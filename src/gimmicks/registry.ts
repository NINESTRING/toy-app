import {
  Disc3Icon,
  DrumIcon,
  KeyboardIcon,
  LightbulbIcon,
  PartyPopperIcon,
} from 'lucide-react-native';

import type { PresetName } from '@/haptics/presets';

import type { Gimmick, GimmickVariant, HapticSpec } from './types';

/**
 * 기믹 레지스트리. (§4)
 *
 * 기믹 하나 추가하는 비용을 최소화하는 게 목표다. 새 기믹 = 여기 항목 하나 +
 * 폴더 하나. 갤러리 타일의 겉모습(`look`)도 그래서 여기 있다 — 셸에 별도
 * 맵을 두면 추가할 곳이 셋이 된다. 자세한 근거는 `types.ts`의
 * `GimmickLook`에.
 *
 * 항목이 (`look.icon`을 뺀) 순수 데이터 + lazy 컴포넌트이므로 신규 기믹을
 * EAS Update로 심사 없이 배포할 수 있다. (§7)
 *
 * 첫 스프린트는 Discrete 1개 + Detented 1개만 만든다. (§10) 이 둘이
 * 구조적으로 가장 멀어서, 같은 레지스트리로 굴러가면 나머지는 추가만 하면
 * 된다. 클리커만 5개 만들고 나서 다이얼을 붙이면 그때 다 갈아엎게 된다.
 * (첫 Discrete였던 클리커는 같은 모델의 키캡이 자리를 대신하게 되어 삭제했다.)
 */
