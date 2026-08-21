# 키캡 기믹 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 키캡 하나를 누르는 `discrete` 기믹을 추가하고, 스위치 축 3종(적축/갈축/사일런트)을 화면 안에서 전환·영속화한다.

**Architecture:** 축 목록을 `Gimmick.variants`로 일반화해 셸(`app/gimmick/[id].tsx`)이 선택 UI를 소유하고, 선택된 변형을 기믹 컴포넌트에 `variant` prop으로 내린다. 키캡은 Skia 캔버스 하나에 배경 그라디언트·하우징·그림자·키캡을 그리고 `"Esc"` 라벨만 RN `Text`로 얹는다. 눌림과 배경색 전환은 전부 SharedValue로 Skia에 직결되어 JS 스레드를 거치지 않는다.

**Tech Stack:** TypeScript(strict) · Expo SDK 57 · expo-router · @shopify/react-native-skia 2.6.2 · react-native-reanimated 4.5.1 · react-native-gesture-handler · react-native-pulsar 1.7.0 · zustand + react-native-mmkv · React Native Reusables + Uniwind (셸 전용)

**Spec:** [docs/superpowers/specs/2026-08-21-keycap-gimmick-design.md](../specs/2026-08-21-keycap-gimmick-design.md)

## Global Constraints

- 참조 `§N`은 모두 [stack.md](../../../stack.md)의 절 번호다. 작업 전에 §0 §1 §4 §5를 읽을 것.
- **기믹 화면 내부에서 `className`을 쓰지 않는다 (§1).** `src/gimmicks/**` 아래 파일은 `ViewStyle`/`TextStyle` 상수만 쓴다. RNR·Uniwind는 `src/app/**`과 `src/components/**`까지만.
- **기믹 컴포넌트에서 RNR `Text`(`@/components/ui/text`)를 import하지 않는다.** 그건 `className`을 쓴다. `react-native`의 `Text`를 쓴다.
- **`component`는 반드시 lazy (§4 원칙 2).** registry 항목은 `component: () => import('./keycap')` 형태를 유지한다.
- **햅틱 프리셋 이름은 `PresetName` 타입을 통과해야 한다.** 오타는 런타임 무음이 아니라 컴파일 에러여야 한다.
- **새 의존성을 추가하지 않는다.** Skia는 이미 `package.json`에 있다(2.6.2).
- 포매팅은 `.prettierrc`를 따른다: `printWidth: 100`, `singleQuote: true`, `trailingComma: "es5"`, `bracketSameLine: true`. 커밋 전 `npm run format`.
- 주석은 한국어로, 기존 파일들과 같은 톤으로 쓴다 — **무엇을 하는지가 아니라 왜 그렇게 했는지**를 적고 근거가 되는 절 번호를 붙인다.

### 검증 방식 — TDD가 아니다

**이 저장소에는 테스트 하네스가 없다.** `package.json`에 `test` 스크립트도, jest 설정도, 테스트 파일도 없다. 스펙 §7이 테스트 인프라 도입을 명시적으로 범위 밖으로 뒀으므로, **이 계획의 각 태스크는 실패하는 테스트 대신 아래 두 개로 검증한다.**

| 게이트 | 명령 | 통과 기준 |
|---|---|---|
| 타입 | `npm run typecheck` | 출력 없이 종료 (exit 0) |
| 화면 | `npm run ios:sim` | 아래 각 태스크의 "시뮬레이터 확인" 항목 |

`npm run ios:sim`은 첫 빌드가 10분 이상 걸린다. **한 번 띄워두고 이후 태스크에서는 Fast Refresh로 이어서 확인한다.**

> **시뮬레이터로는 이 기믹을 평가할 수 없다.** 햅틱이 제품 자체인데(§0) 시뮬레이터에선 아무 느낌이 없다(§5). 시뮬레이터에서 확인하는 것은 레이아웃·색·전환·무회귀뿐이다. **딸깍 지연과 축 3종의 구분은 실기기 Release 빌드(`npm run ios:release`)에서만 판단된다** — 이 계획은 거기까지 가지 않고, 프리셋 3개를 미검증으로 표시해 넘긴다.

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `src/gimmicks/types.ts` | 레지스트리 계약. `GimmickVariant`/`VariantOf`가 여기 추가된다 | 1 |
| `src/gimmicks/registry.ts` | 기믹 정의(순수 데이터) + preload 대상 프리셋 수집 | 1, 2 |
| `src/gimmicks/clicker/index.tsx` | 클리커 생김새. `variant.haptic`으로 이관 | 1 |
| `src/gimmicks/dial/index.tsx` | 다이얼 생김새. `variant.haptic`으로 이관 | 1 |
| `src/app/gimmick/[id].tsx` | 셸. 변형 해석 + 축 선택 UI + 카운트/리셋 | 1, 3 |
| `src/gimmicks/keycap/palette.ts` | 축 id → 색. 키캡 전용 시각 정보 | 2 |
| `src/gimmicks/keycap/index.tsx` | 키캡 Skia 도화 + 눌림/배경 전환 | 2 |
| `src/store/gimmickState.ts` | 카운트 + 선택된 축의 영속화 | 3 |

`_kinds/discrete.tsx`는 **건드리지 않는다.** 축의 차이는 터치 다운 순간에 쏘는 파형의 차이로 환원되므로 제스처·햅틱 계층에 변경이 없다.

---

## Task 1: `variants` 데이터 모델 + 기존 기믹 이관

축 목록을 담을 자리를 만들고, 기믹 컴포넌트가 햅틱을 읽는 경로를 `gimmick.haptic` → `variant.haptic`으로 옮긴다. **이 태스크는 눈에 보이는 변화가 없다 — 무회귀가 곧 통과 조건이다.**

**Files:**
- Modify: `src/gimmicks/types.ts`
- Modify: `src/gimmicks/registry.ts` (`BUNDLED_PRESETS`)
- Modify: `src/app/gimmick/[id].tsx`
- Modify: `src/gimmicks/clicker/index.tsx`
- Modify: `src/gimmicks/dial/index.tsx`

**Interfaces:**
- Produces:
  - `type GimmickVariant<H> = { id: string; name: string; haptic: H }` — `src/gimmicks/types.ts`
  - `type VariantOf<K extends GimmickKind> = GimmickVariant<KindSpec[K]['haptic']>` — `src/gimmicks/types.ts`
  - `Gimmick`의 각 멤버에 `variants?: readonly VariantOf<K>[]`
  - `GimmickScreenProps<K>`에 `variant: VariantOf<K>`
  - `BUNDLED_PRESETS`가 `gimmick.haptic` **과 모든 `variants[].haptic`** 의 프리셋을 수집

