import * as React from 'react';
import { useSharedValue } from 'react-native-reanimated';

/**
 * §5: 초당 20회를 넘게 쏘면 시스템이 드랍한다. 40~50ms 스로틀.
 *
 * 45ms = 초당 약 22회. 드랍 경계 바로 아래에 붙여서, 빠른 연타에서
 * 시스템이 임의로 버리는 게 아니라 우리가 결정해서 버린다.
 */
export const HAPTIC_THROTTLE_MS = 45;

/**
 * 워크릿 안에서 동작하는 스로틀. (§4: 모든 햅틱 계산은 워크릿 안에서)
 *
 * 드래그 중 "지금 쏴도 되나?"를 JS 스레드에 물으면 확실히 밀리므로,
 * 마지막 발사 시각을 shared value에 두고 UI 스레드에서만 판정한다.
 * `performance.now()`는 워크릿 런타임에 설치돼 있어 호출 가능하다.
 *
 * @param fire 워크릿에서 호출 가능한 햅틱 함수 (Pulsar 프리셋 또는 composer)
 * @returns 실제로 쐈으면 true, 스로틀에 걸려 버렸으면 false
 */
export function useThrottledHaptic(
  fire: () => void,
  throttleMs: number = HAPTIC_THROTTLE_MS
): () => boolean {
  const lastFiredAt = useSharedValue(0);

  return React.useCallback(() => {
    'worklet';
    const now = performance.now();
    if (now - lastFiredAt.value < throttleMs) {
      return false;
    }
    lastFiredAt.value = now;
    fire();
    return true;
  }, [fire, throttleMs, lastFiredAt]);
}
