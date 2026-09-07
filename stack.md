# 스택 & 아키텍처

> 피젯 토이 컬렉션 앱. 여러 종류의 기믹(클리커, 다이얼, 뽁뽁이 등)을 모으는 구조.
> 이 문서는 결정된 사항과 그 이유를 기록한다. 재논의 비용을 줄이는 것이 목적.

---

## 0. 제품의 본질

**햅틱이 곧 제품이다.** UI가 예쁜 것보다 딸깍 한 번의 촉감 지연이 짧은 게 중요하다.
모든 기술 결정은 이 기준으로 판단한다.

경쟁 앱 지형:

- **양산형 광고 앱** (Fidget Toys 3D, Antistress, Pop It Fidget 류) — 물량 공세, 햅틱 품질 낮음. 경쟁 대상 아님.
- **인디 프리미엄** — 실제 경쟁자.
  - `Fidgetable` — 가장 유사. 커스텀 피젯 빌더 + 햅틱 튜닝 + 테마 빌더. **iOS 전용.**
  - `FiDigital` — 물리 기반 기믹, 광고/구독 없음, 프리미엄 가격대.
  - `Fidget Lab`, `Tappy`

**우리의 빈틈 2개**

1. **안드로이드** — 상층 앱이 죄다 iOS 전용. 한국은 갤럭시 비중이 높음.
2. **한국어 시장** — 사실상 비어 있음.

**마케팅 주의**: "불안 감소 입증" 류 문구 금지. 피젯과 집중력 연구는 결과가 엇갈리고
임상 근거를 가진 피젯 앱은 없다. 앱스토어 건강 관련 심사에도 걸릴 수 있음.
"손이 심심할 때" 정도의 톤으로 간다.

---

## 1. 핵심 경계선

성격이 다른 두 앱이 한 바이너리에 들어있다. **이 선을 넘지 않는다.**

| | 앱 셸 | 기믹 핫패스 |
|---|---|---|
| 화면 | 갤러리, 설정, 페이월, 온보딩 | 실제 피젯 화면 |
| 비중 | 화면 수 90% | 코드 난이도 90% |
| 도구 | React Native Reusables + `className` | Reanimated + Skia + Pulsar |
| 스타일 | Tailwind 클래스 | 워크릿 내부 `useAnimatedStyle` |

> **규칙: 기믹 화면 내부에서 `className`을 쓰지 않는다.**
> 드래그 중 매 프레임 스타일이 바뀌는 구간이라 Tailwind가 낄 자리가 없다.
> RNR은 갤러리 카드 · 바텀시트 · 설정 토글 · 구매 화면까지만.

---

## 2. 스택

### 셸

| 패키지 | 역할 |
|---|---|
| Expo SDK 57 + Dev Client | 런타임. **Expo Go 사용 불가** (Pulsar/Skia가 prebuild 필요) |
| expo-router | 파일 기반 라우팅 |
| React Native Reusables | shadcn/ui 계열 UI. copy-paste 방식이라 소유권 100% |
| Uniwind | Tailwind 바인딩 (NativeWind 아님 — 아래 참고) |
| lucide-react-native | 아이콘 |

### 기믹 엔진

| 패키지 | 역할 |
|---|---|
| react-native-reanimated 4 | 워크릿. UI 스레드에서 제스처 → 햅틱 계산 |
| react-native-gesture-handler | `Gesture.Tap` / `Gesture.Pan` / `Gesture.Manual` |
| react-native-pulsar | 햅틱. 프리셋 150+ / 패턴 컴포저 / 실시간 컴포저 |
| @shopify/react-native-skia | 물리 · 그리기 기믹 |
| expo-audio | 사운드 (expo-av 아님 — deprecated) |
| expo-sensors | 흔들어서 리셋 등 |

### 상태 · 저장

| 패키지 | 역할 |
|---|---|
| zustand | 전역 상태 (기믹 해금 여부, 설정) |
| react-native-mmkv | 영속화. 동기 API라 AsyncStorage보다 빠름 |

### 운영

| 패키지 | 역할 |
|---|---|
| EAS Update | **신규 기믹 OTA 배포** — 심사 없이 콘텐츠 추가 |
| react-native-purchases (RevenueCat) | 기믹 팩 판매 |
| expo-battery | 저전력 모드 감지 → 햅틱 폴백 트리거 |
| expo-keep-awake | 화면 꺼짐 방지 |

### 쓰지 않는 것

- **추가 상태관리 라이브러리** — 기믹 내부 상태는 대부분 `useSharedValue`라 React 상태로 올라오지 않음
- **백엔드** — v1엔 없음. 기기 간 동기화가 필요해지면 그때 Supabase
- **캐러셀 라이브러리** — RNR 카드 + FlashList로 충분
- **모노레포** — 기믹 15개 넘고 별도 배포가 필요해질 때 pnpm workspace로 승격

