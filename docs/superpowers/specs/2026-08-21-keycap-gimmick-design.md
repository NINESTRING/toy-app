# 키캡 기믹 설계

> 상태: 승인됨 · 2026-08-21
> 참조는 모두 [stack.md](../../../stack.md)의 절 번호다.

---

## 0. 무엇을 만드는가

키캡 하나를 누르는 `discrete` 기믹. **스위치 축 3종(적축 / 갈축 / 사일런트)을 화면
안에서 전환**하고, 축을 바꾸면 햅틱과 배경색이 함께 바뀐다.

§4 표는 "키캡 패드"를 `grid` 모델로 분류하지만 이 기믹은 키캡 **하나**이므로
`grid`가 아니다. 터치 다운 1회에 햅틱 하나 — `discrete`다. 패드는 별도 작업으로
남긴다(§10 참고).

---

## 1. 문제: 클리커와 구조가 같다

키캡은 `discrete`이고 클리커도 `discrete`다. 껍데기만 바꾸면 갤러리에
"동그란 클리커"와 "네모난 클리커"가 나란히 서고, 사용자가 둘 중 하나를 고를 이유가
없어진다. §0이 "햅틱이 곧 제품"이라고 못박은 앱에서 기믹의 차별점은 생김새가 아니라
손맛이어야 한다.

**해결: 축 전환을 이 기믹의 정체성으로 삼는다.** 키보드를 쓰는 사람이면 적축·갈축이
바로 이해되는 언어고, 항목 하나로 손맛 3종이 나온다.

화면에선 손가락이 실제로 내려가지 않으므로 축의 차이는 **터치 다운 순간에 쏘는
파형의 차이**로 환원된다. 갈축의 "중간 걸림 + 바닥"처럼 2단이 필요한 경우도
`types.ts`에 이미 있는 `PatternHaptic`(`discretePattern`에 트랜지언트 2개)이
담당한다. **`_kinds/discrete.tsx`는 손대지 않는다.**

---

## 2. 결정 목록

| 결정 | 대안 | 이유 |
|---|---|---|
| 입력 모델 `discrete` 재사용 | `grid` 신설 | 키캡 하나면 터치 다운 1회다. `grid`는 별도 작업 |
| 축 목록을 `Gimmick.variants`로 일반화 | registry에 키캡 3개 / `DiscreteConfig.switches` | 다이얼·볼펜에도 재사용된다. `config`에 넣으면 `haptic` 필드와 햅틱 지정자가 두 군데로 갈린다 |
| 축 선택 UI를 **셸**(`[id].tsx`)에 | 기믹 컴포넌트 안에 | 매 프레임 안 바뀌므로 §1 금지 구간이 아니다. 셸에 두면 다른 기믹이 `variants`를 달 때 UI가 공짜로 따라온다 |
| 축별 색은 **컴포넌트**가 소유 | `variant`에 색 필드 추가 | §4 원칙 1이 데이터로 규정한 건 햅틱이다. 팔레트는 키캡 전용 시각 정보이고, 클리커도 자기 색을 컴포넌트에 갖고 있다 |
| Skia 도화 + RN `Text` 라벨 | RN View 레이어 / 배경만 Skia | RN `shadowOffset`은 iOS 전용이라 방향 있는 그림자가 안드로이드에서 사라진다. §0이 안드로이드를 빈틈으로 지목한 앱에서 그건 못 넘긴다. 라벨만 RN인 건 Skia 텍스트의 폰트 에셋 요구를 피하려는 것 |
| 사운드 제외 | 축별 클릭음 | 오디오 에셋이 없다. 새로 만드는 건 이 작업 범위 밖 |

---

## 3. 데이터 모델

