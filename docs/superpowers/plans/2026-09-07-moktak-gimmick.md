# 목탁 기믹 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목탁을 누르면 채가 내려와 치고 "똑" 소리·햅틱이 나며, 108 카운트다운과 27타마다 법구경 문구 카드가 뜨는 다섯째 기믹을 붙인다.

**Architecture:** 입력은 기존 `discrete` 모델을 그대로 쓰되 `hitTest` 워크릿 prop을 하나 더해 목탁 위의 탭만 통과시킨다. 108 사이클과 문구 인덱스는 셸 카운트에서 파생되는 순수 함수(`cycle.ts`, import 없음 → Node 검증)다. 소리는 이 앱 최초로 붙는데, registry의 `sound` 키 → `audio/assets.ts` 맵 → 기믹 화면이 `SoundPool`을 만들어 `onInteract`마다 재생하는 셸 경로로 흐른다. 기믹 컴포넌트는 소리를 모른다.

**Tech Stack:** React Native 0.86 · Expo 57 · `@shopify/react-native-skia` 2.6.2 (`Oval`, `Path`, `RadialGradient`, `LinearGradient`, `BlurMask`, `Group origin`) · `react-native-reanimated` 4.5.1 · `react-native-gesture-handler` 2.32 · `expo-audio` 57 · `react-native-pulsar` 1.7 · TypeScript 6 · Node 24 타입 스트리핑

**참조 스펙:** [목탁 기믹 설계](../specs/2026-09-07-moktak-gimmick-design.md)

## Global Constraints

이 절의 조건은 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **기믹 화면 내부(`src/gimmicks/**`)에서 `className`을 쓰지 않는다.** (stack.md §1) 텍스트는 RN `Text`/`Animated.Text` + 스타일 객체.
- **`cycle.ts`에는 import가 하나도 없어야 한다.** Node 검증 수단이 사라진다. `cordPhysics.ts`·`confettiLook.ts`와 같은 규칙.
- **워크릿에서 불리는 함수는 `'worklet'` 지시자로 시작한다.**
- **누를 때 애니메이션 0ms, 뗄 때만 여운.** (§0, 키캡 전례) 채는 터치 다운에 즉시 타격 각도로 간다.
- **햅틱 기본값은 `knock`.** 실기기 확인된 값이다. 후보 교체는 실기기 세션의 일이고 이 계획의 범위가 아니다.
- **새 의존성 없음.** Metro 기본 `assetExts`에 `wav`가 포함된다.
- **기존 기믹 무회귀.** `hitTest`를 안 주는 discrete(키캡)은 동작이 같아야 한다.
- 새 파일을 추가하면 Metro 캐시가 썩는다 — `Requiring unknown module`이 뜨면 `npm run dev:clear`.
- 커밋 메시지는 한국어, 기존 로그 톤(`feat:` / `fix:` / `docs:`). 커밋 전 `npm run format`.
- 이 저장소엔 테스트 러너가 없다. 검증 하니스는 **커밋하지 않고** 스크래치패드에 둔다.

**하니스 경로(이하 `$CHECK`):**
`/private/tmp/claude-501/-Users-ninestring-work-toy-app/c2e3ef0c-9b37-4476-8c77-516ad3e1f031/scratchpad/cycle.check.mts`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/gimmicks/moktak/cycle.ts` | **신규.** 108 사이클·문구 인덱스 순수 함수. import 없음. |
| `src/gimmicks/moktak/quotes.ts` | **신규.** 문구 12개 상수. 시각 정보라 기믹이 소유. |
| `src/gimmicks/moktak/index.tsx` | **신규.** Skia 도화(목탁·채·그림자), 상단 정보, 문구 카드, 히트테스트. |
| `src/gimmicks/_kinds/discrete.tsx` | **수정.** `hitTest` prop, 릴리스 햅틱 가드. |
| `src/gimmicks/registry.ts` | **수정.** `moktak` 항목. |
| `src/gimmicks/types.ts` | **수정.** `GimmickBase.sound?: SoundKey`. |
| `src/lib/tints.ts` | **수정.** `orange`. |
| `scripts/synth-moktak.mjs` | **신규.** WAV 합성 스크립트. |
| `assets/sounds/moktak.wav` | **신규.** 합성 결과. 커밋한다. |
| `src/audio/assets.ts` | **신규.** 사운드 키 → 에셋 맵, `SoundKey`. |
| `src/audio/useSoundPool.ts` | **신규.** 키로 `SoundPool`을 만들고 해제하는 훅. |
| `src/app/gimmick/[id].tsx` | **수정.** `useSoundPool` 연결 — `onInteract`에서 재생. |
| `stack.md` | **수정.** 폴더 구조에 `moktak/`, §5 오디오에 재생 경로. |
| `docs/superpowers/specs/2026-09-07-moktak-gimmick-design.md` | **수정.** 실기기 체크리스트. |

---

## Task 1: 순수 사이클 모듈 (`cycle.ts`)

**Files:**
- Create: `src/gimmicks/moktak/cycle.ts`
- Test(하니스, 커밋 안 함): `$CHECK`

**Interfaces:**
- Consumes: 없음.
- Produces — Task 5·6이 이 이름들에 의존한다:
  - `CYCLE: number` (108), `QUOTE_EVERY: number` (27)
  - `remainingOf(count: number): number`
  - `lapsOf(count: number): number`
  - `progressOf(count: number): number` (0~1)
  - `quoteIndexAt(count: number, quoteCount: number): number | null`

- [ ] **Step 1: 실패하는 하니스를 먼저 쓴다**

`$CHECK`에 아래를 그대로 쓴다. 스크래치패드엔 package.json이 없어 `.mts` 확장자로 모듈 종류를 정하고, 프로젝트 파일은 절대 경로로 부른다.

```ts
import assert from 'node:assert/strict';

import {
  CYCLE,
  QUOTE_EVERY,
  lapsOf,
  progressOf,
  quoteIndexAt,
  remainingOf,
} from '/Users/ninestring/work/toy-app/src/gimmicks/moktak/cycle.ts';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check('상수', () => {
  assert.equal(CYCLE, 108);
  assert.equal(QUOTE_EVERY, 27);
});

check('remainingOf — 0은 108, 107은 1, 108은 새 바퀴라 다시 108', () => {
  assert.equal(remainingOf(0), 108);
  assert.equal(remainingOf(1), 107);
  assert.equal(remainingOf(27), 81);
  assert.equal(remainingOf(107), 1);
  assert.equal(remainingOf(108), 108);
  assert.equal(remainingOf(109), 107);
  assert.equal(remainingOf(216), 108);
});

check('lapsOf — 108마다 1', () => {
  assert.equal(lapsOf(0), 0);
  assert.equal(lapsOf(107), 0);
  assert.equal(lapsOf(108), 1);
  assert.equal(lapsOf(215), 1);
  assert.equal(lapsOf(216), 2);
});

