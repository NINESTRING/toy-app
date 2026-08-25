# 색종이 화려화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 색종이를 모양 4종(직사각·리본·원형·마름모)으로 섞고, 개체의 1/3에 회전과 위상이 맞는 금박 반짝임을 입힌다.

**Architecture:** 겉모습을 정하는 순수 수학(칸 배정·플러터 위상·금박 색)을 import 없는 `confettiLook.ts`로 떼어내 Node로 검증하고, `confetti.tsx`는 그 함수들을 Skia 버퍼 안에서 부르기만 한다. 스프라이트 시트는 12×12 칸 4개를 가로로 이은 48×12 한 장이고, 모양은 파티클이 아니라 풀 슬롯에 영구히 붙는다.

**Tech Stack:** React Native 0.86 · Expo 57 · `@shopify/react-native-skia` 2.6.2 (`Atlas`, `useTexture`, `useRSXformBuffer`, `useColorBuffer`) · `react-native-reanimated` 4.5.1 (워크릿) · TypeScript 6 · Node 24 타입 스트리핑

**참조 스펙:** [색종이 화려화 설계](../specs/2026-08-25-confetti-flourish-design.md) · [파티 포퍼 기믹 설계 §7](../specs/2026-08-24-popper-gimmick-design.md)

## Global Constraints

이 절의 조건은 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **팔레트는 축제 6색 그대로.** 색을 추가하지 않는다 — 포퍼 스펙 §7이 "탁한 색이 절반"을 이유로 고정 팔레트를 택한 결정을 유지한다.
- **발사당 개수 `round(40 + 80 × power)` 그대로.** 물량을 늘리지 않는다.
- **`colorBlendMode="srcIn"` 그대로.** `modulate`로 바꾸지 않는다(스펙 §3 범위 밖).
- **드로우콜은 1번.** `Atlas` 하나로 256개를 계속 그린다.
- **`POOL_SIZE % SHAPE_COUNT === 0`.** 256 % 4 == 0. 이게 깨지면 랩어라운드에서 특정 모양이 조용히 더 자주 나온다.
- **`confettiLook.ts`에는 import가 하나도 없어야 한다.** Skia도 Reanimated도 들이면 Node 검증 수단이 사라진다. `cordPhysics.ts`와 같은 규칙이다.
- **물리 상수·풀 크기·`index.tsx`는 건드리지 않는다.**
- **워크릿에서 불리는 함수는 `'worklet'` 지시자로 시작한다.**
- 커밋 메시지는 한국어, 기존 로그 톤(`feat:` / `fix:` / `docs:`)을 따른다.
- 이 저장소엔 테스트 파일이 하나도 없다. 검증 하니스는 **커밋하지 않고** 스크래치패드에 둔다.