```ts
// src/gimmicks/types.ts

/**
 * 하나의 기믹이 갖는 손맛 변형. 햅틱 타입은 kind에서 파생되므로
 * detented 기믹에 variants를 달면 RealtimeHaptic만 받는다.
 */
export type GimmickVariant<H> = {
  id: string;
  name: string;
  haptic: H;
};

export type Gimmick = {
  [K in GimmickKind]: GimmickBase & {
    kind: K;
    haptic: KindSpec[K]['haptic'];                           // 기본 변형
    variants?: readonly GimmickVariant<KindSpec[K]['haptic']>[];
    config: KindSpec[K]['config'];
    component: LazyComponent<K>;
  };
}[GimmickKind];

/** 기믹 컴포넌트가 받는 변형. kind별 햅틱 타입이 붙는다. */
export type VariantOf<K extends GimmickKind> = GimmickVariant<KindSpec[K]['haptic']>;

export type GimmickScreenProps<K extends GimmickKind = GimmickKind> = {
  gimmick: Extract<Gimmick, { kind: K }>;
  /** 선택된 변형. variants가 없는 기믹은 셸이 haptic으로 단일 변형을 합성한다. */
  variant: VariantOf<K>;
  onInteract: () => void;
};
```

**진실의 출처를 둘로 만들지 않는다.** 기믹 컴포넌트는 `gimmick.haptic`이 아니라
`variant.haptic`을 쓴다. 클리커와 다이얼도 여기로 옮긴다(각 1줄). `variants`가 없는
기믹은 셸이 `{ id: 'default', name: gimmick.name, haptic: gimmick.haptic }`을
합성해 넘기므로 동작이 그대로다.

`BUNDLED_PRESETS`는 **변형의 프리셋까지 모아야 한다.** 안 그러면 축을 바꾼 직후 첫
딸깍이 씹힌다(§4 원칙 3).

---

## 4. 축 3종

| 축 | `id` | 프리셋 (초기값) | 배경 → 키캡 |
|---|---|---|---|
| 적축 | `linear` | `keyboardPress` | 파랑 → 노랑 |
| 갈축 | `tactile` | `keyboardMechanical` | 붉은기 → 크림 |
| 사일런트 | `silent` | `keyboardMembrane` | 자턴 → 훈연 |

세 이름 모두 설치된 Pulsar 1.7.0에 실제로 존재한다(프리셋 197개 중). 오타는
`PresetName` 조건부 타입이 컴파일 타임에 잡는다.

> ⚠️ **이 프리셋 3개는 미검증이다.** §10은 코드를 짜기 전에 Pulsar Live Preview에서
> 실제로 느껴보고 고르라고 지시하지만 그건 실기기 작업이다. `registry.ts`가
> 클리커·다이얼에 이미 달아둔 것과 같은 성격의 경고 주석을 붙여 넘긴다.
> §4 원칙 1대로 햅틱이 데이터이므로 교체는 한 줄이다.
>
> 갈축이 2단(걸림 + 바닥) 느낌을 못 내면 `PatternHaptic`으로 바꾼다 —
> `discretePattern`에 시각차를 둔 트랜지언트 2개.

팔레트는 `keycap/palette.ts`가 `id → 색` 맵으로 갖는다. **맵에 없는 `id`는 기본
팔레트로 폴백한다** — §7 OTA로 축이 추가됐을 때 크래시하지 않게.

---

## 5. 상태

`store/gimmickState.ts`의 `GimmickState`에 `variantId?: string`을 추가한다.
`count`와 같은 키(`gimmick:{id}:state`), 같은 디바운스에 얹는다(§5).

**리셋 버튼은 `count`만 0으로 하고 축 선택은 유지한다.** §5가 리셋을 요구한 건 진행
상태("다 터진 뽁뽁이") 때문이고, 축은 취향이라 리셋 대상이 아니다.

읽을 때 저장된 `variantId`가 현재 `variants`에 없으면(OTA로 축이 빠진 경우) 기본
변형으로 떨어진다.

---

## 6. 렌더링

`src/gimmicks/keycap/index.tsx` — §1대로 이 파일에 `className`은 없다.

Skia 캔버스 하나에 아래에서 위로 쌓는다:

1. 배경 그라디언트 — `LinearGradient`
2. 하우징 — 키캡이 박힌 검은 타 (`RoundedRect`)
3. 드롭섀도 — 왼쪽 아래로 떨어지는 방향 있는 그림자 (`Box` + `BoxShadow`)
4. 키캡 스커트 — 측면. 눌림을 만드는 곳
5. 키캡 상판 — `RoundedRect`