check('progressOf — 0~1, 108에서 0으로 돌아간다', () => {
  assert.equal(progressOf(0), 0);
  assert.equal(progressOf(54), 0.5);
  assert.equal(progressOf(108), 0);
  assert.ok(progressOf(107) > 0.99 && progressOf(107) < 1);
});

check('quoteIndexAt — 27의 배수(0 제외)에서만, 순환', () => {
  assert.equal(quoteIndexAt(0, 12), null);
  assert.equal(quoteIndexAt(1, 12), null);
  assert.equal(quoteIndexAt(26, 12), null);
  assert.equal(quoteIndexAt(28, 12), null);
  assert.equal(quoteIndexAt(27, 12), 0);
  assert.equal(quoteIndexAt(54, 12), 1);
  assert.equal(quoteIndexAt(108, 12), 3);
  assert.equal(quoteIndexAt(324, 12), 11);
  assert.equal(quoteIndexAt(351, 12), 0);
});

check('quoteIndexAt — 문구가 0개면 null', () => {
  assert.equal(quoteIndexAt(27, 0), null);
});

console.log(`cycle: ${passed}개 검사 전부 통과`);
```

- [ ] **Step 2: 하니스를 돌려 실패를 확인한다**

Run: `node "$CHECK"`
Expected: `Cannot find module '/Users/ninestring/work/toy-app/src/gimmicks/moktak/cycle.ts'`로 실패.

- [ ] **Step 3: 모듈을 쓴다**

`src/gimmicks/moktak/cycle.ts`:

```ts
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
```

- [ ] **Step 4: 하니스를 돌려 통과를 확인한다**

Run: `node "$CHECK"`
Expected: `cycle: 6개 검사 전부 통과`. (`MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해하다.)

- [ ] **Step 5: 타입 체크 · import 없음 확인**

Run: `npm run typecheck && grep -c "^import" src/gimmicks/moktak/cycle.ts`
Expected: 타입 에러 없음, grep 출력 `0`.

- [ ] **Step 6: 포맷 후 커밋**

```bash
npm run format
git add src/gimmicks/moktak/cycle.ts
git commit -m "feat: 목탁 108 사이클 순수 모듈 — 남은 수·바퀴·문구 인덱스"
```

---

## Task 2: 소리 — 합성 에셋과 셸 재생 경로

이 태스크가 끝나면 registry에 `sound: '<키>'`를 적은 기믹은 `onInteract`마다 소리가 난다. 아직 쓰는 기믹은 없다(Task 5가 붙인다).

**Files:**
- Create: `scripts/synth-moktak.mjs`
- Create: `assets/sounds/moktak.wav` (스크립트 출력)
- Create: `src/audio/assets.ts`
- Create: `src/audio/useSoundPool.ts`
- Modify: `src/gimmicks/types.ts` (`GimmickBase.sound`)
- Modify: `src/app/gimmick/[id].tsx` (`onInteract`)

**Interfaces:**
- Consumes: `SoundPool` (`src/audio/pool.ts`, 기존) — `new SoundPool(source)`, `play()`, `release()`.
- Produces:
  - `SOUND_ASSETS: { moktak: number }`, `type SoundKey = 'moktak'` (`src/audio/assets.ts`)
  - `useSoundPool(key: SoundKey | undefined): () => void` — 재생 함수. 키가 없으면 no-op.
  - `GimmickBase.sound?: SoundKey` — Task 5의 registry 항목이 `sound: 'moktak'`을 적는다.

- [ ] **Step 1: 합성 스크립트를 쓴다**

`scripts/synth-moktak.mjs`:

```js
// 목탁 타격음 합성. 실행: node scripts/synth-moktak.mjs
//
// 실제 녹음이 없어 감쇠 사인 3개 + 어택 노이즈 클릭으로 "나무를 친 소리"를
// 만든다(스펙 §5). 실기기에서 들어보고 PARTIALS의 주파수·감쇠를 바꿔 다시
// 돌리면 된다 — 그래서 스크립트를 결과 WAV와 함께 커밋한다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/sounds/moktak.wav');

const SAMPLE_RATE = 44100;
const DURATION_S = 0.25;

/** 부분음. 기본음 + 배음 둘. 높은 배음이 먼저 죽어야 "나무"로 들린다. */
const PARTIALS = [
  { freq: 820, decayMs: 80, gain: 1.0 },
  { freq: 1650, decayMs: 60, gain: 0.5 },
  { freq: 2400, decayMs: 40, gain: 0.3 },
];

/** 어택의 노이즈 클릭. 이게 없으면 목탁이 아니라 실로폰이다. */
const CLICK_MS = 5;
const CLICK_GAIN = 0.6;

/** 꼬리를 잘라 끝에서 클릭이 나지 않게 한다. */
const TAIL_FADE_MS = 20;

/** 피크 정규화 목표. */
const PEAK_DBFS = -1;

/** 결정적 노이즈 — 같은 입력이면 같은 파일이 나와 diff가 깨끗하다. */
let seed = 0x9e3779b9;
function noise() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 4294967296) * 2 - 1;
}

const n = Math.round(SAMPLE_RATE * DURATION_S);
const samples = new Float64Array(n);

for (let i = 0; i < n; i += 1) {
  const t = i / SAMPLE_RATE;
  const ms = t * 1000;
  let v = 0;
  for (const p of PARTIALS) {
    v += p.gain * Math.exp(-ms / p.decayMs) * Math.sin(2 * Math.PI * p.freq * t);
  }
  if (ms < CLICK_MS) {
    v += CLICK_GAIN * noise() * (1 - ms / CLICK_MS);
  }
  const remainingMs = (DURATION_S - t) * 1000;
  if (remainingMs < TAIL_FADE_MS) {
    v *= remainingMs / TAIL_FADE_MS;
  }
  samples[i] = v;
}

let peak = 0;
for (const v of samples) {
  peak = Math.max(peak, Math.abs(v));
}
const scale = Math.pow(10, PEAK_DBFS / 20) / peak;

/** 16bit PCM 모노 WAV. 헤더 44바이트. */
const data = Buffer.alloc(n * 2);
for (let i = 0; i < n; i += 1) {
  const s = Math.max(-1, Math.min(1, samples[i] * scale));
  data.writeInt16LE(Math.round(s * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16); // fmt 청크 크기
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // 모노
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([header, data]));
console.log(`wrote ${OUT} — ${n} samples, ${(DURATION_S * 1000).toFixed(0)}ms, peak ${PEAK_DBFS}dBFS`);
```

- [ ] **Step 2: 스크립트를 돌리고 WAV 헤더를 검증한다**

Run:

```bash
node scripts/synth-moktak.mjs && node -e '
const fs = require("fs");
const b = fs.readFileSync("assets/sounds/moktak.wav");
const assert = require("assert/strict");
assert.equal(b.toString("ascii", 0, 4), "RIFF");
assert.equal(b.toString("ascii", 8, 12), "WAVE");
assert.equal(b.readUInt16LE(20), 1, "PCM");
assert.equal(b.readUInt16LE(22), 1, "mono");
assert.equal(b.readUInt32LE(24), 44100);
assert.equal(b.readUInt16LE(34), 16);
const len = b.readUInt32LE(40);
assert.equal(len, b.length - 44);
assert.equal(len / 2, Math.round(44100 * 0.25), "sample count");
let peak = 0;
for (let i = 44; i < b.length; i += 2) peak = Math.max(peak, Math.abs(b.readInt16LE(i)));
const dbfs = 20 * Math.log10(peak / 32767);
assert.ok(dbfs > -1.2 && dbfs < -0.8, `peak ${dbfs}`);
console.log(`wav ok — ${len / 2} samples, peak ${dbfs.toFixed(2)} dBFS`);
'
```

Expected: `wrote …/assets/sounds/moktak.wav` 다음 줄에 `wav ok — 11025 samples, peak -1.00 dBFS` 근처.

- [ ] **Step 3: 에셋 맵을 쓴다**

`src/audio/assets.ts`:

```ts
/**
 * 사운드 에셋 맵. (§5 오디오)
 *
 * registry의 `sound` 키가 여기 키로 제한된다(`SoundKey`). 프리셋 이름
 * (`PresetName`)과 같은 수법 — 없는 키는 런타임 무음이 아니라 컴파일 에러.
 *
 * `require`는 Metro가 에셋을 번들에 싸는 방식이다. 값은 에셋 id(number)이고
 * `expo-audio`의 `AudioSource`가 그대로 받는다.
 */
export const SOUND_ASSETS = {
  /** 목탁 타격음. `scripts/synth-moktak.mjs`가 만든 합성음이다. */
  moktak: require('../../assets/sounds/moktak.wav') as number,
} as const;

/** 사운드 키. registry의 `sound`가 이 유니온으로 제한된다. */
export type SoundKey = keyof typeof SOUND_ASSETS;
```

- [ ] **Step 4: 훅을 쓴다**

`src/audio/useSoundPool.ts`:

```ts
import * as React from 'react';

import { SOUND_ASSETS, type SoundKey } from './assets';
import { SoundPool } from './pool';

/**
 * 기믹 화면이 registry의 `sound` 키로 플레이어 풀을 얻는다. (§5 오디오)
 *
 * 마운트 시 풀을 만들고 언마운트 시 해제한다. 반환값은 재생 함수 하나 —
 * 키가 없는 기믹(키캡·다이얼·전구·포퍼)에는 아무것도 안 하는 함수가 온다.
 * 호출부가 분기하지 않게 하기 위해서다(`useHapticFire`가 undefined 스펙에
 * 하는 것과 같다).
 *
 * 재생은 JS 스레드다. `onInteract`가 `runOnJS`를 타고 오므로 햅틱(UI
 * 스레드)보다 늦다 — expo-audio에 워크릿 경로가 없어 지금 구조에선 더
 * 당길 수 없다. 어긋남이 체감되는지는 실기기 몫이다(스펙 §5).
 */
export function useSoundPool(key: SoundKey | undefined): () => void {
  const poolRef = React.useRef<SoundPool | null>(null);

  React.useEffect(() => {
    if (key === undefined) {
      return;
    }
    const pool = new SoundPool(SOUND_ASSETS[key]);
    poolRef.current = pool;
    return () => {
      poolRef.current = null;
      pool.release();
    };
  }, [key]);

  return React.useCallback(() => {
    poolRef.current?.play();
  }, []);
}
```

- [ ] **Step 5: `GimmickBase.sound`를 `SoundKey`로 좁힌다**

`src/gimmicks/types.ts` 상단 import 블록에 추가:

```ts
import type { SoundKey } from '@/audio/assets';
```

`GimmickBase`의 `sound` 줄을 교체:

```ts
type GimmickBase = {
  id: string;
  name: string;
  /**
   * 사운드 키. 없는 키는 컴파일 에러(`audio/assets.ts`). 소리는 §5대로
   * 플레이어 풀을 거치며, 기믹 화면(셸)이 `onInteract`마다 튼다 — 기믹
   * 컴포넌트는 소리를 모른다.
   */
  sound?: SoundKey;
  /** 갤러리 타일의 아이콘과 틴트. */
  look: GimmickLook;
};
```

`import type`이므로 types.ts가 WAV를 번들에 끌어오지 않는다.

- [ ] **Step 6: 기믹 화면에 연결한다**

`src/app/gimmick/[id].tsx`의 import 블록에 추가:

```ts
import { useSoundPool } from '@/audio/useSoundPool';
```

`GimmickView` 안, `const capability = useHapticCapability();` 다음 줄에:

```ts
  /** registry에 `sound`가 있으면 조작마다 튼다. 없으면 no-op. (§5 오디오) */
  const playSound = useSoundPool(gimmick.sound);
```

기존 `onInteract`를 교체:

```ts
  const onInteract = React.useCallback(() => {
    playSound();
    interact(gimmick.id);
  }, [playSound, interact, gimmick.id]);
```

- [ ] **Step 7: 타입 체크**

Run: `npm run typecheck`
Expected: 에러 없음. (아직 `sound`를 쓰는 기믹이 없으니 런타임 변화도 없다.)

- [ ] **Step 8: 포맷 후 커밋**

```bash
npm run format
git add scripts/synth-moktak.mjs assets/sounds/moktak.wav src/audio/assets.ts src/audio/useSoundPool.ts src/gimmicks/types.ts "src/app/gimmick/[id].tsx"
git commit -m "feat: 사운드 경로 — 합성 목탁음 에셋, registry sound 키를 셸이 재생"
```

---

## Task 3: `DiscreteGimmick`에 `hitTest`

**Files:**
- Modify: `src/gimmicks/_kinds/discrete.tsx`

**Interfaces:**
- Produces: `Props.hitTest?: (x: number, y: number) => boolean` — 워크릿. 루트 뷰 기준 좌표. Task 5의 목탁이 준다.

- [ ] **Step 1: prop과 판정을 넣는다**

`Props` 타입을 교체:

```ts
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
```

함수 시그니처와 제스처를 교체:

```ts
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
          /** 빗나간 탭. 아무 일도 없다 — 목탁의 채나 배경을 누른 경우. */
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
         * 뗄 때 소리가 나면 안 된다.
         */
        .onFinalize(() => {
          'worklet';
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
```

- [ ] **Step 2: 타입 체크**

Run: `npm run typecheck`
Expected: 에러 없음. 키캡은 `hitTest`를 안 주므로 `undefined` 분기로 기존과 같다.

- [ ] **Step 3: 포맷 후 커밋**