---

- [ ] **Step 1: `types.ts`에 변형 타입 추가**

`src/gimmicks/types.ts`의 "기믹" 구분선 주석(`// ---` + `// 기믹`) **바로 위**에 아래 블록을 넣는다.

```ts
// ---------------------------------------------------------------------------
// 변형
// ---------------------------------------------------------------------------

/**
 * 하나의 기믹이 갖는 손맛 변형.
 *
 * 키캡의 스위치 축(적축·갈축·사일런트)처럼 "같은 물건인데 손맛이 다른" 것을
 * 표현한다. 키캡은 클리커와 같은 discrete 모델이라 껍데기만 바꾸면 갤러리에
 * 사실상 같은 기믹이 둘 서게 되는데, 차별점을 손맛에 두는 게 §0("햅틱이 곧
 * 제품")에 맞는 답이다.
 *
 * 햅틱 타입을 파라미터로 받으므로 kind별 제약이 그대로 유지된다 — detented
 * 기믹에 variants를 달면 RealtimeHaptic만 들어간다.
 *
 * **색이나 사운드는 여기 넣지 않는다.** §4 원칙 1이 데이터로 규정한 건
 * 햅틱이고, 시각 정보는 기믹 컴포넌트가 자기 것으로 갖는다(클리커가 자기
 * 색을 컴포넌트에 갖고 있는 것과 같은 자리다).
 */
export type GimmickVariant<H> = {
  id: string;
  name: string;
  haptic: H;
};

/** kind에 맞는 변형 타입. 기믹 컴포넌트가 props로 받는다. */
export type VariantOf<K extends GimmickKind> = GimmickVariant<KindSpec[K]['haptic']>;
```

- [ ] **Step 2: `GimmickScreenProps`에 `variant` 추가**

같은 파일의 `GimmickScreenProps`를 아래로 교체한다. 기존 `gimmick`/`onInteract`와 그 주석은 그대로 두고 `variant`만 추가하는 것이다.

```ts
/** 기믹 화면 컴포넌트가 받는 props. */
export type GimmickScreenProps<K extends GimmickKind = GimmickKind> = {
  gimmick: Extract<Gimmick, { kind: K }>;
  /**
   * 선택된 변형. 기믹 컴포넌트는 `gimmick.haptic`이 아니라 **이쪽**을 쓴다 —
   * 진실의 출처를 둘로 만들지 않기 위해서다.
   *
   * `variants`가 없는 기믹에는 셸이 `gimmick.haptic`으로 단일 변형을 합성해
   * 넘기므로, 변형 개념을 모르는 기믹도 그대로 동작한다.
   */
  variant: VariantOf<K>;
  /**
   * 한 번 조작될 때마다(딸깍 1회, 눈금 1칸) 호출된다.
   * 카운트를 메모리에 쌓는 용도 — MMKV 저장은 store 쪽에서 디바운스한다. (§5)
   */
  onInteract: () => void;
};
```

- [ ] **Step 3: `Gimmick`에 `variants` 추가**

같은 파일의 `export type Gimmick = {...}`를 아래로 교체한다.

```ts
export type Gimmick = {
  [K in GimmickKind]: GimmickBase & {
    kind: K;
    /**
     * 기본 변형의 햅틱. `variants`가 있으면 그 첫 항목과 같은 값을 둔다 —
     * 저장된 축을 못 찾았을 때 셸이 여기로 떨어진다.
     */
    haptic: KindSpec[K]['haptic'];
    /** 손맛 변형. 2개 이상일 때만 셸이 선택 UI를 그린다. */
    variants?: readonly VariantOf<K>[];
    config: KindSpec[K]['config'];
    component: LazyComponent<K>;
  };
}[GimmickKind];
```

- [ ] **Step 4: `BUNDLED_PRESETS`가 변형의 프리셋까지 수집하게 고치기**

`src/gimmicks/registry.ts` 맨 아래 `BUNDLED_PRESETS` 블록을 아래로 교체한다.

**이 단계를 빠뜨리면 축을 바꾼 직후 첫 딸깍이 씹힌다 (§4 원칙 3).**

```ts
/**
 * `as const` 배열은 항목마다 리터럴 타입이라, `variants`가 없는 항목에서
 * `gimmick.variants` 접근이 타입 에러가 된다. 순회용으로 한 번 넓혀 쓴다 —
 * 위의 `satisfies readonly Gimmick[]`이 이미 이 배열이 Gimmick[]임을
 * 컴파일 타임에 보장하므로, 이 대입은 그 보장을 통과시키는 것뿐이다.
 */
const ALL_GIMMICKS: readonly Gimmick[] = GIMMICKS;

/**
 * 번들에 포함된 기믹이 쓰는 프리셋. 앱 시작 시 preload한다. (§4 원칙 3)
 *
 * **변형의 프리셋까지 모아야 한다.** 기본 변형만 preload하면 사용자가 축을
 * 바꾼 직후의 첫 딸깍이 씹힌다 — 엔진 캐시에 없는 프리셋을 그 순간 올리기
 * 때문이다.
 *
 * Detented/Physics는 실시간 변조라 preload할 프리셋이 없으므로 자연히 빠진다.
 */
export const BUNDLED_PRESETS: readonly PresetName[] = ALL_GIMMICKS.flatMap((gimmick) => {
  /**
   * 유니온 배열(`discrete`용 배열 | `detented`용 배열)에 `.map`을 직접
   * 호출하면 TS가 시그니처를 합치지 못한다. 한 번 넓혀 받으면 풀린다 —
   * 속성 타입은 공변이라 대입이 성립한다.
   */
  const variants: readonly GimmickVariant<HapticSpec>[] = gimmick.variants ?? [];
  const haptics: readonly HapticSpec[] = [gimmick.haptic, ...variants.map((v) => v.haptic)];

  return haptics.flatMap((haptic) => (haptic.type === 'preset' ? [haptic.name] : []));
});
```

같은 파일 상단의 import를 아래로 교체한다(`GimmickVariant`, `HapticSpec` 추가).

```ts
import type { PresetName } from '@/haptics/presets';

import type { Gimmick, GimmickVariant, HapticSpec } from './types';
```

- [ ] **Step 5: 셸에서 변형을 해석해 내려보내기**

