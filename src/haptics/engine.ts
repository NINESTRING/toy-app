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
 * **여기서 preload를 하면 안 된다.** 원래는 §4 원칙 3대로 번들 기믹의 프리셋을
 * 전부 미리 캐시에 올렸는데, 그게 릴리스 빌드에서 그 프리셋들을 통째로
 * 무음으로 만들었다.
 *
 * 실기기에서 확인한 것(Debug에서는 안 나타나고 Release에서만 재현):
 *
 *   - 무음인 프리셋이 preload 목록과 **정확히 일치**했다. 목록에 없는
 *     프리셋(thump, blip)은 멀쩡했다.
 *   - `clearCache()`를 부르면 무음이던 게 살아났다 — 캐시에 박힌 항목이
 *     깨져 있었다는 뜻이다.
 *   - **같은 `preloadPresets` 호출을 앱이 뜬 뒤에 하면 멀쩡했다.** 그래서
 *     범인은 호출 자체가 아니라 호출 시점이다.
 *
 * 릴리스는 JS 시작이 빨라 이 `useEffect`가 네이티브 햅틱 엔진이 준비되기 전에
 * 돈다. 그 시점의 preload가 깨진 캐시 항목을 만들고, 그게 계속 재생된다.
 * Debug는 번들 로딩이 느려서 그 사이에 엔진이 올라오므로 안 걸린다.
 *
 * 캐시를 끄는 건 답이 아니다 — `enableCache(false)`로 두면 재생이 아예 안 된다
 * (그것도 실기기에서 확인했다). 캐시는 켜두고 채우는 건 Pulsar의 on-demand
 * 로딩에 맡긴다. 미preload 프리셋도 문제없이 울리는 걸 확인했다.
 */
export function initHaptics(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  Settings.enableCache(true);
}

/**
 * 프리셋을 엔진 캐시에 올린다. 이미 올라간 것은 Pulsar가 무시한다.
 *
 * ⚠️ **앱 시작 직후에 부르지 말 것.** 엔진이 준비되기 전에 부르면 깨진 항목이
 * 박혀서 그 프리셋이 영구히 무음이 된다 — 이유는 `initHaptics` 주석에.
 * 쓸 일이 생기면(OTA 기믹 등) 화면이 뜨고 난 뒤에 부른다.
 */
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
