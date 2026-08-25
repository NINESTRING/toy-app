# 전구 개정 구현 계획 — 릴리스 토글 · 로프 체인 줄

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전구 기믹의 토글을 임계값 통과 → 릴리스로 옮기고, 풀코드를 2차 베지에 1개 → 마디 12개 로프 체인 시뮬레이션으로 바꾼다.

**Architecture:** `_kinds/tug.tsx`는 발화를 `onUpdate`에서 `onFinalize`로 옮기고 `fired` 플래그를 `armed` 래치로 바꾼다. 줄은 두 파일로 쪼갠다 — `bulb/cordPhysics.ts`는 import가 없는 순수 PBD 적분기(Node로 직접 돌려 검증), `bulb/cord.ts`는 프레임 콜백·수면 게이트·Skia 경로를 가진 `useCord` 훅. tug는 여전히 매듭 변위만 주고 줄 모양은 bulb가 소유한다 — `TugRenderState` 계약은 안 바뀐다.

**Tech Stack:** React Native 0.86, Reanimated 4.5 (+ react-native-worklets 0.10), Skia 2.6, Gesture Handler 2.32, Expo Router. 새 의존성 없음.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-08-25-bulb-cord-revision-design.md`. 원본 `2026-08-24-bulb-gimmick-design.md`의 §2·§3 토글 결정과 §6 줄 그리기를 대체한다.
- stack.md §1: `src/gimmicks/bulb/**`와 `src/gimmicks/_kinds/**`에 `className`을 쓰지 않는다. 스타일은 `ViewStyle` 상수.
- stack.md §4: 제스처·햅틱 판정은 전부 워크릿 안에서 끝난다. React 상태로 올리지 않는다.
- 주석은 한국어. 기존 파일들의 밀도·어조를 따른다 — **무엇**이 아니라 **왜**를 적는다.
- 물리 상수는 전부 실기기 미검증이다. 새로 넣는 상수마다 그 사실을 주석에 남긴다 (퍼퍼 `confetti.tsx`, 다이얼과 같은 관행).
- 테스트 러너가 없다. 검증 게이트는 `npm run typecheck`와 (해당 태스크에서만) Node 하니스다.
- 커밋 메시지는 한국어, `타입: 요약` 형식. 각 태스크 끝에 1커밋.

---

### Task 1: 릴리스 토글 — `_kinds/tug.tsx`

**Files:**
- Modify: `src/gimmicks/_kinds/tug.tsx`

**Interfaces:**
- Consumes: `useThrottledHaptic`, `useHapticFire` (기존, 변경 없음)
- Produces: `TugRenderState { dragX, dragY, on, active }` — **타입은 안 바뀐다.** `on`의 의미만 "임계값 통과 순간 토글" → "릴리스 순간 토글"로 바뀐다. 이 파일의 export는 `TugGimmick`, `TugRenderState` 그대로.

- [ ] **Step 1: `fired`를 `armed`로 바꾸고 선언 주석을 고친다**

`src/gimmicks/_kinds/tug.tsx`에서 아래 두 줄을

```ts
  /** 이번 당김 사이클에서 이미 토글했는지. 놓아야 풀린다. */
  const fired = useSharedValue(false);
```

이렇게 바꾼다:

```ts
  /**
   * 이번 당김 사이클에서 임계값을 넘어본 적이 있는지. 릴리스에서 토글을
   * 쏠지를 정한다.
   *
   * **한 번 서면 안 내려간다** — 100pt 당겼다가 손가락을 제자리로 되돌려
   * 놓아도 토글된다. 레퍼런스 펜은 릴리스 시점 거리로 재서 이 경우
   * 불발인데, 우리는 갈라진다: 실제 걸쇠는 트립하면 못 되돌리고
   * (`latch` 프리셋을 고른 것과 같은 모델), 피젯 토이에서 제일 나쁜
   * 실패는 "다 당겼는데 안 켜졌네"다.
   */
  const armed = useSharedValue(false);
```

- [ ] **Step 2: `onUpdate`에서 발화를 걷어낸다**

`onUpdate` 콜백 전체를 아래로 교체한다.

```ts
        .onUpdate((event) => {
          'worklet';
          dragX.value = grabX.value + event.translationX;
          dragY.value = grabY.value + event.translationY;

          if (armed.value) {
            return;
          }

          /**
           * 거리는 **잡은 지점 기준**이다(레퍼런스도 press 지점 기준).
           * 휴지점 기준으로 재면 복귀 스프링 도중의 줄(이미 임계값 밖)을
           * 다시 잡았을 때 1px만 움직여도 장전되는 구멍이 생긴다.
           *
           * 방향은 따지지 않는다 — 어느 쪽으로 당겨도 장전된다. 레퍼런스와
           * 같고, 피젯 토이에선 "되는 방향"을 외우게 하는 게 손해다.
           */
          const distance = Math.sqrt(
            event.translationX * event.translationX + event.translationY * event.translationY
          );
          if (distance <= threshold) {
            return;
          }

          armed.value = true;
        })
```

- [ ] **Step 3: `onFinalize`에서 발화한다**

`onFinalize` 콜백 전체를 아래로 교체한다.

```ts
        .onFinalize(() => {
          'worklet';
          active.value = false;

          /**
           * 발화 지점. 딸깍·불·카운트가 전부 손을 떼는 이 순간에 같이
           * 터진다 — 사용자가 스스로 만든 사건이라 인과가 또렷하다
           * (개정 스펙 §1). 취소도 릴리스로 친다.
           */
          if (armed.value) {
            armed.value = false;
            on.value = on.value === 1 ? 0 : 1;
            fireToggle();
            runOnJS(onInteract)();
          }

          dragX.value = withSpring(0, WHIP_SPRING);
          dragY.value = withSpring(0, WHIP_SPRING);
        }),