`src/app/gimmick/[id].tsx`를 세 군데 고친다.

먼저 import에 타입을 추가한다 — 기존 `import type { Gimmick } from '@/gimmicks/types';`를 교체.

```ts
import type { Gimmick, GimmickVariant, HapticSpec } from '@/gimmicks/types';
```

다음으로 `GimmickBodyComponent` 타입 선언(파일 하단부)을 교체한다.

```ts
type GimmickBodyComponent = React.ComponentType<{
  gimmick: Gimmick;
  variant: GimmickVariant<HapticSpec>;
  onInteract: () => void;
}>;
```

그리고 `GimmickView` 함수 **바로 위**에 변형 해석 함수를 추가한다.

```ts
/** `variants`가 없는 기믹의 합성 변형에 쓰는 id. */
const DEFAULT_VARIANT_ID = 'default';

/**
 * 기믹의 변형 목록. 없으면 `haptic` 하나로 단일 변형을 합성한다.
 *
 * 이렇게 해두면 기믹 컴포넌트가 분기 없이 항상 `variant.haptic`만 보게 되고,
 * 변형 개념을 모르는 기존 기믹(클리커·다이얼)도 그대로 동작한다.
 */
function variantsOf(gimmick: Gimmick): readonly GimmickVariant<HapticSpec>[] {
  /**
   * 유니온 배열에 직접 접근하면 TS가 시그니처를 합치지 못하므로 한 번 넓혀
   * 받는다. 속성 타입은 공변이라 대입이 성립한다.
   */
  const variants: readonly GimmickVariant<HapticSpec>[] = gimmick.variants ?? [];
  if (variants.length > 0) {
    return variants;
  }
  return [{ id: DEFAULT_VARIANT_ID, name: gimmick.name, haptic: gimmick.haptic }];
}
```

- [ ] **Step 6: `GimmickView`에서 변형을 골라 `Body`에 넘기기**

같은 파일 `GimmickView` 안, `const capability = useHapticCapability();` 다음 줄에 추가한다.

```ts
  /**
   * 지금은 항상 기본 변형이다. 사용자 선택은 Task 3에서 붙는다 —
   * 이 태스크의 목표는 햅틱을 읽는 경로를 옮기는 것뿐이다.
   */
  const variants = React.useMemo(() => variantsOf(gimmick), [gimmick]);
  const variant = variants[0];
```

그리고 `<Body .../>` 호출에 `variant`를 넘긴다.

```tsx
          <Body gimmick={gimmick} variant={variant} onInteract={onInteract} />
```

- [ ] **Step 7: 클리커를 `variant.haptic`으로 이관**

`src/gimmicks/clicker/index.tsx`의 `Clicker` 함수 시그니처와 `DiscreteGimmick` 호출을 교체한다.

```tsx
export default function Clicker({ gimmick, variant, onInteract }: GimmickScreenProps<'discrete'>) {
  return (
    <View style={CONTAINER}>
      <DiscreteGimmick haptic={variant.haptic} config={gimmick.config} onInteract={onInteract}>
        {({ pressed }) => <ClickerBody pressed={pressed} />}
      </DiscreteGimmick>
    </View>
  );
}
```

- [ ] **Step 8: 다이얼을 `variant.haptic`으로 이관**

`src/gimmicks/dial/index.tsx`의 `Dial` 함수를 교체한다.

```tsx
export default function Dial({ gimmick, variant, onInteract }: GimmickScreenProps<'detented'>) {
  return (
    <View style={CONTAINER}>
      <DetentedGimmick haptic={variant.haptic} config={gimmick.config} onInteract={onInteract}>
        {({ angle }) => <Knob angle={angle} detentCount={gimmick.config.detentCount} />}
      </DetentedGimmick>
    </View>
  );
}
```

- [ ] **Step 9: 타입 게이트**

Run: `npm run typecheck`
Expected: 출력 없이 exit 0.

흔한 실패와 원인:
- `Property 'variants' does not exist on type ...` → Step 4의 `ALL_GIMMICKS` 또는 Step 5의 넓혀받기 대입을 빠뜨린 것.
- `Type 'GimmickVariant<HapticSpec>' is not assignable to 'VariantOf<'discrete'>'` → `Body` 캐스팅이 `GimmickBodyComponent`를 거치는지 확인(Step 5).

- [ ] **Step 10: 시뮬레이터 확인 — 무회귀**

Run: `npm run ios:sim`

확인 항목:
1. 갤러리에 **클리커**와 **다이얼** 두 카드가 그대로 보인다.
2. 클리커 진입 → 원을 누르면 눌림 표현이 나오고 하단 카운트가 오른다.
3. 다이얼 진입 → 드래그하면 노브가 손가락을 따라 돌고 카운트가 오른다.
4. 헤더 리셋 버튼을 누르면 카운트가 0이 된다.

**하나라도 어긋나면 이 태스크는 실패다** — 이 태스크에 눈에 보이는 변화는 없어야 한다.

- [ ] **Step 11: 커밋**

```bash
npm run format
git add src/gimmicks/types.ts src/gimmicks/registry.ts src/app/gimmick/\[id\].tsx \
  src/gimmicks/clicker/index.tsx src/gimmicks/dial/index.tsx
git commit -m "feat: 기믹 변형(variants) 모델 추가

키캡의 스위치 축처럼 '같은 물건인데 손맛이 다른' 것을 표현할 자리를
Gimmick에 만든다. 햅틱 타입이 kind에서 파생되므로 detented 기믹에 붙이면
RealtimeHaptic만 들어간다.

기믹 컴포넌트가 햅틱을 읽는 경로를 gimmick.haptic에서 variant.haptic으로
옮겼다. variants가 없는 기믹은 셸이 단일 변형을 합성해 넘기므로 클리커·
다이얼의 동작은 그대로다.

BUNDLED_PRESETS가 변형의 프리셋까지 모은다 — 기본 변형만 preload하면
축을 바꾼 직후 첫 딸깍이 씹힌다. (§4 원칙 3)"
```

---

## Task 2: 키캡 렌더링 + registry 항목

Skia로 키캡을 그리고 registry에 축 3종을 등록한다. 아직 축을 바꿀 UI는 없으므로 **기본 축(적축)으로 진입해 누르는 것까지**가 이 태스크의 결과물이다.

**Files:**
- Create: `src/gimmicks/keycap/palette.ts`
- Create: `src/gimmicks/keycap/index.tsx`
- Modify: `src/gimmicks/registry.ts` (`GIMMICKS`에 항목 추가)

