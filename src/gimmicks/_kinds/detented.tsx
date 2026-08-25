import * as React from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRealtimeComposer } from 'react-native-pulsar';
import { runOnJS, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { HAPTIC_THROTTLE_MS } from '@/haptics/useThrottledHaptic';
import type { DetentedConfig, RealtimeHaptic } from '@/gimmicks/types';

/**
 * Detented 입력 모델. (§4)
 *
 * 다이얼, 슬라이더, 래칫 — 눈금을 넘을 때마다 딸깍한다. 생김새가 달라도
 * 코드상 같은 종류다.
 *
 * §4가 "품질을 가르는 지점"으로 지목한 부분이 여기다: 눈금 하나를 넘을 때의
 * 진동 세기가 **각속도에 따라 달라야** 한다. 천천히 돌리면 약하게, 빨리
 * 돌리면 세게.
 *
 * 세는 단위는 손맛의 단위와 분리돼 있다. 딸깍은 눈금마다 터지지만 카운트는
 * `detentsPerCount` 눈금마다 1이다 — 다이얼은 한 바퀴(32눈금)에 1이라
 * 카운터가 "몇 번 돌렸나"를 뜻하게 된다.
 *
 * 모든 계산이 워크릿 안에서 끝난다. 드래그 중 "눈금 넘었나?"를 JS 스레드에서
 * 계산하면 확실히 밀린다. (§4)
 */

export type DetentedRenderState = {
  /** 현재 회전 각도(도). 워크릿에서 읽어 `useAnimatedStyle`로 쓴다. (§1) */
  angle: SharedValue<number>;
  /** 현재 눈금 인덱스. 0 ~ detentCount. */
  detent: SharedValue<number>;
  /** 드래그 중인지. */
  active: SharedValue<boolean>;
};

type Props = {
  haptic: RealtimeHaptic;
  config: DetentedConfig;
  onInteract: () => void;
  children: (state: DetentedRenderState) => React.ReactNode;
};

export function DetentedGimmick({ haptic, config, onInteract, children }: Props) {
  const composer = useRealtimeComposer();

  const angle = useSharedValue(0);
  const detent = useSharedValue(0);
  const active = useSharedValue(false);

  /** 손가락의 이전 각도. 회전 델타를 구하는 기준. */
  const previousTouchAngle = useSharedValue(0);
  /** 이전 프레임 시각. 각속도 계산용. */
  const previousTimestamp = useSharedValue(0);
  /** 마지막으로 햅틱을 쏜 시각. 워크릿 내부 스로틀. (§5) */
  const lastFiredAt = useSharedValue(0);
  /** 뷰 중심. 손가락 좌표를 각도로 바꿀 때 기준점. */
  const center = useSharedValue({ x: 0, y: 0 });
  /**
   * 다음 카운트까지의 **부호 있는** 눈금 누적. `detentsPerCount`에 닿으면
   * 1 올리고 그만큼 덜어낸다.
   *
   * 절대 이동량을 쌓지 않는 게 핵심이다. 다이얼은 한 바퀴에 1인데, 절대값을
   * 쌓으면 반 바퀴씩 앞뒤로 흔들기만 해도 카운트가 오른다. 부호가 있으면
   * 왕복은 서로 상쇄되어 제자리다 — "한 바퀴 돌렸을 때"가 곧이곧대로 지켜진다.
   *
   * 올린 뒤 0으로 리셋하지 않고 `detentsPerCount`만큼 **덜어내는** 것도
   * 이유가 있다. 경계에 걸터앉아 한 눈금씩 왕복하면 리셋 방식에선 넘나들
   * 때마다 1씩 오른다. 덜어내면 다음 발화까지 다시 한 바퀴가 필요하다.
   */
  const countProgress = useSharedValue(0);

  const { detentCount, sweepDegrees, clamp, detentsPerCount = 1 } = config;
  const { minAmplitude, maxAmplitude, frequency, velocityForMaxAmplitude } = haptic;

  /** 눈금 하나의 각도 폭. */
  const degreesPerDetent = sweepDegrees / detentCount;

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        /** 눈금 하나를 넘기려면 손가락을 조금은 움직여야 하므로 0에서 시작. */
        .minDistance(0)
        .onBegin((event) => {
          'worklet';
          active.value = true;
          previousTouchAngle.value = Math.atan2(event.y - center.value.y, event.x - center.value.x);
          previousTimestamp.value = performance.now();
        })
        .onUpdate((event) => {
          'worklet';

          const touchAngle = Math.atan2(event.y - center.value.y, event.x - center.value.x);

          /**
           * 각도 델타. atan2는 ±π에서 끊기므로 그대로 빼면 한 바퀴 점프가
           * 생긴다. 델타를 (-π, π]로 되감아서 누적한다.
           */
          let deltaRadians = touchAngle - previousTouchAngle.value;
          if (deltaRadians > Math.PI) {
            deltaRadians -= 2 * Math.PI;
          } else if (deltaRadians < -Math.PI) {
            deltaRadians += 2 * Math.PI;
          }
          previousTouchAngle.value = touchAngle;

          const deltaDegrees = (deltaRadians * 180) / Math.PI;

          const next = angle.value + deltaDegrees;
          angle.value = clamp ? Math.min(sweepDegrees, Math.max(0, next)) : next;

          /** 각속도(도/초). 진폭 변조의 입력. */
          const now = performance.now();
          const elapsed = now - previousTimestamp.value;
          previousTimestamp.value = now;
          const velocity = elapsed > 0 ? Math.abs(deltaDegrees) / (elapsed / 1000) : 0;

          /**
           * 눈금을 넘었는가. 인덱스는 항상 갱신하고 햅틱만 스로틀로 막는다 —
           * 그렇게 해야 빠르게 돌린 뒤에도 인덱스가 실제 위치와 어긋나지 않는다.
           */
          const nextDetent = Math.round(angle.value / degreesPerDetent);
          if (nextDetent === detent.value) {
            return;
          }
          const stepped = nextDetent - detent.value;
          detent.value = nextDetent;

          /**
           * 카운트는 햅틱 **스로틀 위**에 있다. 아래로 내리면 빨리 돌릴 때
           * 버려진 딸깍만큼 카운트도 같이 새서, 실제로 돌린 양보다 적게 센다.
           * 눈금 인덱스는 스로틀과 무관하게 항상 갱신되므로 여기서 세는 게 맞다.
           */
          countProgress.value += stepped;
          while (countProgress.value >= detentsPerCount) {
            countProgress.value -= detentsPerCount;
            runOnJS(onInteract)();
          }
          while (countProgress.value <= -detentsPerCount) {
            countProgress.value += detentsPerCount;
            runOnJS(onInteract)();
          }

          // §5: 초당 20회 넘게 쏘면 시스템이 드랍한다. 우리가 먼저 버린다.
          if (now - lastFiredAt.value < HAPTIC_THROTTLE_MS) {
            return;
          }
          lastFiredAt.value = now;

          /**
           * 속도 → 진폭. `playDiscrete`는 진폭·주파수를 받는 단발 트랜지언트라
           * 눈금 딸깍 하나에 대응한다.
           *
           * §4는 이 자리에 `set(진폭, 주파수)`를 적어뒀지만, `set`은 연속
           * 엔벨로프(계속 울리는 진동의 세기를 바꾸는 것)다. 눈금은 매번
           * 끊기는 단발이므로 `playDiscrete`가 맞다. §4가 의도한 결과
           * ("천천히 돌릴 때와 빨리 돌릴 때 손맛이 다르다")는 진폭을
           * 속도로 스케일하는 아래 계산이 그대로 만들어낸다.
           */
          const speedRatio = Math.min(1, velocity / velocityForMaxAmplitude);
          const amplitude = minAmplitude + (maxAmplitude - minAmplitude) * speedRatio;
          composer.playDiscrete(amplitude, frequency);
        })
        .onFinalize(() => {
          'worklet';
          active.value = false;
          composer.stop();
        }),
    [
      active,
      angle,
      center,
      clamp,
      composer,
      countProgress,
      degreesPerDetent,
      detent,
      detentsPerCount,
      frequency,
      lastFiredAt,
      maxAmplitude,
      minAmplitude,
      onInteract,
      previousTimestamp,
      previousTouchAngle,
      sweepDegrees,
      velocityForMaxAmplitude,
    ]
  );

  /**
   * 제스처 좌표(`event.x`/`event.y`)는 GestureDetector의 자식 뷰 기준으로
   * 온다. 그래서 중심은 그 뷰의 실제 크기에서 구해야 한다.
   */
  const onLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      center.value = { x: width / 2, y: height / 2 };
    },
    [center]
  );

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={onLayout} style={SURFACE_STYLE}>
        {children({ angle, detent, active })}
      </View>
    </GestureDetector>
  );
}

const SURFACE_STYLE: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};