**하니스 경로(이하 `$CHECK`):**
`/private/tmp/claude-501/-Users-ninestring-work-toy-app/2c5c1a56-e0dc-4001-a5c3-61048eb919c2/scratchpad/confettiLook.check.ts`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/gimmicks/popper/confettiLook.ts` | **신규.** 색종이의 겉모습을 정하는 순수 상수·함수. import 없음 → Node로 직접 검증. 칸 배정(`cellX`), 플러터 위상(`flutterScale`), 금박 색(`writeConfettiRgb`), 팔레트. |
| `src/gimmicks/popper/confetti.tsx` | **수정.** 물리 적분과 Skia 버퍼. 겉모습 수학을 위 모듈에 위임하고, 텍스처를 4칸으로 굽고, 파티클에 `foil` 필드를 얹는다. |
| `src/gimmicks/popper/index.tsx` | **변경 없음.** |

`flutterScale`을 `confettiLook.ts`에 두는 이유는 검증만이 아니다. 변환 버퍼의 스케일 진동과 색 버퍼의 번쩍임이 **같은 위상**을 써야 하는데, 지금은 `sin(rot * 3)`이 변환 버퍼 안에 인라인으로 박혀 있다. 한쪽만 고치면 조용히 어긋난다 — 상수 `FLUTTER_CYCLES` 하나를 두 곳이 공유하게 만든다.

---

## Task 1: 순수 겉모습 모듈 (`confettiLook.ts`)

**Files:**
- Create: `src/gimmicks/popper/confettiLook.ts`
- Test(하니스, 커밋 안 함): `$CHECK`

**Interfaces:**
- Consumes: 없음(이 파일은 import가 없다).
- Produces — Task 2·3이 이 이름들에 의존한다:
  - `CELL: number` (12), `SHAPE_COUNT: number` (4)
  - `TEXTURE_WIDTH: number` (48), `TEXTURE_HEIGHT: number` (12)
  - `cellX(slot: number): number`
  - `flutterScale(rot: number): number`
  - `PALETTE: readonly (readonly [number, number, number])[]`
  - `FOIL_RATIO: number` (0.34)
  - `writeConfettiRgb(out: { [index: number]: number }, colorIndex: number, rot: number, foil: number): void`

- [ ] **Step 1: 실패하는 하니스를 먼저 쓴다**

`$CHECK`에 아래 내용을 그대로 쓴다. `import` 경로가 절대 경로인 건 스크래치패드에서 프로젝트 파일을 부르기 때문이다.

```ts
import assert from 'node:assert/strict';

import {
  CELL,
  SHAPE_COUNT,
  TEXTURE_WIDTH,
  TEXTURE_HEIGHT,
  cellX,
  flutterScale,
  PALETTE,
  FOIL_RATIO,
  writeConfettiRgb,
} from '/Users/ninestring/work/toy-app/src/gimmicks/popper/confettiLook.ts';

/** confetti.tsx의 풀 크기. 여기 복제해 두고 나눗셈 조건을 지킨다. */
const POOL_SIZE = 256;
/** 발사 1회 최소 개수 = round(40 + 80 × 0). */
const MIN_SHOT = 40;

// 1. 시트 크기가 칸 배치와 맞는다.
assert.equal(TEXTURE_WIDTH, CELL * SHAPE_COUNT, '시트 폭 = 칸 × 개수');
assert.equal(TEXTURE_HEIGHT, CELL, '시트는 한 줄이다');

// 2. 풀이 칸 수로 나누어떨어진다 — 랩어라운드 정렬 조건.
assert.equal(POOL_SIZE % SHAPE_COUNT, 0, 'POOL_SIZE % SHAPE_COUNT === 0');

// 3. 칸 오프셋은 항상 시트 안이고, 칸 경계에 정렬돼 있다.
for (let slot = 0; slot < POOL_SIZE; slot++) {
  const x = cellX(slot);
  assert.ok(x >= 0 && x + CELL <= TEXTURE_WIDTH, `슬롯 ${slot}: 시트 밖 ${x}`);
  assert.equal(x % CELL, 0, `슬롯 ${slot}: 칸 경계에 안 맞음`);
}