```bash
npm run format
git add src/gimmicks/_kinds/discrete.tsx
git commit -m "feat: discrete에 hitTest — 유효 위치의 탭만 딸깍"
```

---

## Task 4: 문구 상수 (`quotes.ts`)

**Files:**
- Create: `src/gimmicks/moktak/quotes.ts`

**Interfaces:**
- Produces: `type Quote = { text: string; source: string }`, `QUOTES: readonly Quote[]` (12개). Task 6이 쓴다.

- [ ] **Step 1: 파일을 쓴다**

```ts
/**
 * 문구 카드에 도는 구절 12개. (스펙 §4)
 *
 * 컴포넌트 상수와 같은 취급 — 시각 정보는 기믹이 자기 것으로 갖는다(§4
 * 원칙 1이 데이터로 규정한 건 햅틱뿐). 두 줄 안에 들어가는 길이로 골랐다.
 * 번역은 널리 알려진 풀이를 짧게 다듬은 것이다.
 *
 * 순서가 곧 등장 순서다(`cycle.ts`의 `quoteIndexAt`). 개수를 바꾸면
 * 같은 횟수에 다른 문구가 뜬다.
 */
export type Quote = {
  text: string;
  source: string;
};

export const QUOTES: readonly Quote[] = [
  { text: '한 방울의 물이 모여 항아리를 채운다. 작은 선도 그렇게 쌓인다.', source: '법구경' },
  { text: '마음이 모든 것에 앞선다. 마음이 맑으면 말과 행동도 맑다.', source: '법구경' },
  { text: '미움은 미움으로 그치지 않는다. 미움을 버릴 때 비로소 그친다.', source: '법구경' },
  { text: '남의 잘못을 보지 말고, 자신이 한 일과 하지 않은 일을 보라.', source: '법구경' },
  { text: '천 마디 쓸모없는 말보다 들어서 고요해지는 한마디가 낫다.', source: '법구경' },
  { text: '자기 자신이야말로 자신의 주인이다. 어떤 주인이 따로 있겠는가.', source: '법구경' },
  { text: '잠 못 드는 이에게 밤은 길고, 지친 이에게 길은 멀다.', source: '법구경' },
  { text: '원한을 품은 사람들 속에서 원한 없이 사는 것, 그것이 행복이다.', source: '법구경' },
  { text: '무소의 뿔처럼 혼자서 가라.', source: '숫타니파타' },
  { text: '지나간 것을 슬퍼하지 않고 오지 않은 것을 바라지 않는 이는 지금 여기에 산다.', source: '숫타니파타' },
  { text: '모든 지어진 것은 이슬 같고 번개 같으니, 마땅히 그렇게 보라.', source: '금강경' },
  { text: '마땅히 머무는 바 없이 그 마음을 내라.', source: '금강경' },
];
```

- [ ] **Step 2: 타입 체크 후 커밋**

Run: `npm run typecheck`
Expected: 에러 없음.

```bash
npm run format
git add src/gimmicks/moktak/quotes.ts
git commit -m "feat: 목탁 문구 12개 — 법구경·숫타니파타·금강경"
```

---

## Task 5: 목탁 씬 — 그림·상단 정보·히트테스트·registry

이 태스크가 끝나면 갤러리에 다섯째 타일이 생기고, 목탁 화면이 뜨며(시뮬레이터로 확인), 실기기에서 몸통을 누르면 채가 치고 소리·햅틱이 난다. 문구 카드는 Task 6.

**Files:**
- Create: `src/gimmicks/moktak/index.tsx`
- Modify: `src/lib/tints.ts`
- Modify: `src/gimmicks/registry.ts`

**Interfaces:**
- Consumes: `DiscreteGimmick` + `hitTest`(Task 3), `remainingOf`/`lapsOf`/`progressOf`(Task 1), `SoundKey 'moktak'`(Task 2), `useGimmickCount`(`@/store/gimmickState`, 기존).
- Produces: `default Moktak: ComponentType<GimmickScreenProps<'discrete'>>`. Task 6이 이 파일에 `<QuoteCard count={count} />` 한 줄을 끼운다 — 아래 코드의 `{/* Task 6: QuoteCard */}` 자리.

- [ ] **Step 1: 틴트 `orange`를 추가한다**

`src/lib/tints.ts`의 `TINTS`에서 `rose` 항목 뒤에:

```ts
  orange: {
    surface: 'bg-orange-500/10 dark:bg-orange-500/15 border-orange-500/20',
    icon: 'text-orange-600 dark:text-orange-400',
  },
```

파일 머리 주석의 색 목록에 한 줄:

```
 *   orange  ← 목탁 몸통 #b5532b
```

- [ ] **Step 2: 목탁 컴포넌트를 쓴다**

`src/gimmicks/moktak/index.tsx`:

```tsx
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Oval,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  Skia,
  vec,
  type SkSize,
} from '@shopify/react-native-skia';
import * as React from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { DiscreteGimmick } from '@/gimmicks/_kinds/discrete';
import type { GimmickScreenProps } from '@/gimmicks/types';
import { useGimmickCount } from '@/store/gimmickState';

import { lapsOf, progressOf, remainingOf } from './cycle';

/**
 * 목탁 — Discrete 입력 모델. (§4, 스펙 2026-09-07)
 *
 * 목탁 몸통을 누르면 채가 즉시 내려와 치고, 손을 떼면 스프링으로 돌아온다.
 * 햅틱·카운트·소리는 터치 다운 순간(`_kinds/discrete.tsx`)이고 채 스윙은
 * 시각 연출이다. **몸통 위의 탭만 맞는다** — `hitTest`가 채·배경을 거른다.
 *
 * 위쪽에 108 카운트다운("N 남음", 진행 바, 바퀴 수). 전부 셸 카운트에서
 * 파생된다(`cycle.ts`).
 *
 * §1: 이 파일 안에서는 `className`을 쓰지 않는다. 텍스트는 RN `Text` +
 * 스타일 객체다.
 *
 * 왜 Skia인가: 키캡·전구·포퍼와 같다 — 배경을 소유하고, 양 OS가 같은 결과를
 * 내야 한다. 이미지 에셋 없이 전부 경로로 그린다.
 */

/** 설계 좌표계. 캔버스는 화면 전체, 도형은 이 상자 기준으로 적는다. */
const DESIGN_W = 320;
const DESIGN_H = 440;

/** 목탁 몸통 타원. 히트테스트도 이 값을 쓴다 — 보이는 것이 곧 맞는 영역. */
const BODY_SHAPE = { cx: 128, cy: 270, rx: 92, ry: 98 };

/** 위쪽 세로 홈. */
const SLIT = { x: 124, y: 176, width: 8, height: 70, r: 4 };

/** 앞면 구멍. */
const HOLE = { x: 100, y: 226, width: 44, height: 52 };

/** 아래 손잡이 고리. 몸통 뒤에 그려 겹치는 부분이 몸통에 가려진다. */
const RING = { cx: 96, cy: 392, outerR: 44, innerR: 24 };

/** 바닥 그림자. */
const FLOOR_SHADOW = { x: 53, y: 372, width: 150, height: 24, blur: 12 };

/**
 * 채. 위 끝이 회전축이고 그 축 기준 로컬 좌표로 그린다.
 * 휴지 각도는 몸통 반대쪽으로 살짝 기운 값, 타격 각도는 아래 끝이 몸통
 * 오른쪽 면에 닿는 값 — 몸통 우측 가장자리(x≈208, y≈319)에 끝 반지름 13을
 * 더해 sin⁻¹((268-221)/165)로 잡았다. 실기기에서 미세 조정.
 */
const STICK = { pivotX: 268, pivotY: 160, shaftW: 12, shaftLen: 150, tipY: 165, tipR: 13 };
const REST_ANGLE = -0.12;
const STRIKE_ANGLE = 0.29;

/** 타격 순간 몸통이 눌리는 정도. */
const BODY_SQUASH = 0.03;

/**
 * 뗄 때의 복귀 스프링. 약한 오버슈트가 채의 반동이 된다 — 별도 반동
 * 애니메이션을 만들지 않는다(포퍼 포신, 전구 매듭과 같은 구조).
 *
 * ⚠️ 실기기 미검증. 출렁임이 과하면 damping ↑.
 */
const RETURN_SPRING = { damping: 12, stiffness: 220, mass: 1 };

/** 진행 바가 새 값으로 미끄러지는 시간. */
const PROGRESS_MS = 200;

/**
 * 팔레트. 목탁 전용 시각 정보라 컴포넌트가 갖는다(키캡 전례).
 * 배경은 한지색 단색이고 테마와 무관하다 — 기믹이 배경을 소유한다.
 */
const PALETTE = {
  background: '#f3ede1',
  /** 몸통 방사형 그라디언트: 밝은 면 → 중간 → 그늘. 중간이 갤러리 틴트의 출처. */
  woodLight: '#d07a48',
  wood: '#b5532b',
  woodDark: '#7a3416',
  /** 홈·구멍. */
  cavity: '#2b1408',
  /** 채. 몸통보다 밝은 나무. */
  stickLight: '#e6b37a',
  stick: '#d9a066',
  stickDark: '#b98246',
  floorShadow: 'rgba(0, 0, 0, 0.18)',
  /** 텍스트. */
  ink: '#3a2f27',
  inkMuted: '#8a7b6e',
  track: 'rgba(58, 47, 39, 0.12)',
  fill: '#b5532b',
};

const BODY_GRADIENT_COLORS = [PALETTE.woodLight, PALETTE.wood, PALETTE.woodDark];
const STICK_GRADIENT_COLORS = [PALETTE.stickLight, PALETTE.stick, PALETTE.stickDark];

/** 정적인 도형은 미리 만든다 — 워크릿에서 Skia 객체를 만들지 않는다. */
const RING_PATH = Skia.PathBuilder.Make()
  .addCircle(RING.cx, RING.cy, RING.outerR)
  .addCircle(RING.cx, RING.cy, RING.innerR)
  .detach();

export default function Moktak({ gimmick, variant, onInteract }: GimmickScreenProps<'discrete'>) {
  /**
   * 캔버스 실측 크기. 그림과 히트테스트가 같은 값을 봐야 눈에 보이는 몸통이
   * 곧 맞는 영역이 된다 — 전구가 `canGrab`을 위해 올린 것과 같은 이유.
   */
  const canvasSize = useSharedValue<SkSize>({ width: 0, height: 0 });

  /**
   * 몸통 타원 또는 손잡이 고리 안이면 맞는다. 채·배경·상단 정보는 빗나간다.
   * 루트 뷰 좌표 → 설계 좌표는 `centerTransform`의 역변환이다.
   */
  const hitTest = React.useCallback(
    (x: number, y: number) => {
      'worklet';
      const { width, height } = canvasSize.value;
      /** 레이아웃 전이면 목탁이 어디 있는지 모른다 — 그 터치는 빗나간 걸로. */
      if (width === 0 || height === 0) {
        return false;
      }
      const dx = x - (width - DESIGN_W) / 2;
      const dy = y - (height - DESIGN_H) / 2;
      const ex = (dx - BODY_SHAPE.cx) / BODY_SHAPE.rx;
      const ey = (dy - BODY_SHAPE.cy) / BODY_SHAPE.ry;
      if (ex * ex + ey * ey <= 1) {
        return true;
      }
      const rx = dx - RING.cx;
      const ry = dy - RING.cy;
      return rx * rx + ry * ry <= RING.outerR * RING.outerR;
    },
    [canvasSize]
  );

  const count = useGimmickCount(gimmick.id);

  return (
    <View style={CONTAINER}>
      <DiscreteGimmick
        haptic={variant.haptic}
        config={gimmick.config}
        onInteract={onInteract}
        hitTest={hitTest}>
        {({ pressed }) => <MoktakBody pressed={pressed} canvasSize={canvasSize} count={count} />}
      </DiscreteGimmick>
    </View>
  );
}

type BodyProps = {
  pressed: SharedValue<number>;
  canvasSize: SharedValue<SkSize>;
  /** 셸 카운트. 108 사이클은 전부 여기서 파생된다. */
  count: number;
};

function MoktakBody({ pressed, canvasSize, count }: BodyProps) {
  const backgroundWidth = useDerivedValue(() => canvasSize.value.width);
  const backgroundHeight = useDerivedValue(() => canvasSize.value.height);

  /** 설계 좌표계를 캔버스 가운데로 옮긴다. */
  const centerTransform = useDerivedValue(() => [
    { translateX: (canvasSize.value.width - DESIGN_W) / 2 },
    { translateY: (canvasSize.value.height - DESIGN_H) / 2 },
  ]);

  /**
   * 스윙 0~1. 누를 때 즉시 1(§0 — 누를 때 애니메이션은 체감 지연이다),
   * 뗄 때 스프링으로 0. 채 각도와 몸통 눌림이 여기서 파생된다.
   */
  const swing = useSharedValue(0);

  useAnimatedReaction(
    () => pressed.value,
    (value) => {
      if (value === 1) {
        cancelAnimation(swing);
        swing.value = 1;
      } else {
        swing.value = withSpring(0, RETURN_SPRING);
      }
    }
  );

  const stickTransform = useDerivedValue(() => [
    { translateX: STICK.pivotX },
    { translateY: STICK.pivotY },
    { rotate: REST_ANGLE + (STRIKE_ANGLE - REST_ANGLE) * swing.value },
  ]);

  const bodyTransform = useDerivedValue(() => [{ scale: 1 - BODY_SQUASH * swing.value }]);

  /** 진행 바. React 상태(count)가 바뀌면 200ms로 미끄러진다. */
  const progress = useSharedValue(progressOf(count));
  React.useEffect(() => {
    progress.value = withTiming(progressOf(count), { duration: PROGRESS_MS });
  }, [count, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    /**
     * 키캡과 같은 지뢰 주의: 스타일만 있는 루트 뷰는 Fabric이 flatten할 수
     * 있고, 그러면 GestureDetector가 엉뚱한 view tag에 붙는다.
     */
    <View style={BODY} collapsable={false}>
      <Canvas style={CANVAS} onSize={canvasSize}>
        {/* 배경은 캔버스 전체 — 즉 화면 전체를 덮는다. */}
        <Rect
          x={0}
          y={0}
          width={backgroundWidth}
          height={backgroundHeight}
          color={PALETTE.background}
        />

        <Group transform={centerTransform}>
          {/* 바닥 그림자. 몸통보다 먼저 그려 뒤에 깔린다. */}
          <Oval
            x={FLOOR_SHADOW.x}
            y={FLOOR_SHADOW.y}
            width={FLOOR_SHADOW.width}
            height={FLOOR_SHADOW.height}
            color={PALETTE.floorShadow}>
            <BlurMask blur={FLOOR_SHADOW.blur} style="normal" />
          </Oval>

          {/* 손잡이 고리. 몸통 뒤. 두 원 + evenOdd로 구멍을 낸다. */}
          <Path path={RING_PATH} fillType="evenOdd">
            <LinearGradient
              start={vec(RING.cx - RING.outerR, RING.cy)}
              end={vec(RING.cx + RING.outerR, RING.cy)}
              colors={BODY_GRADIENT_COLORS}
            />
          </Path>

          {/* 몸통. 타격 순간 살짝 눌린다 — 중심 기준 scale. */}
          <Group transform={bodyTransform} origin={vec(BODY_SHAPE.cx, BODY_SHAPE.cy)}>
            <Oval
              x={BODY_SHAPE.cx - BODY_SHAPE.rx}
              y={BODY_SHAPE.cy - BODY_SHAPE.ry}
              width={BODY_SHAPE.rx * 2}
              height={BODY_SHAPE.ry * 2}>
              <RadialGradient
                c={vec(BODY_SHAPE.cx - 28, BODY_SHAPE.cy - 34)}
                r={150}
                colors={BODY_GRADIENT_COLORS}
              />
            </Oval>
            <RoundedRect
              x={SLIT.x}
              y={SLIT.y}
              width={SLIT.width}
              height={SLIT.height}
              r={SLIT.r}
              color={PALETTE.cavity}
            />
            <Oval x={HOLE.x} y={HOLE.y} width={HOLE.width} height={HOLE.height} color={PALETTE.cavity} />
          </Group>

          {/* 채. 위 끝이 축. 로컬 좌표는 축이 원점이다. */}
          <Group transform={stickTransform}>
            <RoundedRect
              x={-STICK.shaftW / 2}
              y={0}
              width={STICK.shaftW}
              height={STICK.shaftLen}
              r={STICK.shaftW / 2}>
              <LinearGradient
                start={vec(-STICK.shaftW / 2, 0)}
                end={vec(STICK.shaftW / 2, 0)}
                colors={STICK_GRADIENT_COLORS}
              />
            </RoundedRect>
            <Circle cx={0} cy={STICK.tipY} r={STICK.tipR}>
              <LinearGradient
                start={vec(-STICK.tipR, 0)}
                end={vec(STICK.tipR, 0)}
                colors={STICK_GRADIENT_COLORS}
              />
            </Circle>
          </Group>
        </Group>
      </Canvas>

      {/*
        텍스트는 RN 쪽이다. Skia 텍스트는 폰트 에셋을 요구하므로 피한다(키캡
        전례). 설계 상자와 같은 크기의 뷰를 BODY가 가운데 정렬해주므로 좌표를
        캔버스의 센터링 transform과 따로 계산할 필요가 없다.
      */}
      <View style={DESIGN_BOX} pointerEvents="none">
        <Text style={TITLE}>번뇌가 사라지는 중</Text>
        <View style={COUNT_ROW}>
          <Text style={REMAINING}>{remainingOf(count)}</Text>
          <Text style={REMAINING_UNIT}>남음</Text>
        </View>
        <View style={TRACK}>
          <Animated.View style={[FILL, fillStyle]} />
        </View>
        <Text style={SUBLINE}>
          총 {count.toLocaleString()}개 소멸 · {lapsOf(count)}바퀴 완주
        </Text>

        {/* Task 6: QuoteCard */}
      </View>
    </View>
  );
}

/** 셸이 기믹에 콘텐츠 영역 전체를 준다. 배경이 화면을 채우려면 다 받아야 한다. */
const CONTAINER: ViewStyle = {
  flex: 1,
};

/**
 * 제스처를 받는 뷰. 화면 전체다 — 판정은 `hitTest`가 하므로 뷰를 목탁
 * 크기로 줄일 필요가 없고, 배경 캔버스가 `pressed`를 읽으려면 같은 루트
 * 안에 있어야 한다.
 */
const BODY: ViewStyle = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
};

/** 캔버스는 BODY 전체를 덮는다. */
const CANVAS: ViewStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

/** 설계 좌표계와 같은 크기의 상자. 텍스트 좌표는 이 상자 기준이다. */
const DESIGN_BOX: ViewStyle = {
  width: DESIGN_W,
  height: DESIGN_H,
};

const TITLE: TextStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  textAlign: 'center',
  fontSize: 16,
  color: PALETTE.inkMuted,
};

const COUNT_ROW: ViewStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 22,
  flexDirection: 'row',
  alignItems: 'baseline',
  justifyContent: 'center',
  gap: 10,
};

const REMAINING: TextStyle = {
  fontSize: 64,
  fontWeight: '700',
  letterSpacing: -1,
  color: PALETTE.ink,
};

const REMAINING_UNIT: TextStyle = {
  fontSize: 20,
  fontWeight: '600',
  color: PALETTE.inkMuted,
};

const TRACK: ViewStyle = {
  position: 'absolute',
  left: 40,
  right: 40,
  top: 108,
  height: 8,
  borderRadius: 4,
  backgroundColor: PALETTE.track,
  overflow: 'hidden',
};

const FILL: ViewStyle = {
  height: '100%',
  borderRadius: 4,
  backgroundColor: PALETTE.fill,
};

const SUBLINE: TextStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 126,
  textAlign: 'center',
  fontSize: 14,
  color: PALETTE.inkMuted,
};
```