```

- [ ] **Step 4: `useMemo` deps에서 `fired` → `armed`로 고친다**

```ts
    [active, dragX, dragY, armed, fireToggle, grabX, grabY, on, onInteract, threshold]
```

- [ ] **Step 5: `WHIP_SPRING` damping을 9 → 12로 올리고 주석을 고친다**

```ts
/**
 * 놓았을 때 매듭의 복귀 스프링.
 *
 * damping을 9에서 12로 올렸다 — 출렁임을 이제 줄(`bulb/cordPhysics.ts`의
 * 로프 체인)이 담당하므로, 매듭까지 통통 튀면 파형이 두 겹으로 겹친다.
 * 매듭은 깔끔하게 돌아오고 파형은 줄이 문다.
 *
 * ⚠️ 실기기 미검증. 출렁임이 과하면 damping ↑.
 */
const WHIP_SPRING = { damping: 12, stiffness: 300, mass: 1 };
```

- [ ] **Step 6: 파일 상단 주석 블록에서 토글 시점 설명을 고친다**

`TugGimmick` 위 JSDoc의 두 번째 문단을 아래로 교체한다.

```
 * 전구 풀코드, 레버 — 당겼다 놓는 것. 드래그 거리가 임계값을 넘으면
 * 장전되고, **손을 떼는 순간** 토글 + 햅틱이 터진다.
 *
 * 원본 스펙은 당김 도중 임계값 통과 순간에 쐈다. 개정 스펙 §1이 뒤집었다 —
 * 임계값 통과는 손가락이 못 느끼는 사건(화면에 눈금이 없다)이라 "왜 지금?"이
 * 될 여지가 있었고, 릴리스는 사용자가 스스로 만든 사건이라 그 여지가 없다.
 * 릴리스 지연은 실재하지만 타이밍을 사용자가 소유하므로 "느리다"가 아니라
 * "내가 놓아서 켜졌다"로 읽힌다.
 *
 * 릴리스가 사이클을 끝내므로 "한 번의 당김에 토글 1회"는 구조적으로 보장된다.
```

- [ ] **Step 7: `TugRenderState`의 `on` 주석을 고친다**

```ts
  /** 켜짐 여부 0 | 1. 임계값을 넘어본 뒤 손을 떼는 순간 바뀐다. */
  on: SharedValue<number>;
```

- [ ] **Step 8: 타입 검사**

Run: `npm run typecheck`
Expected: 에러 없이 종료 (exit 0). `fired` 잔재가 남아 있으면 여기서 잡힌다.

- [ ] **Step 9: `fired` 잔재가 없는지 확인**

Run: `grep -n "fired" src/gimmicks/_kinds/tug.tsx`
Expected: 아무것도 안 나옴 (grep exit 1).

- [ ] **Step 10: 커밋**

```bash
git add src/gimmicks/_kinds/tug.tsx
git commit -m "feat: tug 토글을 임계값 통과 → 릴리스로

fired(이미 쐈음) 플래그를 armed(임계값을 넘어봤음) 래치로 바꾸고
발화를 onFinalize로 옮긴다. 딸깍·불·카운트가 손을 떼는 한 순간에
같이 터진다.

armed는 한 번 서면 안 내려간다 — 되돌려 놓아도 토글된다. 레퍼런스
펜과 갈리는 지점이고 이유는 개정 스펙 §2에 있다.

출렁임을 줄이 담당하게 되므로 WHIP_SPRING damping 9 → 12."
```

---

### Task 2: 순수 적분기 — `bulb/cordPhysics.ts`

**Files:**
- Create: `src/gimmicks/bulb/cordPhysics.ts`

**Interfaces:**
- Consumes: 없음. **이 파일에 import를 하나도 두지 않는다** — Node가 타입만 벗겨 바로 실행할 수 있게 하려는 것이고, Step 6~8의 수치 검증이 여기에 달려 있다.
- Produces:
  - `CORD_ANCHOR: { x: number; y: number }` = `{ x: 150, y: 226 }`
  - `CORD_REST: { x: number; y: number }` = `{ x: 150, y: 372 }`
  - `CORD_WIDTH: number` = 6, `KNOT_R: number` = 9
  - `NODE_COUNT: number` = 12, `SEGMENT_LEN: number`, `SLEEP_SPEED: number` = 1.5
  - `type CordNode = { x, y, px, py, vx, vy: number }`
  - `createCordNodes(): CordNode[]`
  - `stepCord(nodes: CordNode[], dt: number, tailX: number, tailY: number): void` — 제자리 변형, 워크릿
  - `maxNodeSpeed(nodes: CordNode[]): number` — 워크릿

- [ ] **Step 1: 파일을 만들고 상수·타입을 적는다**

```ts
/**
 * 풀코드 로프의 순수 물리. (개정 스펙 §3)
 *
 * **이 파일에 import가 하나도 없는 건 의도다.** 그래야 Node가 타입만
 * 벗겨내고 바로 실행할 수 있다(`node --experimental-strip-types`, Node 24
 * 기본값). 이 앱엔 테스트 러너가 없고 시뮬레이터엔 터치를 못 넣으므로
 * 적분기를 자동으로 검증할 수단이 이것뿐이다. import를 하나라도 들이면
 * 그 수단이 사라진다 — Skia도 Reanimated도 여기 오면 안 된다.
 *
 * `stepCord`·`maxNodeSpeed`는 워크릿이다. `useCord`의 프레임 콜백 안에서
 * 불린다(stack.md §4 — 시뮬레이션은 React 상태로 안 올라온다).
 */