// 4. 한 발(최소 40개)이면 네 모양이 균등하게 섞인다 — 랩어라운드 지점에서도.
for (const start of [0, 7, 254]) {
  const counts = new Map<number, number>();
  for (let n = 0; n < MIN_SHOT; n++) {
    const x = cellX((start + n) % POOL_SIZE);
    counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  assert.equal(counts.size, SHAPE_COUNT, `start=${start}: 모양 ${SHAPE_COUNT}종이 다 나와야 한다`);
  for (const [x, count] of counts) {
    assert.equal(count, MIN_SHOT / SHAPE_COUNT, `start=${start}, 칸 ${x}: 균등해야 한다`);
  }
}

// 5. 플러터 스케일 치역은 0.5~1.0이다.
let flutterMin = Infinity;
let flutterMax = -Infinity;
for (let i = 0; i <= 20000; i++) {
  const f = flutterScale((i / 20000) * Math.PI * 4 - Math.PI * 2);
  flutterMin = Math.min(flutterMin, f);
  flutterMax = Math.max(flutterMax, f);
}
assert.ok(Math.abs(flutterMin - 0.5) < 1e-3, `플러터 하한 ${flutterMin}`);
assert.ok(Math.abs(flutterMax - 1.0) < 1e-3, `플러터 상한 ${flutterMax}`);

// 6. 무광 조각은 회전과 무관하게 팔레트 색 그대로다.
{
  const out = [0, 0, 0];
  for (let ci = 0; ci < PALETTE.length; ci++) {
    for (const rot of [0, 1.3, 5.5, -2.2]) {
      writeConfettiRgb(out, ci, rot, 0);
      assert.deepEqual(out, [...PALETTE[ci]], `무광 ${ci} @ rot=${rot}`);
    }
  }
}

// 7. 금박은 어느 색·어느 회전에서도 0~1을 벗어나지 않는다.
{
  const out = [0, 0, 0];
  for (let ci = 0; ci < PALETTE.length; ci++) {
    for (let i = 0; i <= 4000; i++) {
      const rot = (i / 4000) * Math.PI * 4 - Math.PI * 2;
      writeConfettiRgb(out, ci, rot, 1);
      for (let c = 0; c < 3; c++) {
        assert.ok(out[c] >= 0 && out[c] <= 1, `금박 ${ci} @ rot=${rot} 채널 ${c} = ${out[c]}`);
      }
    }
  }
}

// 8. 번쩍 피크는 팔레트보다 뚜렷하게 밝고, 뒷면 골은 뚜렷하게 어둡다.
//    위상은 flutterScale과 같아야 한다 — 피크에서 조각이 가장 넓게 보인다.
{
  const out = [0, 0, 0];
  const peak = Math.PI / 6; // sin(rot × 3) = +1
  const trough = -Math.PI / 6; // sin(rot × 3) = -1
  assert.ok(Math.abs(flutterScale(peak) - 1.0) < 1e-9, '번쩍 피크 = 플러터 최대');
  assert.ok(Math.abs(flutterScale(trough) - 0.5) < 1e-9, '뒷면 골 = 플러터 최소');

  const base = PALETTE[0];
  writeConfettiRgb(out, 0, peak, 1);
  assert.ok(out[1] > base[1] + 0.2, `번쩍이 밝아야 한다: ${out[1]} vs ${base[1]}`);
  writeConfettiRgb(out, 0, trough, 1);
  assert.ok(out[1] < base[1] - 0.05, `뒷면이 어두워야 한다: ${out[1]} vs ${base[1]}`);
}

// 9. 번쩍은 날카롭다 — 피크의 절반 위상에서 이미 대부분 사그라든다.
{
  const out = [0, 0, 0];
  const base = PALETTE[0];
  writeConfettiRgb(out, 0, Math.PI / 6, 1);
  const atPeak = out[1] - base[1];
  writeConfettiRgb(out, 0, Math.PI / 12, 1); // sin(rot × 3) = sin(45°) ≈ 0.707
  const atHalf = out[1] - base[1];
  assert.ok(atHalf < atPeak * 0.3, `4제곱이면 급히 사그라들어야 한다: ${atHalf} vs ${atPeak}`);
}

// 10. 금박 비율은 섞임을 만드는 값이다 — 0도 1도 아니다.
assert.ok(FOIL_RATIO > 0 && FOIL_RATIO < 1, `FOIL_RATIO = ${FOIL_RATIO}`);

console.log('confettiLook: 10개 검사 전부 통과');
```

- [ ] **Step 2: 하니스를 돌려 실패를 확인한다**

Run: `node "$CHECK"`
(`$CHECK`는 Global Constraints의 절대 경로로 바꿔 넣는다.)

Expected: FAIL — `Cannot find module .../confettiLook.ts`. 모듈이 아직 없다.

- [ ] **Step 3: 모듈을 쓴다**

`src/gimmicks/popper/confettiLook.ts`:

```ts
/**
 * 색종이의 겉모습을 정하는 순수 상수·함수. (화려화 스펙 §1, §2)
 *
 * **이 파일에 import가 하나도 없는 건 의도다** — `bulb/cordPhysics.ts`와
 * 같은 이유다. 이 앱엔 테스트 러너가 없고, 발사가 터치 제스처라
 * 시뮬레이터에서 트리거할 수도 없다. 색·모양 배정을 자동으로 검증할 수단이
 * Node의 타입 스트리핑(Node 24 기본값)으로 이 파일을 직접 실행하는 것뿐이다.
 * import를 하나라도 들이면 그 수단이 사라진다 — Skia도 Reanimated도 여기
 * 오면 안 된다.
 *
 * 아래 함수는 전부 워크릿이다. `confetti.tsx`의 변환·색 버퍼 안에서 불린다.
 */

/**
 * 스프라이트 시트의 칸 하나. **정사각이어야 한다** — RSXform은 스프라이트
 * (0,0)을 기준으로 변환하므로 회전을 조각 중심축으로 돌리려면 평행이동에서
 * 중심 오프셋을 빼야 하는데(`confetti.tsx`의 변환 버퍼), 칸이 모양마다 다른
 * 크기면 그 보정값이 개체마다 갈라져 워크릿에 분기가 들어온다.
 */
export const CELL = 12;

/** 칸 개수. `POOL_SIZE`가 이 값으로 나누어떨어져야 한다 — `cellX` 참조. */
export const SHAPE_COUNT = 4;

/** 시트는 칸을 가로로 이은 한 줄이다. `useTexture`에 넘길 크기의 출처. */
export const TEXTURE_WIDTH = CELL * SHAPE_COUNT;
export const TEXTURE_HEIGHT = CELL;

/**
 * 슬롯이 영구히 가리키는 칸의 x 오프셋.
 *
 * 모양이 파티클이 아니라 **풀 슬롯**에 붙는 이유: `Atlas`에서 워크릿 버퍼는
 * `transforms`와 `colors` 둘뿐이고 `sprites`는 정적 배열이라 런타임에 못
 * 바꾼다. 대신 스폰이 링버퍼를 순차로 훑으므로 한 발(최소 40개)이면 네
 * 모양이 저절로 균등하게 섞인다 — 분기도 랜덤 호출도 없다.
 *
 * ⚠️ `POOL_SIZE % SHAPE_COUNT === 0`이어야 랩어라운드에서도 정렬이 유지된다.
 * 풀을 250 같은 값으로 바꾸면 특정 모양이 조용히 더 자주 나온다.
 */
export function cellX(slot: number): number {
  'worklet';
  return (slot % SHAPE_COUNT) * CELL;
}

/**
 * 회전 한 바퀴당 플러터 진동 수.
 *
 * 변환의 스케일 진동과 색의 번쩍임이 **같은 위상**을 써야 한다 — 조각이
 * 정면으로 가장 넓게 보이는 순간이 빛을 반사할 순간이다. 한쪽에만 박아두면
 * 나중에 조용히 어긋나므로 상수를 하나만 둔다.
 */
const FLUTTER_CYCLES = 3;

/**
 * 조각이 정면(1.0)과 비스듬(0.5)을 오가는 스케일. RSXform이 균일 스케일만
 * 주므로 종횡 눌림 대신 이걸로 낙엽 느낌을 낸다.
 */
export function flutterScale(rot: number): number {
  'worklet';
  return 0.75 + 0.25 * Math.sin(rot * FLUTTER_CYCLES);
}

/**
 * 축제 6색 — 고깔과 같은 계열(포퍼 스펙 §7). 레퍼런스의 전면 랜덤 RGB는 탁한
 * 색이 절반이라 버렸다. SkColor(Float32Array)에 바로 쓰도록 0~1 RGB.
 */
export const PALETTE: readonly (readonly [number, number, number])[] = [
  [1.0, 0.42, 0.42], // 코랄 #ff6b6b
  [1.0, 0.85, 0.24], // 옐로 #ffd93d
  [0.31, 0.8, 0.77], // 민트 #4ecdc4
  [0.27, 0.67, 0.95], // 스카이 #45aaf2
  [0.65, 0.37, 0.92], // 바이올렛 #a55eea
  [0.99, 0.47, 0.66], // 핑크 #fd79a8
];

/**
 * 금박이 빛을 스칠 때의 색. 순수 흰색이면 형광으로 읽혀서 살짝 노랗다 —
 * 금박으로 보이게 하는 건 밝기가 아니라 이 온도다.
 */
const SHEEN: readonly [number, number, number] = [1.0, 0.97, 0.86];

/**
 * 금박으로 태어날 확률. 전부 반짝이면 균질해져서 종이가 아니라 플라스틱으로
 * 읽힌다 — 무광이 섞여 있어야 번쩍이는 조각이 도드라진다.
 *
 * ⚠️ 실기기 미검증. 손맛 보고 조정할 값이다.
 */
export const FOIL_RATIO = 0.34;

/** 번쩍임이 SHEEN 쪽으로 끌어당기는 최대치. ⚠️ 실기기 미검증. */
const GLINT_STRENGTH = 0.65;

/** 뒷면이 어두워지는 최대치. 이 대비가 있어야 깜빡임이 아니라 회전으로 읽힌다. */
const SHADE_STRENGTH = 0.25;

/**
 * 개체의 RGB를 `out[0..2]`에 쓴다. `out`은 색 버퍼가 준
 * SkColor(Float32Array)다 — 제자리에 채우므로 할당이 없다. 알파는 건드리지
 * 않는다(수명 페이드는 호출부의 일이다).
 *
 * 무광(`foil === 0`)은 팔레트 색 그대로다. 금박은 회전 위상에 따라
 * 갈린다 — 정면을 향할 때 `s⁴`로 날카롭게 번쩍이고(부드럽게 부풀면 "빛나는
 * 색"이 되지 "빛을 스치는 종이"가 안 된다), 뒷면일 때 `s²`로 어두워진다.
 * 두 갈래는 부호로 갈리므로 동시에 적용되지 않는다.
 */
export function writeConfettiRgb(
  out: { [index: number]: number },
  colorIndex: number,
  rot: number,
  foil: number
): void {
  'worklet';
  const rgb = PALETTE[colorIndex];

  if (foil === 0) {
    out[0] = rgb[0];
    out[1] = rgb[1];
    out[2] = rgb[2];
    return;
  }

  const s = Math.sin(rot * FLUTTER_CYCLES);

  if (s > 0) {
    const k = GLINT_STRENGTH * s * s * s * s;
    out[0] = rgb[0] + (SHEEN[0] - rgb[0]) * k;
    out[1] = rgb[1] + (SHEEN[1] - rgb[1]) * k;
    out[2] = rgb[2] + (SHEEN[2] - rgb[2]) * k;
    return;
  }

  const shade = 1 - SHADE_STRENGTH * s * s;
  out[0] = rgb[0] * shade;
  out[1] = rgb[1] * shade;
  out[2] = rgb[2] * shade;
}
```

- [ ] **Step 4: 하니스를 돌려 통과를 확인한다**

Run: `node "$CHECK"`
Expected: PASS — `confettiLook: 10개 검사 전부 통과`

- [ ] **Step 5: 타입 체크**

Run: `npm run typecheck`
Expected: 에러 없이 종료(exit 0). 아직 아무도 이 모듈을 안 쓰므로 `confetti.tsx`는 그대로 통과한다.

- [ ] **Step 6: 포맷 후 커밋**

```bash
npm run format
git add src/gimmicks/popper/confettiLook.ts
git commit -m "feat: 색종이 겉모습의 순수 모듈 — 칸 배정·플러터 위상·금박 색"
```

---

## Task 2: 스프라이트 시트를 4칸으로 (`confetti.tsx`)

**Files:**
- Modify: `src/gimmicks/popper/confetti.tsx`
- Test(하니스): `$CHECK` (Task 1에서 쓴 것 그대로 재실행)

**Interfaces:**
- Consumes: Task 1의 `CELL`, `SHAPE_COUNT`, `TEXTURE_WIDTH`, `TEXTURE_HEIGHT`, `cellX`, `flutterScale`.
- Produces: 없음(파일 내부 변경). `useConfetti`/`ConfettiAtlas`의 시그니처는 그대로다 — `index.tsx`는 안 건드린다.

이 태스크가 끝나면 색종이는 네 모양으로 날아가지만 반짝임은 아직 없다. 그 상태로 빌드되고 돌아간다.

- [ ] **Step 1: 시트를 굽는 도형과 상수를 교체한다**

`confetti.tsx` 상단에서 `SPRITE_W` / `SPRITE_H` / `SPRITE_SIZE` / `SPRITES` / `PALETTE`를 지우고 아래로 바꾼다. `Circle`, `Group`, `Path`를 `@shopify/react-native-skia` import에 추가하고(`Rect`는 이미 있다), 파일 맨 위에 로컬 모듈 import를 더한다.

```tsx
import { CELL, PALETTE, TEXTURE_HEIGHT, TEXTURE_WIDTH, cellX, flutterScale } from './confettiLook';
```

(`FOIL_RATIO`와 `writeConfettiRgb`는 Task 3에서 더한다 — 지금 넣으면 미사용 import가 된다.)

```tsx
/** `useTexture`의 deps에 들어가므로 반드시 모듈 상수 — 인라인 리터럴이면 발사마다 텍스처를 새로 굽는다. */
const TEXTURE_SIZE = { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT };

/** 마름모(칸 3)의 경로. 정적이므로 모듈 상수 — 키캡·고깔과 같은 패턴. */
const DIAMOND_PATH = Skia.PathBuilder.Make()
  .moveTo(CELL * 3 + 6, 2)
  .lineTo(CELL * 3 + 10, 6)
  .lineTo(CELL * 3 + 6, 10)
  .lineTo(CELL * 3 + 2, 6)
  .close()
  .detach();

/**
 * 시트에 구울 종이 4종. 전부 흰색이다 — 색은 Atlas colors가 개체별로 입힌다.
 *
 * **모든 모양은 칸 경계에서 0.5pt 안쪽에 있다.** 칸이 가로로 붙어 있어서
 * 경계에 닿은 픽셀은 겹선형 필터링에서 이웃 칸 색을 빨아들인다. 리본이
 * 3×12가 아니라 3×11인 게 그 이유다.
 */
const CONFETTI_SHEET = (
  <Group>
    {/* 0 — 직사각. 개정 전 조각과 같은 6×10, 기존 손맛의 기준점이다. */}
    <Rect x={3} y={1} width={6} height={10} color="white" />
    {/* 1 — 리본. */}
    <Rect x={CELL + 4.5} y={0.5} width={3} height={11} color="white" />
    {/* 2 — 원형. */}
    <Circle cx={CELL * 2 + 6} cy={6} r={4.5} color="white" />
    {/* 3 — 마름모. */}
    <Path path={DIAMOND_PATH} color="white" />
  </Group>
);

/**
 * 슬롯마다 자기 칸을 가리킨다. `Atlas`의 `sprites`는 워크릿 버퍼가 아니라
 * 정적 배열이라 이 배정은 앱 수명 내내 고정이다 — `cellX` 주석 참조.
 */
const SPRITES = Array.from({ length: POOL_SIZE }, (_, slot) =>
  Skia.XYWHRect(cellX(slot), 0, CELL, CELL)
);
```

- [ ] **Step 2: 텍스처를 시트로 굽는다**

`useConfetti` 안의 `useTexture` 호출을 바꾼다. 주석도 시트 기준으로 고친다.

```tsx
  /**
   * 종이 4종을 한 장의 GPU 텍스처로. 색은 Atlas colors가 개체별로 입힌다 —
   * srcIn이라 스프라이트의 알파만 남기고 색을 통째로 덮는다.
   *
   * 엘리먼트는 모듈 상수다 — `useTexture`가 그리기 이펙트에 넘기는 deps는
   * 세 번째 인자(생략 시 `[]`)뿐이라 identity를 보진 않지만, 매 렌더 새
   * 엘리먼트를 만들 이유도 없다. 반면 size는 `usePictureAsTexture`의 deps에
   * 그대로 들어가므로 반드시 상수여야 한다.
   */
  const texture = useTexture(CONFETTI_SHEET, TEXTURE_SIZE);
```

- [ ] **Step 3: 회전축 보정을 칸 중심으로 바꾼다**

변환 버퍼에서 `flutter` 인라인 식을 `flutterScale` 호출로 바꾸고, `cx`/`cy`를 칸 중심 하나로 합친다.

```tsx
    const flutter = flutterScale(particle.rot);
    const scale = particle.scale * flutter;
    const scos = Math.cos(particle.rot) * scale;
    const ssin = Math.sin(particle.rot) * scale;
    /** 칸이 정사각이라 중심 보정이 모양과 무관하게 하나다(confettiLook의 CELL 주석). */
    const center = CELL / 2;
    xform.set(
      scos,
      ssin,
      particle.x - (scos * center - ssin * center),
      particle.y - (ssin * center + scos * center)
    );
```

- [ ] **Step 4: 하니스를 다시 돌려 나눗셈 조건이 여전히 성립하는지 본다**

Run: `node "$CHECK"`
Expected: PASS — `confettiLook: 10개 검사 전부 통과`. (`POOL_SIZE = 256`이 하니스에 복제돼 있다. `confetti.tsx`의 값을 바꿨다면 여기서 갈라진다.)

- [ ] **Step 5: 타입 체크**

Run: `npm run typecheck`
Expected: 에러 없이 종료(exit 0).

미사용 심볼이 남아 에러가 나면 `SPRITE_W`·`SPRITE_H`·`SPRITE_SIZE` 삭제가 빠진 것이다.

- [ ] **Step 6: 포맷 후 커밋**

```bash
npm run format
git add src/gimmicks/popper/confetti.tsx
git commit -m "feat: 색종이 모양 4종 — 12×12 칸 4개 시트, 슬롯에 고정 배정"
```

---

## Task 3: 개체 1/3의 금박 반짝임 (`confetti.tsx`)

**Files:**
- Modify: `src/gimmicks/popper/confetti.tsx`
- Test(하니스): `$CHECK`

**Interfaces:**
- Consumes: Task 1의 `FOIL_RATIO`, `writeConfettiRgb`, `PALETTE`.
- Produces: 없음. `useConfetti`/`ConfettiAtlas` 시그니처 그대로.

- [ ] **Step 1: import에 두 이름을 더한다**

```tsx
import {
  CELL,
  FOIL_RATIO,
  PALETTE,
  TEXTURE_HEIGHT,
  TEXTURE_WIDTH,
  cellX,
  flutterScale,
  writeConfettiRgb,
} from './confettiLook';
```

- [ ] **Step 2: 파티클에 `foil` 필드를 얹는다**

`Particle` 타입과 `makeDeadParticle`을 고친다.

```tsx
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number; // 라디안
  rotV: number; // 라디안/s
  scale: number;
  colorIndex: number;
  /** 1이면 금박 — 회전하며 빛을 스친다. 색 버퍼만 읽는다(물리와 무관). */
  foil: number;
  life: number; // 남은 초. 0 이하 = 죽음
};

