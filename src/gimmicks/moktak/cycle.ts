/**
 * 목탁의 108 사이클. (스펙 §4)
 *
 * ⚠️ import 금지 — 이 파일은 Node가 타입만 벗겨 바로 실행한다. Skia·Reanimated
 * 를 들이면 그 검증 수단이 사라진다(`bulb/cordPhysics.ts`와 같은 규칙).
 *
 * 총 횟수는 셸의 카운트(`useGimmickCount`)이고 여기 함수들은 전부 그 값에서
 * 파생된다. 별도 저장이 없으므로 셸의 리셋 버튼이 108 사이클도 함께 되돌린다.
 */

/** 번뇌의 수. 한 바퀴. */
export const CYCLE = 108;

/** 문구 카드가 뜨는 주기. 108의 1/4 — 한 바퀴에 네 번. */
export const QUOTE_EVERY = 27;

/**
 * 이번 바퀴에 남은 번뇌.
 * 0 → 108, 107 → 1, 108 → 108(새 바퀴가 곧바로 시작된다).
 */
export function remainingOf(count: number): number {
  return CYCLE - (count % CYCLE);
}

/** 완주한 바퀴 수. 108 → 1. */
export function lapsOf(count: number): number {
  return Math.floor(count / CYCLE);
}

/**
 * 이번 바퀴 진행도 0~1. 진행 바 너비.
 *
 * 108에서 0이다 — 108번째 타격에 바가 꽉 차는 게 아니라 곧바로 비고 새
 * 바퀴가 시작된다(스펙 §4). 완주 연출은 범위 밖.
 */
export function progressOf(count: number): number {
  return (count % CYCLE) / CYCLE;
}

/**
 * 이 횟수에서 뜰 문구 인덱스. `QUOTE_EVERY`의 배수(0 제외)에서만 값이 있다.
 * 27 → 0, 54 → 1, …, `quoteCount`를 넘으면 처음부터 돈다.
 *
 * 결정적이라 같은 횟수에 같은 문구가 뜬다 — 랜덤보다 테스트 가능하고 재현된다.
 */
export function quoteIndexAt(count: number, quoteCount: number): number | null {
  if (count <= 0 || quoteCount <= 0 || count % QUOTE_EVERY !== 0) {
    return null;
  }
  return (count / QUOTE_EVERY - 1) % quoteCount;
}
