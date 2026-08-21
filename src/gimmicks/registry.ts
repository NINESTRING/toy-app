import type { PresetName } from '@/haptics/presets';

import type { Gimmick } from './types';

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
 */
export const GIMMICKS = [
  {
    id: 'clicker',
    name: '클리커',
    kind: 'discrete',
    /**
     * `snap`을 골랐다.
     *
     * ⚠️ 미검증 값이다. §10은 코드를 짜기 전에 Pulsar Live Preview
     * 플레이그라운드에서 프리셋을 실제로 느껴보고 고르라고 지시하는데,
     * 그건 실기기가 필요한 작업이라 아직 못 했다.
     *
     * 실기기에서 확인한 뒤 교체할 것. 후보(151개 중 클리커 계열):
     *   snap, keyboardMechanical, keyboardMembrane, latch, plunk,
     *   trigger, knock, clasp, lock, blip, pip
     * §4 원칙 1대로 햅틱이 데이터이므로 교체는 아래 한 줄만 바꾸면 끝난다.
     */
    haptic: { type: 'preset', name: 'snap' },
    config: {
      /**
       * 릴리스 햅틱 없음 — 단순 클리커는 누를 때만 딸깍한다.
       * 볼펜 기믹을 추가할 때 여기에 뗄 때의 프리셋을 넣는다.
       */
    },
    component: () => import('./clicker'),
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
      detentCount: 24,
      sweepDegrees: 360,
      /** 무한 회전. 오디오 노브처럼 끝을 만들려면 clamp: true + sweep 270. */
      clamp: false,
    },
    component: () => import('./dial'),
  },
] as const satisfies readonly Gimmick[];

/** id로 기믹 찾기. 라우트 파라미터가 문자열로 오므로 검증 겸용. */
export function findGimmick(id: string | undefined): Gimmick | undefined {
  return GIMMICKS.find((gimmick) => gimmick.id === id);
}

/**
 * 번들에 포함된 기믹이 쓰는 프리셋. 앱 시작 시 preload한다. (§4 원칙 3)
 *
 * Detented/Physics는 실시간 변조라 preload할 프리셋이 없으므로 자연히 빠진다.
 */
export const BUNDLED_PRESETS: readonly PresetName[] = GIMMICKS.flatMap((gimmick) =>
  gimmick.haptic.type === 'preset' ? [gimmick.haptic.name] : []
);