**Interfaces:**
- Consumes: Task 1의 `GimmickScreenProps<'discrete'>`(`variant` 포함), `VariantOf`, `BUNDLED_PRESETS` 수집 로직
- Produces:
  - `type KeycapPalette = { backgroundTop; backgroundBottom; housing; capTop; capSkirt; label }` (모두 `string`) — `src/gimmicks/keycap/palette.ts`
  - `function paletteFor(variantId: string): KeycapPalette` — 모르는 id는 기본 팔레트로 폴백
  - `export default function Keycap(props: GimmickScreenProps<'discrete'>)` — `src/gimmicks/keycap/index.tsx`
  - registry에 `id: 'keycap'` 항목 (variants: `linear` / `tactile` / `silent`)

---

- [ ] **Step 1: 팔레트 파일 작성**

Create `src/gimmicks/keycap/palette.ts`:

```ts
/**
 * 축별 팔레트.
 *
 * 색을 registry의 variant가 아니라 여기 두는 이유: §4 원칙 1이 데이터로
 * 규정한 건 햅틱이고, 팔레트는 키캡 전용 시각 정보다. 클리커도 자기 색을
 * 컴포넌트에 갖고 있다.
 *
 * 대가는 registry의 variant id와 이 맵의 키가 문자열로 결합된다는 것이다.
 * 그래서 `paletteFor`가 모르는 id를 기본 팔레트로 흘린다 — §7 OTA로 축이
 * 추가돼도 화면이 죽지 않아야 한다.
 */
export type KeycapPalette = {
  /** 배경 그라디언트. 위 → 아래 */
  backgroundTop: string;
  backgroundBottom: string;
  /** 키캡이 박힌 하우징. 레퍼런스의 검은 타 */
  housing: string;
  /** 키캡 상판 */
  capTop: string;
  /** 키캡 측면. 상판보다 어두워야 두께로 읽힌다 */
  capSkirt: string;
  /** 라벨 글자색 */
  label: string;
};

/** 적축 — 레퍼런스 이미지의 파랑/노랑. */
const LINEAR: KeycapPalette = {
  backgroundTop: '#1a5ce0',
  backgroundBottom: '#0a2f9c',
  housing: '#0b1020',
  capTop: '#f2cf1f',
  capSkirt: '#c39f08',
  label: '#1a1a1a',
};

/** 갈축 — 붉은기 배경에 크림색 키캡. */
const TACTILE: KeycapPalette = {
  backgroundTop: '#b4442c',
  backgroundBottom: '#6f2114',
  housing: '#1a0f0b',
  capTop: '#efe3cb',
  capSkirt: '#bfae8c',
  label: '#2a1c14',
};

/** 사일런트 — 자턴 배경에 훈연 회색 키캡. */
const SILENT: KeycapPalette = {
  backgroundTop: '#4a3f72',
  backgroundBottom: '#241e3c',
  housing: '#120f1c',
  capTop: '#8d8598',
  capSkirt: '#655e70',
  label: '#f0edf5',
};

/**
 * 모르는 id를 흘려보낼 기본값. 레퍼런스 이미지가 적축이므로 그것으로 둔다.
 */
const DEFAULT_PALETTE = LINEAR;

/** 값 타입에 undefined를 넣어야 아래 `??`가 타입 체커에도 의미를 갖는다. */
const PALETTES: Record<string, KeycapPalette | undefined> = {
  linear: LINEAR,
  tactile: TACTILE,
  silent: SILENT,
};

export function paletteFor(variantId: string): KeycapPalette {
  return PALETTES[variantId] ?? DEFAULT_PALETTE;
}
```

- [ ] **Step 2: 키캡 컴포넌트 작성**

Create `src/gimmicks/keycap/index.tsx`:

```tsx
import { Box, BoxShadow, Canvas, Group, LinearGradient, Rect, RoundedRect, rect, rrect, vec } from '@shopify/react-native-skia';
import * as React from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { DiscreteGimmick } from '@/gimmicks/_kinds/discrete';
import type { GimmickScreenProps } from '@/gimmicks/types';

import { paletteFor, type KeycapPalette } from './palette';

/**
 * 키캡 — Discrete 입력 모델. (§4)
 *
 * §4 표는 "키캡 패드"를 grid로 분류하지만 이건 키캡 **하나**다. 터치 다운
 * 1회에 햅틱 하나이므로 discrete이고, `_kinds/discrete.tsx`를 그대로 쓴다.
 *
 * §1: 이 파일 안에서는 `className`을 쓰지 않는다. `Text`도 RNR이 아니라
 * react-native의 것을 쓴다 — RNR `Text`는 className을 쓴다.
 *
 * 왜 Skia인가: RN의 `shadowOffset`은 iOS 전용이라 방향 있는 그림자가
 * 안드로이드에서 사라진다. §0이 안드로이드를 우리 빈틈으로 지목한 앱에서
 * 그건 못 넘긴다. Skia는 양 OS가 같은 결과를 낸다. §4가 Skia에 배정한
 * "그리기" 용도에 해당한다.
 */

/** 캔버스 한 변. 다이얼(260)보다 크게 잡아 그림자가 잘리지 않게 한다. */
const SIZE = 300;

/** 키캡이 박힌 하우징. */
const HOUSING = { x: 74, y: 74, size: 152, radius: 20 };

/** 키캡 몸통(스커트). 이 아래쪽 측면이 두께로 읽힌다. */
const SKIRT = { x: 90, y: 84, size: 120, radius: 14 };

/**
 * 상판. 스커트보다 좁고 살짝 위에 앉는다 — 아래쪽에 남는 스커트가
 * 키캡의 앞면(경사)으로 읽힌다.
 */
const CAP_TOP = { x: 96, y: 86, width: 108, height: 104, radius: 10 };

/** 눌렸을 때 내려가는 거리(px). */
const PRESS_DEPTH = 7;

/** 그림자. 레퍼런스처럼 왼쪽 아래로 떨어지므로 dx가 음수다. */
const SHADOW_DX = -14;
const SHADOW_DY = 18;
const SHADOW_BLUR = 20;
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.42)';

/**
 * 뗄 때의 복귀 시간. 클리커와 같은 값이다 — 누를 때는 0ms로 즉시 내려가고
 * 뗄 때만 여운을 준다. 누를 때 애니메이션을 넣으면 그게 체감 지연으로
 * 읽힌다. (§0)
 */
const RELEASE_MS = 90;

/** 축을 바꿀 때 배경색이 넘어가는 시간. */
const BACKGROUND_FADE_MS = 220;

/** Skia에 넘길 도형은 미리 만들어둔다 — 워크릿에서 Skia 객체를 만들지 않는다. */
const SKIRT_BOX = rrect(rect(SKIRT.x, SKIRT.y, SKIRT.size, SKIRT.size), SKIRT.radius, SKIRT.radius);

export default function Keycap({ gimmick, variant, onInteract }: GimmickScreenProps<'discrete'>) {
  const { palettes, stops, activeIndex } = useVariantPalettes(gimmick, variant);

  return (
    <View style={CONTAINER}>
      <DiscreteGimmick haptic={variant.haptic} config={gimmick.config} onInteract={onInteract}>
        {({ pressed }) => (
          <KeycapBody
            pressed={pressed}
            palettes={palettes}
            stops={stops}
            activeIndex={activeIndex}
          />
        )}
      </DiscreteGimmick>
    </View>
  );
}

/**
 * 축 목록에서 보간용 팔레트 배열을 만든다.
 *
 * 색 전환을 "현재 축 인덱스"라는 숫자 하나로 다루면, 축이 몇 개든
 * `interpolateColor` 한 번으로 끝난다.
 */
function useVariantPalettes(
  gimmick: GimmickScreenProps<'discrete'>['gimmick'],
  variant: GimmickScreenProps<'discrete'>['variant']
) {
  return React.useMemo(() => {
    const ids = (gimmick.variants ?? []).map((candidate) => candidate.id);
    const list = ids.length > 0 ? ids : [variant.id];
    const palettes = list.map(paletteFor);

    /**
     * `interpolateColor`는 입력 구간이 2개 이상이어야 한다. 변형이 하나뿐인
     * 경우(또는 §7 OTA로 축이 빠진 경우) 같은 팔레트를 한 번 더 넣어
     * "변하지 않는 보간"으로 만든다.
     */
    if (palettes.length === 1) {
      palettes.push(palettes[0]);
    }

    return {
      palettes,
      stops: palettes.map((_, index) => index),
      /** 저장된 축이 목록에 없으면 첫 축으로 떨어진다. */
      activeIndex: Math.max(0, list.indexOf(variant.id)),
    };
  }, [gimmick.variants, variant.id]);
}

type BodyProps = {
  pressed: SharedValue<number>;
  palettes: KeycapPalette[];
  stops: number[];
  activeIndex: number;
};

function KeycapBody({ pressed, palettes, stops, activeIndex }: BodyProps) {
  /**
   * 눌린 깊이(px). `pressed`를 그대로 쓰지 않고 한 겹 두는 이유는 누를 때와
   * 뗄 때의 시간이 달라야 하기 때문이다 — 누를 때 즉시, 뗄 때 90ms. (§0)
   */
  const depth = useSharedValue(0);

  useAnimatedReaction(
    () => pressed.value,
    (value) => {
      depth.value = value === 1 ? PRESS_DEPTH : withTiming(0, { duration: RELEASE_MS });
    }
  );

  /** 축 전환용 진행값. 첫 렌더에서는 애니메이션 없이 현재 축에서 시작한다. */
  const progress = useSharedValue(activeIndex);
  const mounted = React.useRef(false);

  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    progress.value = withTiming(activeIndex, { duration: BACKGROUND_FADE_MS });
  }, [activeIndex, progress]);

  const backgroundColors = useDerivedValue(() => [
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.backgroundTop)
    ),
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.backgroundBottom)
    ),
  ]);

  const housingColor = useDerivedValue(() =>
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.housing)
    )
  );

  const skirtColor = useDerivedValue(() =>
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.capSkirt)
    )
  );

  const capTopColor = useDerivedValue(() =>
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.capTop)
    )
  );

  /** 키캡 전체가 내려간다. 하우징은 제자리에 있어 눌림이 보인다. */
  const capTransform = useDerivedValue(() => [{ translateY: depth.value }]);

  /**
   * 그림자는 Box의 자식이라 키캡과 함께 내려간다. 내려간 만큼 dy를 줄여
   * 바닥에 붙어 있게 만든다 — 결과적으로 키캡이 자기 그림자에 가까워진다.
   */
  const shadowDy = useDerivedValue(() => SHADOW_DY - depth.value);
  const shadowBlur = useDerivedValue(() => SHADOW_BLUR - depth.value * 0.8);

  /** 라벨은 상판에 붙어 있어야 하므로 같은 깊이로 내린다. */
  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: depth.value }],
  }));

  const labelColor = useDerivedValue(() =>
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.label)
    )
  );

  /**
   * 라벨 색만 RN 쪽이라 워크릿 값을 스타일로 옮긴다. 캔버스 안의 색들과
   * 달리 이건 Skia가 읽지 않는다.
   */
  const labelColorStyle = useAnimatedStyle(() => ({
    color: labelColor.value,
  }));

  return (
    <View style={BODY}>
      <Canvas style={CANVAS}>
        <Rect x={0} y={0} width={SIZE} height={SIZE}>
          <LinearGradient start={vec(0, 0)} end={vec(0, SIZE)} colors={backgroundColors} />
        </Rect>

        <RoundedRect
          x={HOUSING.x}
          y={HOUSING.y}
          width={HOUSING.size}
          height={HOUSING.size}
          r={HOUSING.radius}
          color={housingColor}
        />

        <Group transform={capTransform}>
          <Box box={SKIRT_BOX} color={skirtColor}>
            <BoxShadow dx={SHADOW_DX} dy={shadowDy} blur={shadowBlur} color={SHADOW_COLOR} />
          </Box>
          <RoundedRect
            x={CAP_TOP.x}
            y={CAP_TOP.y}
            width={CAP_TOP.width}
            height={CAP_TOP.height}
            r={CAP_TOP.radius}
            color={capTopColor}
          />
        </Group>
      </Canvas>

      {/* 캔버스 위에 얹는 라벨. Skia 텍스트는 폰트 에셋을 요구하므로 피한다. */}
      <Animated.Text style={[LABEL, labelStyle, labelColorStyle]} pointerEvents="none">
        Esc
      </Animated.Text>
    </View>
  );
}

const CONTAINER: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};

/** 제스처를 받는 뷰. Canvas가 아니라 이 뷰가 터치를 받는다. */
const BODY: ViewStyle = {
  width: SIZE,
  height: SIZE,
};

const CANVAS: ViewStyle = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: SIZE,
  height: SIZE,
};

/**
 * 상판 중심(y ≈ 138)에 글자 중심을 맞춘 값. 상판 기하가 바뀌면 여기도
 * 같이 옮겨야 한다.
 */
const LABEL: TextStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 124,
  textAlign: 'center',
  fontSize: 22,
  fontWeight: '600',
  letterSpacing: 0.5,
};
```