---

## 3. Uniwind vs NativeWind

RNR은 둘 다 지원한다. **Uniwind를 쓴다.**

**결정적 이유: Reanimated 4 호환성.** 워크릿 햅틱이 이 앱의 심장인데
스타일링 라이브러리가 Reanimated 4와 싸우면 안 된다.
NativeWind v4 안정판은 Reanimated 4 지원이 없고, v5는 프리뷰 + 부분 지원.

> ⚠️ 이 정보의 출처는 Uniwind 측 비교표라 편향 가능성이 있다.
> 확정 전 NativeWind 이슈 트래커를 직접 확인할 것.

부수적 이유:

- NativeWind v4는 Tailwind v3 요구 / Uniwind는 Tailwind v4 전용
- Uniwind는 Babel 설정 없이 Metro 플러그인만 — 콜드 빌드 빠름
- 성능 (2,000뷰 렌더 iOS 81ms vs 197ms) — 이 앱 규모에선 큰 의미 없음

**리스크**: Uniwind가 신생이라 RNR 컴포넌트 일부에서 엣지 케이스 가능.
초반에 Dialog · Select 같은 복잡한 컴포넌트를 먼저 붙여 검증하고 진행.
className API가 같아서 나중에 갈아타는 건 어렵지 않다.

---

## 4. 기믹 아키텍처

### 입력 모델 5종

기믹은 **생김새가 아니라 입력 모델로 분류한다.** 다이얼과 슬라이더는 생긴 게 달라도
코드상 같은 종류고, 클리커와 뽁뽁이는 둘 다 "누른다"지만 구조가 완전히 다르다.

| 모델 | 예시 | 햅틱 트리거 | API |
|---|---|---|---|
| **Discrete** | 클리커, 토글, 볼펜 | 터치 다운 1회 | `Presets.*()` |
| **Detented** | 다이얼, 슬라이더, 래칫 | 눈금 넘을 때마다 | `useRealtimeComposer` |
| **Tug** | 전구 풀코드, 레버 | 임계값을 넘어본 뒤 놓는 순간 1회 | `Presets.*()` |
| **Sling** | 파티 포퍼, 새총 | 릴리스 순간 1회 + 당기는 동안 연속 변조 | `useRealtimeComposer` + `Presets.*()` |
| **Grid** | 뽁뽁이, 키캡 패드 | 셀별, 멀티터치 | `Gesture.Manual` |
| **Physics** | 스피너, 구슬, 진자 | 속도/충돌 임계값 | 워크릿 + `set()` |

Tug는 처음 4종에 없었고 전구(풀코드) 기믹을 만들며 추가됐다 — 드래그 **거리**가
관문이고 트리거는 릴리스라 discrete(터치 다운)와도 detented(눈금)와도 다르다.
릴리스가 사이클을 끝내므로 한 번의 당김에 토글은 1회다.

Sling도 마찬가지로 파티 포퍼를 만들며 추가됐다 — 릴리스가 트리거이고 드래그가
각도·파워라는 연속 payload를 만들어서 tug(이진 토글)와 다르다.

Detented / Physics는 `useRealtimeComposer`의 `set(진폭, 주파수)`로
드래그 속도에 따라 진동 세기를 실시간 변조한다. 다이얼을 천천히 돌릴 때와
빨리 돌릴 때 손맛이 달라지는 것 — 여기가 품질을 가르는 지점.

> **모든 햅틱 계산은 워크릿 안에서.** 드래그 중 "눈금 넘었나?"를 JS 스레드에서
> 계산하면 확실히 밀린다.

### 레지스트리

기믹 하나 추가하는 비용을 최소화하는 게 목표.

```ts
type Gimmick = {
  id: string;
  name: string;
  kind: 'discrete' | 'detented' | 'grid' | 'physics';
  haptic: HapticSpec;              // 프리셋 이름 or 커스텀 패턴 JSON
  sound?: string;                  // 에셋 키
  look: { icon: LucideIcon; tint: TintName };  // 갤러리 타일
  config: Record<string, any>;     // detentCount, gridSize, friction 등
  component: () => Promise<ComponentType>;  // lazy
};
```

**원칙 3개**

1. **햅틱은 코드가 아니라 데이터.** `{ preset: 'Tap' }` 또는 패턴 JSON.
   기믹 정의가 순수 데이터가 되면 나중에 서버에서 내려받을 수도 있다.
