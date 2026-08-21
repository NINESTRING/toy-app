# toy-app

피젯 토이 컬렉션 앱. 아키텍처와 그 **근거**는 [stack.md](./stack.md)에 있다 —
작업 전에 읽을 것. 이 README는 실행 방법과 작업 절차만 다룬다.
아래에서 `§`로 참조하는 건 모두 stack.md의 절 번호다.

## 준비

**Expo Go로는 열 수 없다.** Pulsar와 Skia가 네이티브 모듈이라 dev client가 필요하다. (§2)

```bash
npm install
npm run prebuild        # ios/ android/ 생성 (gitignore 대상)
```

`ios/`와 `android/`는 커밋하지 않는다. `app.config.ts`가 진실 소스이고 네이티브
프로젝트는 언제든 재생성된다. 클론 직후엔 `npm run prebuild`가 필수다.

Android는 Android SDK가 별도로 필요하다.

## 실행 방법 3가지

용도가 다르다. **어느 것으로 확인했는지가 결과의 의미를 바꾼다.**

| | 명령 | 햅틱 | Metro | 용도 |
|---|---|---|---|---|
| 시뮬레이터 | `npm run ios:sim` | 없음 | 실행 중 필요 | 레이아웃, 화면 전환, 로직 |
| 실기기 + Metro | `npm run ios` | 있음 | 실행 중 필요 | 평소 개발 루프 |
| 실기기 단독 | `npm run ios:release` | 있음 | 빌드 때만 | 손맛·지연 실측, 남에게 보여주기 |

### 1. 시뮬레이터 — 레이아웃 확인용

```bash
npm run ios:sim
```

빠르고 실기기 연결이 필요 없다. 갤러리 배치, 다크모드, 라우팅 확인엔 충분하다.

> **시뮬레이터로는 이 앱을 평가할 수 없다.** 햅틱이 제품 자체인데(§0) 시뮬레이터에선
> 아무 느낌이 없다(§5). 다이얼을 돌려도 진동이 없으니 "동작한다/안 한다"를 여기서
> 판단하면 안 된다. 화면만 본다.

### 2. 실기기 + Metro — 평소 개발 루프

```bash
npm run ios        # 첫 빌드 (Skia 포함이라 10분+)
npm run dev        # 이후 JS만 고칠 때
```

한 번 빌드해두면 JS 변경은 `npm run dev`로 붙기만 하면 된다. 네이티브 의존성을
추가했을 때만 다시 `npm run ios`.

기기가 Metro(개발 PC)에 네트워크로 붙어 있어야 앱이 켜진다. 같은 Wi-Fi거나
USB로 연결돼 있어야 한다.

첫 실행 시 코드 서명을 물어본다. 안 풀리면 Xcode에서 한 번 잡아준다:

```bash
open ios/toyapp.xcworkspace   # .xcodeproj 아니라 .xcworkspace (CocoaPods)
```

`toyapp` 타겟 → Signing & Capabilities → *Automatically manage signing* → Team 선택.

### 3. 실기기 단독 — Metro 없이

```bash
npm run ios:release
```

Release 빌드는 **JS 번들을 바이너리 안에 심는다.** Metro는 빌드하는 동안 한 번
돌고 끝이며, 설치된 앱은 개발 PC를 전혀 필요로 하지 않는다. 케이블을 뽑고 나가서
써도 되고, 다른 사람 손에 쥐어줘도 된다.

**손맛을 판단할 때는 이 구성으로 해야 한다.** Debug 빌드의 JS는 Release보다 느려서
딸깍 지연이 실제보다 나쁘게 나온다. §0이 "딸깍 한 번의 촉감 지연"을 제품 기준으로
정한 이상, 지연 측정은 Release에서만 의미가 있다.

대신 Fast Refresh와 개발 메뉴가 없다. JS를 고치면 다시 빌드해야 한다.