> `Text`를 import했지만 `Animated.Text`만 쓴다면 import에서 `Text`를 빼라. 위 코드는 `Text`를 쓰지 않으므로 **`import { View, type TextStyle, type ViewStyle } from 'react-native';`** 로 줄인다.

- [ ] **Step 3: registry에 키캡 등록**

`src/gimmicks/registry.ts`의 `GIMMICKS` 배열에서 `clicker` 항목 **다음**에 아래를 넣는다(다이얼 앞).

```ts
  {
    id: 'keycap',
    name: '키캡',
    kind: 'discrete',
    /**
     * 기본 축은 적축. 아래 variants[0]과 같은 값을 둔다 — 저장된 축을
     * 못 찾았을 때 셸이 여기로 떨어진다.
     */
    haptic: { type: 'preset', name: 'keyboardPress' },
    /**
     * 스위치 축 3종.
     *
     * 화면에선 손가락이 실제로 내려가지 않으므로 축의 차이는 터치 다운
     * 순간에 쏘는 파형의 차이로 환원된다. 그래서 `_kinds/discrete.tsx`는
     * 손댈 필요가 없다.
     *
     * ⚠️ **프리셋 3개 모두 미검증이다.** §10은 코드를 짜기 전에 Pulsar
     * Live Preview에서 실제로 느껴보고 고르라고 지시하는데, 그건 실기기가
     * 필요한 작업이라 아직 못 했다. 클리커·다이얼과 같은 상태다.
     *
     * 실기기에서 확인한 뒤 교체할 것. 후보(키보드 계열):
     *   keyboardPress, keyboardRelease, keyboardTap,
     *   keyboardMechanical, keyboardMembrane, snap, latch, plunk
     *
     * 갈축이 2단(중간 걸림 + 바닥) 느낌을 못 내면 프리셋 대신
     * `{ type: 'pattern', pattern: ... }`으로 바꾼다 — `discretePattern`에
     * 시각차를 둔 트랜지언트 2개를 넣으면 된다. §4 원칙 1대로 햅틱이
     * 데이터이므로 교체는 이 블록 안에서 끝난다.
     */
    variants: [
      { id: 'linear', name: '적축', haptic: { type: 'preset', name: 'keyboardPress' } },
      { id: 'tactile', name: '갈축', haptic: { type: 'preset', name: 'keyboardMechanical' } },
      { id: 'silent', name: '사일런트', haptic: { type: 'preset', name: 'keyboardMembrane' } },
    ],
    config: {
      /** 릴리스 햅틱 없음 — 축의 차이는 누를 때 한 방으로 표현한다. */
    },
    component: () => import('./keycap'),
  },
```

- [ ] **Step 4: 타입 게이트**

Run: `npm run typecheck`
Expected: 출력 없이 exit 0.

흔한 실패와 원인:
- `Type '"keyboardPress"' is not assignable to type 'PresetName'` → 설치된 Pulsar에 그 이름이 없다. `node_modules/react-native-pulsar/lib/typescript/src/Presets.d.ts`에서 실제 이름을 확인하고 고친다.
- `'Text' is declared but its value is never read` → Step 2의 안내대로 import를 줄인다.

- [ ] **Step 5: 시뮬레이터 확인**

Run: `npm run ios:sim` (이미 떠 있으면 Fast Refresh)

확인 항목:
1. 갤러리에 **키캡** 카드가 클리커와 다이얼 사이에 보이고, 부제가 "누르기"다.
2. 키캡 진입 → 파란 그라디언트 배경, 검은 하우징, 노란 키캡, `Esc` 라벨.
3. 그림자가 **왼쪽 아래**로 떨어진다.
4. 누르면 키캡과 라벨이 함께 내려가고 그림자가 짧아진다. 떼면 부드럽게 올라온다.
5. 카운트가 오른다.
6. 클리커·다이얼이 여전히 정상이다.
7. 축 전환 UI는 **아직 없다** — 다음 태스크다.

- [ ] **Step 6: 커밋**

```bash
npm run format
git add src/gimmicks/keycap/ src/gimmicks/registry.ts
git commit -m "feat: 키캡 기믹 (Skia)

키캡 하나를 누르는 discrete 기믹. §4 표는 '키캡 패드'를 grid로 분류하지만
이건 키캡 하나이므로 터치 다운 1회 = discrete다.

Skia로 그린 이유: RN shadowOffset은 iOS 전용이라 방향 있는 그림자가
안드로이드에서 사라진다. §0이 안드로이드를 빈틈으로 지목한 앱에서 그건
못 넘긴다.

눌림은 클리커의 관례를 따른다 — 누를 때 0ms 즉시, 뗄 때 90ms. 키캡이
내려간 만큼 그림자 dy를 줄여 그림자가 바닥에 붙어 있게 했다.

축 3종의 프리셋은 실기기 확인이 필요해 미검증으로 표시했다."
```

---

## Task 3: 축 선택 UI + 영속화

셸에 축 칩을 붙이고 선택을 MMKV에 남긴다. **이 태스크가 끝나면 축 전환이 실제로 동작한다.**

**Files:**
- Modify: `src/store/gimmickState.ts`
- Modify: `src/app/gimmick/[id].tsx`

**Interfaces:**
- Consumes: Task 1의 `variantsOf`, Task 2의 `keycap` variants(`linear`/`tactile`/`silent`)
- Produces:
  - `GimmickState`에 `variantId?: string`
  - `useGimmickStore` 액션 `setVariant: (gimmickId: string, variantId: string) => void`
  - `function useGimmickVariantId(gimmickId: string): string | undefined`

---

- [ ] **Step 1: `GimmickState`에 `variantId` 추가**

`src/store/gimmickState.ts`의 `GimmickState`와 `load`를 교체한다.

