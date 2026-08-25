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
 *
 * 앞의 셋이 전송 방식 원시형(프리셋 / 패턴 / 실시간)인 것과 달리
 * `SlingHaptic`은 그 원시형을 품는 복합형이라는 게 의도된 비대칭이다.
 * 복합형이 하나 더 생기면 이 유니온을 원시형과 복합형으로 쪼개는 게 맞다.
 */
export type HapticSpec = PresetHaptic | PatternHaptic | RealtimeHaptic | SlingHaptic;

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

/**
 * Tug — 전구 풀코드, 레버. 임계값을 넘어본 뒤 **놓는 순간** 1회. (§4)
 *
 * discrete와 다른 점은 트리거가 터치 다운이 아니라 릴리스라는 것, 그리고
 * 드래그 거리가 그 릴리스를 쏠지 말지의 관문이라는 것이다.
 */
export type TugConfig = {
  /**
   * 토글로 인정하는 당김 거리(pt). 잡은 지점 기준 유클리드 거리, 방향 무관.
   * 한 번 넘으면 되돌아와도 안 풀린다 — 이유는 `_kinds/tug.tsx`에.
   */
  threshold: number;
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
 * Sling — 파티 포퍼, 새총. 당겨서 조준하고 놓는 순간 발사. (§4)
 *
 * tug와 다른 점: 트리거는 둘 다 릴리스지만, sling의 드래그는 각도·파워라는
 * **연속 payload**를 만든다. tug의 드래그는 쏠지 말지를 정하는 관문 하나뿐인
 * 이진 토글이다.
 */
export type SlingConfig = {
  /** 파워 1.0에 도달하는 당김 거리(pt). */
  maxPull: number;
  /** 이 파워(0~1) 미만에서 놓으면 불발 — 탭이 오발되지 않는다. */
  minPower: number;
  /** 발사각 허용 부채꼴(도). 수직 위를 중심으로 ±(fanDegrees/2)로 클램프. */
  fanDegrees: number;
};

/**
 * 차징 럼블 + 발사 한 방. sling 전용 복합 햅틱.
 *
 * 당기는 동안은 연속 엔벨로프(`useRealtimeComposer`의 `set`)를 파워로
 * 변조하고, 릴리스 순간 단발을 쏜다. 단발(트랜지언트)과 연속(엔벨로프)은
 * 다른 채널이라 서로 충돌하지 않는다.
 */
export type SlingHaptic = {
  type: 'sling';
  /** 당기는 동안의 연속 엔벨로프. 파워 0→1로 보간한다. */
  charge: {
    minAmplitude: number;
    maxAmplitude: number;
    /** 파워가 차면 주파수도 올라간다 — 세지면서 날카로워지는 것. */
    minFrequency: number;
    maxFrequency: number;
  };
  /** 릴리스 순간 한 방. */
  fire: PresetHaptic | PatternHaptic;
};

/**
 * 구현된 입력 모델 → 설정 타입.
 *
 * §4가 정의한 입력 모델(discrete / detented / tug / grid / physics) 중
 * grid / physics는 아직 없다. 추가할 때 할 일:
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
  tug: {
    config: TugConfig;
    /** 릴리스 순간 한 방 — discrete와 같은 단발 계열. */
    haptic: PresetHaptic | PatternHaptic;
  };
  sling: {
    config: SlingConfig;
    /** 차징(연속) + 발사(단발) 복합. 이 kind 전용 타입이다. */
    haptic: SlingHaptic;
  };
};

/** 구현된 입력 모델. */
export type GimmickKind = keyof KindSpec;

/** §4가 정의한 전체 입력 모델 분류. 아직 구현되지 않은 것을 포함한다. */
export type PlannedGimmickKind = GimmickKind | 'grid' | 'physics';

// ---------------------------------------------------------------------------
// 변형
// ---------------------------------------------------------------------------

/**
 * 하나의 기믹이 갖는 손맛 변형.
 *
 * 키보드 스위치 축(적축·갈축·사일런트)처럼 "같은 물건인데 손맛이 다른" 것을
 * 표현한다. 차별점을 손맛에 두는 게 §0("햅틱이 곧 제품")에 맞는 답이다.
 * (첫 사용처였던 키캡은 적축만 남기면서 지금은 variants를 쓰지 않는다 —
 * 셸의 선택 UI는 variants가 2개 이상일 때만 나타난다.)
 *
 * 햅틱 타입을 파라미터로 받으므로 kind별 제약이 그대로 유지된다 — detented
 * 기믹에 variants를 달면 RealtimeHaptic만 들어간다.
 *
 * 색이나 사운드는 여기 넣지 않는다. §4 원칙 1이 데이터로 규정한 건 햅틱이고,
 * 시각 정보는 기믹 컴포넌트가 자기 것으로 갖는다(키캡이 자기 팔레트를
 * 컴포넌트에 갖고 있는 것과 같은 자리다).
 */
export type GimmickVariant<H> = {
  id: string;
  name: string;
  haptic: H;
};

/** kind에 맞는 변형 타입. 기믹 컴포넌트가 props로 받는다. */
export type VariantOf<K extends GimmickKind> = GimmickVariant<KindSpec[K]['haptic']>;

// ---------------------------------------------------------------------------
// 기믹
// ---------------------------------------------------------------------------

/** 기믹 화면 컴포넌트가 받는 props. */
export type GimmickScreenProps<K extends GimmickKind = GimmickKind> = {
  gimmick: Extract<Gimmick, { kind: K }>;
  /**
   * 선택된 변형. 기믹 컴포넌트는 `gimmick.haptic`이 아니라 이쪽을 쓴다 —
   * 진실의 출처를 둘로 만들지 않기 위해서다.
   *
   * `variants`가 없는 기믹에는 셸이 `gimmick.haptic`으로 단일 변형을 합성해
   * 넘기므로, 변형 개념을 모르는 기믹도 그대로 동작한다.
   */
  variant: VariantOf<K>;
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
    /**
     * 기본 변형의 햅틱. `variants`가 있으면 그 첫 항목과 같은 값을 둔다 —
     * 저장된 축을 못 찾았을 때 셸이 여기로 떨어진다.
     */
    haptic: KindSpec[K]['haptic'];
    /** 손맛 변형. 2개 이상일 때만 셸이 선택 UI를 그린다. */
    variants?: readonly VariantOf<K>[];
    config: KindSpec[K]['config'];
    component: LazyComponent<K>;
  };
}[GimmickKind];
