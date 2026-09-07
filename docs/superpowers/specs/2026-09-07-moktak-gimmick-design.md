# 목탁 기믹 설계

> 상태: 승인됨 · 2026-09-07
> 참조는 모두 [stack.md](../../../stack.md)의 절 번호다.
> 레퍼런스: 카카오 미니앱 "목탁 두드리기" 스크린샷 — 번뇌 108 카운트다운,
> 진행 바, 법구경 문구 카드, 목탁 + 채.

---

## 0. 무엇을 만드는가

연한 한지색 배경 위에 목탁과 채. **목탁을 누르면 채가 즉시 내려와 치고
"똑" 소리와 햅틱이 난다. 손을 떼면 채가 스프링으로 돌아온다.** 위쪽에
"번뇌가 사라지는 중 · N 남음 · 진행 바 · M바퀴 완주"가 있고, 27타마다
법구경 문구 카드가 떠서 4초 뒤 사라진다.

이 앱 최초의 **소리 있는 기믹**이자 최초의 **탭 위치를 가리는 기믹**이다.
그 둘이 기존 계약에 각각 작은 확장을 요구한다(§3, §5).

---

## 1. 결정 목록

| 결정 | 대안 | 이유 |
|---|---|---|
| 입력 모델 `discrete` 재사용 | 채를 드래그해 휘두르기 / 길게 누르면 자동 연타 | 터치 다운 1회에 한 방. 채 스윙은 시각 연출이고 트리거는 누르는 순간이다(키캡과 같은 원칙). 사용자 결정 |
| 목탁 위만 맞는다 | 화면 아무 데나(기존 기믹 전부) | "목탁을 누른다"를 문자 그대로. 사용자 결정. 빗나가면 무반응이다 |
| 판정은 `DiscreteGimmick`의 `hitTest` 워크릿 prop | 제스처 뷰를 목탁 크기로 줄이기 / 음수 hitSlop / 새 kind | 배경 캔버스도 `pressed`를 읽어야 해서 루트 뷰는 전체 화면이어야 한다. 캔버스 크기에 따라 변하는 영역을 정적 hitSlop에 넣는 건 깨지기 쉽다. kind 신설은 판정 하나에 과하다 |
| 108 카운트다운은 셸 카운트에서 파생 | 별도 저장 | `count % 108`과 `floor(count / 108)`로 충분하다. 저장소 변경 없음, 리셋도 셸 버튼이 그대로 처리 |
| 문구는 27타마다, 자동 소멸 | 완주 시에만 / 랜덤 확률 | 치는 중에 문구가 도는 리듬이 생기고 손을 쓸 일이 없다. 사용자 결정 |
| 문구 선택은 결정적(`count`에서 계산) | 랜덤 | 같은 횟수에 같은 문구. 테스트 가능하고 재현된다 |
| 소리 있음, 합성 WAV | 실제 녹음 / 소리 없음 | "똑"이 물건의 절반이다. 외부 파일 의존 없이 지금 가능. 사용자 결정 |
| 소리는 셸이 `sound` 키로 튼다 | 컴포넌트가 직접 require | `GimmickBase.sound`가 죽은 데이터로 남지 않고, 다음 기믹은 키 한 줄이면 소리가 난다. 햅틱처럼 소리도 데이터 |
| 햅틱 기본값 `knock` | `rap`, `thud`, `gavel`, `plunk`, `castanets` | 전구에서 실기기 확인된 값이라 무음 위험이 없다(§5 "느낌 없는 프리셋이 실재한다"). 전구와 구분되는 후보는 실기기에서 고른다 |
| 그림은 전부 Skia 경로, 이미지 에셋 없음 | 목탁 PNG | 키캡·전구·포퍼 전례. 양 OS 동일 결과 |
| 배경 고정 한지색 | 테마 추종 | 키캡 파랑과 같은 처지 — 기믹이 배경을 소유한다 |

---

## 2. 그림 (`src/gimmicks/moktak/index.tsx`)

§1대로 이 파일에 `className`은 없다. 텍스트는 RN `Text`/`Animated.Text` +
스타일 객체.