```ts
export type GimmickState = {
  /** 총 조작 횟수. 딸깍 1회, 눈금 1칸이 1이다. */
  count: number;
  /**
   * 선택된 변형 id. 없으면 기믹의 기본 변형을 쓴다.
   *
   * 카운트와 같은 키에 얹는다 — 기믹당 상태가 한 덩어리라 §5의
   * `gimmick:{id}:state` 규칙을 그대로 따르고 디바운스도 공유한다.
   */
  variantId?: string;
};

const EMPTY: GimmickState = { count: 0 };

function load(gimmickId: string): GimmickState {
  const raw = storage.getString(gimmickStateKey(gimmickId));
  if (!raw) {
    return EMPTY;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<GimmickState>;
    return {
      count: typeof parsed.count === 'number' ? parsed.count : 0,
      variantId: typeof parsed.variantId === 'string' ? parsed.variantId : undefined,
    };
  } catch {
    // 저장 형식이 깨진 경우 기믹을 못 열게 하는 것보다 0에서 다시 세는 게 낫다.
    return EMPTY;
  }
}
```

- [ ] **Step 2: `Store` 타입에 `setVariant` 추가**

같은 파일의 `type Store`를 교체한다.

```ts
type Store = {
  states: Record<string, GimmickState>;
  /** 화면 진입 시 호출. MMKV에서 한 번 읽어 메모리로 올린다. */
  hydrate: (gimmickId: string) => void;
  /** 조작 1회. 메모리는 즉시, 디스크는 디바운스. */
  interact: (gimmickId: string) => void;
  /** 축(변형) 선택. 카운트와 같은 키에 함께 저장된다. */
  setVariant: (gimmickId: string, variantId: string) => void;
  /** §5: 리셋 버튼 필수 — 다 터진 뽁뽁이는 쓸모가 없다. */
  reset: (gimmickId: string) => void;
};
```

- [ ] **Step 3: `interact`가 축 선택을 지우지 않게 고치기**

같은 파일 `interact`의 `next` 생성을 교체한다.

**현재 구현은 `{ count: current.count + 1 }`로 상태를 새로 만들기 때문에, 이대로 두면 딸깍 한 번에 축 선택이 날아간다.**

```ts
  interact: (gimmickId) => {
    const current = get().states[gimmickId] ?? EMPTY;
    /** 전개가 필요하다 — 새로 만들면 딸깍 한 번에 축 선택이 날아간다. */
    const next: GimmickState = { ...current, count: current.count + 1 };

    set((state) => ({ states: { ...state.states, [gimmickId]: next } }));
    writeDebounced(gimmickStateKey(gimmickId), JSON.stringify(next));
  },
```

- [ ] **Step 4: `setVariant` 구현과 `reset` 수정**

같은 파일에서 `interact` 다음에 `setVariant`를 넣고, `reset`을 교체한다.

```ts
  setVariant: (gimmickId, variantId) => {
    const current = get().states[gimmickId] ?? EMPTY;
    const next: GimmickState = { ...current, variantId };

    set((state) => ({ states: { ...state.states, [gimmickId]: next } }));
    writeDebounced(gimmickStateKey(gimmickId), JSON.stringify(next));
  },

  reset: (gimmickId) => {
    const { variantId } = get().states[gimmickId] ?? EMPTY;
    /**
     * 카운트만 0으로 하고 축 선택은 유지한다. §5가 리셋을 요구한 건 진행
     * 상태("다 터진 뽁뽁이") 때문이고, 축은 취향이라 리셋 대상이 아니다.
     */
    const next: GimmickState = { count: 0, variantId };

    set((state) => ({ states: { ...state.states, [gimmickId]: next } }));

    if (variantId === undefined) {
      // 남길 게 없으면 키를 지운다. 예약된 쓰기까지 취소된다.
      deleteKey(gimmickStateKey(gimmickId));
      return;
    }
    /**
     * 축을 남겨야 하므로 지우는 대신 덮어쓴다. 디바운스라 앱이 곧바로
     * 죽으면 이전 카운트가 살아남을 수 있다 — §5가 디바운스를 택한 대가와
     * 같은 것이고, 백그라운드 진입 시 `flushPendingWrites`가 닫아준다.
     */
    writeDebounced(gimmickStateKey(gimmickId), JSON.stringify(next));
  },
```

- [ ] **Step 5: 선택자 추가**

같은 파일 맨 아래 `useGimmickCount` 다음에 넣는다.

```ts
/** 저장된 축 id. 목록에 없는 값일 수 있으므로 셸에서 검증한다. */
export function useGimmickVariantId(gimmickId: string): string | undefined {
  return useGimmickStore((state) => state.states[gimmickId]?.variantId);
}
```

- [ ] **Step 6: 셸에서 저장된 축을 골라 쓰기**

`src/app/gimmick/[id].tsx`의 store import를 교체한다.

```ts
import { useGimmickCount, useGimmickStore, useGimmickVariantId } from '@/store/gimmickState';
```

`GimmickView` 안에서 Task 1 Step 6에 넣은 두 줄을 아래로 교체한다.

```ts
  const variants = React.useMemo(() => variantsOf(gimmick), [gimmick]);
  const storedVariantId = useGimmickVariantId(gimmick.id);
  /**
   * 저장된 id가 현재 목록에 없으면 첫 변형으로 떨어진다 — §7 OTA로 축이
   * 빠졌을 때 화면이 빈 상태가 되지 않게 한다.
   */
  const variant = React.useMemo(
    () => variants.find((candidate) => candidate.id === storedVariantId) ?? variants[0],
    [variants, storedVariantId]
  );
```

그리고 `reset`을 가져오는 줄 근처에 `setVariant`를 추가한다.

```ts
  const setVariant = useGimmickStore((state) => state.setVariant);
```

- [ ] **Step 7: 축 칩 렌더링**

같은 파일에서 `<React.Suspense>` 블록 **다음**, 카운트 `<Text>` **앞**에 넣는다.

```tsx
        {variants.length > 1 ? (
          <View className="flex-row gap-2">
            {variants.map((candidate) => (
              <Button
                key={candidate.id}
                size="sm"
                variant={candidate.id === variant.id ? 'default' : 'outline'}
                onPressIn={() => setVariant(gimmick.id, candidate.id)}>
                <Text>{candidate.name}</Text>
              </Button>
            ))}
          </View>
        ) : null}
```

**칩은 셸에 있으므로 `className`을 쓴다 — §1이 금지한 건 기믹 화면 내부이고, 여기는 매 프레임 스타일이 바뀌는 구간이 아니다.** `variants.length > 1` 가드 덕분에 클리커·다이얼 화면은 그대로다.

