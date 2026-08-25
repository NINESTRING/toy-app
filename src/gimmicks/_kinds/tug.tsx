import * as React from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { useThrottledHaptic } from '@/haptics/useThrottledHaptic';
import type { PatternHaptic, PresetHaptic, TugConfig } from '@/gimmicks/types';

import { useHapticFire } from './useHapticFire';

/**
 * Tug 입력 모델. (§4)
 *
 * 전구 풀코드, 레버 — 당겼다 놓는 것. 드래그 거리가 임계값을 넘으면
 * 장전되고, **손을 떼는 순간** 토글 + 햅틱이 터진다.
 *
 * 원본 스펙은 당김 도중 임계값 통과 순간에 쐈다. 개정 스펙 §1이 뒤집었다 —
 * 임계값 통과는 손가락이 못 느끼는 사건(화면에 눈금이 없다)이라 "왜 지금?"이
 * 될 여지가 있었고, 릴리스는 사용자가 스스로 만든 사건이라 그 여지가 없다.
 * 릴리스 지연은 실재하지만 타이밍을 사용자가 소유하므로 "느리다"가 아니라
 * "내가 놓아서 켜졌다"로 읽힌다.
 *
 * 릴리스가 사이클을 끝내므로 "한 번의 당김에 토글 1회"는 구조적으로 보장된다.
 *
 * 이 컴포넌트는 제스처·토글·복귀 스프링만 소유하고 생김새는 children에
 * 맡긴다. 모든 판정이 워크릿 안에서 끝난다. (§4)
 */

export type TugRenderState = {
  /** 줄 끝의 휴지점 대비 변위(pt). 워크릿에서 읽어 경로를 그린다. (§1) */
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  /** 켜짐 여부 0 | 1. 임계값을 넘어본 뒤 손을 떼는 순간 바뀐다. */
  on: SharedValue<number>;
  /** 드래그 중인지. */
  active: SharedValue<boolean>;
};

type Props = {
  haptic: PresetHaptic | PatternHaptic;
  config: TugConfig;
  onInteract: () => void;
  children: (state: TugRenderState) => React.ReactNode;
};

/**
 * 놓았을 때 매듭의 복귀 스프링.
 *
 * damping을 9에서 12로 올렸다 — 출렁임을 이제 줄(`bulb/cordPhysics.ts`의
 * 로프 체인)이 담당하므로, 매듭까지 통통 튀면 파형이 두 겹으로 겹친다.
 * 매듭은 깔끔하게 돌아오고 파형은 줄이 문다.
 *
 * ⚠️ 실기기 미검증. 출렁임이 과하면 damping ↑.
 */
const WHIP_SPRING = { damping: 12, stiffness: 300, mass: 1 };

export function TugGimmick({ haptic, config, onInteract, children }: Props) {
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const on = useSharedValue(0);
  const active = useSharedValue(false);

  /**
   * 이번 당김 사이클에서 임계값을 넘어본 적이 있는지. 릴리스에서 토글을
   * 쏠지를 정한다.
   *
   * **한 번 서면 안 내려간다** — 100pt 당겼다가 손가락을 제자리로 되돌려
   * 놓아도 토글된다. 레퍼런스 펜은 릴리스 시점 거리로 재서 이 경우
   * 불발인데, 우리는 갈라진다: 실제 걸쇠는 트립하면 못 되돌리고
   * (`latch` 프리셋을 고른 것과 같은 모델), 피젯 토이에서 제일 나쁜
   * 실패는 "다 당겼는데 안 켜졌네"다.
   */
  const armed = useSharedValue(false);
  /** 잡은 순간의 변위. 복귀 도중에 다시 잡아도 튀지 않게 하는 기점. */
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);

  const fireToggle = useThrottledHaptic(useHapticFire(haptic));

  const { threshold } = config;

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        /** 잡는 즉시 줄이 손가락을 따라야 하므로 발동 거리 0. */
        .minDistance(0)
        .onBegin(() => {
          'worklet';
          active.value = true;
          /** 스프링 복귀 중이면 그 자리에서 낚아챈다. */
          cancelAnimation(dragX);
          cancelAnimation(dragY);
          grabX.value = dragX.value;
          grabY.value = dragY.value;
        })
        .onUpdate((event) => {
          'worklet';
          dragX.value = grabX.value + event.translationX;
          dragY.value = grabY.value + event.translationY;

          if (armed.value) {
            return;
          }

          /**
           * 거리는 **잡은 지점 기준**이다(레퍼런스도 press 지점 기준).
           * 휴지점 기준으로 재면 복귀 스프링 도중의 줄(이미 임계값 밖)을
           * 다시 잡았을 때 1px만 움직여도 장전되는 구멍이 생긴다.
           *
           * 방향은 따지지 않는다 — 어느 쪽으로 당겨도 장전된다. 레퍼런스와
           * 같고, 피젯 토이에선 "되는 방향"을 외우게 하는 게 손해다.
           */
          const distance = Math.sqrt(
            event.translationX * event.translationX + event.translationY * event.translationY
          );
          if (distance <= threshold) {
            return;
          }

          armed.value = true;
        })
        .onFinalize(() => {
          'worklet';
          active.value = false;

          /**
           * 발화 지점. 딸깍·불·카운트가 전부 손을 떼는 이 순간에 같이
           * 터진다 — 사용자가 스스로 만든 사건이라 인과가 또렷하다
           * (개정 스펙 §1). 취소도 릴리스로 친다.
           */
          if (armed.value) {
            armed.value = false;
            on.value = on.value === 1 ? 0 : 1;
            fireToggle();
            runOnJS(onInteract)();
          }

          dragX.value = withSpring(0, WHIP_SPRING);
          dragY.value = withSpring(0, WHIP_SPRING);
        }),
    [active, dragX, dragY, armed, fireToggle, grabX, grabY, on, onInteract, threshold]
  );

  return <GestureDetector gesture={pan}>{children({ dragX, dragY, on, active })}</GestureDetector>;
}
