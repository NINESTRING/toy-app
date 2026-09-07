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
  /**
   * 이 터치가 유효한 위치인지 판정하는 워크릿. 없으면 어디든 유효하다 —
   * 기존 기믹(키캡)은 그대로다.
   *
   * `(x, y)`는 제스처 루트 뷰 기준 터치 좌표(pt). false면 햅틱·카운트·눌림을
   * 전부 생략한다.
   *
   * config가 아니라 prop인 이유: config는 입력 모델의 데이터 파라미터(§4 원칙
   * 1)인데, 판정 영역은 기믹의 설계 좌표계와 캔버스 크기에 묶여 있어 데이터로
   * 떼어낼 수 없다. tug의 `canGrab`과 같은 자리다 — `_kinds`는 기믹의 도형을
   * 모른다.
   */
  hitTest?: (x: number, y: number) => boolean;
  children: (state: DiscreteRenderState) => React.ReactNode;
};

export function DiscreteGimmick({ haptic, config, onInteract, hitTest, children }: Props) {
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
        .onBegin((event) => {
          'worklet';
          /**
           * 빗나간 탭. 아무 일도 없다 — 목탁의 채나 배경을 누른 경우.
           *
           * tug의 `canGrab`과 달리 여기선 거부해도 `manager.fail()`을 부르지
           * 않는다. `Tap`은 손가락이 조금이라도 움직이면 스스로 실패하는
           * 제스처라 tug의 수동 활성화 `Pan`과 달리 화면을 계속 삼킬 위험이
           * 없다 — 그래서 빗나간 탭도 스와이프 뒤로가기 같은 다른 제스처를
           * 막지 않는다. 게다가 셸의 오버레이 버튼은 이 제스처 뷰보다 위에
           * 있어 애초에 여기까지 오지도 않는다.
           */
          if (hitTest !== undefined && !hitTest(event.x, event.y)) {
            return;
          }
          pressed.value = 1;
          firePress();
          runOnJS(onInteract)();
        })
        /**
         * `onFinalize`는 탭이 성공했든 취소됐든(손가락이 밖으로 나가든) 부른다.
         * 눌린 상태를 되돌리는 자리로는 `onEnd`보다 안전하다 — 안 그러면
         * 문지르듯 두드릴 때 버튼이 눌린 채로 남는다.
         *
         * 릴리스 햅틱은 실제로 눌렸던 탭에만 — 빗나간 탭(`hitTest` false)에
         * 릴리스 햅틱이 나가면 안 된다.
         */
        .onFinalize(() => {
          'worklet';
          /**
           * `pressed`는 탭 하나가 아니라 공유된 눌림 플래그 하나다 — 손가락별
           * 상태가 아니다. 그래서 두 손가락이 겹쳐 짚었다가 하나씩 뗄 때,
           * 이론상 한쪽의 릴리스 햅틱이 씹힐 수 있다. 지금 릴리스 햅틱을 쓰는
           * 기믹이 없어 실제 문제는 없다 — 생기면 손가락별 추적으로 바꾼다.
           */
          const wasPressed = pressed.value === 1;
          pressed.value = 0;
          if (hasReleaseHaptic && wasPressed) {
            fireRelease();
          }
        }),
    [pressed, firePress, fireRelease, hasReleaseHaptic, hitTest, onInteract]
  );

  return <GestureDetector gesture={tap}>{children({ pressed })}</GestureDetector>;
}