/** 줄의 시작. index.tsx의 CAP 바닥 중앙과 맞춰져 있다 — 같이 움직여야 한다. */
export const CORD_ANCHOR = { x: 150, y: 226 };

/** 매듭의 휴지점. tug의 `drag`가 여기서의 변위다. */
export const CORD_REST = { x: 150, y: 372 };

/** 줄과 매듭의 굵기. 도형 상수지만 앵커·휴지점과 같이 읽혀야 해서 여기 둔다. */
export const CORD_WIDTH = 6;
export const KNOT_R = 9;

/** 마디 개수. 세그먼트는 11개다. */
export const NODE_COUNT = 12;

/**
 * 직선거리 대비 로프 길이. 1.0이면 쉴 때 완전히 팽팽하다.
 *
 * 2%면 쉴 때 매듭보다 1.5pt 아래로 처졌다 올라온다 — 스무딩 곡선에 묻힌다.
 * 더 키우면 아래쪽에 눈에 보이는 고리가 생긴다.
 */
const CORD_SLACK = 1.02;

const SPAN = Math.sqrt(
  (CORD_REST.x - CORD_ANCHOR.x) ** 2 + (CORD_REST.y - CORD_ANCHOR.y) ** 2
);

/** 세그먼트 하나의 휴지 길이. */
export const SEGMENT_LEN = (SPAN * CORD_SLACK) / (NODE_COUNT - 1);

/** ⚠️ 물리 상수 전부 실기기 미검증 — 퍼퍼 색종이·다이얼과 같은 상태다. */
const GRAVITY = 2200; // pt/s²
const DRAG = 2.6; // /s — 공기저항
const CONSTRAINT_ITERATIONS = 5;

/** 자유 마디가 전부 이 속력 밑이면 멈춘 것으로 친다. `useCord`의 수면 판정. */
export const SLEEP_SPEED = 1.5; // pt/s

export type CordNode = {
  x: number;
  y: number;
  /** 직전 프레임 위치. 제약이 옮긴 만큼까지 속도로 되돌려 받는 데 쓴다. */
  px: number;
  py: number;
  vx: number;
  vy: number;
};
```

- [ ] **Step 2: `createCordNodes`를 적는다**

파일 끝에 이어 붙인다.

```ts
/** 앵커 → 휴지점 직선 위에 마디를 고르게 뿌린다. 첫 프레임의 시작 자세다. */
export function createCordNodes(): CordNode[] {
  const nodes: CordNode[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const t = i / (NODE_COUNT - 1);
    const x = CORD_ANCHOR.x + (CORD_REST.x - CORD_ANCHOR.x) * t;
    const y = CORD_ANCHOR.y + (CORD_REST.y - CORD_ANCHOR.y) * t;
    nodes.push({ x, y, px: x, py: y, vx: 0, vy: 0 });
  }
  return nodes;
}
```

- [ ] **Step 3: `stepCord`를 적는다**

파일 끝에 이어 붙인다.

```ts
/**
 * 한 프레임 적분. 마디 배열을 **제자리에서** 고친다 — 퍼퍼 색종이와 같은
 * 무할당 패턴이다.
 *
 * PBD(position-based dynamics): 적분 → 양 끝 핀 → 거리 제약 반복 →
 * 위치차로 속도 회수. 가변 dt에서 안전한 표준 형태고, 제약이 옮긴 만큼이
 * 속도에 반영되는 게 핵심이다.
 *
 * `tailX/tailY`는 매듭의 현재 위치다 — tug의 복귀 스프링이 소유한다.
 * 꼬리가 튀어오르면 몸통이 관성으로 뒤처지고, 제약이 그걸 따라 끌면서
 * 파형이 저절로 생긴다. 사진의 S자가 이거다.
 */