`"Esc"` 라벨만 RN `Text`로 캔버스 위에 얹는다.

**눌림 표현은 클리커의 관례를 그대로 따른다 — 누를 때 0ms 즉시, 뗄 때 90ms
`withTiming`.** 클리커 주석이 적어둔 이유가 그대로 적용된다: 누를 때 애니메이션을
넣으면 그게 체감 지연으로 읽힌다(§0).

키캡은 **scale이 아니라 아래로 이동 + 스커트 높이 축소**로 눌린다. 실제 키캡은
작아지지 않고 내려간다.

`SkiaProps`가 `SharedValue`를 받으므로 `pressed`를 Skia에 직결한다 — JS 스레드를
거치지 않는다. 축 전환 시 배경색은 220ms 보간한다. **연타 중에는 배경이 가만히 있고
키캡만 움직인다** — 다타타 두드릴 때 배경색이 같이 출렁이면 산만해진다.

축 선택 칩은 셸(`[id].tsx`)이 RNR + `className`으로 그린다. `gimmick.variants`가
2개 이상일 때만 나타나므로 클리커·다이얼 화면은 그대로다.

---

## 7. 범위 밖

- **사운드.** 오디오 풀(`src/audio/pool.ts`)은 준비돼 있지만 에셋이 없다
  (`[id].tsx`에 이미 TODO로 적혀 있다). 축의 정체성에 소리가 큰 건 사실이지만
  오디오 파일을 새로 만드는 건 이 요청 범위 밖이다. `variant`에 `sound?`를
  미리 뚫어두지도 않는다 — 에셋이 생기면 그때 한 줄이다.
- **`grid` 입력 모델.** 키캡 패드는 별도 작업. 이번에 만든 키캡 렌더러를 셀로
  재사용한다.
- **테스트 하네스.** `package.json`에 테스트 스크립트도 하네스도 없다. 새로 도입하는
  건 이 요청 범위를 넘는다.

---

## 8. 파일 변경

| 파일 | 작업 |
|---|---|
| `src/gimmicks/types.ts` | `GimmickVariant`, `VariantOf`, `variants?`, `GimmickScreenProps.variant` |
| `src/gimmicks/registry.ts` | `keycap` 항목 추가, `BUNDLED_PRESETS`가 변형까지 수집 |
| `src/store/gimmickState.ts` | `variantId` 영속화 + `setVariant` |
| `src/app/gimmick/[id].tsx` | 축 칩 UI, 변형 해석 후 전달 |
| `src/gimmicks/clicker/index.tsx` | `variant.haptic` 사용 (1줄) |
| `src/gimmicks/dial/index.tsx` | `variant.haptic` 사용 (1줄) |
| `src/gimmicks/keycap/index.tsx` | 신규 — Skia 도화 |
| `src/gimmicks/keycap/palette.ts` | 신규 — 축별 색 |

새 의존성은 없다. Skia는 이미 설치돼 있다.

---

## 9. 검증

| 확인할 것 | 방법 | 가능 여부 |
|---|---|---|
| 타입 | `npm run typecheck` | 가능 |
| 레이아웃·색 전환·그림자 | `npm run ios:sim` | 가능 |
| 기존 기믹 무회귀 | 시뮬레이터에서 클리커·다이얼 진입 | 가능 |
| **손맛, 프리셋 3개의 적합성** | `npm run ios:release` (실기기) | **불가 — 미검증으로 넘김** |

README가 못박은 대로 **시뮬레이터로는 이 기믹을 평가할 수 없다.** 딸깍 지연과 축
3종의 구분은 실기기 Release 빌드에서만 의미가 있다.

---

## 10. 후속

- [ ] 실기기에서 축 3종의 프리셋 확정 (§10의 Live Preview 절차)
- [ ] 갈축이 2단 느낌을 못 내면 `PatternHaptic`으로 교체
- [ ] 축별 클릭음 에셋 → `variant`에 `sound?` 추가
- [ ] `grid` 입력 모델 + 키캡 패드
- [ ] `variants`가 붙을 다음 후보: 다이얼(눈금 24/48), 볼펜(눌림/릴리스 조합)
