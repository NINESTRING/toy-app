import type { ExpoConfig } from 'expo/config';

/**
 * 앱 설정. 식별자 관련 제약은 stack.md §8 참고.
 *
 * 변경 난이도 (§8):
 *   번들 ID / 패키지명  — 출시 후 변경 불가
 *   slug + EAS projectId — 가능하나 채널·빌드 히스토리 꼬임
 *   스토어 표시명        — 언제든 가능
 */

/**
 * 제품 코드네임. 번들 ID에만 쓴다.
 * 브랜드명(스토어 표시명)과 분리해둬야 리브랜딩이 자유롭다. (§8)
 */
const CODENAME = 'toyapp';

/** 역도메인. 보유 도메인 기준. */
const ORG = 'com.ninestring';

/**
 * ⚠️ 출시 후 변경 불가. (§8)
 * Expo 기본값 `com.anonymous.*`는 절대 금지 — 여기서 이미 회피됨.
 */
const BUNDLE_ID = `${ORG}.${CODENAME}`;

const config: ExpoConfig = {
  /**
   * 스토어 표시명. 언제든 변경 가능하므로 지금은 플레이스홀더.
   *
   * TODO(§9): 주력 시장(한국 vs 글로벌) 확정 후 브랜드명으로 교체.
   *   - ASO 규칙(§8): 이름에 "Fidget"을 넣지 않는다. 이미 20개 앱이
   *     나눠 가진 키워드라 묻힌다. 대신 부제에 "Haptic Fidget Toys".
   *   - 마케팅 규칙(§0): "불안 감소 입증" 류 문구 금지.
   */
  name: 'toy-app',
  slug: 'toy-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: CODENAME,
  userInterfaceStyle: 'automatic',

  /**
   * 참고: `newArchEnabled` 플래그는 여기 없다. SDK 57에서는 새 아키텍처가
   * 유일한 모드가 되어 Expo 설정 스키마에서 아예 제거됐다. Pulsar가
   * TurboModule(codegen)이라 새 아키텍처를 요구하는데, 그 조건은 SDK 57을
   * 쓰는 것만으로 무조건 충족된다.
   */

  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true,
  },

  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    /**
     * android.permission.VIBRATE는 react-native-pulsar가 자기
     * AndroidManifest에 선언하고 Gradle이 머지한다. 여기 중복 선언 불필요.
     */
  },

  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
    ],
    'expo-status-bar',
    [
      /**
       * expo-audio는 기믹 사운드 *재생* 전용이다. (§2)
       *
       * 기본값을 그대로 두면 녹음/백그라운드 재생용 권한이 따라붙는다:
       *   recordAudioAndroid: true    -> android.permission.RECORD_AUDIO
       *   microphonePermission        -> NSMicrophoneUsageDescription
       *   enableBackgroundPlayback    -> UIBackgroundModes: [audio],
       *                                  FOREGROUND_SERVICE(_MEDIA_PLAYBACK)
       *
       * 피젯 앱이 마이크와 백그라운드 오디오를 요구할 이유가 없고,
       * 정당화되지 않은 권한은 스토어 심사에서 문제가 된다. 전부 끈다.
       * 나중에 녹음 기능이 생기면 그때 켠다.
       */
      'expo-audio',
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ],
  ],

  /**
   * EAS Update — 신규 기믹 OTA 배포 (§7).
   *
   * `fingerprint` 정책은 네이티브 의존성이 바뀔 때만 runtimeVersion을
   * 올린다. §7의 "runtimeVersion 정책은 네이티브 의존성 추가 시에만
   * 올린다"와 정확히 일치하므로 appVersion 정책을 쓰지 않는다.
   */
  runtimeVersion: {
    policy: 'fingerprint',
  },

  experiments: {
    typedRoutes: true,
  },
};

export default config;