export function stepCord(nodes: CordNode[], dt: number, tailX: number, tailY: number): void {
  'worklet';
  const last = NODE_COUNT - 1;
  const damp = Math.max(0, 1 - DRAG * dt);

  for (let i = 1; i < last; i++) {
    const node = nodes[i];
    node.px = node.x;
    node.py = node.y;
    node.vx *= damp;
    node.vy = node.vy * damp + GRAVITY * dt;
    node.x += node.vx * dt;
    node.y += node.vy * dt;
  }

  /** 머리는 캡 바닥, 꼬리는 매듭. 둘 다 제약이 못 움직인다. */
  nodes[0].x = CORD_ANCHOR.x;
  nodes[0].y = CORD_ANCHOR.y;
  nodes[last].x = tailX;
  nodes[last].y = tailY;

  /**
   * 거리 제약. **늘어났을 때만** 당긴다 — 로프지 막대가 아니다.
   *
   * 양방향(막대)으로 하면 여유 길이가 있는 수직 줄이 압축에 저항하면서
   * 좌우 어느 쪽으로 좌굴할지를 수치 오차가 정하게 되고, 쉴 때 미세하게
   * 떤다. 당기기 전용이면 여유분은 그냥 아래로 처진다.
   *
   * 매듭을 로프 길이 밖으로 끌면 양 끝 핀이 이기고 중간이 직선으로 펴진다
   * — 팽팽해진다. 예외 처리 없이 나온다.
   */
  for (let iteration = 0; iteration < CONSTRAINT_ITERATIONS; iteration++) {
    for (let i = 0; i < last; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= SEGMENT_LEN || distance === 0) {
        continue;
      }
      const excess = (distance - SEGMENT_LEN) / distance;
      const aPinned = i === 0;
      const bPinned = i + 1 === last;
      /** 핀은 안 움직이므로 자유인 쪽이 초과분을 전부 흡수한다. */
      const aShare = aPinned ? 0 : bPinned ? 1 : 0.5;
      const bShare = bPinned ? 0 : aPinned ? 1 : 0.5;
      a.x += dx * excess * aShare;
      a.y += dy * excess * aShare;
      b.x -= dx * excess * bShare;
      b.y -= dy * excess * bShare;
    }
  }

  /**
   * 제약이 옮긴 만큼도 속도다. 이게 없으면 파형이 한 프레임 만에 죽고
   * 줄이 고무줄처럼 늘어졌다 붙는 걸로 보인다.
   */
  for (let i = 1; i < last; i++) {
    const node = nodes[i];
    node.vx = (node.x - node.px) / dt;
    node.vy = (node.y - node.py) / dt;
  }
}
```

- [ ] **Step 4: `maxNodeSpeed`를 적는다**

파일 끝에 이어 붙인다.

```ts
/** 자유 마디 중 가장 빠른 속력(pt/s). `useCord`가 잠들 때를 정하는 데 쓴다. */
export function maxNodeSpeed(nodes: CordNode[]): number {
  'worklet';
  let fastest = 0;
  for (let i = 1; i < NODE_COUNT - 1; i++) {
    const node = nodes[i];
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > fastest) {
      fastest = speed;
    }
  }
  return fastest;
}
```

- [ ] **Step 5: 타입 검사**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 6: 하니스를 스크래치패드에 쓴다**

리포에 커밋하지 않는다 — 러너가 없어 CI에서 돌 곳이 없고, 실행되지 않는 테스트를 남기는 건 거짓 신호다 (개정 스펙 §7).

경로: `$SCRATCH/cord-harness.mts` (`$SCRATCH`는 이 세션의 스크래치패드 디렉터리)

확장자가 **`.mts`여야 한다.** 스크래치패드엔 package.json이 없어서 Node가
확장자로 모듈 종류를 정한다. import 대상은 **절대 경로**로 적는다 — 프로젝트
밖에서 프로젝트 안을 가리키므로 상대 경로가 길고 깨지기 쉽다.

(검증됨: Node 24가 `.ts`를 ESM으로 자동 감지해 타입만 벗겨낸다.
`MODULE_TYPELESS_PACKAGE_JSON` 경고가 뜨지만 무해하다 — 프로젝트에
`"type": "module"`을 넣으라는 뜻인데 RN 앱에 그걸 넣을 이유가 없다.)

```ts
import {
  CORD_ANCHOR,
  CORD_REST,
  NODE_COUNT,
  SEGMENT_LEN,
  SLEEP_SPEED,
  createCordNodes,
  maxNodeSpeed,
  stepCord,
  type CordNode,
} from '/Users/ninestring/work/toy-app/src/gimmicks/bulb/cordPhysics.ts';

