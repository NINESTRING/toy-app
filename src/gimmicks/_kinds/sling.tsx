import * as React from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRealtimeComposer } from 'react-native-pulsar';
import {
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { useThrottledHaptic } from '@/haptics/useThrottledHaptic';
import type { SlingConfig, SlingHaptic } from '@/gimmicks/types';

import { useHapticFire } from './useHapticFire';

/**
 * Sling 입력 모델. (§4)
 *
 * 파티 포퍼, 새총 — 당겨서 조준하고 놓으면 발사. 드래그 벡터의 반대
 * 방향이 발사각, 길이가 파워다(Angry Birds 문법). 당기는 동안 파워에
 * 비례하는 차징 럼블이 울리고(§0 — 게이지를 눈으로 안 봐도 손이 안다),
 * 릴리스 순간 단발이 터진다.
 *
 * 이 컴포넌트는 제스처·조준·파워·발사 판정·햅틱만 소유하고 생김새는
 * children에 맡긴다. 모든 판정이 워크릿 안에서 끝난다. (§4)
 */

/** 휴지 조준각(도). 화면 좌표계에서 수직 위. */
export const REST_ANGLE = -90;

export type SlingShot = {
  /** 발사마다 1씩 증가. 자식이 useAnimatedReaction으로 받아 파티클을 뿌린다. */
  seq: number;
  /** 발사 방향(도). 부채꼴 클램프 적용 후 값. */
  angle: number;
  /** 발사 파워 0~1. */
  power: number;
};

export type SlingRenderState = {
  /** 현재 조준 방향(도). 놓으면 스프링으로 REST_ANGLE 복귀. */
  angle: SharedValue<number>;
  /**
   * 현재 파워 0~1. 놓으면 스프링으로 0 복귀 — 오버슈트로 살짝 음수가
   * 되는 구간이 포신 반동(recoil)이다. 그리는 쪽에서 clamp해서 쓴다.
   */
  power: SharedValue<number>;
  active: SharedValue<boolean>;
  shot: SharedValue<SlingShot>;
};

type Props = {
  haptic: SlingHaptic;
  config: SlingConfig;
  onInteract: () => void;
  children: (state: SlingRenderState) => React.ReactNode;
};

/**
 * 릴리스 복귀 스프링. 낮은 감쇠의 오버슈트가 그대로 포신 반동이 된다 —
 * 전구가 복귀 스프링으로 채찍 반동을 얻은 것과 같은 구조(스펙 §6).
 * ⚠️ 실기기 튜닝 대상.
 */
const RECOIL_SPRING = { damping: 10, stiffness: 320, mass: 1 };

/**
 * 조준각을 REST_ANGLE 중심 ±halfFan으로 클램프. atan2가 ±180에서 끊기므로
 * 편차를 (-180, 180]으로 되감은 뒤 자른다.
 */
function clampToFan(rawAngle: number, halfFan: number): number {
  'worklet';
  let delta = rawAngle - REST_ANGLE;
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }
  return REST_ANGLE + Math.min(halfFan, Math.max(-halfFan, delta));
}

export function SlingGimmick({ haptic, config, onInteract, children }: Props) {
  const composer = useRealtimeComposer();

  const angle = useSharedValue(REST_ANGLE);
  const power = useSharedValue(0);
  const active = useSharedValue(false);
  const shot = useSharedValue<SlingShot>({ seq: 0, angle: REST_ANGLE, power: 0 });

  /**
   * 발사 단발. 사이클당 1회라 스로틀의 실질 의미는 없지만 discrete·tug와
   * 같은 계약을 유지한다.
   */
  const fireShot = useThrottledHaptic(useHapticFire(haptic.fire));

  const { maxPull, minPower, fanDegrees } = config;
  const { minAmplitude, maxAmplitude, minFrequency, maxFrequency } = haptic.charge;
  const halfFan = fanDegrees / 2;

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        /** 잡는 즉시 조준이 시작돼야 하므로 발동 거리 0. */
        .minDistance(0)
        .onBegin(() => {
          'worklet';
          active.value = true;
          /** 반동 스프링 도중에 다시 잡으면 그 자리에서 낚아챈다. */
          cancelAnimation(angle);
          cancelAnimation(power);
          /**
           * 잡는 순간 파워는 0이다 — `onUpdate`가 잡은 지점 기준
           * translation으로 파워를 재기 때문이다. 반동 스프링을 도중에
           * 낚아채면 power가 그 값에 얼어붙는데, 움직임 없는 탭은
           * `onUpdate`를 한 번도 거치지 않고 `onFinalize`로 가므로 그 잔값이
           * 그대로 발사 판정을 통과한다. 여기서 0으로 되돌려 막는다.
           */
          power.value = 0;
        })
        .onUpdate((event) => {
          'worklet';
          /**
           * 당김 벡터는 잡은 지점 기준(tug와 같은 원칙). 발사 방향은
           * 그 반대다 — 아래로 당기면 위로 쏜다.
           */
          const pullX = event.translationX;
          const pullY = event.translationY;
          const distance = Math.sqrt(pullX * pullX + pullY * pullY);

          const nextPower = Math.min(1, distance / maxPull);
          power.value = nextPower;

          /** 거리 0이면 atan2(0,0)이 무의미하므로 조준각을 건드리지 않는다. */
          if (distance > 0) {
            const rawAngle = (Math.atan2(-pullY, -pullX) * 180) / Math.PI;
            angle.value = clampToFan(rawAngle, halfFan);
          }

          /**
           * 차징 럼블 — 연속 엔벨로프라 detented의 playDiscrete(단발)가
           * 아니라 §4가 적어둔 set이 맞다. 트랜지언트가 아니므로 §5의
           * 초당 20회 드랍과 무관하고 매 프레임 호출해도 된다.
           */
          composer.set(
            minAmplitude + (maxAmplitude - minAmplitude) * nextPower,
            minFrequency + (maxFrequency - minFrequency) * nextPower
          );
        })
        .onFinalize(() => {
          'worklet';
          active.value = false;
          composer.stop();

          /** minPower 미만은 불발 — 탭이 오발되지 않는다(스펙 §3). */
          if (power.value >= minPower) {
            shot.value = {
              seq: shot.value.seq + 1,
              angle: angle.value,
              power: power.value,
            };
            fireShot();
            runOnJS(onInteract)();
          }

          power.value = withSpring(0, RECOIL_SPRING);
          angle.value = withSpring(REST_ANGLE, RECOIL_SPRING);
        }),
    [
      active,
      angle,
      composer,
      fireShot,
      halfFan,
      maxAmplitude,
      maxPull,
      maxFrequency,
      minAmplitude,
      minFrequency,
      minPower,
      onInteract,
      power,
      shot,
    ]
  );

  return (
    <GestureDetector gesture={pan}>
      {children({ angle, power, active, shot })}
    </GestureDetector>
  );
}