키캡·포퍼처럼 Skia 캔버스가 화면을 덮고, 목탁은 설계 좌표계(320×420 상자)에
적은 뒤 센터링 transform으로 놓는다. 화면 크기가 달라도 상수는 그대로다.

아래에서 위로:

1. **배경** — 한지색 단색 `#f3ede1`, 캔버스 전체.
2. **목탁 몸통** — 원에 가까운 타원. 방사형 그라디언트로 나무 명암(밝은
   `#c8683a` → 어두운 `#7a3416`), 텍스처는 없다. 위쪽 세로 홈(어두운 둥근
   선), 앞면 구멍(어두운 타원), 아래 손잡이 고리(고리 경로, 몸통과 같은
   그라디언트).
3. **채** — 오른쪽에 세로로 선 막대(위가 가늘고 아래가 둥글게 굵어진다),
   밝은 나무색 `#d9a066`. **위 끝이 회전축**이고, 휴지 각도는 목탁 반대쪽으로
   살짝 기운 값. 타격 각도는 아래 끝이 몸통 오른쪽 면에 닿는 값.

정적인 경로(몸통·고리·홈·구멍·채)는 모듈 상수로 미리 만든다. 매 프레임
바뀌는 건 채의 회전 transform과 몸통 scale뿐이다.

**틴트**: `lib/tints.ts`에 `orange` 신설 — 몸통 지배색 `#b5532b`에서 왔다.
**아이콘**: `DrumIcon`.

### 상단 정보 (RN 레이어)

설계 상자와 같은 크기의 뷰를 가운데 정렬해 캔버스와 좌표를 공유한다(키캡의
`DESIGN_BOX` 수법). 위에서부터:

- "번뇌가 사라지는 중" — 작은 회갈색 글자
- **N** 남음 — 큰 숫자(`remaining`) + 작은 "남음"
- 진행 바 — 트랙 위에 채워지는 막대. 너비는 `count % 108 / 108`.
  `Animated.View` + `useAnimatedStyle`, 값이 바뀔 때 `withTiming` 200ms.
- "총 {count}개 소멸 · {laps}바퀴 완주" — 작은 글자. 셸 상단 알약도 총
  횟수를 보여주지만, 이 줄은 바퀴 수와 함께 문장으로 읽히는 자리다.

숫자는 React 상태(`useGimmickCount`)에서 온다. 탭마다 텍스트 리렌더가 한 번
있지만 셸의 카운트 알약이 이미 같은 일을 하고 있다 — 애니메이션은 전부
SharedValue라 리렌더와 무관하다.

---

## 3. 입력·움직임

### `_kinds/discrete.tsx` 확장

```ts
type Props = {
  haptic: PresetHaptic | PatternHaptic;
  config: DiscreteConfig;
  onInteract: () => void;
  /**
   * 탭이 유효한 위치인지. 워크릿. 루트 뷰 기준 좌표를 받는다.
   * 생략하면 어디든 유효하다 — 기존 기믹은 그대로다.
   * false면 햅틱·카운트·눌림을 전부 생략한다(onBegin이 곧바로 return).
   */
  hitTest?: (x: number, y: number) => boolean;
  children: (state: DiscreteRenderState) => React.ReactNode;
};
```

`onBegin(e)`에서 `hitTest && !hitTest(e.x, e.y)`면 return. `onFinalize`는
그대로 `pressed = 0`(빗나간 탭에서도 0 → 0이라 무해). 릴리스 햅틱은
`pressed`가 1이었을 때만 쏜다 — 빗나간 탭에 릴리스 햅틱이 나가면 안 된다.
현재 릴리스 햅틱을 쓰는 기믹은 없지만 계약은 맞춰둔다.

`hitTest`는 prop이고 config가 아니다. config는 §4 원칙 1대로 입력 모델의
데이터 파라미터인데, 판정 영역은 컴포넌트의 레이아웃 지식(설계 좌표계 +
캔버스 크기)에 묶여 있어 데이터로 떼어낼 수 없다.

### 목탁 쪽 판정

목탁 컴포넌트(외곽)가 `canvasSize` SharedValue를 소유하고 `hitTest`와
`MoktakBody` 양쪽에 준다. `hitTest`는 루트 뷰 좌표 → 설계 좌표(센터링
역변환) → 몸통 타원 방정식. 채·배경·상단 정보를 눌러도 안 친다.

