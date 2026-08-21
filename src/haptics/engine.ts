import { HapticSupport, Settings } from 'react-native-pulsar';

import type { PresetName } from './presets';

/**
 * 햅틱 엔진 싱글톤. (§4 원칙 3)
 *
 * Core Haptics 엔진 시작에 수십 ms가 걸린다. 기믹을 전환할 때마다 엔진을
 * 새로 만들면 첫 딸깍이 씹힌다. 그래서 엔진은 앱 수명 내내 살려두고,
 * 이 모듈은 `Settings.shutDownEngine()`을 **의도적으로 노출하지 않는다.**
 *
 * Pulsar의 네이티브 모듈 자체가 이미 프로세스당 하나이므로, 여기서 관리할
 * 싱글톤 상태는 "초기화를 한 번만 한다"와 "무엇을 preload 했는가" 뿐이다.
 */

let initialized = false;

/**
 * 앱 시작 시 한 번 호출한다.
 *
 * @param preload 번들에 포함된 기믹들이 쓰는 프리셋. 미리 캐시에 올려두면
 *   기믹 첫 진입의 첫 딸깍이 씹히지 않는다. OTA로 내려온 기믹(§7)의
 *   프리셋은 여기 없으므로 해당 기믹 진입 시 `preloadPresets`로 보충한다.
 */
export function initHaptics(preload: readonly PresetName[]): void {
  if (initialized) {
    return;
  }
  initialized = true;

  Settings.enableCache(true);
  preloadPresets(preload);
}

/** 프리셋을 엔진 캐시에 올린다. 이미 올라간 것은 Pulsar가 무시한다. */
export function preloadPresets(names: readonly PresetName[]): void {
  if (names.length === 0) {
    return;
  }
  Settings.preloadPresets([...names]);
}

/**
 * 기기가 지원하는 햅틱 수준.
 *
 * iOS는 `ADVANCED_SUPPORT`(Taptic Engine 있음) 또는 `NO_SUPPORT` 둘 중
 * 하나만 반환한다. 중간 등급(`LIMITED_SUPPORT`)이 나오는 쪽은 안드로이드다 —
 * §5의 "안드로이드 진동 모터 편차가 크다"가 여기로 드러난다.
 *
 * 이 값만으로는 부족하다. 저전력 모드나 사용자가 설정에서 Taptic Engine을
 * 끈 경우는 여기 안 잡힌다. `useHapticCapability`가 두 신호를 합친다.
 */
export function getHapticSupport(): HapticSupport {
  return Settings.getHapticsSupportLevel();
}

/** 설정 화면의 햅틱 on/off 토글용. */
export function setHapticsEnabled(enabled: boolean): void {
  Settings.enableHaptics(enabled);
}

/** 설정 화면의 사운드 on/off 토글용 (Pulsar 프리셋에 딸린 사운드). */
export function setPresetSoundEnabled(enabled: boolean): void {
  Settings.enableSound(enabled);
}

/**
 * 진행 중인 햅틱을 즉시 끊는다. 기믹 화면을 떠날 때 호출한다.
 * 엔진을 내리는 것이 아니라 재생만 멈추는 것이므로 다음 딸깍이 씹히지 않는다.
 */
export function stopHaptics(): void {
  Settings.stopHaptics();
}