- [ ] **Step 3: registry에 항목을 추가한다**

`src/gimmicks/registry.ts` import 줄을 교체:

```ts
import {
  Disc3Icon,
  DrumIcon,
  KeyboardIcon,
  LightbulbIcon,
  PartyPopperIcon,
} from 'lucide-react-native';
```

`popper` 항목 뒤, 배열이 닫히기 전에:

```ts
  {
    id: 'moktak',
    name: '목탁',
    /** 틴트는 이 기믹의 지배색에서 왔다 — 몸통 그라디언트 중간 #b5532b. */
    look: { icon: DrumIcon, tint: 'orange' },
    kind: 'discrete',
    /**
     * `knock`은 전구에서 실기기 확인된 값이라 무음 위험이 없다(§5 "느낌 없는
     * 프리셋이 실재한다"). 전구와 같은 프리셋인 게 아쉬우므로 실기기에서
     * 후보(rap, thud, gavel, plunk, castanets)를 비교해 구분되는 것으로
     * 바꾼다(스펙 §9).
     */
    haptic: { type: 'preset', name: 'knock' },
    /** 이 앱 최초의 소리. `audio/assets.ts`의 키 — 셸이 `onInteract`마다 튼다. */
    sound: 'moktak',
    config: {/** 릴리스 햅틱 없음 — 치는 순간 한 방이면 충분하다. */},
    component: () => import('./moktak'),
  },
```