const DT = 1 / 60;
let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} — ${detail}`);
  if (!ok) failures++;
}

/** 앵커→꼬리 직선 기준 각 마디의 부호 있는 수직 편차. */
function perpOffsets(nodes: CordNode[]): number[] {
  const tail = nodes[NODE_COUNT - 1];
  const dx = tail.x - CORD_ANCHOR.x;
  const dy = tail.y - CORD_ANCHOR.y;
  const len = Math.hypot(dx, dy) || 1;
  return nodes.map((n) => ((n.x - CORD_ANCHOR.x) * dy - (n.y - CORD_ANCHOR.y) * dx) / len);
}

function signChanges(values: number[], epsilon: number): number {
  let changes = 0;
  let previous = 0;
  for (const value of values) {
    if (Math.abs(value) < epsilon) continue;
    const sign = value > 0 ? 1 : -1;
    if (previous !== 0 && sign !== previous) changes++;
    previous = sign;
  }
  return changes;
}

// 1. 쉴 때 수직으로 수렴하고 잠들 수 있는 상태가 된다.
{
  const nodes = createCordNodes();
  for (let f = 0; f < 300; f++) stepCord(nodes, DT, CORD_REST.x, CORD_REST.y);
  const maxDrift = Math.max(...nodes.map((n) => Math.abs(n.x - CORD_ANCHOR.x)));
  const maxDip = Math.max(...nodes.map((n) => n.y)) - CORD_REST.y;
  const speed = maxNodeSpeed(nodes);
  check('쉴 때 수직', maxDrift < 0.5, `좌우 편차 ${maxDrift.toFixed(3)}pt < 0.5`);
  check('쉴 때 처짐', maxDip < 2.5, `매듭 아래로 ${maxDip.toFixed(3)}pt < 2.5`);
  check('쉴 때 잠듦', speed < SLEEP_SPEED, `최대 속력 ${speed.toFixed(3)} < ${SLEEP_SPEED}`);
}

// 2. 로프 길이 밖으로 끌면 직선으로 펴진다.
{
  const nodes = createCordNodes();
  const tailX = 300;
  const tailY = 500;
  for (let f = 0; f < 200; f++) stepCord(nodes, DT, tailX, tailY);
  const maxPerp = Math.max(...perpOffsets(nodes).map(Math.abs));
  check('팽팽해짐', maxPerp < 3, `직선 이탈 ${maxPerp.toFixed(3)}pt < 3`);
}

// 3. 매듭이 스프링으로 왕복하면 부호 변화가 2번 이상 — 사진의 S자.
{
  const nodes = createCordNodes();
  // 감쇠 스프링으로 꼬리를 -90pt에서 0으로 되돌린다 (WHIP_SPRING 근사).
  let offset = -90;
  let velocity = 0;
  const stiffness = 300;
  const damping = 12;
  let bestChanges = 0;
  let bestAmplitude = 0;
  for (let f = 0; f < 180; f++) {
    velocity += (-stiffness * offset - damping * velocity) * DT;
    offset += velocity * DT;
    stepCord(nodes, DT, CORD_REST.x + offset, CORD_REST.y);
    const offsets = perpOffsets(nodes);
    bestChanges = Math.max(bestChanges, signChanges(offsets, 1.5));
    bestAmplitude = Math.max(bestAmplitude, ...offsets.map(Math.abs));
  }
  check('S자 파형', bestChanges >= 2, `최대 부호 변화 ${bestChanges}회 >= 2`);
  check('파형 진폭', bestAmplitude > 5, `최대 진폭 ${bestAmplitude.toFixed(2)}pt > 5`);
}

// 4. 난폭한 입력에도 NaN이 안 난다.
{
  const nodes = createCordNodes();
  let seed = 1;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let f = 0; f < 1000; f++) {
    const dt = 1 / 60 + random() * 0.05; // 프레임 드롭 흉내
    stepCord(nodes, dt, CORD_REST.x + (random() - 0.5) * 400, CORD_REST.y + (random() - 0.5) * 400);
  }
  const finite = nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  check('수치 안정', finite, `1000프레임 후 전부 유한`);
}

console.log(`\nSEGMENT_LEN = ${SEGMENT_LEN.toFixed(3)}pt × ${NODE_COUNT - 1}개`);
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

> `'worklet'` 지시자는 Node에선 그냥 문자열 리터럴 표현식이라 무시된다.
> 그래서 하니스가 도는 것이다.

- [ ] **Step 7: 하니스를 돌린다**

Run: `node $SCRATCH/cord-harness.mts`
Expected: 6개 항목 전부 `PASS`, 마지막 줄 `ALL PASS`, exit 0.

- [ ] **Step 8: 실패하면 상수를 고친다 (통과했으면 건너뛴다)**

| 실패 항목 | 손댈 곳 |
|---|---|
| 쉴 때 수직 / 처짐 | `CORD_SLACK`을 1.01로 낮춘다 |
| 쉴 때 잠듦 | `CONSTRAINT_ITERATIONS`를 7로 올린다 (수렴이 덜 된 것) |
| 팽팽해짐 | `CONSTRAINT_ITERATIONS`를 7로 올린다 |
| S자 파형 / 진폭 | `DRAG`를 1.8로 낮춘다 (감쇠가 과해 파형이 죽은 것) |
| 수치 안정 | `stepCord` 안에서 `dt`를 클램프하지 말 것 — 클램프는 `cord.ts`가 한다. NaN이면 `distance === 0` 가드를 확인한다 |

고쳤으면 Step 7을 다시 돌린다.

- [ ] **Step 9: 커밋**

```bash
git add src/gimmicks/bulb/cordPhysics.ts
git commit -m "feat: 풀코드 로프의 순수 PBD 적분기

마디 12개 체인. 머리는 캡 바닥, 꼬리는 매듭에 핀으로 박고 중간
10개가 중력 + 당기기 전용 거리 제약으로 움직인다. 꼬리가 튀어오르면
몸통이 뒤처지며 파형이 생긴다.

import를 하나도 두지 않은 건 의도다 — Node가 타입만 벗겨 바로 돌릴
수 있어야 적분기를 실기기 없이 검증한다. 이 앱엔 테스트 러너가 없다."
```

---

### Task 3: `useCord` 훅 — `bulb/cord.ts`

**Files:**
- Create: `src/gimmicks/bulb/cord.ts`

**Interfaces:**
- Consumes: Task 2의 `CORD_REST`, `NODE_COUNT`, `SLEEP_SPEED`, `createCordNodes`, `maxNodeSpeed`, `stepCord`, `type CordNode`. Task 1의 `TugRenderState`에서 오는 `dragX`, `dragY`, `active`.
- Produces:
  - `type Cord = { path: SharedValue<SkPath>; knotX: SharedValue<number>; knotY: SharedValue<number> }`
  - `useCord(props: { dragX: SharedValue<number>; dragY: SharedValue<number>; active: SharedValue<boolean> }): Cord`

- [ ] **Step 1: 파일을 만든다**

```ts
import { Skia, type SkPath } from '@shopify/react-native-skia';
import {
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  CORD_REST,
  NODE_COUNT,
  SLEEP_SPEED,
  createCordNodes,
  maxNodeSpeed,
  stepCord,
  type CordNode,
} from './cordPhysics';

