import type { PresetName } from '@/haptics/presets';

import type { Gimmick, GimmickVariant, HapticSpec } from './types';

/**
 * 기믹 레지스트리. (§4)
 *
 * 기믹 하나 추가하는 비용을 최소화하는 게 목표다. 새 기믹 = 여기 항목 하나 +
 * 폴더 하나. 항목이 순수 데이터 + lazy 컴포넌트이므로 신규 기믹을
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
    kind: 'discrete',
    /**
     * 축은 적축 하나만 남겼다(갈축·사일런트 삭제). 셸의 축 선택 칩은
     * variants가 2개 이상일 때만 나타나므로 variants를 지우는 것으로 선택
     * UI도 함께 사라진다 — 저장된 축 id(tactile/silent)가 남아 있어도 셸이
     * 합성 기본 변형으로 떨어진다.
     *
     * 프리셋은 원래 갈축에 배정했던 `keyboardMechanical`을 적축이 물려받았다.
     *
     * ⚠️ 미검증 값이다. §10은 코드를 짜기 전에 Pulsar Live Preview에서
     * 실제로 느껴보고 고르라고 지시하는데, 그건 실기기가 필요한 작업이라
     * 아직 못 했다. 다이얼·전구와 같은 상태다. 후보:
     *   keyboardMechanical, plunk, snap, latch, ratchet, thud
     */
    haptic: { type: 'preset', name: 'keyboardMechanical' },
    config: {/** 릴리스 햅틱 없음 — 누를 때 한 방이면 충분하다. */},
    component: () => import('./keycap'),
  },
  {
    id: 'dial',
    name: '다이얼',
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
       * 원본은 0~270° 클램프 노브지만 우리는 무한 회전이다 — 눈금 점 32개를
       * 온전한 원에 두고, 한 바퀴 채우면 색이 리셋된다. 원이 닫혀 있으므로
       * 점 개수와 detent 개수가 같다(부채꼴이었다면 점이 하나 더 많다).
       */
      detentCount: 32,
      sweepDegrees: 360,
      /** 무한 회전. 오디오 노브처럼 끝을 만들려면 clamp: true + sweep 270. */
      clamp: false,
    },
    component: () => import('./dial'),
  },
  {
    id: 'bulb',
    name: '전구',
    kind: 'tug',
    /**
     * 풀코드가 임계값을 넘는 순간의 딸깍. 실제 풀체인 스위치의 묵직한
     * 걸쇠 느낌을 노리고 `latch`를 골랐다.
     *
     * ⚠️ 미검증 값이다. 키캡·다이얼과 같은 상태 — §10의 Live
     * Preview 절차는 실기기가 필요하다. 후보:
     *   latch, lock, snap, trigger, toggleOn/toggleOff(켜짐·꺼짐 분리 —
     *   config 확장이 필요해서 후속으로 미뤘다, 스펙 §7)
     */
    haptic: { type: 'preset', name: 'latch' },
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

  return haptics.flatMap((haptic) => (haptic.type === 'preset' ? [haptic.name] : []));
});