- [ ] **Step 4: 타입 체크**

Run: `npm run typecheck`
Expected: 에러 없음. `Gimmick` 유니온이 `discrete` kind에 `sound: 'moktak'`을 받아들이고, `tint: 'orange'`가 `TintName`에 있다.

- [ ] **Step 5: 시뮬레이터로 휴지 상태를 본다**

Metro가 떠 있지 않으면 `npm run dev:clear`를 백그라운드로 올린 뒤(새 파일이 셋이라 캐시 정리가 필요하다), 시뮬레이터 앱이 떠 있으면 재시작한다 — Skia 화면은 Fast Refresh로 안 갱신된다.

```bash
xcrun simctl terminate booted com.ninestring.toyapp
xcrun simctl openurl booted toyapp://gimmick/moktak
sleep 4
xcrun simctl io booted screenshot /private/tmp/claude-501/-Users-ninestring-work-toy-app/c2e3ef0c-9b37-4476-8c77-516ad3e1f031/scratchpad/moktak-rest.png
```

스크린샷을 Read로 열어 확인할 것:
- 한지색 배경이 화면 전체를 덮는다.
- 몸통(타원 + 홈 + 구멍 + 고리)이 가운데 왼쪽, 채가 오른쪽에 서 있고 채 끝이 몸통에 닿지 않는다.
- "번뇌가 사라지는 중 / 108 남음 / 빈 진행 바 / 총 0개 소멸 · 0바퀴 완주"가 목탁 위에 있고 셸 상단 알약(0)과 겹치지 않는다.
- 상단 알약·뒤로가기·리셋이 배경 위에서 읽힌다.

갤러리도 한 장: `xcrun simctl openurl booted toyapp://` 후 스크린샷. 다섯째 타일 "목탁 / 누르기"가 오렌지 틴트로 3번째 줄 왼쪽에 있고 오른쪽은 빈 자리다.

시뮬레이터로는 탭을 못 넣는다 — 채 스윙·햅틱·소리는 확인 불가. 실기기 몫으로 남긴다.

- [ ] **Step 6: 포맷 후 커밋**

```bash
npm run format
git add src/gimmicks/moktak/index.tsx src/gimmicks/registry.ts src/lib/tints.ts
git commit -m "feat: 목탁 기믹 — 몸통을 누르면 채가 치고, 108 카운트다운"
```

---

## Task 6: 문구 카드

**Files:**
- Modify: `src/gimmicks/moktak/index.tsx`

**Interfaces:**
- Consumes: `quoteIndexAt`(Task 1), `QUOTES`/`Quote`(Task 4).
- Produces: `QuoteCard({ count }: { count: number })` — 같은 파일 내부 컴포넌트.

- [ ] **Step 1: import를 늘린다**

`./cycle` import 줄을 교체:

```ts
import { lapsOf, progressOf, quoteIndexAt, remainingOf } from './cycle';
import { QUOTES, type Quote } from './quotes';
```

- [ ] **Step 2: 상수를 추가한다**

`PROGRESS_MS` 상수 아래에:

```ts
/** 문구 카드 타이밍(스펙 §4): 페이드 300ms, 유지 4초. */
const CARD_FADE_MS = 300;
const CARD_HOLD_MS = 4000;
/** 나타날 때 아래에서 올라오는 거리(pt). */
const CARD_LIFT = 12;
```

- [ ] **Step 3: 카드 컴포넌트를 추가한다**

`MoktakBody` 함수 아래, 스타일 상수들 위에:

```tsx
/**
 * 27타마다 뜨는 문구 카드. (스펙 §4)
 *
 * `count`가 바뀔 때 `quoteIndexAt`이 인덱스를 주면 문구를 갈고 페이드 인 →
 * 4초 유지 → 페이드 아웃. 표시 중에 다음 27이 오면 문구를 갈고 타이머를
 * 다시 잰다. `pointerEvents="none"` — 카드 아래 목탁을 치면 그대로 친다.
 *
 * 문구 선택이 결정적이라(카운트에서 계산) 같은 횟수에 같은 문구가 뜬다.
 */
function QuoteCard({ count }: { count: number }) {
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const opacity = useSharedValue(0);
  const lift = useSharedValue(CARD_LIFT);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const index = quoteIndexAt(count, QUOTES.length);
    if (index === null) {
      return;
    }
    const next = QUOTES[index];
    if (next === undefined) {
      return;
    }
    setQuote(next);

    cancelAnimation(opacity);
    cancelAnimation(lift);
    opacity.value = withTiming(1, { duration: CARD_FADE_MS });
    lift.value = withTiming(0, { duration: CARD_FADE_MS });

    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      opacity.value = withTiming(0, { duration: CARD_FADE_MS });
      lift.value = withTiming(CARD_LIFT, { duration: CARD_FADE_MS });
    }, CARD_FADE_MS + CARD_HOLD_MS);
  }, [count, opacity, lift]);

  /** 언마운트 시 타이머 정리 — 화면을 떠난 뒤 shared value를 만지지 않는다. */
  React.useEffect(
    () => () => {
      if (hideTimer.current !== null) {
        clearTimeout(hideTimer.current);
      }
    },
    []
  );

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }],
  }));

  if (quote === null) {
    return null;
  }

  return (
    <Animated.View style={[CARD, cardStyle]} pointerEvents="none">
      <Text style={CARD_TEXT}>{quote.text}</Text>
      <Text style={CARD_SOURCE}>— {quote.source}</Text>
    </Animated.View>
  );
}
```

- [ ] **Step 4: 자리에 끼우고 스타일을 추가한다**

`MoktakBody`의 `{/* Task 6: QuoteCard */}`를 교체:

```tsx
        <QuoteCard count={count} />
```