/**
 * 풀코드 줄 — 시뮬레이션 구동 + Skia 경로. (개정 스펙 §3)
 *
 * 물리는 `cordPhysics.ts`가 전부 갖고 있다. 여기는 공유값·프레임 콜백·
 * 수면 게이트·경로 생성만 한다. 그렇게 나눈 이유는 그 파일 주석에 있다.
 *
 * 경계: **tug는 매듭 변위만 준다. 줄 모양은 bulb가 소유한다.** 복귀
 * 스프링은 `_kinds/tug.tsx`에 그대로 남고, 로프는 그 위에 얹히는 생김새다.
 *
 * 훅을 `Canvas` 바깥(RN 트리)에서 부르는 건 퍼퍼 색종이와 같은 이유다 —
 * Skia는 `Canvas`의 자식을 별도 react-reconciler 루트에 마운트하므로
 * Canvas 안에서 훅을 부르면 RN 트리가 아닌 그 루트의 생명주기를 탄다.
 */

/** 매듭이 이만큼 안쪽이면 휴지점에 있는 것으로 친다. */
const REST_EPSILON = 0.25;

/** 앱이 멈췄다 돌아온 프레임의 폭주 방지 — 퍼퍼와 같은 클램프. */
const MAX_FRAME_MS = 64;

type Props = {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  active: SharedValue<boolean>;
};

export type Cord = {
  /** 앵커에서 매듭까지의 줄. 매 프레임 다시 만들어진다. */
  path: SharedValue<SkPath>;
  /** 매듭 원의 중심. 로프의 꼬리 핀과 같은 점이다. */
  knotX: SharedValue<number>;
  knotY: SharedValue<number>;
};

export function useCord({ dragX, dragY, active }: Props): Cord {
  const nodes = useSharedValue<CordNode[]>(createCordNodes());
  /** 배열 제자리 변형은 파생값을 안 깨운다 — 프레임마다 이걸 올린다(퍼퍼와 동일). */
  const tick = useSharedValue(0);
  /** 참이면 프레임 콜백이 즉시 반환한다. 놀 때 비용 0. */
  const asleep = useSharedValue(false);

  const knotX = useDerivedValue(() => CORD_REST.x + dragX.value);
  const knotY = useDerivedValue(() => CORD_REST.y + dragY.value);

  /**
   * 깨우는 건 이것 하나다. 잠든 뒤 매듭이 움직이려면 새 제스처가 있어야
   * 하고, 그건 반드시 `active`를 세운다 — 스프링 복귀는 잠들기 전에 이미
   * 끝나 있다(수면 조건이 매듭의 휴지점 도달을 요구한다).
   */
  useAnimatedReaction(
    () => active.value,
    (isActive) => {
      if (isActive) {
        asleep.value = false;
      }
    }
  );

  useFrameCallback((frameInfo) => {
    if (asleep.value) {
      return;
    }
    const dtMs = frameInfo.timeSincePreviousFrame;
    if (dtMs === null) {
      return;
    }
    const dt = Math.min(dtMs, MAX_FRAME_MS) / 1000;

    stepCord(nodes.value, dt, CORD_REST.x + dragX.value, CORD_REST.y + dragY.value);
    tick.value = tick.value + 1;

    /** 드래그 중도 아니고, 매듭도 제자리고, 다 멈췄으면 잔다. */
    if (
      !active.value &&
      Math.abs(dragX.value) < REST_EPSILON &&
      Math.abs(dragY.value) < REST_EPSILON &&
      maxNodeSpeed(nodes.value) < SLEEP_SPEED
    ) {
      asleep.value = true;
    }
  });

  /**
   * 마디를 지나는 2차 베지에 체인 — 마디가 제어점, 이웃과의 중점이 끝점인
   * 표준 중점 스무딩이다. 마디 12개에 세그먼트 13.5pt라 꺾임은 안 보인다.
   *
   * 형태가 프레임마다 바뀌므로 경로는 미리 못 만든다(원본 스펙 §6). 마지막
   * 구간만 직선인 건 중점 스무딩의 끝 처리다 — 13.5pt짜리라 안 보인다.
   */
  const path = useDerivedValue(() => {
    void tick.value; // 매 프레임 재계산 트리거
    const chain = nodes.value;
    const builder = Skia.PathBuilder.Make().moveTo(chain[0].x, chain[0].y);
    for (let i = 1; i < NODE_COUNT - 1; i++) {
      const node = chain[i];
      const next = chain[i + 1];
      builder.quadTo(node.x, node.y, (node.x + next.x) / 2, (node.y + next.y) / 2);
    }
    const tail = chain[NODE_COUNT - 1];
    return builder.lineTo(tail.x, tail.y).detach();
  });

  return { path, knotX, knotY };
}
```

- [ ] **Step 2: 타입 검사**

Run: `npm run typecheck`
Expected: 에러 없음. `SkPath` import가 타입 전용인지, `PathBuilder` 체이닝이 맞는지 여기서 잡힌다.

- [ ] **Step 3: 커밋**

```bash
git add src/gimmicks/bulb/cord.ts
git commit -m "feat: useCord — 로프 구동 + Skia 경로

프레임 콜백이 cordPhysics를 돌리고 tick으로 파생값을 깨운다(퍼퍼와
같은 패턴). 경로는 마디를 지나는 2차 베지에 중점 스무딩.

