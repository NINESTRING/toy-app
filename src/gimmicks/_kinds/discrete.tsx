import * as React from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { useThrottledHaptic } from '@/haptics/useThrottledHaptic';
import type { DiscreteConfig, PatternHaptic, PresetHaptic } from '@/gimmicks/types';

import { useHapticFire } from './useHapticFire';

/**
 * Discrete 입력 모델. (§4)
 *
 * 클리커, 토글, 볼펜 — 생김새는 달라도 코드상 같은 종류다.
 * 터치 다운 1회에 프리셋 하나를 쏜다.
 *
 * 이 컴포넌트는 제스처와 햅틱만 소유하고 생김새는 children에 맡긴다.
 * 그래서 클리커와 토글이 같은 파일을 공유할 수 있다.
 */

export type DiscreteRenderState = {
  /** 눌린 정도 0~1. 워크릿에서 읽어 `useAnimatedStyle`로 쓴다. (§1) */
  pressed: SharedValue<number>;
};

type Props = {
  haptic: PresetHaptic | PatternHaptic;
  config: DiscreteConfig;
  onInteract: () => void;
  children: (state: DiscreteRenderState) => React.ReactNode;
};

export function DiscreteGimmick({ haptic, config, onInteract, children }: Props) {
  const pressed = useSharedValue(0);

  const firePress = useThrottledHaptic(useHapticFire(haptic));
  const fireRelease = useThrottledHaptic(useHapticFire(config.releaseHaptic));

  const hasReleaseHaptic = config.releaseHaptic !== undefined;

  const tap = React.useMemo(
    () =>
      Gesture.Tap()
        /**
         * §5: `onPress`는 손 뗄 때 발화한다. 실제 클리커는 누르는 순간 딸깍이므로
         * `onBegin`을 쓴다. 이 한 줄이 체감 지연의 대부분을 결정한다.
         */
        .onBegin(() => {
          'worklet';
          pressed.value = 1;
          firePress();
          runOnJS(onInteract)();
        })
        /**
         * `onFinalize`는 탭이 성공했든 취소됐든(손가락이 밖으로 나가든) 부른다.
         * 눌린 상태를 되돌리는 자리로는 `onEnd`보다 안전하다 — 안 그러면
         * 문지르듯 두드릴 때 버튼이 눌린 채로 남는다.
         */
        .onFinalize(() => {
          'worklet';
          pressed.value = 0;
          if (hasReleaseHaptic) {
            fireRelease();
          }
        }),
    [pressed, firePress, fireRelease, hasReleaseHaptic, onInteract]
  );

  return <GestureDetector gesture={tap}>{children({ pressed })}</GestureDetector>;
}