function makeDeadParticle(): Particle {
  return { x: 0, y: 0, vx: 0, vy: 0, rot: 0, rotV: 0, scale: 1, colorIndex: 0, foil: 0, life: 0 };
}
```

- [ ] **Step 3: 스폰에서 금박 여부를 정한다**

스폰 루프의 `particle.colorIndex = ...` 바로 아래에 한 줄을 더한다.

```tsx
        particle.colorIndex = Math.floor(Math.random() * PALETTE.length);
        particle.foil = Math.random() < FOIL_RATIO ? 1 : 0;
```

- [ ] **Step 4: 색 버퍼를 순수 함수에 위임한다**

```tsx
  /**
   * 개체 색 + 수명 끝 페이드아웃. SkColor는 [r,g,b,a] Float32Array다.
   * RGB는 `writeConfettiRgb`가 제자리에 채운다 — 금박이면 회전 위상에 따라
   * 번쩍이고, 무광이면 팔레트 색 그대로다. 알파만 여기서 정한다.
   */
  const colors = useColorBuffer(POOL_SIZE, (color, index) => {
    'worklet';
    void tick.value;
    const particle = particles.value[index];
    writeConfettiRgb(color, particle.colorIndex, particle.rot, particle.foil);
    color[3] = particle.life <= 0 ? 0 : Math.min(1, particle.life / FADE_SECONDS);
  });