> 무료 Apple 계정으로 서명하면 7일 후 앱이 만료된다. 재설치하면 된다.

Android도 같은 세 가지가 있다:

```bash
npm run android:emu        # 에뮬레이터 (햅틱 없음)
npm run android            # 실기기 + Metro
npm run android:release    # 실기기 단독
```

안드로이드는 실기기 확인이 iOS보다 더 중요하다. §5가 지적한 대로 **진동 모터
편차가 커서** 기기마다 손맛이 다르고, 저가 기기에서는 `LIMITED_SUPPORT`로 떨어져
폴백 경로를 타게 된다. 갤럭시 상위 기종 하나로 확인한 결과를 전체로 일반화할 수 없다.

## 확인 명령

```bash
npm run typecheck    # tsc --noEmit
npm run deps:check   # expo install --check
```

`deps:check`는 그냥 습관이 아니다. `react-native-worklets`가 Pulsar와
Reanimated 4의 공통 의존성이고 §5가 "여기가 제일 잘 깨진다"고 지목한 지점이다.
npm 최신 버전은 SDK 57 정렬 버전과 다르므로(worklets 0.10.1 vs 0.11.4)
`npm i <pkg>@latest`로 이 셋을 건드리지 말고 항상 `expo install`을 쓴다.

## 구조

경계선 하나만 기억하면 된다. (§1)

| | 앱 셸 | 기믹 핫패스 |
|---|---|---|
| 어디 | `src/app/`, `src/components/ui/` | `src/gimmicks/` |
| 스타일 | RNR + `className` | `useAnimatedStyle` |

**기믹 화면 내부에서 `className`을 쓰지 않는다.** 드래그 중 매 프레임 스타일이
바뀌는 구간이라 Tailwind가 낄 자리가 없다.

```text
src/
  app/              expo-router. 갤러리, 기믹 화면
  components/ui/    RNR copy-paste 컴포넌트
  gimmicks/
    registry.ts     기믹 정의 (데이터 + lazy 컴포넌트)
    types.ts        레지스트리 계약
    _kinds/         입력 모델별 공통 로직 (discrete, detented)
    clicker/ dial/  개별 기믹
  haptics/          엔진 싱글톤, 지원 레벨 감지, 워크릿 스로틀
  audio/            플레이어 풀
  store/            zustand + MMKV
  lib/              cn(), 테마
```

## 기믹 추가하기

1. `src/gimmicks/<id>/index.tsx` — 화면. 입력 모델 컴포넌트를 감싸고 생김새만 담당
2. `src/gimmicks/registry.ts` — 항목 하나 추가

타입이 `kind` ↔ `haptic` ↔ `config` ↔ `component`의 일관성을 컴파일 타임에
강제한다. detented 기믹에 preset 햅틱을 주거나 kind에 안 맞는 컴포넌트를
연결하면 `npm run typecheck`에서 걸린다.

새 입력 모델(grid, physics)을 추가할 때는 `types.ts`의 `KindSpec`에 한 줄과
`_kinds/`에 렌더러 하나가 더 필요하다. 자세한 절차는 `types.ts` 주석에 있다.

## 아직 안 된 것

- **햅틱 프리셋이 미검증이다.** §10은 코드 전에 Pulsar Live Preview에서
  프리셋을 실제로 느껴보고 고르라고 지시하는데, 실기기가 필요해서 못 했다.
  `registry.ts`에 ⚠️로 표시돼 있고, 햅틱이 데이터이므로 교체는 한 줄이다.
- **사운드 에셋이 없다.** 플레이어 풀은 준비돼 있고 기믹의 `sound` 필드도
  비어 있다. 햅틱 폴백(§5)이 지금은 안내 문구만 띄운다.
- **stack.md §9의 미결정 항목들** — 주력 시장, 스토어 표시명, 수익 모델.
  번들 ID는 `com.ninestring.toyapp`으로 확정됐다(출시 후 변경 불가).
