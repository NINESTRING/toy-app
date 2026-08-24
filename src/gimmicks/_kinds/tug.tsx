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
 * 전구 풀코드, 레버, 파티 팝퍼 — 당겼다 놓는 것. 드래그 거리가 임계값을
 * 넘는 **순간** 토글 + 햅틱이 터진다. 레퍼런스(jh3y의 Tuggable Light Bulb)는
 * 놓은 뒤에 토글하지만, 실제 풀체인 스위치는 당기는 도중에 딸깍하고 §0
 * 기준으로도 임계값 통과 순간이 맞다 — 릴리스를 기다리면 그만큼이 지연이다.
 *
 * 한 번의 당김 사이클에 토글은 1회. 놓아야 재장전된다.
 *
 * 이 컴포넌트는 제스처·토글·복귀 스프링만 소유하고 생김새는 children에
 * 맡긴다. 모든 판정이 워크릿 안에서 끝난다. (§4)
 */

export type TugRenderState = {
  /** 줄 끝의 휴지점 대비 변위(pt). 워크릿에서 읽어 경로를 그린다. (§1) */
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  /** 켜짐 여부 0 | 1. 임계값 통과 순간 바뀐다. */
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
 * 놓았을 때의 복귀 스프링. 감쇠를 낮게 잡아 두어 번 오버슈트하는 것이
 * 채찍 반동이다 — 레퍼런스의 MorphSVG 출렁임을 이걸로 대신한다(스펙 §3).
 * 출렁임이 과하면 damping을 올린다. 실기기 튜닝 대상.
 */
const WHIP_SPRING = { damping: 9, stiffness: 300, mass: 1 };

export function TugGimmick({ haptic, config, onInteract, children }: Props) {
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const on = useSharedValue(0);
  const active = useSharedValue(false);

  /** 이번 당김 사이클에서 이미 토글했는지. 놓아야 풀린다. */
  const fired = useSharedValue(false);
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

          if (fired.value) {
            return;
          }

          /**
           * 거리는 **잡은 지점 기준**이다(레퍼런스도 press 지점 기준).
           * 휴지점 기준으로 재면 복귀 스프링 도중의 줄(이미 임계값 밖)을
           * 다시 잡았을 때 1px만 움직여도 재토글되는 구멍이 생긴다.
           *
           * 방향은 따지지 않는다 — 어느 쪽으로 당겨도 딸깍. 레퍼런스와
           * 같고, 피젯 토이에선 "되는 방향"을 외우게 하는 게 손해다.
           */
          const distance = Math.sqrt(
            event.translationX * event.translationX + event.translationY * event.translationY
          );
          if (distance <= threshold) {
            return;
          }

          fired.value = true;
          on.value = on.value === 1 ? 0 : 1;
          fireToggle();
          runOnJS(onInteract)();
        })
        .onFinalize(() => {
          'worklet';
          active.value = false;
          fired.value = false;
          dragX.value = withSpring(0, WHIP_SPRING);
          dragY.value = withSpring(0, WHIP_SPRING);
        }),
    [active, dragX, dragY, fired, fireToggle, grabX, grabY, on, onInteract, threshold]
  );

  return <GestureDetector gesture={pan}>{children({ dragX, dragY, on, active })}</GestureDetector>;
}