2. **`component`는 반드시 lazy.** 기믹 30개 + Skia 씬이면 초기 번들이 터진다.
   갤러리에선 썸네일만, 진입 시 로드.

   > **따라서 갤러리 타일에 살아있는 미리보기를 넣을 수 없다.** 원칙 2가
   > 갤러리의 기믹 컴포넌트 import를 금지하므로, 갤러리가 쓸 시각 정보는
   > 컴포넌트 밖에 있어야 한다. 그래서 `look`(아이콘 + 틴트 이름)이
   > 레지스트리 항목에 있다 — 셸에 별도 맵을 두면 기믹 추가할 곳이 셋이 되어
   > "항목 하나 + 폴더 하나"가 깨진다. `look.icon`이 컴포넌트 참조라
   > 레지스트리가 완전한 JSON은 아니게 되는데, EAS Update(§7)는 영향 없고
   > 서버 주도 레지스트리는 지금 요구사항이 아니라 감수했다.
   >
   > 타일 틴트는 **그 기믹 씬의 지배색**에서 딴다(키캡 파랑, 다이얼 민트,
   > 전구 앰버, 포퍼 로즈). 눌러 들어가면 같은 색이 화면을 채운다. 색 자체는
   > 셸(`lib/tints.ts`)이 갖고 테마 토큰으로는 올리지 않는다 — 무채색 토큰은
   > 그대로고, 색은 갤러리 타일 전용이다.
3. **햅틱 엔진은 싱글톤.** Core Haptics 엔진 시작에 수십 ms. 기믹 전환마다
   새로 만들면 첫 딸깍이 씹힌다. Pulsar의 preloading/caching 문서 참고.

### 폴더 구조 (v1)

```
src/
  app/                    # expo-router
  components/ui/          # RNR copy-paste 컴포넌트
  gimmicks/
    registry.ts           # Gimmick[] 정의
    _kinds/               # 입력 모델별 공통 로직
      discrete.tsx
      detented.tsx
      tug.tsx
      sling.tsx
      grid.tsx
      physics.tsx
    keycap/
    dial/
    bulb/
    popper/
    moktak/
    bubblewrap/
  haptics/                # 엔진 싱글톤, 폴백 로직
  audio/                  # 플레이어 풀
  store/                  # zustand + mmkv
```

---

## 5. 함정 목록

### 햅틱

- **iOS에서 햅틱이 아예 안 나올 수 있음** — 저전력 모드, 설정에서 Taptic Engine 끔,
  카메라 활성화 중, 받아쓰기 중. 햅틱이 제품 자체인 앱이 무반응이 되는 것.
  → `expo-battery`로 저전력 모드 감지 → 안내 + 사운드/시각 폴백
- **스로틀 필수** — 초당 20회 넘게 쏘면 시스템이 드랍. 40~50ms 스로틀
- **앱 시작 시 `preloadPresets`를 부르면 그 프리셋들이 무음이 된다** — 릴리스
  빌드에서만 재현된다. 릴리스는 JS 시작이 빨라 `useEffect`가 네이티브 엔진
  준비 전에 돌고, 그때의 preload가 깨진 캐시 항목을 만들어 영구히 무음으로
  재생된다. Debug는 번들 로딩이 느려 그 사이 엔진이 올라오므로 안 걸린다.
  → 시작 시에는 `enableCache(true)`만. 채우는 건 on-demand에 맡긴다.
  `enableCache(false)`는 답이 아니다 — 캐시를 끄면 재생이 아예 안 된다.
- **느낌 없는 프리셋이 실재한다** — `balloonPop`이 실기기에서 무음이었다.
  이름이 유효한지는 타입이 잡지만 느껴지는지는 못 잡는다. 프리셋을 배정하면
  실기기에서 눌러볼 것
- **안드로이드 진동 모터 편차가 큼** — 저가 기기 폴백 설계 필수
- **시뮬레이터에선 아무 느낌 없음** — 실기기 상시 연결

### 오디오

- **인스턴스 하나로는 연타 불가.** 재생 끝나기 전에 다시 못 튼다.
  → 플레이어 풀 4~5개 라운드로빈
- **소리는 셸이 튼다.** registry의 `sound` 키(`audio/assets.ts`의 `SoundKey`) →
  기믹 화면이 `useSoundPool`로 풀을 만들어 `onInteract`마다 재생, 이탈 시 해제.
  기믹 컴포넌트는 소리를 모른다 — 햅틱처럼 소리도 데이터다. 재생은 JS
  스레드라 햅틱(UI 스레드)보다 늦다. 첫 사용처는 목탁(합성 WAV,
  `scripts/synth-moktak.mjs`).

### 제스처

- **`onPress` 대신 터치 다운.** `onPress`는 손 뗄 때 발화. 실제 클리커는 누르는 순간 딸깍.
  → `Gesture.Tap().onBegin()`