드래그 중도 아니고 매듭도 제자리고 마디가 다 멈추면 잠든다 — 놀 때
프레임 비용 0. 깨우는 건 active에 건 반응 하나뿐이다."
```

---

### Task 4: 전구가 로프를 쓰게 한다 — `bulb/index.tsx`

**Files:**
- Modify: `src/gimmicks/bulb/index.tsx`

**Interfaces:**
- Consumes: Task 3의 `useCord`, Task 2의 `CORD_WIDTH`·`KNOT_R`.
- Produces: 없음 (화면 컴포넌트).

- [ ] **Step 1: `useCord` import를 추가하고 죽은 import를 정리한다**

`@/gimmicks/_kinds/tug` import 아래에 붙인다.

```ts
import { useCord } from './cord';
import { CORD_WIDTH, KNOT_R } from './cordPhysics';
```

- [ ] **Step 2: 옮겨간 상수 블록을 지우고 포인터 주석을 남긴다**

아래 블록을

```ts
/** 줄의 시작(캡 바닥)과 휴지점 끝. `drag`는 끝점의 변위다. */
const CORD_ANCHOR = { x: 150, y: 226 };
const CORD_REST = { x: 150, y: 372 };
const CORD_WIDTH = 6;
const KNOT_R = 9;

/**
 * 줄이 당겨졌을 때 제어점이 변위의 반대쪽으로 처지는 비율. 스프링이
 * 오버슈트할 때 제어점이 교대로 반대편에 남으며 줄이 S자로 출렁인다.
 */
const CORD_BEND = 0.35;
```

이걸로 교체한다.

```ts
/**
 * 줄의 앵커·휴지점·굵기는 `cordPhysics.ts`에 있다 — 로프 시뮬이 그 값을
 * 소유하고 여기선 굵기만 받아 쓴다. **앵커(150, 226)는 아래 CAP의 바닥
 * 중앙이다.** CAP을 옮기면 거기도 같이 옮겨야 한다.
 */