### 움직임

- 누를 때: **0ms**로 채가 타격 각도로 꺾이고 몸통 scale 0.97. 누를 때
  애니메이션을 넣으면 체감 지연으로 읽힌다(§0, 키캡 전례).
- 뗄 때: `withSpring`으로 복귀(damping 12, stiffness 220 근처 — 약한
  오버슈트가 반동이 된다). 몸통도 같은 스프링으로 1.0.
- `pressed`를 `useAnimatedReaction`으로 받아 `swing`(0~1) SharedValue를
  만들고, 채 회전과 몸통 scale은 `swing`에서 파생한다.

### 햅틱

`{ type: 'preset', name: 'knock' }`. 실기기에서 `rap`, `thud`, `gavel`,
`plunk`, `castanets`를 비교해 전구(`knock`)와 구분되는 것으로 바꾼다.
릴리스 햅틱 없음.

---

## 4. 108 카운트다운 · 문구

### `src/gimmicks/moktak/cycle.ts` — 순수 모듈

import 없는 순수 로직. Node로 바로 검증한다.

```ts
export const CYCLE = 108;
export const QUOTE_EVERY = 27;

/** 이번 바퀴에 남은 번뇌. count 0 → 108, 107 → 1, 108 → 108(새 바퀴). */
export function remainingOf(count: number): number;
/** 완주한 바퀴 수. 108 → 1. */
export function lapsOf(count: number): number;
/** 이번 바퀴 진행도 0~1. 진행 바 너비. */
export function progressOf(count: number): number;
/**
 * 이 횟수에서 뜰 문구 인덱스. 27의 배수(0 제외)에서만 값이 있다.
 * 27 → 0, 54 → 1, …, quoteCount를 넘으면 처음부터 돈다.
 */
export function quoteIndexAt(count: number, quoteCount: number): number | null;
```

`progressOf(108)`은 0이다(새 바퀴 시작) — 108번째 타격에 바가 꽉 찼다가 곧
비는 게 아니라 곧바로 비는 것으로 받아들인다. 완주 연출은 범위 밖(§7).

### `src/gimmicks/moktak/quotes.ts`

`{ text: string; source: string }[]` 12개. 법구경·숫타니파타·금강경 등에서
두 줄 안에 들어가는 짧은 구절. 사용자 검토 후 교체 가능. 컴포넌트 상수와
같은 취급 — 시각 정보는 기믹이 자기 것으로 갖는다.

### 카드

- 목탁 위쪽에 겹치는 흰 카드(`#ffffff`, 둥근 모서리, 부드러운 그림자).
  문구 본문 + "— 출처".
- `count`가 바뀔 때 `quoteIndexAt(count, QUOTES.length)`가 null이 아니면
  표시. 페이드 인 300ms → 4초 유지 → 페이드 아웃 300ms. `opacity`와
  `translateY`(살짝 위로 뜨며 나타남)는 SharedValue.
- 표시 중에 다음 27이 오면 문구를 갈고 타이머를 다시 잰다(`setTimeout`
  clear 후 재설정).
- `pointerEvents="none"` — 카드는 터치를 막지 않는다. 카드 아래 목탁을
  치면 그대로 친다.
- 언마운트 시 타이머 정리.

---

## 5. 소리

### 에셋 합성 — `scripts/synth-moktak.mjs`

Node 스크립트. 16bit 44.1kHz 모노 WAV 약 250ms를 만들어
`assets/sounds/moktak.wav`에 쓴다.

- 감쇠 사인 3개: 약 820Hz(기본음, 감쇠 80ms), 1650Hz(60ms), 2400Hz(40ms).
  진폭 비 1 : 0.5 : 0.3.
- 5ms 화이트노이즈 클릭을 어택에 얹어 나무 타격감.
- 피크 정규화 후 -1dBFS. 클리핑 없음.

스크립트와 결과 WAV를 둘 다 커밋한다 — 실기기에서 들어보고 주파수·감쇠를
바꿔 다시 생성할 수 있어야 한다.

### 에셋 맵 — `src/audio/assets.ts`

```ts
export const SOUND_ASSETS = {
  moktak: require('../../assets/sounds/moktak.wav'),
} as const;
export type SoundKey = keyof typeof SOUND_ASSETS;
```