- **뽁뽁이 멀티터치** — `Gesture.Manual()`의 `onTouchesDown`에서 `allTouches` 배열을 받아
  워크릿 안에서 좌표 → 셀 인덱스 히트테스트.
  손가락 3개면 햅틱 3번이 아니라 **한 번 세게** 쏘는 게 실제 느낌에 가깝다.

### 저장

- 카운트는 메모리에 두고 MMKV 저장은 디바운스
- 기믹별 상태는 `gimmick:{id}:state` 키로
- **리셋 버튼 필수** — 다 터진 뽁뽁이는 쓸모가 없다

### 빌드

- `react-native-worklets`가 Pulsar와 Reanimated 4의 공통 의존성.
  **여기가 제일 잘 깨진다.** `npx expo install --check`로 버전 확인

---

## 6. 설치 순서

의존성 충돌 때문에 순서가 중요하다.

```bash
# 1. RNR init (Expo + Uniwind + 기본 컴포넌트)
npx @react-native-reusables/cli@latest init

# 2. 기믹 엔진
npx expo install react-native-pulsar react-native-worklets \
  react-native-reanimated react-native-gesture-handler \
  @shopify/react-native-skia expo-audio expo-sensors

# 3. 인프라
npx expo install react-native-mmkv expo-battery expo-keep-awake
npm i zustand

# 4. 네이티브 생성 + 실기기 빌드
npx expo prebuild
npx expo run:ios --device
```

---

## 7. 배포 전략

기믹 정의가 데이터 + lazy 컴포넌트이므로 **EAS Update로 신규 기믹을 심사 없이 배포**할 수 있다.
"매주 새 피젯 1개" 같은 리텐션 루프를 스토어 심사 주기와 무관하게 돌린다.

- 코어 기믹 5~6개는 번들에 포함
- 나머지는 OTA
- `runtimeVersion` 정책은 네이티브 의존성 추가 시에만 올린다

---

## 8. 네이밍 / 식별자

**변경 난이도 순서**

| 항목 | 변경 가능성 |
|---|---|
| 번들 ID / 패키지명 | **출시 후 불가** |
| slug + EAS projectId | 가능하나 채널·빌드 히스토리 꼬임 |
| 스토어 표시명 | 언제든 가능 |
| GitHub 레포 이름 | 언제든 가능 (리다이렉트 자동) |

**규칙**

- 번들 ID엔 제품 코드네임, 스토어 표시명엔 브랜드 → 분리해두면 리브랜딩이 자유롭다
- Expo 기본값 `com.anonymous.*` 절대 금지
- 레포 이름은 소문자 + 하이픈, 버전 넣지 않음

**앱스토어 ASO**: 이름에 "Fidget"을 넣지 않는다. 이미 20개 앱이 나눠 가진 키워드라 묻힌다.
이름은 고유 브랜드, **부제에 "Haptic Fidget Toys"** 를 넣어 브랜드와 검색 노출을 분리.

---

## 9. 미결정

- [x] **스토어 표시명: `토이앱`** — 2026-08-25 결정. ASO 규칙(§8)의
  "이름에 Fidget을 넣지 않는다"를 만족한다. §8대로 언제든 바꿀 수 있는 값이고,
  `CODENAME`/번들 ID(`toyapp`)와 분리해 둔 설계가 처음으로 값을 했다.
- [ ] **주력 시장: 한국 vs 글로벌** — ASO 전략이 갈린다. 이름은 정했지만
  시장은 아직이다(한국어 이름이라 한국 쪽으로 기울어는 있다)
  - 한국 → 안드로이드 우선
  - 글로벌 → iOS 프리미엄에서 Fidgetable과 정면 승부. 영문 표시명이 따로 필요
- [ ] **부제** — ASO 규칙(§8)이 "Haptic Fidget Toys"를 여기 넣으라고 한 자리
- [ ] 앱스토어 이름 중복 / 상표 검색
- [ ] NativeWind의 Reanimated 4 지원 현황 직접 확인
- [ ] 수익 모델: 유료 앱 vs 무료 + 기믹 팩 IAP

---

## 10. 첫 스프린트

**Discrete 1개 + Detented 1개**만 만든다.

이 둘이 구조적으로 가장 멀어서, 같은 레지스트리로 굴릴 수 있으면 나머지는 추가만 하면 된다.
반대로 클리커만 5개 만들고 나서 다이얼을 붙이려 하면 그때 다 갈아엎게 된다.

작업 전 **Pulsar Live Preview 플레이그라운드**에서 프리셋을 실제로 느껴보고
"이 기믹엔 어떤 프리셋"을 미리 골라둘 것. 프리셋이 150개 이상이라
웬만한 기믹은 커스텀 패턴 없이 커버된다. 코드 짜기 전에 고르면 시행착오가 크게 준다.
