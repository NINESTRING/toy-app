# toy-app

피젯 토이 컬렉션 앱. 아키텍처와 그 근거는 [stack.md](./stack.md)에 있다 —
**작업 전에 읽을 것.** 이 README는 실행 방법만 다룬다.

## 실행

**Expo Go로는 열 수 없다.** Pulsar와 Skia가 네이티브 모듈이라 dev client가 필요하다. (§2)

```bash
npm install
npm run prebuild        # ios/ android/ 생성 (gitignore 대상)
npm run ios             # 실기기 빌드 + 설치
npm run dev             # 이후엔 dev client에 붙이기만
```

> **시뮬레이터에서는 이 앱을 평가할 수 없다.** 햅틱이 제품 자체인데(§0)
> 시뮬레이터에선 아무 느낌이 없다. 실기기를 상시 연결해둔다. (§5)

Android는 Android SDK가 별도로 필요하다.

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