```

- [ ] **Step 5: 파일 상단 주석을 실제와 맞춘다**

파일 머리 블록 주석에서 시뮬레이션·렌더 설명은 그대로 두되, 겉모습 수학이 옆 파일로 나갔다는 사실을 한 문단 더한다.

```
 * 겉모습(칸 배정·플러터 위상·금박 색)은 `confettiLook.ts`가 소유한다 —
 * import가 없어 Node로 직접 검증되는 파일이다. 여기 남은 건 물리 적분과
 * Skia 버퍼 배선이다.
```

- [ ] **Step 6: 하니스 · 타입 체크**

Run: `node "$CHECK" && npm run typecheck`
Expected: `confettiLook: 10개 검사 전부 통과` 출력 후 타입 에러 없이 종료(exit 0).

- [ ] **Step 7: 포맷 후 커밋**

```bash
npm run format
git add src/gimmicks/popper/confetti.tsx
git commit -m "feat: 색종이 1/3에 금박 반짝임 — 플러터와 같은 위상"
```

- [ ] **Step 8: 실기기 확인 체크리스트를 스펙에 남긴다**

`docs/superpowers/specs/2026-08-25-confetti-flourish-design.md`의 §4 끝에 아래를 덧붙인다. 포퍼 스펙에 실기기 체크리스트를 남긴 것과 같은 패턴이다.

```markdown
### 실기기 체크리스트

