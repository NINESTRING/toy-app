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

Android도 같은 세 가지가 있다:

```bash
npm run android:emu        # 에뮬레이터 (햅틱 없음)
npm run android            # 실기기 + Metro
npm run android:release    # 실기기 단독
```

안드로이드는 실기기 확인이 iOS보다 더 중요하다. §5가 지적한 대로 **진동 모터
편차가 커서** 기기마다 손맛이 다르고, 저가 기기에서는 `LIMITED_SUPPORT`로 떨어져
폴백 경로를 타게 된다. 갤럭시 상위 기종 하나로 확인한 결과를 전체로 일반화할 수 없다.

### 서명 만료 — 무료 계정의 7일

이 프로젝트는 **무료 Apple 계정**으로 서명한다(팀 `R7NARLC828`, Personal Team).
무료 계정의 프로비저닝 프로파일은 발급 시각으로부터 **정확히 7일**이고, 지나면
설치된 앱이 아예 실행되지 않는다. Apple이 건 상한이라 무료인 이상 우회할 방법은
없다.

만료를 정하는 건 **인증서가 아니라 프로파일**이다. 인증서(`Apple Development:
…`)는 1년짜리고(현재 것은 2027-08-11 만료) 그동안 멀쩡하지만, 앱을 멈추는 건
7일짜리 프로파일 쪽이다. "인증서는 살아 있는데 앱이 안 열린다"의 정체가 이것이다.

**함정 — 그냥 다시 빌드하면 7일이 안 늘어난다.** Xcode 자동 서명은 아직 유효한
프로파일이 있으면 새로 발급하지 않고 **그걸 재사용한다.** 3일 남은 프로파일로
빌드하면 방금 설치한 앱도 3일 뒤에 죽는다. 카운트다운은 설치 시각이 아니라
**프로파일 발급 시각**부터 돌기 때문이다. 만료 직전에 재설치해서 하루 벌고 끝나는
건 대부분 이 함정이다.

**오늘 발급받아 만 7일을 쓰려면 프로파일을 지우고 Xcode를 한 번 연다.**

지우기만 하고 바로 `npm run ios:release`를 하면 빌드가 실패한다:

> ❌ No profiles for 'com.ninestring.toyapp' were found: … Automatic signing is
> disabled and unable to generate a profile. To enable automatic signing, pass
> `-allowProvisioningUpdates` to xcodebuild.

`expo run:ios`는 `xcodebuild`에 `-allowProvisioningUpdates`를 넘기지 않는다(CLI에
통과 옵션 자체가 없다). 그래서 프로파일이 없으면 **스스로 발급하지 못하고 그냥
멈춘다.** 발급은 Xcode가 해야 한다 — 워크스페이스를 열어두기만 하면 자동 서명이
알아서 새로 만든다. 빌드까지 갈 필요도 없고, 실측 15초쯤 걸렸다.

```bash
# 1. toyapp 프로파일만 지운다 (다른 앱 것은 건드리지 않는다)
for f in ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*; do
  security cms -D -i "$f" > /tmp/pp.plist 2>/dev/null || continue
  case "$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' /tmp/pp.plist)" in
    *.com.ninestring.toyapp) rm "$f" ;;
  esac
done

# 2. Xcode가 새로 발급하게 한다. 아래 조회 명령으로 새 만료일이 보이면 닫아도 된다.
open ios/toyapp.xcworkspace

# 3. 그 다음에 빌드한다
npm run ios:release
```

7일 시계는 설치 시각이 아니라 **2번에서 프로파일이 발급된 시각**부터 돈다. 빌드가
길어져도 손해는 그 시간만큼이다.

지금 며칠 남았는지는 이걸로 본다:

```bash
for f in ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*; do
  security cms -D -i "$f" > /tmp/pp.plist 2>/dev/null || continue
  printf '%s  →  %s\n' \
    "$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' /tmp/pp.plist)" \
    "$(/usr/libexec/PlistBuddy -c 'Print :ExpirationDate' /tmp/pp.plist)"
done
```

프로파일은 Xcode 16부터 `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`에
있다. 예전 경로(`~/Library/MobileDevice/Provisioning Profiles/`)는 이제 비어 있으므로
거기를 뒤지면 헛수고다.

**7일을 넘기는 유일한 방법은 유료 Apple Developer Program($99/년)이다.** 가입하면
같은 명령 그대로 프로파일이 1년짜리로 발급되고, 그때는 인증서 만료일이 상한이 된다.
기기에 오래 얹어두고 손맛을 관찰할 거라면 이 값을 치는 것 말고 선택지가 없다.

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

- **실시간 햅틱 변조가 미검증이다.** 단발 프리셋(키캡·전구·포퍼 발사)은
  실기기에서 골라 확정했다. 남은 건 연속 엔벨로프 쪽이다 — 다이얼의
  속도별 진폭과 포퍼의 차징 럼블. `registry.ts`에 ⚠️로 표시돼 있고,
  햅틱이 데이터이므로 교체는 한 줄이다.

  프리셋을 고르는 과정에서 알게 된 것: **아무 느낌도 안 나는 프리셋이
  실재한다.** `balloonPop`이 그랬다. 타입 검사는 이름이 존재하는지만 보고
  느껴지는지는 못 보므로, 새 기믹에 프리셋을 배정하면 실기기에서 한 번은
  눌러봐야 한다.
- **사운드 에셋이 없다.** 플레이어 풀은 준비돼 있고 기믹의 `sound` 필드도
  비어 있다. 햅틱 폴백(§5)이 지금은 안내 문구만 띄운다.
- **stack.md §9의 미결정 항목들** — 주력 시장, 부제, 수익 모델.
  스토어 표시명은 `토이앱`으로 정했고(§8대로 언제든 변경 가능), 번들 ID는
  `com.ninestring.toyapp`으로 확정됐다(출시 후 변경 불가).