export const GIMMICKS = [
  {
    id: 'keycap',
    name: '키캡',
    look: { icon: KeyboardIcon },
    kind: 'discrete',
    /**
     * 축은 적축 하나만 남겼다(갈축·사일런트 삭제). 셸의 축 선택 칩은
     * variants가 2개 이상일 때만 나타나므로 variants를 지우는 것으로 선택
     * UI도 함께 사라진다 — 저장된 축 id(tactile/silent)가 남아 있어도 셸이
     * 합성 기본 변형으로 떨어진다.
     *
     * 프리셋은 갈축에 배정했던 `keyboardMechanical`을 적축이 물려받았다가
     * `ratchet`으로 바뀌었다 — 실기기에서 후보 6개(keyboardMechanical, plunk,
     * snap, latch, ratchet, thud)를 손으로 비교해 고른 값이다. §10이 요구한
     * 절차를 뒤늦게 밟은 것이고, 이제 미검증이 아니다.
     */
    haptic: { type: 'preset', name: 'ratchet' },
    config: {/** 릴리스 햅틱 없음 — 누를 때 한 방이면 충분하다. */},
    component: () => import('./keycap'),
  },
  {
    id: 'dial',
    name: '다이얼',
    look: { icon: Disc3Icon },
    kind: 'detented',
    /**
     * ⚠️ 미검증 값. 위와 같은 이유로 실기기 확인 필요.
     *
     * Detented는 프리셋이 아니라 실시간 변조를 쓴다(§4). 여기 값들이
     * "천천히 돌릴 때와 빨리 돌릴 때 손맛이 다르다"를 만드는 튜닝
     * 파라미터이므로, 실기기에서 돌려보며 조정하는 게 정상이다.
     */
    haptic: {
      type: 'realtime',
      minAmplitude: 0.25,
      maxAmplitude: 1,
      /** 다이얼 눈금은 날카로운 쪽이 어울린다. */
      frequency: 0.7,
      /** 초당 360도(1회전/초)를 최대 세기 기준으로 잡았다. */
      velocityForMaxAmplitude: 360,
    },
    config: {
      /**
       * 레퍼런스: Chris Gannon의 Soft Dial (codepen.io/chrisgannon/pen/yLQyeEy).
       * 원본은 0~270° 클램프 노브지만 우리는 무한 회전이다 — 불빛 32개를
       * 온전한 원에 두고 마커가 계속 돈다. 원이 닫혀 있으므로 불빛 개수와
       * detent 개수가 같다(부채꼴이었다면 불빛이 하나 더 많다).
       */
      detentCount: 32,
      sweepDegrees: 360,
      /** 무한 회전. 오디오 노브처럼 끝을 만들려면 clamp: true + sweep 270. */
      clamp: false,
      /**
       * **`detentCount`와 같은 값이어야 한다** — 그래야 "한 바퀴에 카운트 1"이
       * 된다. 눈금마다 세면 한 번 휙 돌릴 때 32가 올라서 숫자가 조작 횟수가
       * 아니라 각도 눈금처럼 읽힌다. 딸깍은 그대로 눈금마다 터진다.
       */
      detentsPerCount: 32,
    },
    component: () => import('./dial'),
  },
  {
    id: 'bulb',
    name: '전구',
    look: { icon: LightbulbIcon },
    kind: 'tug',
    /**
     * 임계값을 넘긴 뒤 손을 떼는 순간의 딸깍. 실제 풀체인 스위치의 묵직한
     * 걸쇠 느낌을 노렸다. 이름만 보고 `latch`를 골랐었는데, 실기기에서
     * 후보(latch, lock, snap, trigger, clasp, knock)를 비교해 `knock`으로
     * 정했다 — 이제 미검증이 아니다.
     *
     * 켜짐·꺼짐을 다른 햅틱으로 나누는 건 여전히 후속이다(config 확장이
     * 필요하다, 스펙 §7).
     */
    haptic: { type: 'preset', name: 'knock' },
    config: {
      /**
       * 토글로 인정하는 당김 거리(pt). 레퍼런스는 50px — 손가락 기준으로
       * 살짝 여유를 줬다. 너무 짧으면 스치기만 해도 켜져서 "당겼다"는
       * 느낌이 죽는다.
       */
      threshold: 60,
    },
    component: () => import('./bulb'),
  },
  {
    id: 'popper',
    name: '파티 포퍼',
    look: { icon: PartyPopperIcon },
    kind: 'sling',
    /**
     * 당기는 동안 파워 비례 차징 럼블(연속 엔벨로프), 놓는 순간 펑.
     *
     * fire는 실기기에서 골랐다. 원래 `balloonPop`이었는데 **그 프리셋이 이
     * 기기에서 아무 느낌도 안 났다** — 무음 프리셋이 실재한다는 게 이번에
     * 확인됐다. 후보(burst, firecracker, explosion, snap, flourish)를 눌러보고
     * `flourish`로 정했다.
     *
     * 무음 프리셋은 최악의 실패 모드다(§0 — 햅틱이 곧 제품인데 아무 일도
     * 안 일어난다). 새 기믹에 프리셋을 배정하면 실기기에서 한 번은 눌러봐야
     * 한다. 타입 검사는 이름이 존재하는지만 보고 느껴지는지는 못 본다.
     *
     * ⚠️ charge(연속 엔벨로프)는 아직 미검증이다. "당길수록 팽팽해진다"가
     * 느껴질 때까지 범위를 조정해야 한다.
     */
    haptic: {
      type: 'sling',
      charge: { minAmplitude: 0.1, maxAmplitude: 0.7, minFrequency: 0.2, maxFrequency: 0.6 },
      fire: { type: 'preset', name: 'flourish' },
    },
    config: {
      /** 파워 1.0에 도달하는 당김 거리(pt). 화면 절반쯤 당기면 풀파워. */
      maxPull: 160,
      /** 이 미만에서 놓으면 불발 — 탭 오발 방지. 답답하면 소형 발사로 완화(스펙 §11). */
      minPower: 0.1,
      /** 발사각: 수직 위 ±75° — 바닥으로 쏘는 낭비 사이클을 없앤다. */
      fanDegrees: 150,
    },
    component: () => import('./popper'),
  },
  {
    id: 'moktak',
    name: '목탁',
    look: { icon: DrumIcon },
    kind: 'discrete',
    /**
     * `knock`은 전구에서 실기기 확인된 값이라 무음 위험이 없다(§5 "느낌 없는
     * 프리셋이 실재한다"). 전구와 같은 프리셋인 게 아쉬우므로 실기기에서
     * 후보(rap, thud, gavel, plunk, castanets)를 비교해 구분되는 것으로
     * 바꾼다(스펙 §9).
     */
    haptic: { type: 'preset', name: 'knock' },
    /** 이 앱 최초의 소리. `audio/assets.ts`의 키 — 셸이 `onInteract`마다 튼다. */
    sound: 'moktak',
    config: {/** 릴리스 햅틱 없음 — 치는 순간 한 방이면 충분하다. */},
    component: () => import('./moktak'),
  },
] as const satisfies readonly Gimmick[];