```

- [ ] **Step 3: `BulbBody`의 시그니처에 `active`를 추가한다**

`BodyProps`를

```ts
type BodyProps = {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  on: SharedValue<number>;
  /** 로프 시뮬의 수면 게이트가 읽는다 — 드래그가 시작되면 깨운다. */
  active: SharedValue<boolean>;
};
```

로 바꾸고, `function BulbBody({ dragX, dragY, on }: BodyProps)`를

```ts
function BulbBody({ dragX, dragY, on, active }: BodyProps) {
```

로 바꾼다.

- [ ] **Step 4: render prop에서 `active`를 넘긴다**

`Bulb`의 children을

```tsx
        {({ dragX, dragY, on, active }) => (
          <BulbBody dragX={dragX} dragY={dragY} on={on} active={active} />
        )}
```

로 바꾼다.

- [ ] **Step 5: 손으로 만들던 베지에를 `useCord`로 갈아끼운다**

`cordPath`/`knotX`/`knotY` 세 개의 `useDerivedValue` 블록 전체 — 즉

```ts
  const cordPath = useDerivedValue(() => {
```

부터

```ts
  const knotY = useDerivedValue(() => CORD_REST.y + dragY.value);
```

까지를 아래 한 줄로 교체한다.

```ts
  /**
   * 줄. 마디 12개 로프 체인이다 — 꼬리(매듭)는 tug의 복귀 스프링을 따라가고
   * 몸통은 관성으로 뒤처지며 파형을 만든다(개정 스펙 §3). 원래는 2차 베지에
   * 1개였는데 한쪽으로밖에 못 휘어서 출렁임이 "휘었다 펴졌다"로 읽혔다.
   */
  const { path: cordPath, knotX, knotY } = useCord({ dragX, dragY, active });
```

- [ ] **Step 6: 타입 검사**

Run: `npm run typecheck`
Expected: 에러 없음. `Skia`·`useDerivedValue`가 아직 다른 곳(`FILAMENT_PATH`, 색 보간)에서 쓰이므로 import는 그대로 살아 있어야 한다.

- [ ] **Step 7: 쓰이지 않게 된 import가 없는지 확인한다**

Run: `grep -n "CORD_ANCHOR\|CORD_BEND\|CORD_REST" src/gimmicks/bulb/index.tsx`
Expected: 아무것도 안 나옴 (grep exit 1). 나오면 Step 2·5가 덜 된 것이다.

- [ ] **Step 8: 시뮬레이터에서 쉬는 자세를 확인한다**

Run: `npm run ios:sim`

앱이 뜨면 목록에서 **전구**로 들어가 스크린샷을 찍는다. 확인할 것:
- 줄이 캡 바닥에서 매듭까지 **수직**으로 내려온다 (좌우로 휘지 않는다)
- 매듭 원이 줄 끝에 붙어 있다 (떨어지거나 겹치지 않는다)
- 줄이 끊기거나 매듭 아래로 고리가 보이지 않는다

> 시뮬레이터엔 터치를 못 넣는다 — 출렁임과 릴리스 토글은 여기서 못 본다.
> 실기기 항목이다 (개정 스펙 §7).

- [ ] **Step 9: 커밋**

```bash
git add src/gimmicks/bulb/index.tsx
git commit -m "feat: 전구 줄을 로프 체인으로 교체

손으로 만들던 2차 베지에 1개 + CORD_BEND 제어점 처짐을 useCord로
갈아끼운다. 베지에 하나로는 한쪽으로밖에 못 휘어서 출렁임이 '휘었다
펴졌다'로 읽혔다.

앵커·휴지점·굵기는 cordPhysics.ts로 옮겼다. 앵커가 CAP 바닥과 묶여
있다는 사실은 포인터 주석으로 남긴다."
```

---

### Task 5: 문서와 주석을 릴리스 트리거로 맞춘다

**Files:**
- Modify: `src/gimmicks/types.ts`
- Modify: `src/gimmicks/_kinds/useHapticFire.ts`
- Modify: `src/gimmicks/registry.ts`
- Modify: `stack.md`

**Interfaces:**
- Consumes: 없음. 주석·문서만 고친다. **타입 시그니처와 런타임 동작은 하나도 안 바뀐다.**
- Produces: 없음.

- [ ] **Step 1: `types.ts`의 `TugConfig` 블록을 고친다**

```ts
/**
 * Tug — 전구 풀코드, 레버. 임계값을 넘어본 뒤 **놓는 순간** 1회. (§4)
 *
 * discrete와 다른 점은 트리거가 터치 다운이 아니라 릴리스라는 것, 그리고
 * 드래그 거리가 그 릴리스를 쏠지 말지의 관문이라는 것이다.
 */
export type TugConfig = {
  /**
   * 토글로 인정하는 당김 거리(pt). 잡은 지점 기준 유클리드 거리, 방향 무관.
   * 한 번 넘으면 되돌아와도 안 풀린다 — 이유는 `_kinds/tug.tsx`에.
   */
  threshold: number;
};
```

- [ ] **Step 2: `types.ts`의 `KindSpec.tug` 햅틱 주석을 고친다**

`tug:` 항목 안의 haptic 주석을 찾아 아래로 바꾼다.

```ts
    /** 릴리스 순간 한 방 — discrete와 같은 단발 계열. */
```

- [ ] **Step 3: `types.ts`의 `SlingConfig` 위 주석에서 tug와의 대비를 다시 적는다**

```ts
/**
 * Sling — 파티 포퍼, 새총. 당겨서 조준하고 놓는 순간 발사. (§4)
 *
 * tug와 다른 점: 트리거는 둘 다 릴리스지만, sling의 드래그는 각도·파워라는
 * **연속 payload**를 만든다. tug의 드래그는 쏠지 말지를 정하는 관문 하나뿐인
 * 이진 토글이다.
 */
```

- [ ] **Step 4: `useHapticFire.ts`의 공유 설명을 고친다**

```
 * discrete(터치 다운)와 tug(릴리스)가 공유한다 — 둘 다 "한 순간에
 * 한 방"이라 스펙 → 함수 변환이 같다.
```

- [ ] **Step 5: `registry.ts`의 `bulb` 햅틱 주석 첫 줄을 고친다**

```ts
    /**
     * 임계값을 넘긴 뒤 손을 떼는 순간의 딸깍. 실제 풀체인 스위치의 묵직한
     * 걸쇠 느낌을 노리고 `latch`를 골랐다.
```

(그 아래 "⚠️ 미검증 값이다..." 문단은 그대로 둔다.)

- [ ] **Step 6: `stack.md` §4 표의 Tug 행을 고친다**

131행을

```
| **Tug** | 전구 풀코드, 레버 | 임계값을 넘어본 뒤 놓는 순간 1회 | `Presets.*()` |
```

로 바꾼다.

- [ ] **Step 7: `stack.md` 136행·141행의 설명을 고친다**

136행에서 시작하는 문단의 "드래그 **거리**가" 설명 뒤에 트리거가 릴리스임을 명시하고, 141행의 "tug(당김 도중 임계값)와 다르다"를 고친다. 각각 아래를 포함해야 한다.

- 136행 문단: `드래그 **거리**가 관문이고 트리거는 릴리스다`
- 141행: `각도·파워라는 연속 payload를 만들어서 tug(이진 토글)와 다르다`

- [ ] **Step 8: 타입 검사**

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 9: "임계값 통과 순간" 잔재가 없는지 확인**

Run: `grep -rn "임계값을 넘는 순간\|임계값 통과 순간\|당김 도중" src/ stack.md`
Expected: 아무것도 안 나옴 (grep exit 1).

- [ ] **Step 10: 커밋**

```bash
git add src/gimmicks/types.ts src/gimmicks/_kinds/useHapticFire.ts src/gimmicks/registry.ts stack.md
git commit -m "docs: tug를 릴리스 트리거로 다시 적는다

tug와 sling이 둘 다 릴리스 발화가 되면서 구분선이 옮겨간다 —
tug는 임계값 이진 토글, sling은 각도·파워 연속 payload.

주석·문서만 바뀐다. 타입도 동작도 그대로."
```

---

## 완료 후

전부 끝나면:

```bash
npm run typecheck
git log --oneline main..HEAD
```

5개 커밋(+ 스펙 커밋)이 보여야 한다.

### 실기기로 넘기는 것

이 계획은 실기기 검증을 포함하지 않는다. 시뮬레이터엔 터치를 못 넣으므로 아래는 전부 미검증으로 남는다 (개정 스펙 §8):

- 릴리스 토글의 손맛, `latch` 프리셋 적합성
- `armed` 래치가 너무 관대한지 (되돌려 놓아도 토글)
- 물리 상수 — `GRAVITY` 2200, `DRAG` 2.6, `CORD_SLACK` 1.02, `CONSTRAINT_ITERATIONS` 5, `WHIP_SPRING` damping 12
- 급격히 접히는 게 보이면 굽힘 강성 제약(i ↔ i+2) 추가
