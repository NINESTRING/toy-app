# 전구 기믹 설계

> 상태: 승인됨 · 2026-08-24
> 참조는 모두 [stack.md](../../../stack.md)의 절 번호다.
> 레퍼런스: jh3y, [Tuggable Light Bulb!](https://codepen.io/jh3y/pen/VwjgdLj) (GSAP Draggable + MorphSVG)

---

## 0. 무엇을 만드는가

풀코드(당김줄)가 달린 전구. **줄을 잡아당기면 전구가 켜지고/꺼지고, 배경이 화면
전체로 밝아지거나 어두워진다.** 놓으면 줄이 탄성으로 출렁이며 제자리로 돌아온다.

레퍼런스 펜의 구성: 전구 + 아래로 늘어진 줄, 드래그로 줄 끝을 끌다가 놓으면
이동 거리가 50px을 넘었을 때 조명이 토글되고 줄이 MorphSVG로 출렁인다.

---

## 1. 문제: 기존 입력 모델에 없다

§4의 분류로 보면 이 기믹은 discrete(터치 다운 1회)도 detented(눈금)도 아니다.
**드래그 거리가 임계값을 넘는 것**이 햅틱 트리거다. grid도 physics도 아니다.

**해결: 입력 모델 `tug`(당기기)를 신설한다.** types.ts가 적어둔 확장 절차
(KindSpec 한 줄 + `_kinds/` 렌더러 + registry 항목)를 그대로 밟는다. 풀코드
전구 외에도 레버, 파티 팝퍼, 슬롯머신 손잡이 등 "당겼다 놓기"류가 전부 이
모델로 온다. stack.md §4 표에도 행을 추가한다.

---

## 2. 레퍼런스에서 바꾸는 것: 토글 시점

펜은 **놓은 뒤** 줄이 복귀하고 나서 토글한다(릴리스 → 복귀 애니메이션 →
onStart에서 상태 전환 + 클릭음). 웹에선 자연스럽지만 §0 기준으로는 당김과
피드백 사이에 지연이 낀다.

**우리는 당기는 중에 임계값을 넘는 순간 토글한다.** 햅틱·조명·카운트가 그
순간에 동시에 터진다. 실제 풀체인 스위치도 당기는 도중에 딸깍하지, 놓을 때
하지 않는다. 놓기 전에 또 넘어도 재발화하지 않도록 **한 번의 당김 사이클에
토글은 1회**로 제한하고, 손을 떼야 재장전된다.

---

## 3. 결정 목록

| 결정 | 대안 | 이유 |
|---|---|---|
| 입력 모델 `tug` 신설 | `discrete` 재사용 + 컴포넌트가 제스처 소유 | 제스처·햅틱은 `_kinds`가, 생김새는 컴포넌트가 갖는 게 이 코드베이스의 계약. discrete로 위장하면 Tap 렌더러를 버리고 다시 만들게 된다 |
| 임계값 통과 순간 토글 | 펜처럼 릴리스 후 토글 | §0. 위 §2 참조 |
| 햅틱은 단발 프리셋 (`PresetHaptic \| PatternHaptic`) | 당기는 동안 실시간 장력 변조(RealtimeHaptic) 추가 | 스위치의 본질은 "딸깍" 한 방이다. 장력 럼블은 실기기에서 딸깍이 확정된 뒤의 후속 (§10) |
| 채찍 반동은 `withSpring` 오버슈트 | 펜처럼 경로 4종 모프 | 줄 끝점을 낮은 감쇠 스프링으로 복귀시키고 제어점이 드래그의 -0.35배로 처지게 하면 곡선이 교대로 휘며 출렁인다. MorphSVG 이식 대비 1/5 비용으로 같은 인상 |
| 전구를 Skia 프리미티브로 재작도 | 펜의 SVG 경로 이식 | 키캡 전례. 펜의 경로는 좌표계가 어긋난 Inkscape 산출물이라 이식 비용 > 재작도 비용 |
| 드래그는 화면 아무 데서나 | 펜처럼 줄 끝 히트 스팟만 | 피젯 토이에선 타깃이 큰 게 이득 (키캡·§5). 줄 끝은 손가락에 가려 보이지도 않는다 |
| 사운드 제외 | 펜의 click.mp3 이식 | 오디오 에셋이 없다. 키캡과 같은 범위 결정 |
| 변형 없음 | 스위치 무게 2종 등 | 프리셋이 실기기 미검증인 상태에서 변형부터 만드는 건 순서가 거꾸로다 |

---

## 4. 데이터 모델

```ts
// src/gimmicks/types.ts

/** Tug — 풀코드, 레버. 당김이 임계값을 넘는 순간 1회. */
export type TugConfig = {
  /** 토글로 인정하는 당김 거리(pt). 놓아야 재장전된다. */
  threshold: number;
};

type KindSpec = {
  // ...discrete, detented...
  tug: {
    config: TugConfig;
    /** 임계값 통과 순간 한 방 — discrete와 같은 단발 계열. */
    haptic: PresetHaptic | PatternHaptic;
  };
};
```

registry 항목:

```ts
{
  id: 'bulb',
  name: '전구',
  kind: 'tug',
  haptic: { type: 'preset', name: 'latch' },
  config: { threshold: 60 },
  component: () => import('./bulb'),
}
```

`BUNDLED_PRESETS` 수집 로직은 `gimmick.haptic`을 이미 훑으므로 손댈 게 없다.

> ⚠️ **`latch`는 미검증이다.** 클리커·키캡·다이얼과 같은 상태 — §10의 Live
> Preview 절차는 실기기 작업이라 아직 못 했다. 후보: `latch`, `lock`, `snap`,
> `trigger`, `toggleOn`/`toggleOff`(켜짐/꺼짐을 다른 파형으로 — 이 경우
> PatternHaptic 또는 config 확장이 필요해서 후속으로 미룬다).

`useHapticFire`(스펙 → 워크릿 호출 가능 함수)는 discrete.tsx의 프라이빗 훅인데
tug도 똑같이 필요하다. **`_kinds/useHapticFire.ts`로 추출**해서 둘이 공유한다.

---

## 5. `_kinds/tug.tsx`

detented처럼 제스처·햅틱·복귀 물리를 소유하고 생김새는 render prop에 맡긴다.

```ts
export type TugRenderState = {
  /** 줄 끝의 휴지점 대비 변위(pt). 워크릿에서 읽는다. */
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  /** 켜짐 여부. 0 | 1. 임계값 통과 순간 바뀐다. */
  on: SharedValue<number>;
  active: SharedValue<boolean>;
};
```

- `Pan.onBegin` — 현재 변위를 기점으로 잡는다(스프링 복귀 중에 다시 잡아도
  튀지 않게 `cancelAnimation` 후 기점 저장).
- `onUpdate` — 변위 갱신. 미발화 상태에서 `√(x²+y²) > threshold`면
  `on` 토글 + 햅틱 + `onInteract`, 발화 플래그를 세운다. 방향은 따지지
  않는다(펜과 동일 — 어느 쪽으로 당겨도 딸깍).
- `onFinalize` — 발화 플래그 해제, `withSpring`으로 0 복귀. 감쇠를 낮게
  (damping 9, stiffness 300 부근) 잡아 두어 번 출렁이는 게 채찍 반동이다.

모든 판정이 워크릿 안에서 끝난다(§4). 햅틱은 `useThrottledHaptic`을 거친다 —
사이클당 1회 제한이 있어 실질 의미는 없지만 discrete와 같은 계약을 유지한다.

---

## 6. 렌더링 (`src/gimmicks/bulb/index.tsx`)

§1대로 이 파일에 `className`은 없다. 키캡처럼 Skia 캔버스가 화면 전체를 덮고,
도형은 **300×460pt 설계 좌표계**에 적은 뒤 센터링 transform으로 배치한다.

아래에서 위로:

1. **배경** — 캔버스 전체 그라디언트. 꺼짐: 어두운 청회색, 켜짐: 따뜻한 크림.
   `on`을 120ms `withTiming`으로 따라가는 진행값에 `interpolateColor`.
   펜의 `--on` CSS 변수 계산식과 같은 역할이다.
2. **글로우** — 켜졌을 때만 유리 뒤에 `BlurMask` 원. 불투명도가 진행값을 탄다.
3. **유리** — 원. 꺼짐: 반투명 한기, 켜짐: 노란 충전. 테두리는 줄과 같은 색.
4. **필라멘트** — V자 라인 2개. 꺼짐: 어두운 회색, 켜짐: 백열.
5. **샤인** — 유리 왼쪽 위 호. 켜지면 옅어진다(펜의 `--shine`과 동일한 방향).
6. **캡** — 유리 아래 라운드 사각 + 가로 골 2줄.
7. **줄** — 캡 바닥(앵커)에서 줄 끝까지 2차 베지어. 끝점 = 휴지점 + `drag`,
   제어점 = 중점 − `drag` × 0.35. 스프링이 오버슈트할 때 제어점이 반대로
   처지며 줄이 S자로 출렁인다. 끝에 매듭 원.

**줄 경로는 매 프레임 `useDerivedValue`에서 만든다.** 키캡은 "워크릿에서 Skia
객체를 만들지 않는다"를 지켰지만 그건 도형이 전부 정적이라 가능했던 것이고,
줄은 형태 자체가 프레임마다 바뀌므로 미리 만들 수 없다. 경로 하나(세그먼트
2개)라 할당 비용은 무시할 수 있다. 정적인 도형(유리·캡·필라멘트·샤인)은
키캡처럼 모듈 상수로 미리 만든다.

**조명 전환은 120ms로 짧게.** 실제 전구는 즉시 켜진다 — 여기 애니메이션을
길게 넣으면 그게 체감 지연으로 읽힌다(§0, 클리커 주석과 같은 논리).

루트 뷰에 `collapsable={false}` — 키캡이 밟은 지뢰(스타일만 있는 루트 뷰를
Fabric이 flatten해서 GestureDetector가 엉뚱한 태그에 붙는 문제) 그대로다.

---

## 7. 범위 밖

- **사운드** (펜의 click.mp3) — 에셋 없음. 키캡과 동일.
- **당기는 동안의 장력 햅틱** — 실시간 변조를 tug에 섞는 건 딸깍 프리셋이
  실기기에서 확정된 뒤에 (§10 후속).
- **켜짐/꺼짐 파형 분리** (`toggleOn`/`toggleOff`) — config 확장이 필요.
  실기기에서 `latch` 하나로 충분한지부터 확인한다.
- **전구 흔들림** — 당길 때 전구 본체가 살짝 기우는 연출. 펜에도 없다.

---

## 8. 파일 변경

| 파일 | 작업 |
|---|---|
| `src/gimmicks/types.ts` | `TugConfig`, `KindSpec.tug` |
| `src/gimmicks/_kinds/useHapticFire.ts` | 신규 — discrete.tsx에서 추출 |
| `src/gimmicks/_kinds/discrete.tsx` | 추출된 훅 import (동작 불변) |
| `src/gimmicks/_kinds/tug.tsx` | 신규 — 제스처·토글·스프링 복귀 |
| `src/gimmicks/bulb/index.tsx` | 신규 — Skia 도화 |
| `src/gimmicks/registry.ts` | `bulb` 항목 |
| `src/app/index.tsx` | `KIND_LABELS.tug: '당기기'` |
| `stack.md` | §4 표에 Tug 행, 폴더 구조에 `tug.tsx` |

새 의존성 없음.

---

## 9. 검증

| 확인할 것 | 방법 | 가능 여부 |
|---|---|---|
| 타입 | `npm run typecheck` | 가능 |
| 레이아웃·꺼짐 상태 색 | `npm run ios:sim` + 스크린샷 | 가능 (터치를 못 넣으므로 켜짐 상태·출렁임은 불가) |
| 기존 기믹 무회귀 | discrete.tsx 변경이 추출뿐임을 diff로 확인 | 가능 |
| **딸깍 손맛, `latch` 적합성, 스프링 감쇠** | `npm run ios:release` (실기기) | **불가 — 미검증으로 넘김** |

---

## 10. 후속

- [ ] 실기기에서 `latch` 확정 (후보: lock, snap, trigger, toggleOn/Off)
- [ ] 스프링 감쇠·강성 실기기 튜닝 (출렁임이 과하면 damping ↑)
- [ ] 당기는 동안 장력 럼블 (RealtimeHaptic 혼합)
- [ ] 클릭음 에셋 → `sound` 연결