/** id로 기믹 찾기. 라우트 파라미터가 문자열로 오므로 검증 겸용. */
export function findGimmick(id: string | undefined): Gimmick | undefined {
  return GIMMICKS.find((gimmick) => gimmick.id === id);
}

/**
 * `as const` 배열은 항목마다 리터럴 타입이라, `variants`가 없는 항목에서
 * `gimmick.variants` 접근이 타입 에러가 된다. 순회용으로 한 번 넓혀 쓴다 —
 * 위의 `satisfies readonly Gimmick[]`이 이미 이 배열이 Gimmick[]임을 컴파일
 * 타임에 보장하므로, 이 대입은 그 보장을 통과시키는 것뿐이다.
 */
const ALL_GIMMICKS: readonly Gimmick[] = GIMMICKS;

/**
 * 하나의 햅틱 스펙이 참조하는 프리셋. sling처럼 프리셋을 중첩해 갖는
 * 타입이 생겨도 여기서 걸린다 — `never` 대입이 새 멤버를 컴파일 에러로
 * 만들기 때문이다. §4 원칙 3(번들 기믹의 프리셋은 전부 preload)이 조용히
 * 깨지는 걸 막는 자리다.
 */
function presetsOf(haptic: HapticSpec): readonly PresetName[] {
  switch (haptic.type) {
    case 'preset':
      return [haptic.name];
    case 'pattern':
    case 'realtime':
      return [];
    case 'sling':
      return presetsOf(haptic.fire);
    default: {
      const exhaustive: never = haptic;
      return exhaustive;
    }
  }
}

/**
 * 번들에 포함된 기믹이 쓰는 프리셋. 앱 시작 시 preload한다. (§4 원칙 3)
 *
 * 변형의 프리셋까지 모아야 한다. 기본 변형만 preload하면 사용자가 축을 바꾼
 * 직후의 첫 딸깍이 씹힌다 — 엔진 캐시에 없는 프리셋을 그 순간 올리기 때문이다.
 *
 * Detented/Physics는 실시간 변조라 preload할 프리셋이 없으므로 자연히 빠진다.
 */
export const BUNDLED_PRESETS: readonly PresetName[] = ALL_GIMMICKS.flatMap((gimmick) => {
  /**
   * 유니온 배열(discrete용 배열 | detented용 배열)에 `.map`을 직접 호출하면
   * TS가 시그니처를 합치지 못한다. 한 번 넓혀 받으면 풀린다 — 속성 타입은
   * 공변이라 대입이 성립한다.
   */
  const variants: readonly GimmickVariant<HapticSpec>[] = gimmick.variants ?? [];
  const haptics: readonly HapticSpec[] = [gimmick.haptic, ...variants.map((v) => v.haptic)];

  /** sling은 fire 쪽에 프리셋이 숨어 있다 — 안 모으면 첫 펑이 씹힌다(§4 원칙 3). */
  return haptics.flatMap(presetsOf);
});
