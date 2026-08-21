import type { ComponentType } from 'react';
import type { Pattern } from 'react-native-pulsar';

import type { PresetName } from '@/haptics/presets';

/**
 * 기믹 레지스트리 계약. (§4)
 *
 * 목표는 기믹 하나 추가하는 비용을 최소화하는 것. 새 기믹을 붙이는 데
 * 필요한 작업은 registry.ts에 항목 하나 + 폴더 하나다.
 */

// ---------------------------------------------------------------------------
// 햅틱 = 데이터 (§4 원칙 1)
// ---------------------------------------------------------------------------

/**
 * 햅틱은 코드가 아니라 데이터다. 기믹 정의가 순수 데이터로 유지되면
 * 나중에 서버에서 내려받을 수 있다.
 */
export type HapticSpec = PresetHaptic | PatternHaptic | RealtimeHaptic;

/** Pulsar 프리셋 이름. 151개면 웬만한 기믹은 커스텀 패턴 없이 커버된다. (§10) */
export type PresetHaptic = {
  type: 'preset';
  name: PresetName;
};

/** 프리셋으로 안 되는 경우의 커스텀 패턴 JSON. */
export type PatternHaptic = {
  type: 'pattern';
  pattern: Pattern;
};

/**
 * 드래그 속도에 따라 실시간 변조되는 햅틱. Detented / Physics용. (§4)
 *
 * 다이얼을 천천히 돌릴 때와 빨리 돌릴 때 손맛이 달라지는 것 —
 * §4가 "품질을 가르는 지점"이라고 지목한 부분의 튜닝 파라미터다.
 */
export type RealtimeHaptic = {
  type: 'realtime';
  /** 아주 천천히 움직일 때의 진폭 (0~1) */
  minAmplitude: number;
  /** `velocityForMaxAmplitude` 이상으로 움직일 때의 진폭 (0~1) */
  maxAmplitude: number;
  /** 진동 주파수 (0~1). 낮으면 둔탁하고 높으면 날카롭다. */
  frequency: number;
  /** 이 각속도(도/초)에서 maxAmplitude에 도달한다. */
  velocityForMaxAmplitude: number;
};

// ---------------------------------------------------------------------------
// 입력 모델별 설정
// ---------------------------------------------------------------------------

/** Discrete — 클리커, 토글, 볼펜. 터치 다운 1회. (§4) */
export type DiscreteConfig = {
  /**
   * 손을 뗄 때도 햅틱을 쏠지. 실제 볼펜은 누를 때와 뗄 때 소리가 다르다.
   * 단순 클리커는 생략한다.
   */
  releaseHaptic?: PresetHaptic | PatternHaptic;
};

/** Detented — 다이얼, 슬라이더, 래칫. 눈금 넘을 때마다. (§4) */
export type DetentedConfig = {
  /** `sweepDegrees` 구간을 몇 눈금으로 나눌지. */
  detentCount: number;
  /**
   * 전체 회전 범위(도). 360이면 무한 회전에 가깝고,
   * 270이면 오디오 노브처럼 양쪽에 끝이 있다.
   */
  sweepDegrees: number;
  /** 끝에 도달하면 멈출지(노브), 계속 돌지(스피너). */
  clamp: boolean;
};

/**
 * 구현된 입력 모델 → 설정 타입.
 *
 * §4는 입력 모델 4종(discrete / detented / grid / physics)을 정의하지만,
 * 첫 스프린트는 구조적으로 가장 먼 두 개만 만든다(§10). grid / physics를
 * 추가할 때 할 일:
 *   1. 여기에 `grid: { config: GridConfig; haptic: ... }` 한 줄 추가
 *   2. `_kinds/grid.tsx`에 렌더러 추가
 *   3. `KIND_RENDERERS`에 매핑 추가
 * `Gimmick` 유니온은 이 맵에서 자동 파생되므로 손댈 필요 없다.
 */
type KindSpec = {
  discrete: {
    config: DiscreteConfig;
    /** 터치 다운 1회에 하나 쏘는 구조라 실시간 변조는 쓰지 않는다. */
    haptic: PresetHaptic | PatternHaptic;
  };
  detented: {
    config: DetentedConfig;
    /** 눈금마다 속도에 따라 세기가 변해야 하므로 실시간 변조 전용. */
    haptic: RealtimeHaptic;
  };
};

/** 구현된 입력 모델. */
export type GimmickKind = keyof KindSpec;

/** §4가 정의한 전체 입력 모델 분류. 아직 구현되지 않은 것을 포함한다. */
export type PlannedGimmickKind = GimmickKind | 'grid' | 'physics';

// ---------------------------------------------------------------------------
// 기믹
// ---------------------------------------------------------------------------

/** 기믹 화면 컴포넌트가 받는 props. */
export type GimmickScreenProps<K extends GimmickKind = GimmickKind> = {
  gimmick: Extract<Gimmick, { kind: K }>;
  /**
   * 한 번 조작될 때마다(딸깍 1회, 눈금 1칸) 호출된다.
   * 카운트를 메모리에 쌓는 용도 — MMKV 저장은 store 쪽에서 디바운스한다. (§5)
   */
  onInteract: () => void;
};

type GimmickBase = {
  id: string;
  name: string;
  /** 에셋 키. 사운드는 §5대로 플레이어 풀을 거친다. */
  sound?: string;
};

/**
 * `component`는 반드시 lazy. (§4 원칙 2)
 *
 * 기믹 30개 + Skia 씬이면 초기 번들이 터진다. 갤러리에선 썸네일만 쓰고
 * 실제 컴포넌트는 진입할 때 로드한다. 이 구조 덕분에 신규 기믹을
 * EAS Update로 심사 없이 배포할 수 있다. (§7)
 */
type LazyComponent<K extends GimmickKind> = () => Promise<{
  default: ComponentType<GimmickScreenProps<K>>;
}>;

export type Gimmick = {
  [K in GimmickKind]: GimmickBase & {
    kind: K;
    haptic: KindSpec[K]['haptic'];
    config: KindSpec[K]['config'];
    component: LazyComponent<K>;
  };
}[GimmickKind];
