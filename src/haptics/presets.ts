import { Presets } from 'react-native-pulsar';

/**
 * Pulsar 최상위 프리셋 이름 (151개).
 *
 * 설치된 Pulsar 버전에 실제로 존재하는 이름만 통과한다. 레지스트리에
 * 프리셋 이름을 오타내면 런타임 무음이 아니라 컴파일 에러로 잡힌다 —
 * 햅틱이 제품 자체인 앱에서 무음 실패는 가장 나쁜 실패 모드다.
 *
 * `Presets.System.*`(플랫폼 시스템 햅틱)은 제외한다. 함수가 아니라
 * 중첩 객체이므로 아래 조건부 타입에서 자연히 걸러진다.
 */
export type PresetName = {
  [K in keyof typeof Presets]: (typeof Presets)[K] extends () => void ? K : never;
}[keyof typeof Presets];

/**
 * 프리셋 이름을 워크릿에서 호출 가능한 함수 하나로 풀어둔다.
 *
 * Pulsar의 프리셋 함수는 전부 `'worklet'` 지시자를 달고 있어 UI 스레드에서
 * 직접 호출된다. 다만 워크릿 *안에서* `Presets[name]()` 처럼 동적 조회를 하면
 * 프리셋 객체 전체(함수 151개 + System 트리)가 워크릿 클로저로 캡처된다.
 * JS 스레드에서 미리 풀어 함수 하나만 캡처시킨다.
 */
export function resolvePreset(name: PresetName): () => void {
  return Presets[name] as () => void;
}