`SUBLINE` 스타일 아래에:

```ts
/**
 * 카드는 상단 정보 아래, 몸통 위쪽에 겹친다. 그림자는 iOS `shadow*` +
 * 안드로이드 `elevation` 둘 다 — 방향 없는 부드러운 그림자라 두 OS 차이가
 * 눈에 안 띈다(키캡이 Skia 그림자를 택한 이유였던 방향성이 여기엔 없다).
 */
const CARD: ViewStyle = {
  position: 'absolute',
  left: 8,
  right: 8,
  top: 156,
  paddingHorizontal: 20,
  paddingVertical: 18,
  borderRadius: 20,
  backgroundColor: '#ffffff',
  shadowColor: '#000000',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

const CARD_TEXT: TextStyle = {
  textAlign: 'center',
  fontSize: 17,
  lineHeight: 26,
  fontWeight: '600',
  color: PALETTE.ink,
};

const CARD_SOURCE: TextStyle = {
  marginTop: 8,
  textAlign: 'center',
  fontSize: 13,
  color: PALETTE.inkMuted,
};
```

- [ ] **Step 5: 타입 체크**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 6: 포맷 후 커밋**

임시 주입(Step 7)보다 먼저 커밋한다 — 그래야 주입을 `git checkout --`로 정확히 되돌릴 수 있다.

```bash
npm run format
git add src/gimmicks/moktak/index.tsx
git commit -m "feat: 목탁 27타마다 법구경 문구 카드 — 4초 뒤 스스로 사라진다"
```

- [ ] **Step 7: 시뮬레이터에서 카드 레이아웃을 본다 — 임시 주입**

탭을 못 넣으니 카운트를 임시로 27에 고정한다. `git status --short`가 비어 있는지 먼저 확인한다(Step 6 커밋 직후라 비어 있어야 한다).

`Moktak` 함수의 `const count = useGimmickCount(gimmick.id);`를 **임시로** 아래로 바꾼다:

```ts
  const count = 27; // 임시: 카드 레이아웃 확인용. 커밋 금지.
```

앱을 재시작하고 스크린샷(카드가 4초만 보이니 딥링크 직후 2초 안에 찍는다):

```bash
xcrun simctl terminate booted com.ninestring.toyapp
xcrun simctl openurl booted toyapp://gimmick/moktak
sleep 2
xcrun simctl io booted screenshot /private/tmp/claude-501/-Users-ninestring-work-toy-app/c2e3ef0c-9b37-4476-8c77-516ad3e1f031/scratchpad/moktak-card.png
```

확인할 것: 흰 카드가 상단 정보 아래·몸통 위쪽에 겹치고, 문구가 두 줄 안에 들어가며, "— 법구경"이 그 아래 있다. "81 남음", 진행 바 1/4.

되돌린다:

```bash
git checkout -- src/gimmicks/moktak/index.tsx
git status --short
```

Expected: 출력 없음(깨끗한 워킹트리).

---

## Task 7: 문서 — stack.md, 실기기 체크리스트

**Files:**
- Modify: `stack.md`
- Modify: `docs/superpowers/specs/2026-09-07-moktak-gimmick-design.md`

- [ ] **Step 1: stack.md 폴더 구조에 `moktak/`을 추가한다**

§4 "폴더 구조 (v1)" 코드 블록에서 `popper/` 줄 뒤에:

```
    moktak/
```

- [ ] **Step 2: stack.md §5 오디오에 재생 경로를 적는다**

§5 "### 오디오" 절의 기존 항목 아래에:

```markdown
- **소리는 셸이 튼다.** registry의 `sound` 키(`audio/assets.ts`의 `SoundKey`) →
  기믹 화면이 `useSoundPool`로 풀을 만들어 `onInteract`마다 재생, 이탈 시 해제.
  기믹 컴포넌트는 소리를 모른다 — 햅틱처럼 소리도 데이터다. 재생은 JS
  스레드라 햅틱(UI 스레드)보다 늦다. 첫 사용처는 목탁(합성 WAV,
  `scripts/synth-moktak.mjs`).
```

- [ ] **Step 3: 스펙에 실기기 체크리스트를 남긴다**

`docs/superpowers/specs/2026-09-07-moktak-gimmick-design.md`의 §9 끝에:

```markdown
### 실기기 첫 세션 체크리스트

위험도 순. 시뮬레이터는 터치를 못 넣으므로 아래는 전부 미검증이다.

1. **몸통을 누르면 치는가, 채·배경을 누르면 안 치는가.** `hitTest`의 좌표
   변환(루트 뷰 → 설계 좌표)이 맞는지가 최대 위험. 몸통 가장자리를 둘러
   누르며 경계가 보이는 몸통과 일치하는지 본다. 답답하면 `BODY_SHAPE`의
   반지름을 판정에서만 8pt 키운다.
2. **소리가 나는가, 햅틱과 어긋나지 않는가.** 이 앱 최초의 소리다. 무음
   스위치를 켜면 안 나야 한다(`playsInSilentMode: false`). 연타 5회에
   풀(5개)이 돌아 끊기지 않는지.
3. **음색.** 목탁으로 들리는가, 실로폰으로 들리는가. 후자면
   `synth-moktak.mjs`의 `CLICK_GAIN`을 올리거나 `decayMs`를 줄여 재생성.
4. **`knock` 프리셋.** 전구와 같은 값이다. rap, thud, gavel, plunk,
   castanets를 눌러보고 구분되는 것으로 교체.
5. **채 스윙 손맛.** 타격 각도가 몸통에 닿아 보이는가(`STRIKE_ANGLE`),
   복귀 오버슈트가 반동으로 읽히는가(`RETURN_SPRING.damping`).
6. 27타마다 카드가 뜨고 4초 뒤 사라지는가. 연타로 54까지 가면 문구가
   갈리는가.
```

- [ ] **Step 4: 커밋**

```bash
git add stack.md docs/superpowers/specs/2026-09-07-moktak-gimmick-design.md
git commit -m "docs: 목탁 — stack.md 폴더·오디오 경로, 실기기 체크리스트"
```

---

## 완료 조건

- `node "$CHECK"`가 6개 검사를 전부 통과한다.
- `npm run typecheck`가 에러 없이 끝난다.
- `grep -c "^import" src/gimmicks/moktak/cycle.ts`가 `0`.
- `assets/sounds/moktak.wav`가 존재하고 Task 2 Step 2의 헤더 검증을 통과한다.
- 시뮬레이터 스크린샷: 갤러리에 다섯째 타일, 목탁 화면 휴지 상태, 카드 레이아웃(임시 주입) — 세 장을 눈으로 확인했다.
- `git status --short`가 비어 있다(임시 주입이 남아 있지 않다).
- **손맛·소리·히트테스트는 자동 검증 대상이 아니다** — Task 7의 체크리스트가 그 자리를 표시한다.