`types.ts`의 `GimmickBase.sound?: string`을 `SoundKey`로 좁힌다. 없는 키는
컴파일 에러 — 프리셋 이름(`PresetName`)과 같은 수법이다.

### 재생 — `src/app/gimmick/[id].tsx`

`useSoundPool(gimmick.sound)`: 키가 있으면 마운트 시 `new SoundPool(asset)`,
언마운트 시 `release()`. `onInteract`가 `pool?.play()` 뒤 `interact(id)`.

재생은 `runOnJS(onInteract)`를 타므로 JS 스레드다. 햅틱(UI 스레드)보다
늦다. 실기기에서 어긋남이 들리면 그때 판단한다 — expo-audio에는 워크릿
경로가 없어 지금 구조에서 더 당길 방법이 없다.

`configureAudioSession`은 이미 `playsInSilentMode: false` — 무음 스위치를
존중한다. 변경 없음.

---

## 6. 파일 변경

| 파일 | 작업 |
|---|---|
| `src/gimmicks/_kinds/discrete.tsx` | `hitTest` prop, 릴리스 햅틱 가드 |
| `src/gimmicks/moktak/index.tsx` | 신규 — Skia 도화, 상단 정보, 카드, 판정 |
| `src/gimmicks/moktak/cycle.ts` | 신규 — 순수 로직 |
| `src/gimmicks/moktak/quotes.ts` | 신규 — 문구 12개 |
| `src/gimmicks/registry.ts` | `moktak` 항목(`sound: 'moktak'`) |
| `src/gimmicks/types.ts` | `sound?: SoundKey` |
| `src/audio/assets.ts` | 신규 — 에셋 맵 |
| `assets/sounds/moktak.wav` | 신규 — 합성 결과 |
| `scripts/synth-moktak.mjs` | 신규 — 합성 스크립트 |
| `src/app/gimmick/[id].tsx` | 사운드 풀 생성·재생·해제 |
| `src/lib/tints.ts` | `orange` |
| `stack.md` | 폴더 구조에 `moktak/`, §5 오디오에 셸 재생 경로 한 줄 |

새 의존성 없음. Metro 기본 `assetExts`에 `wav`가 포함된다.

---

## 7. 범위 밖

- 공유 버튼, 음악(배경음) 토글 — 레퍼런스에 있지만 이 앱의 셸 결정이다.
- "오늘" 단위 통계 — 날짜 저장이 없다. 총 누적으로 대신한다.
- 완주(108) 순간 연출 — 프리셋·소리 확정 후 후속.
- 자동 연타(길게 누르기) — discrete 확장이 필요하고 사용자가 고르지 않았다.
- 채 드래그 — 입력 모델이 다르다.

---

## 8. 검증

| 확인할 것 | 방법 | 가능 여부 |
|---|---|---|
| 타입 | `npm run typecheck` | 가능 |
| `cycle.ts` 경계값(0, 1, 27, 107, 108, 109, 216) | Node 타입스트립 하니스 | 가능 |
| WAV 형식(헤더, 길이, 피크) | 스크립트 실행 후 헤더 파싱 | 가능 |
| 휴지 상태 생김새, 카운트 표시, 카드 레이아웃 | `npm run ios:sim` + 스크린샷 (딥링크로 진입) | 가능 (터치를 못 넣으므로 카드는 count를 임시로 27에 맞춰 확인) |
| 기존 기믹 무회귀 | `hitTest` 미지정 시 동작 동일, diff 확인 | 가능 |
| **히트테스트 정확도, 채 스윙 손맛, 햅틱 프리셋, 소리 지연·음색** | `npm run ios:release` (실기기) | **불가 — 미검증으로 넘김** |

---

## 9. 후속

- [ ] 실기기에서 햅틱 프리셋 확정 (후보: rap, thud, gavel, plunk, castanets)
- [ ] 소리 음색 튜닝 — 주파수·감쇠를 바꿔 스크립트 재실행
- [ ] 햅틱-소리 어긋남 체감 확인
- [ ] 히트 영역이 답답하면 타원을 조금 키운다
- [ ] 문구 검토·교체
- [ ] 완주 연출
