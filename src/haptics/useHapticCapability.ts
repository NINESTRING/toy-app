import { useLowPowerMode } from 'expo-battery';
import * as React from 'react';
import { AppState } from 'react-native';
import { HapticSupport } from 'react-native-pulsar';

import { getHapticSupport } from './engine';

/**
 * 지금 이 기기에서 햅틱을 신뢰할 수 있는가. (§5)
 *
 * 햅틱이 제품 자체인 앱이 무반응이 되는 게 최악이므로, 폴백이 필요한
 * 상태를 명시적으로 계산한다. §5가 나열한 원인들:
 *
 *   - 저전력 모드            -> `useLowPowerMode()`로 감지
 *   - Taptic Engine 설정에서 끔 -> iOS 지원 레벨이 NO_SUPPORT로 떨어짐
 *   - 저가 안드로이드 모터    -> 지원 레벨이 LIMITED_SUPPORT
 *   - 카메라/받아쓰기 활성 중  -> 감지 수단이 없다. 아래 주의 참고.
 *
 * 주의: 카메라·받아쓰기로 Taptic Engine이 선점된 경우는 어떤 API로도
 * 알 수 없다. 그 케이스까지 덮으려면 "안 느껴지시나요?" 같은 사용자 주도
 * 탈출구가 화면에 있어야 한다 — 감지로 해결할 문제가 아니다.
 */
export type HapticCapability = {
  level: HapticSupport;
  lowPowerMode: boolean;
  /**
   * 햅틱이 없거나 약할 수 있는 상태. true면 사운드/시각 폴백을 켠다.
   */
  needsFallback: boolean;
};

export function useHapticCapability(): HapticCapability {
  const lowPowerMode = useLowPowerMode();
  const [level, setLevel] = React.useState<HapticSupport>(getHapticSupport);

  /**
   * 지원 레벨은 사용자가 설정 앱을 다녀오면 바뀔 수 있다(iOS의 시스템
   * 햅틱 토글). 앱이 포그라운드로 돌아올 때마다 다시 읽는다.
   */
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setLevel(getHapticSupport());
      }
    });
    return () => subscription.remove();
  }, []);

  const weakOrAbsent =
    level === HapticSupport.NO_SUPPORT || level === HapticSupport.LIMITED_SUPPORT;

  return {
    level,
    lowPowerMode,
    needsFallback: weakOrAbsent || lowPowerMode,
  };
}