손으로 쏴 보고 확인할 것 — 전부 미검증이다.

- [ ] 네 모양이 실제로 구분되는가. 12×12 칸에서 마름모 8×8과 원형 r4.5가
      멀리서 같은 덩어리로 뭉개지지 않는가.
- [ ] 리본(3×11)이 회전 중에 너무 얇아 사라지지 않는가.
- [ ] 금박이 "회전하는 종이"로 읽히는가, "깜빡이는 점"으로 읽히는가.
      후자면 `SHADE_STRENGTH`를 올려 뒷면 대비를 키운다.
- [ ] 금박 비율 0.34가 적당한가. 너무 잦으면 플라스틱, 너무 드물면 티가 안 난다.
- [ ] 번쩍임이 어두운 남보라 배경(#2a2140→#141021)에서 튀지 않는가.
- [ ] 연사해도 60fps가 유지되는가 — 드로우콜은 여전히 1번이어야 한다.
```

```bash
git add docs/superpowers/specs/2026-08-25-confetti-flourish-design.md
git commit -m "docs: 색종이 화려화 스펙에 실기기 체크리스트 추가"
```

---

## 완료 조건

- `node "$CHECK"`가 10개 검사를 전부 통과한다.
- `npm run typecheck`가 에러 없이 끝난다.
- `src/gimmicks/popper/index.tsx`에 변경이 없다(`git diff main -- src/gimmicks/popper/index.tsx`가 비어 있다).
- `confettiLook.ts`에 `import` 줄이 없다(`grep -c "^import" src/gimmicks/popper/confettiLook.ts`가 0).
- **"화려해졌다"는 자동 검증 대상이 아니다** — 실기기에서 손으로 쏴 봐야 한다. Task 3 Step 8의 체크리스트가 그 자리를 표시한다.
