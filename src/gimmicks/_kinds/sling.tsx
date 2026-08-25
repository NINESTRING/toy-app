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
 * 기믹이 `canGrab`을 주면 터치 다운 지점이 포를 짚었는지 물어본다 —
 * 아니면 그 터치는 조준을 시작하지 않는다. tug의 `canGrab`과 같은 장치이고
 * 이유도 같다(`_kinds/tug.tsx` 참조).
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
  /**
   * 이 터치로 포를 **잡을 수 있는지** 판정하는 워크릿. 없으면 어디서든 잡힌다.
   *
   * `(x, y)`는 제스처 뷰 기준 터치 좌표(pt), `(angle, power)`는 지금 조준
   * 상태다 — 반동 스프링이 도는 중이면 포가 휴지 자세에 없으므로 같이 넘긴다.
   *
   * 포의 생김새·배치는 기믹이 갖고 있고 `_kinds`는 그걸 모른다. 그래서
   * 판정을 여기서 만들지 않고 받아 쓴다.
   *
   * **잡은 뒤에는 화면 어디로 끌든 조준이 이어진다.** 당길수록 손가락이 포에서
   * 멀어지는 건 이 모델의 정상 동작이고, 여기서 막는 건 시작 지점뿐이다.
   */
  canGrab?: (x: number, y: number, angle: number, power: number) => boolean;
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

export function SlingGimmick({ haptic, config, onInteract, canGrab, children }: Props) {
  const composer = useRealtimeComposer();

  const angle = useSharedValue(REST_ANGLE);
  const power = useSharedValue(0);
  const active = useSharedValue(false);
  const shot = useSharedValue<SlingShot>({ seq: 0, angle: REST_ANGLE, power: 0 });
  /**
   * 이번 터치가 포를 잡았는지. 거부된 터치도 `onFinalize`까지 오므로 거기서
   * 이걸 보고 지나쳐야 한다.
   */
  const grabbed = useSharedValue(false);

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
        /**
         * 수동 활성화. tug와 같은 이유다 — 터치 다운에서 바로 `activate()`를
         * 부르므로 `minDistance(0)`과 같은 즉시성을 유지하면서, `canGrab`이
         * 거부한 터치는 **실패로 끝내** 다른 제스처에 넘길 수 있다. 콜백에서
         * 무시만 하면 제스처가 활성인 채로 그 터치를 삼킨다.
         */
        .manualActivation(true)
        .onTouchesDown((event, manager) => {
          'worklet';
          /** 첫 손가락으로만 판정한다. 조준 중에 두 번째 손가락이 닿아도 안 놓친다. */
          if (event.numberOfTouches > 1) {
            return;
          }
          const touch = event.changedTouches[0];
          /**
           * 판정은 `power`를 0으로 되돌리기 **전에** 해야 한다. 반동 스프링
           * 도중이면 포가 눌린 자세라 그 눌림까지 반영해야 겨냥이 맞는다.
           * 아래 `onStart`가 0으로 되돌리는데, 활성화는 여기서만 나오므로
           * 순서는 항상 이쪽이 먼저다.
           */
          grabbed.value =
            canGrab === undefined || canGrab(touch.x, touch.y, angle.value, power.value);
          if (grabbed.value) {
            manager.activate();
          } else {
            manager.fail();
          }
        })
        /** 활성은 위에서만 나온다 — 즉 여기 온 건 포를 잡은 터치뿐이다. */
        .onStart(() => {
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
          /**
           * 거부된 터치(`canGrab` 불통과)도 finalize까지 온다. 사이클이
           * 아니었으므로 반동 스프링도 걸지 않고 지나간다 — 걸면 마침
           * 복귀하던 포의 애니메이션을 헛되이 다시 시작시킨다.
           */
          if (!grabbed.value) {
            return;
          }
          grabbed.value = false;
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
      canGrab,
      composer,
      fireShot,
      grabbed,
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
    <GestureDetector gesture={pan}>{children({ angle, power, active, shot })}</GestureDetector>
  );
}