`onPressIn`을 쓰는 건 이 파일의 리셋 버튼·테마 토글과 같은 관례다.

- [ ] **Step 8: 타입 게이트**

Run: `npm run typecheck`
Expected: 출력 없이 exit 0.

흔한 실패와 원인:
- `Property 'setVariant' does not exist` → Step 2에서 `Store` 타입에 추가하지 않은 것.
- `deleteKey' is declared but never used` → `reset`에서 `deleteKey` 분기를 빠뜨린 것.

- [ ] **Step 9: 시뮬레이터 확인**

Run: `npm run ios:sim` (이미 떠 있으면 Fast Refresh)

확인 항목:
1. 키캡 화면 하단에 **적축 / 갈축 / 사일런트** 칩 3개. 적축이 채워진 상태.
2. **갈축** 탭 → 배경이 파랑에서 붉은기로 부드럽게(약 220ms) 넘어가고 키캡이 크림색이 된다. 칩 강조가 갈축으로 옮겨간다.
3. **사일런트** 탭 → 자턴 배경 + 회색 키캡.
4. 연타 → **배경은 가만히 있고 키캡만 움직인다.**
5. 뒤로 나갔다 다시 들어와도 **선택한 축이 유지된다.**
6. 헤더 리셋 → 카운트만 0이 되고 **축 선택은 그대로다.**
7. 축을 여러 번 바꾼 뒤 딸깍 → 축 선택이 유지된다(Step 3의 전개가 되어 있는지 확인하는 항목).
8. 클리커·다이얼 화면에는 **칩이 나타나지 않는다.**

- [ ] **Step 10: 커밋**

```bash
npm run format
git add src/store/gimmickState.ts src/app/gimmick/\[id\].tsx
git commit -m "feat: 축 선택 UI + 영속화

축 칩을 셸에 뒀다. 매 프레임 바뀌는 구간이 아니라 §1 금지 대상이 아니고,
셸에 두면 다른 기믹이 variants를 달 때 UI가 따라온다. variants가 2개
이상일 때만 그려지므로 클리커·다이얼 화면은 그대로다.

선택한 축은 카운트와 같은 키에 얹어 디바운스를 공유한다. interact가
상태를 새로 만들던 것을 전개로 고쳤다 — 그대로 두면 딸깍 한 번에 축
선택이 날아간다.

리셋은 카운트만 0으로 하고 축은 유지한다. §5가 리셋을 요구한 건 진행
상태 때문이고 축은 취향이다."
```

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 절 | 요구 | 태스크 |
|---|---|---|
| §3 데이터 모델 | `GimmickVariant`, `VariantOf`, `variants?`, `GimmickScreenProps.variant` | 1 Step 1–3 |
| §3 | 클리커·다이얼을 `variant.haptic`으로 이관 | 1 Step 7–8 |
| §3 | `BUNDLED_PRESETS`가 변형까지 수집 | 1 Step 4 |
| §4 축 3종 + 미검증 표시 | registry 항목 + ⚠️ 주석 | 2 Step 3 |
| §4 팔레트 폴백 | `paletteFor`의 `?? DEFAULT_PALETTE` | 2 Step 1 |
| §5 `variantId` 영속화 | `GimmickState.variantId` | 3 Step 1 |
| §5 리셋은 카운트만 | `reset`이 `variantId` 유지 | 3 Step 4 |
| §5 없는 id는 기본으로 | 셸의 `find(...) ?? variants[0]` | 3 Step 6 |
| §6 Skia 레이어 5겹 + RN 라벨 | `KeycapBody` | 2 Step 2 |
| §6 누를 때 0ms / 뗄 때 90ms | `useAnimatedReaction` + `RELEASE_MS` | 2 Step 2 |
| §6 이동 + 그림자 단축 | `capTransform`, `shadowDy` | 2 Step 2 |
| §6 배경 220ms 보간 | `BACKGROUND_FADE_MS` | 2 Step 2 |
| §6 칩은 셸, 2개 이상일 때만 | `variants.length > 1` | 3 Step 7 |
| §7 범위 밖(사운드·grid·테스트) | 계획에 없음 — 의도된 것 | — |
| §9 검증 | 각 태스크의 타입 게이트 + 시뮬레이터 확인 | 1·2·3 |

빠진 요구 없음.

**2. 플레이스홀더 스캔**

"TBD"/"적절히"/"에러 처리 추가" 류 없음. 모든 코드 단계에 실제 코드가 들어 있다. registry의 ⚠️ 주석은 플레이스홀더가 아니라 **스펙이 지시한 산출물**이다(실기기 검증이 남았다는 사실을 코드에 남기는 것).

**3. 타입 일관성**

- `GimmickVariant<H>` / `VariantOf<K>` — Task 1에서 정의, Task 2·3에서 같은 이름으로 사용.
- `paletteFor(variantId: string): KeycapPalette` — Task 2 Step 1 정의, Step 2에서 `list.map(paletteFor)`로 호출. 인자 타입 일치.
- `setVariant(gimmickId, variantId)` — Task 3 Step 2 선언, Step 4 구현, Step 7 호출. 인자 순서 일치.
- `useGimmickVariantId` — Step 5 정의, Step 6 사용.
- `KeycapPalette` 필드명(`backgroundTop`/`backgroundBottom`/`housing`/`capTop`/`capSkirt`/`label`) — Step 1 정의와 Step 2 사용이 일치.
- Task 1이 셸에 넣는 `const variant = variants[0]`은 Task 3 Step 6에서 교체된다. 의도된 순차 대체이며 계획에 명시돼 있다.

**4. 확인한 외부 API** (설치된 버전의 타입 정의에서 직접 확인)

- Pulsar 1.7.0: `keyboardPress`, `keyboardRelease`, `keyboardTap`, `keyboardMechanical`, `keyboardMembrane` 존재. `Pattern`은 `discretePattern[]` + `continuousPattern`.
- Skia 2.6.2: `Canvas`, `Rect`, `RoundedRect`, `Group`, `Box`, `BoxShadow`, `LinearGradient`, `rect`, `rrect`, `vec` 존재. `BoxShadow`는 `{dx?, dy?, spread?, blur, color?, inner?}`. `Box`는 `box: SkRRect | SkRect`. `GroupProps`에 `transform?: Transforms3d`. `SkiaProps<T>`가 `T | {value: T}`이므로 모든 prop에 SharedValue를 넘길 수 있다.
