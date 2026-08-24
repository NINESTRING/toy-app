# 파티 포퍼(sling) 기믹 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 입력 모델 `sling`(당겨서 조준, 놓으면 발사)과 그 첫 기믹 '파티 포퍼'를 추가한다 — 차징 럼블 + 발사 펑 복합 햅틱, Skia Atlas 색종이 파티클 포함.

**Architecture:** 스펙은 [2026-08-24-popper-gimmick-design.md](../specs/2026-08-24-popper-gimmick-design.md). 전구가 `tug`를 신설한 수순 그대로 — `types.ts`에 KindSpec 항목, `_kinds/sling.tsx`에 제스처·햅틱 렌더러, `popper/`에 Skia 도화 + 파티클, 레지스트리 항목. 모든 판정·시뮬레이션은 워크릿(UI 스레드)에서 돈다.

**Tech Stack:** Reanimated 4 (제스처 워크릿, `useFrameCallback`), react-native-gesture-handler (`Gesture.Pan`), react-native-pulsar (`useRealtimeComposer` 연속 엔벨로프 + 프리셋), @shopify/react-native-skia 2.6.2 (`Atlas`, `useRSXformBuffer`, `useColorBuffer`, `useTexture`).

## Global Constraints

- **§1: 기믹 화면 내부(`_kinds/`, `popper/`)에서 `className` 금지.** 스타일은 `ViewStyle` 상수.
- **§4: 모든 햅틱 판정·파티클 시뮬레이션은 워크릿 안에서.** JS 스레드로 올라오는 건 `runOnJS(onInteract)` 하나뿐.
- **§4 원칙 2: 기믹 컴포넌트는 lazy** (`component: () => import('./popper')`).
- **새 의존성 금지.** 전부 설치된 패키지로 해결된다.
- **테스트 러너 없음.** 이 리포의 검증은 `npm run typecheck` + 시뮬레이터 스크린샷이다 (키캡·전구 전례). 각 태스크는 typecheck 통과가 게이트.
- **커밋은 명시된 파일만 `git add`.** 작업 트리에 이 작업과 무관한 미커밋 변경(키캡 축 정리 등)이 있다 — `git add -A` 금지.
- **프리셋 이름은 `PresetName` 타입이 검증한다.** 설치된 Pulsar에 `pop`·`boom`은 없다. fire 프리셋은 `balloonPop`.
- 햅틱·물리 상수는 전부 ⚠️ 실기기 미검증 — 주석에 그 사실을 남긴다 (기존 기믹들과 같은 규약).

---

### Task 1: `sling` 타입 계약 (`types.ts`)

**Files:**
- Modify: `src/gimmicks/types.ts`

**Interfaces:**
- Produces: `SlingConfig`, `SlingHaptic` (export), `KindSpec.sling` 항목. Task 2~5가 이 타입을 소비한다.

- [ ] **Step 1: `SlingConfig`·`SlingHaptic` 타입 추가**

`src/gimmicks/types.ts`의 `DetentedConfig` 선언 뒤, `KindSpec` 주석 앞에 삽입:

```ts
/**
 * Sling — 파티 포퍼, 새총. 당겨서 조준하고 놓는 순간 발사. (§4)
 *
 * tug와 다른 점: 트리거가 릴리스이고, 드래그가 각도·파워라는 연속
 * payload를 만든다. tug는 당김 도중 임계값 통과가 트리거고 릴리스는
 * 재장전일 뿐이다.
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
```

- [ ] **Step 2: `HapticSpec` 유니온에 `SlingHaptic` 추가**

기존:

```ts
export type HapticSpec = PresetHaptic | PatternHaptic | RealtimeHaptic;
```

변경:

```ts
export type HapticSpec = PresetHaptic | PatternHaptic | RealtimeHaptic | SlingHaptic;
```

- [ ] **Step 3: `KindSpec`에 `sling` 항목 추가**

`KindSpec`의 `tug` 항목 뒤에 삽입:

```ts
  sling: {
    config: SlingConfig;
    /** 차징(연속) + 발사(단발) 복합. 이 kind 전용 타입이다. */
    haptic: SlingHaptic;
  };
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: **실패** — `src/app/index.tsx`의 `KIND_LABELS: Record<Gimmick['kind'], string>`에 `sling` 키가 없다는 에러. (kind 추가가 셸의 라벨 맵에 컴파일 에러로 전파되는 게 이 타입 설계의 의도된 동작이다.)

- [ ] **Step 5: `KIND_LABELS`에 sling 라벨 추가**

`src/app/index.tsx`의 `KIND_LABELS`(67행 부근):

```ts
const KIND_LABELS: Record<Gimmick['kind'], string> = {
  discrete: '누르기',
  detented: '돌리기',
  tug: '당기기',
  sling: '쏘기',
};
```

- [ ] **Step 6: typecheck 재실행**

Run: `npm run typecheck`
Expected: 통과 (에러 0)

- [ ] **Step 7: Commit**

```bash
git add src/gimmicks/types.ts src/app/index.tsx
git commit -m "feat: sling 입력 모델 타입 계약 — 조준-릴리스 + 복합 햅틱"
```

---

### Task 2: `_kinds/sling.tsx` — 제스처·조준·파워·발사·차징 럼블

**Files:**
- Create: `src/gimmicks/_kinds/sling.tsx`

**Interfaces:**
- Consumes: Task 1의 `SlingConfig`, `SlingHaptic`. 기존 `useHapticFire`, `useThrottledHaptic`, Pulsar `useRealtimeComposer`(`set(amplitude, frequency)` / `stop()` — 둘 다 워크릿 호출 가능).
- Produces: `SlingGimmick` 컴포넌트, `SlingShot`·`SlingRenderState` 타입, `REST_ANGLE` 상수. Task 3~4가 소비한다. 각도 규약: **도(deg), 화면 좌표계(0 = +x 오른쪽, 양수 = 시계방향), 수직 위 = -90.**

- [ ] **Step 1: 파일 작성**

`src/gimmicks/_kinds/sling.tsx` 전체:

```tsx
import * as React from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRealtimeComposer } from 'react-native-pulsar';
import {
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { useThrottledHaptic } from '@/haptics/useThrottledHaptic';
import type { SlingConfig, SlingHaptic } from '@/gimmicks/types';

import { useHapticFire } from './useHapticFire';

/**
 * Sling 입력 모델. (§4)
 *
 * 파티 포퍼, 새총 — 당겨서 조준하고 놓으면 발사. 드래그 벡터의 반대
 * 방향이 발사각, 길이가 파워다(Angry Birds 문법). 당기는 동안 파워에
 * 비례하는 차징 럼블이 울리고(§0 — 게이지를 눈으로 안 봐도 손이 안다),
 * 릴리스 순간 단발이 터진다.
 *
 * 이 컴포넌트는 제스처·조준·파워·발사 판정·햅틱만 소유하고 생김새는
 * children에 맡긴다. 모든 판정이 워크릿 안에서 끝난다. (§4)
 */

/** 휴지 조준각(도). 화면 좌표계에서 수직 위. */
export const REST_ANGLE = -90;

export type SlingShot = {
  /** 발사마다 1씩 증가. 자식이 useAnimatedReaction으로 받아 파티클을 뿌린다. */
  seq: number;
  /** 발사 방향(도). 부채꼴 클램프 적용 후 값. */
  angle: number;
  /** 발사 파워 0~1. */
  power: number;
};

export type SlingRenderState = {
  /** 현재 조준 방향(도). 놓으면 스프링으로 REST_ANGLE 복귀. */
  angle: SharedValue<number>;
  /**
   * 현재 파워 0~1. 놓으면 스프링으로 0 복귀 — 오버슈트로 살짝 음수가
   * 되는 구간이 포신 반동(recoil)이다. 그리는 쪽에서 clamp해서 쓴다.
   */
  power: SharedValue<number>;
  active: SharedValue<boolean>;
  shot: SharedValue<SlingShot>;
};

type Props = {
  haptic: SlingHaptic;
  config: SlingConfig;
  onInteract: () => void;
  children: (state: SlingRenderState) => React.ReactNode;
};

/**
 * 릴리스 복귀 스프링. 낮은 감쇠의 오버슈트가 그대로 포신 반동이 된다 —
 * 전구가 복귀 스프링으로 채찍 반동을 얻은 것과 같은 구조(스펙 §6).
 * ⚠️ 실기기 튜닝 대상.
 */
const RECOIL_SPRING = { damping: 10, stiffness: 320, mass: 1 };

/**
 * 조준각을 REST_ANGLE 중심 ±halfFan으로 클램프. atan2가 ±180에서 끊기므로
 * 편차를 (-180, 180]으로 되감은 뒤 자른다.
 */
function clampToFan(rawAngle: number, halfFan: number): number {
  'worklet';
  let delta = rawAngle - REST_ANGLE;
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }
  return REST_ANGLE + Math.min(halfFan, Math.max(-halfFan, delta));
}

export function SlingGimmick({ haptic, config, onInteract, children }: Props) {
  const composer = useRealtimeComposer();

  const angle = useSharedValue(REST_ANGLE);
  const power = useSharedValue(0);
  const active = useSharedValue(false);
  const shot = useSharedValue<SlingShot>({ seq: 0, angle: REST_ANGLE, power: 0 });

  /**
   * 발사 단발. 사이클당 1회라 스로틀의 실질 의미는 없지만 discrete·tug와
   * 같은 계약을 유지한다.
   */
  const fireShot = useThrottledHaptic(useHapticFire(haptic.fire));

  const { maxPull, minPower, fanDegrees } = config;
  const { minAmplitude, maxAmplitude, minFrequency, maxFrequency } = haptic.charge;
  const halfFan = fanDegrees / 2;

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        /** 잡는 즉시 조준이 시작돼야 하므로 발동 거리 0. */
        .minDistance(0)
        .onBegin(() => {
          'worklet';
          active.value = true;
          /** 반동 스프링 도중에 다시 잡으면 그 자리에서 낚아챈다. */
          cancelAnimation(angle);
          cancelAnimation(power);
        })
        .onUpdate((event) => {
          'worklet';
          /**
           * 당김 벡터는 잡은 지점 기준(tug와 같은 원칙). 발사 방향은
           * 그 반대다 — 아래로 당기면 위로 쏜다.
           */
          const pullX = event.translationX;
          const pullY = event.translationY;
          const distance = Math.sqrt(pullX * pullX + pullY * pullY);

          const nextPower = Math.min(1, distance / maxPull);
          power.value = nextPower;

          /** 거리 0이면 atan2(0,0)이 무의미하므로 조준각을 건드리지 않는다. */
          if (distance > 0) {
            const rawAngle = (Math.atan2(-pullY, -pullX) * 180) / Math.PI;
            angle.value = clampToFan(rawAngle, halfFan);
          }

          /**
           * 차징 럼블 — 연속 엔벨로프라 detented의 playDiscrete(단발)가
           * 아니라 §4가 적어둔 set이 맞다. 트랜지언트가 아니므로 §5의
           * 초당 20회 드랍과 무관하고 매 프레임 호출해도 된다.
           */
          composer.set(
            minAmplitude + (maxAmplitude - minAmplitude) * nextPower,
            minFrequency + (maxFrequency - minFrequency) * nextPower
          );
        })
        .onFinalize(() => {
          'worklet';
          active.value = false;
          composer.stop();

          /** minPower 미만은 불발 — 탭이 오발되지 않는다(스펙 §3). */
          if (power.value >= minPower) {
            shot.value = {
              seq: shot.value.seq + 1,
              angle: angle.value,
              power: power.value,
            };
            fireShot();
            runOnJS(onInteract)();
          }

          power.value = withSpring(0, RECOIL_SPRING);
          angle.value = withSpring(REST_ANGLE, RECOIL_SPRING);
        }),
    [
      active,
      angle,
      composer,
      fireShot,
      halfFan,
      maxAmplitude,
      maxPull,
      maxFrequency,
      minAmplitude,
      minFrequency,
      minPower,
      onInteract,
      power,
      shot,
    ]
  );

  return (
    <GestureDetector gesture={pan}>
      {children({ angle, power, active, shot })}
    </GestureDetector>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 3: Commit**

```bash
git add src/gimmicks/_kinds/sling.tsx
git commit -m "feat: _kinds/sling — 조준·파워·발사 판정 + 차징 럼블 렌더러"
```

---

### Task 3: `popper/index.tsx` — 포퍼 씬 (파티클 제외)

**Files:**
- Create: `src/gimmicks/popper/index.tsx`

**Interfaces:**
- Consumes: Task 2의 `SlingGimmick`, `SlingRenderState`, `REST_ANGLE`. `GimmickScreenProps<'sling'>`.
- Produces: default export `Popper` 컴포넌트. 내부 `PopperBody`가 `muzzle`(포구 월드 좌표 derived value)을 만든다 — Task 4가 이 파일에 `<Confetti>`를 끼워 넣으며 소비한다.

- [ ] **Step 1: 파일 작성**

`src/gimmicks/popper/index.tsx` 전체:

```tsx
import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  Skia,
  vec,
  type SkSize,
} from '@shopify/react-native-skia';
import * as React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { REST_ANGLE, SlingGimmick, type SlingShot } from '@/gimmicks/_kinds/sling';
import type { GimmickScreenProps } from '@/gimmicks/types';

/**
 * 파티 포퍼 — Sling 입력 모델. (§4)
 *
 * 레퍼런스: J Scott Smith의 Confetti Cannon (codepen.io/jscottsmith/pen/VjPaLO).
 * 원본은 포가 안 보인다(누른 곳이 포구, 분홍 조준선이 전부) — 우리는 하단
 * 고정 색동 고깔을 보여주고, 새총식 당김 조준 + 조준 점 4개가 파워
 * 게이지를 겸한다(스펙 §1).
 *
 * §1: 이 파일 안에서는 `className`을 쓰지 않는다.
 *
 * 왜 Skia인가: 배경을 소유하는 기믹이고, 색종이 256개는 Atlas 드로우콜
 * 1번으로 그려야 한다(스펙 §7 — Task 4에서 붙는다).
 */

const DEG2RAD = Math.PI / 180;

/**
 * 포퍼 로컬 좌표계: 원점 = 회전 피벗(고깔 밑동), -y = 포구 방향.
 * 화면 배치는 transform이 한다 — 하단 중앙, 바닥에서 PIVOT_FROM_BOTTOM 위.
 */
const PIVOT_FROM_BOTTOM = 150;

/** 고깔. 밑동 반폭 12, 포구 반폭 36, 길이 120. */
const CONE_LENGTH = 120;
const CONE_PATH = Skia.PathBuilder.Make()
  .moveTo(-12, 0)
  .lineTo(-36, -CONE_LENGTH)
  .lineTo(36, -CONE_LENGTH)
  .lineTo(12, 0)
  .close()
  .detach();

/** 포구의 금색 림. 고깔 위 끝을 살짝 덮는다. */
const RIM = { x: -42, y: -134, width: 84, height: 18, radius: 9 };

/** 손잡이. 밑동 아래 라운드 사각. */
const HANDLE = { x: -13, y: 0, width: 26, height: 26, radius: 8 };

/**
 * 당길 때 포신이 발사 반대쪽으로 눌려 들어가는 최대 거리(pt) —
 * 스프링 압축 은유. 릴리스 스프링의 오버슈트가 그대로 반동이 된다.
 */
const PULLBACK_MAX = 26;

/** 조준 가이드 점. 포구 앞에서 시작해 파워에 비례해 간격이 벌어진다. */
const AIM_DOT_COUNT = 4;
const AIM_BASE = 158;
const AIM_GAP_MIN = 14;
const AIM_GAP_GROWTH = 34;
const AIM_DOT_R = 5;

/** 포구 중심까지의 피벗 거리. 색종이 스폰 지점(muzzle) 계산에 쓴다. */
const MUZZLE_DIST = 140;

/**
 * 팔레트. 어두운 남보라 배경 — 색종이 대비가 사는 색(스펙 §6).
 * 축제색 셋이 고깔 줄무늬와 색종이(Task 4)에 공유된다.
 */
const BACKGROUND_COLORS = ['#2a2140', '#141021'];
const CONE_BASE_COLOR = '#ff6b6b';
const STRIPE_COLORS = ['#ffd93d', '#4ecdc4', '#a55eea'];
const RIM_COLOR = '#e8b84b';
const HANDLE_COLOR = '#8d6a3f';
const AIM_DOT_COLOR = '#ffffff';

/** 줄무늬 기울기(라디안). 정적이므로 모듈 상수. */
const STRIPE_TILT = [{ rotate: -0.35 }];

function clamp01(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

export default function Popper({ gimmick, variant, onInteract }: GimmickScreenProps<'sling'>) {
  return (
    <View style={CONTAINER}>
      <SlingGimmick haptic={variant.haptic} config={gimmick.config} onInteract={onInteract}>
        {({ angle, power, shot }) => <PopperBody angle={angle} power={power} shot={shot} />}
      </SlingGimmick>
    </View>
  );
}

type BodyProps = {
  angle: SharedValue<number>;
  power: SharedValue<number>;
  shot: SharedValue<SlingShot>;
};

function PopperBody({ angle, power, shot }: BodyProps) {
  /** 캔버스 실측 크기. 전구와 같은 패턴 — `onSize`가 워크릿에서 채운다. */
  const canvasSize = useSharedValue<SkSize>({ width: 0, height: 0 });

  const backgroundWidth = useDerivedValue(() => canvasSize.value.width);
  const backgroundHeight = useDerivedValue(() => canvasSize.value.height);
  const gradientEnd = useDerivedValue(() => ({ x: 0, y: canvasSize.value.height }));

  /**
   * 포퍼 전체 transform: 하단 중앙 피벗으로 이동 → 조준각 회전 →
   * 당김 비례 로컬 +y(발사 반대쪽) 눌림. 반동 스프링이 power를
   * 오버슈트시키면 눌림이 살짝 음수가 되며 앞으로 튕긴다 — 그게 반동이다.
   */
  const popperTransform = useDerivedValue(() => {
    const rotation = (angle.value - REST_ANGLE) * DEG2RAD;
    const pullback = power.value * PULLBACK_MAX;
    return [
      { translateX: canvasSize.value.width / 2 },
      { translateY: canvasSize.value.height - PIVOT_FROM_BOTTOM },
      { rotate: rotation },
      { translateY: pullback },
    ];
  });

  /**
   * 포구 월드 좌표. Task 4의 색종이 스폰 지점 — 포신을 따라 회전·눌림을
   * 반영한다. 로컬 (0, -d)를 회전하면 (d·sin, -d·cos)이다.
   */
  const muzzle = useDerivedValue(() => {
    const rotation = (angle.value - REST_ANGLE) * DEG2RAD;
    const distance = MUZZLE_DIST - clamp01(power.value) * PULLBACK_MAX;
    return {
      x: canvasSize.value.width / 2 + distance * Math.sin(rotation),
      y: canvasSize.value.height - PIVOT_FROM_BOTTOM - distance * Math.cos(rotation),
    };
  });

  return (
    /**
     * 전구·키캡과 같은 지뢰 주의: 스타일만 있는 루트 뷰는 Fabric이
     * flatten할 수 있고, 그러면 GestureDetector가 엉뚱한 view tag에 붙는다.
     */
    <View style={BODY} collapsable={false}>
      <Canvas style={CANVAS} onSize={canvasSize}>
        {/* 배경 — 캔버스 전체, 상태와 무관하게 정적(스펙 §6). */}
        <Rect x={0} y={0} width={backgroundWidth} height={backgroundHeight}>
          <LinearGradient start={vec(0, 0)} end={gradientEnd} colors={BACKGROUND_COLORS} />
        </Rect>

        {/* Task 4가 여기(포퍼 뒤)에 <Confetti>를 끼운다 — 포퍼가 항상 앞. */}

        <Group transform={popperTransform}>
          {/* 조준 가이드 — 파워 0이면 투명해서 없는 것과 같다. */}
          {Array.from({ length: AIM_DOT_COUNT }, (_, index) => (
            <AimDot key={index} index={index} power={power} />
          ))}

          {/* 고깔 — 코랄 바탕에 기울어진 줄무늬 3개, 고깔 모양으로 클립. */}
          <Group clip={CONE_PATH}>
            <Path path={CONE_PATH} color={CONE_BASE_COLOR} />
            <Group transform={STRIPE_TILT}>
              <Rect x={-90} y={-104} width={180} height={20} color={STRIPE_COLORS[0]} />
              <Rect x={-90} y={-64} width={180} height={20} color={STRIPE_COLORS[1]} />
              <Rect x={-90} y={-24} width={180} height={20} color={STRIPE_COLORS[2]} />
            </Group>
          </Group>

          {/* 포구 림 + 손잡이. */}
          <RoundedRect
            x={RIM.x}
            y={RIM.y}
            width={RIM.width}
            height={RIM.height}
            r={RIM.radius}
            color={RIM_COLOR}
          />
          <RoundedRect
            x={HANDLE.x}
            y={HANDLE.y}
            width={HANDLE.width}
            height={HANDLE.height}
            r={HANDLE.radius}
            color={HANDLE_COLOR}
          />
        </Group>
      </Canvas>
    </View>
  );
}

type AimDotProps = {
  index: number;
  power: SharedValue<number>;
};

/**
 * 조준 점 하나. 간격·불투명도가 파워에 비례한다 — 이 점들이 파워
 * 게이지를 겸한다(스펙 §1). 반동 오버슈트의 음수 파워는 clamp로 막는다.
 */
function AimDot({ index, power }: AimDotProps) {
  const cy = useDerivedValue(
    () => -(AIM_BASE + (index + 1) * (AIM_GAP_MIN + AIM_GAP_GROWTH * clamp01(power.value)))
  );
  const opacity = useDerivedValue(() => clamp01(power.value) * (1 - index * 0.18));

  return (
    <Circle cx={0} cy={cy} r={AIM_DOT_R - index * 0.6} color={AIM_DOT_COLOR} opacity={opacity} />
  );
}

/** 셸이 기믹에 콘텐츠 영역 전체를 준다. 배경이 화면을 채우려면 다 받아야 한다. */
const CONTAINER: ViewStyle = {
  flex: 1,
};

/**
 * 제스처를 받는 뷰. 화면 전체다 — 포퍼를 직접 잡게 하면 당길수록
 * 손가락이 포퍼에서 멀어지는데 조준은 계속돼야 한다. 전구와 같은 원칙.
 */
const BODY: ViewStyle = {
  flex: 1,
};

/** 캔버스는 BODY 전체를 덮는다. 배경이 화면을 채우는 곳이 여기다. */
const CANVAS: ViewStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};
```

`shot`과 `muzzle`은 이 태스크에서는 아직 안 쓰인다(Task 4가 소비). 이 리포의 tsconfig는 `strict`만 켜져 있고 `noUnusedLocals`는 꺼져 있어 에러가 아니다 — 그대로 둔다.

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 3: Commit**

```bash
git add src/gimmicks/popper/index.tsx
git commit -m "feat: 파티 포퍼 씬 — 고깔·조준 가이드·차징 눌림 (파티클 제외)"
```

---

### Task 4: `popper/confetti.tsx` — 색종이 파티클 시스템 + 씬에 연결

**Files:**
- Create: `src/gimmicks/popper/confetti.tsx`
- Modify: `src/gimmicks/popper/index.tsx` (import + `<Confetti>` 삽입)

**Interfaces:**
- Consumes: Task 2의 `SlingShot`. Task 3의 `muzzle`(`SharedValue<{x,y}>`)·`canvasSize`. Skia `Atlas`/`useRSXformBuffer`/`useColorBuffer`/`useTexture`(전부 `@shopify/react-native-skia` 루트 export), Reanimated `useFrameCallback`/`useAnimatedReaction`.
- Produces: `Confetti` 컴포넌트 — props `{ shot, muzzle, canvasSize }`.

- [ ] **Step 1: `confetti.tsx` 작성**

`src/gimmicks/popper/confetti.tsx` 전체:

```tsx
import {
  Atlas,
  Rect,
  Skia,
  useColorBuffer,
  useRSXformBuffer,
  useTexture,
  type SkSize,
} from '@shopify/react-native-skia';
import * as React from 'react';
import {
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { SlingShot } from '@/gimmicks/_kinds/sling';

/**
 * 색종이 파티클 시스템. (스펙 §7)
 *
 * 고정 풀 256개 링버퍼 — 발사가 다음 슬롯들을 덮어쓰고, 연사로 넘치면
 * 가장 오래된 것부터 재활용한다. 할당이 없어 GC 걱정도 없다.
 *
 * 시뮬레이션은 useFrameCallback 워크릿(§4 — React 상태로 올라오지
 * 않는다), 렌더링은 Atlas 드로우콜 1번이다. 레퍼런스의 GSAP Physics2D +
 * 틸트 플러터를 명시적 오일러 적분으로 옮겼다.
 *
 * RSXform·색 버퍼의 modifier는 클로저의 shared value가 바뀔 때 다시
 * 도는 매퍼다. 파티클 배열은 제자리 변형이라 그것만으로는 안 깨어나므로,
 * 프레임 콜백이 tick을 증가시켜 매 프레임 갱신을 트리거한다.
 */

const POOL_SIZE = 256;

/** 스프라이트(직사각 색종이 조각) 원본 크기. 개체 스케일이 곱해진다. */
const SPRITE_W = 6;
const SPRITE_H = 10;

/** 발사 1회당 개수: 40 + 80 × power. (스펙 §7) */
const COUNT_BASE = 40;
const COUNT_PER_POWER = 80;

/** ⚠️ 물리 상수 전부 실기기 미검증 — 60fps와 손맛을 실기기에서 본다. */
const GRAVITY = 1400; // pt/s²
const DRAG = 2.2; // /s — 공기저항. 종단속도 ≈ GRAVITY/DRAG ≈ 640pt/s
const SPREAD_DEG = 25; // 발사각 좌우 확산(각 방향)
const SPEED_BASE = 900; // pt/s, power 0에서
const SPEED_PER_POWER = 1500; // pt/s, power 1에서 +
const LIFE_BASE = 2.4; // s
const LIFE_JITTER = 1.2; // s
const FADE_SECONDS = 0.6; // 수명 끝 페이드아웃 구간

const DEG2RAD = Math.PI / 180;

/**
 * 축제 6색 — 고깔과 같은 계열(스펙 §7). 레퍼런스의 전면 랜덤 RGB는 탁한
 * 색이 절반이라 버렸다. SkColor(Float32Array)에 바로 쓰도록 0~1 RGB.
 */
const PALETTE: readonly (readonly [number, number, number])[] = [
  [1.0, 0.42, 0.42], // 코랄 #ff6b6b
  [1.0, 0.85, 0.24], // 옐로 #ffd93d
  [0.31, 0.8, 0.77], // 민트 #4ecdc4
  [0.27, 0.67, 0.95], // 스카이 #45aaf2
  [0.65, 0.37, 0.92], // 바이올렛 #a55eea
  [0.99, 0.47, 0.66], // 핑크 #fd79a8
];

/** Atlas의 스프라이트 소스 — 전 개체가 같은 조각을 쓴다. */
const SPRITES = new Array(POOL_SIZE).fill(Skia.XYWHRect(0, 0, SPRITE_W, SPRITE_H));

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number; // 라디안
  rotV: number; // 라디안/s
  scale: number;
  colorIndex: number;
  life: number; // 남은 초. 0 이하 = 죽음
};

function makeDeadParticle(): Particle {
  return { x: 0, y: 0, vx: 0, vy: 0, rot: 0, rotV: 0, scale: 1, colorIndex: 0, life: 0 };
}

type Props = {
  shot: SharedValue<SlingShot>;
  /** 포구 월드 좌표 — 스폰 지점. index.tsx의 derived value. */
  muzzle: SharedValue<{ x: number; y: number }>;
  /** 화면 밖(아래) 컬링 기준. */
  canvasSize: SharedValue<SkSize>;
};

export function Confetti({ shot, muzzle, canvasSize }: Props) {
  /**
   * 흰 조각 하나를 GPU 텍스처로. 색은 Atlas colors가 개체별로 입힌다 —
   * srcIn이라 스프라이트의 알파만 남기고 색을 통째로 덮는다.
   */
  const texture = useTexture(
    <Rect x={0} y={0} width={SPRITE_W} height={SPRITE_H} color="white" />,
    { width: SPRITE_W, height: SPRITE_H }
  );

  const particles = useSharedValue<Particle[]>(
    Array.from({ length: POOL_SIZE }, makeDeadParticle)
  );
  /** 링버퍼 커서 — 다음 스폰이 덮어쓸 슬롯. */
  const cursor = useSharedValue(0);
  /** 살아있는 개수. 0이면 프레임 콜백이 일찍 반환한다(스펙 §7). */
  const aliveCount = useSharedValue(0);
  /** 버퍼 매퍼를 매 프레임 깨우는 신호. */
  const tick = useSharedValue(0);

  /** 발사 → 스폰. seq 증가가 이벤트다. */
  useAnimatedReaction(
    () => shot.value.seq,
    (seq, previousSeq) => {
      if (seq === 0 || seq === previousSeq) {
        return;
      }
      const { angle, power } = shot.value;
      const origin = muzzle.value;
      const pool = particles.value;
      const count = Math.round(COUNT_BASE + COUNT_PER_POWER * power);

      for (let i = 0; i < count; i++) {
        const particle = pool[cursor.value];
        cursor.value = (cursor.value + 1) % POOL_SIZE;

        const direction = (angle + (Math.random() - 0.5) * 2 * SPREAD_DEG) * DEG2RAD;
        const speed = (SPEED_BASE + SPEED_PER_POWER * power) * (0.7 + 0.3 * Math.random());

        particle.x = origin.x;
        particle.y = origin.y;
        particle.vx = Math.cos(direction) * speed;
        particle.vy = Math.sin(direction) * speed;
        particle.rot = Math.random() * Math.PI * 2;
        particle.rotV = (Math.random() - 0.5) * 12;
        particle.scale = 1 + Math.random() * 0.8;
        particle.colorIndex = Math.floor(Math.random() * PALETTE.length);
        particle.life = LIFE_BASE + Math.random() * LIFE_JITTER;
      }

      aliveCount.value = Math.min(POOL_SIZE, aliveCount.value + count);
      tick.value = tick.value + 1;
    }
  );

  /** 물리 적분. 살아있는 게 없으면 비용 0(스펙 §7). */
  useFrameCallback((frameInfo) => {
    if (aliveCount.value === 0) {
      return;
    }
    const dtMs = frameInfo.timeSincePreviousFrame;
    if (dtMs === null) {
      return;
    }
    /** 앱이 멈췄다 돌아온 프레임의 폭주 방지. */
    const dt = Math.min(dtMs, 64) / 1000;

    const pool = particles.value;
    const cullY = canvasSize.value.height + 60;
    let alive = 0;

    for (let i = 0; i < POOL_SIZE; i++) {
      const particle = pool[i];
      if (particle.life <= 0) {
        continue;
      }
      particle.life -= dt;
      particle.vx *= Math.max(0, 1 - DRAG * dt);
      particle.vy = particle.vy * Math.max(0, 1 - DRAG * dt) + GRAVITY * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rot += particle.rotV * dt;
      if (particle.y > cullY) {
        particle.life = 0;
        continue;
      }
      if (particle.life > 0) {
        alive++;
      }
    }

    aliveCount.value = alive;
    tick.value = tick.value + 1;
  });

  /**
   * 개체 변환. 회전이 스프라이트 중심을 축으로 돌도록 평행이동을 보정한다
   * (RSXform은 스프라이트 (0,0) 기준이다). 플러터는 회전 + 스케일 진동 —
   * RSXform이 균일 스케일만 주므로 종횡 눌림 대신 이걸로 낙엽 느낌을 낸다.
   */
  const transforms = useRSXformBuffer(POOL_SIZE, (xform, index) => {
    'worklet';
    void tick.value; // 매 프레임 재계산 트리거
    const particle = particles.value[index];
    if (particle.life <= 0) {
      xform.set(0, 0, 0, 0); // 스케일 0 — 그려지지 않는다
      return;
    }
    const flutter = 0.75 + 0.25 * Math.sin(particle.rot * 3);
    const scale = particle.scale * flutter;
    const scos = Math.cos(particle.rot) * scale;
    const ssin = Math.sin(particle.rot) * scale;
    const cx = SPRITE_W / 2;
    const cy = SPRITE_H / 2;
    xform.set(
      scos,
      ssin,
      particle.x - (scos * cx - ssin * cy),
      particle.y - (ssin * cx + scos * cy)
    );
  });

  /** 개체 색 + 수명 끝 페이드아웃. SkColor는 [r,g,b,a] Float32Array다. */
  const colors = useColorBuffer(POOL_SIZE, (color, index) => {
    'worklet';
    void tick.value;
    const particle = particles.value[index];
    const rgb = PALETTE[particle.colorIndex];
    color[0] = rgb[0];
    color[1] = rgb[1];
    color[2] = rgb[2];
    color[3] = particle.life <= 0 ? 0 : Math.min(1, particle.life / FADE_SECONDS);
  });

  return (
    <Atlas
      image={texture}
      sprites={SPRITES}
      transforms={transforms}
      colors={colors}
      colorBlendMode="srcIn"
    />
  );
}
```

- [ ] **Step 2: `index.tsx`에 연결**

`src/gimmicks/popper/index.tsx`에서:

(a) import 추가:

```tsx
import { Confetti } from './confetti';
```

(b) 자리 표시 주석을 실제 엘리먼트로 교체 — 기존:

```tsx
        {/* Task 4가 여기(포퍼 뒤)에 <Confetti>를 끼운다 — 포퍼가 항상 앞. */}
```

변경:

```tsx
        {/* 색종이 — 포퍼보다 뒤에 그려 포퍼가 항상 앞에 온다(스펙 §6). */}
        <Confetti shot={shot} muzzle={muzzle} canvasSize={canvasSize} />
```

(Task 3에서 `shot` prop·`muzzle` 선언을 미뤘다면 여기서 함께 추가한다.)

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 4: Commit**

```bash
git add src/gimmicks/popper/confetti.tsx src/gimmicks/popper/index.tsx
git commit -m "feat: 색종이 파티클 — 256 풀 링버퍼, 프레임 콜백 적분, Atlas 1콜"
```

---

### Task 5: 레지스트리 등록 + 문서

**Files:**
- Modify: `src/gimmicks/registry.ts` (popper 항목 + `BUNDLED_PRESETS` sling 분기)
- Modify: `stack.md` (§4 입력 모델 표 + 폴더 구조)

**Interfaces:**
- Consumes: Task 1의 `SlingHaptic`, Task 3~4의 `./popper` 모듈.
- Produces: 갤러리·기믹 화면에서 `popper`가 열린다.

- [ ] **Step 1: registry에 popper 항목 추가**

`src/gimmicks/registry.ts`의 `GIMMICKS` 배열, `bulb` 항목 뒤에:

```ts
  {
    id: 'popper',
    name: '파티 포퍼',
    kind: 'sling',
    /**
     * 당기는 동안 파워 비례 차징 럼블(연속 엔벨로프), 놓는 순간 펑.
     *
     * ⚠️ 미검증 값이다. 키캡·다이얼·전구와 같은 상태 — §10의 Live
     * Preview 절차는 실기기가 필요하다. fire 후보:
     *   balloonPop, burst, firecracker, explosion, snap
     * charge는 "당길수록 팽팽해진다"가 느껴질 때까지 범위를 조정한다.
     */
    haptic: {
      type: 'sling',
      charge: { minAmplitude: 0.1, maxAmplitude: 0.7, minFrequency: 0.2, maxFrequency: 0.6 },
      fire: { type: 'preset', name: 'balloonPop' },
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
```

- [ ] **Step 2: `BUNDLED_PRESETS`에 sling 분기 추가**

`registry.ts` 끝의 flatMap — 기존:

```ts
  return haptics.flatMap((haptic) => (haptic.type === 'preset' ? [haptic.name] : []));
```

변경:

```ts
  return haptics.flatMap((haptic) => {
    if (haptic.type === 'preset') {
      return [haptic.name];
    }
    /** sling은 fire 쪽에 프리셋이 숨어 있다 — 안 모으면 첫 펑이 씹힌다(§4 원칙 3). */
    if (haptic.type === 'sling' && haptic.fire.type === 'preset') {
      return [haptic.fire.name];
    }
    return [];
  });
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 통과. (`balloonPop`이 `PresetName`에 없으면 여기서 에러가 난다 — 그 경우 `node -e "const p=require('react-native-pulsar/src/Presets');"` 대신 `grep -n "balloonPop" node_modules/react-native-pulsar/src/Presets.ts`로 실제 이름을 확인해 바꾼다.)

- [ ] **Step 4: stack.md 갱신**

(a) §4 입력 모델 표(tug 행 뒤)에 행 추가:

```markdown
| **Sling** | 파티 포퍼, 새총 | 릴리스 순간 1회 + 당기는 동안 연속 변조 | `useRealtimeComposer` + `Presets.*()` |
```

(b) 표 아래 "Tug는 처음 4종에 없었고..." 단락 뒤에 한 줄 추가:

```markdown
Sling도 마찬가지로 파티 포퍼를 만들며 추가됐다 — 릴리스가 트리거이고 드래그가
각도·파워 payload를 만들어서 tug(당김 도중 임계값)와 다르다.
```

(c) §4 폴더 구조 트리의 `tug.tsx` 아래에 `sling.tsx` 추가:

```
      tug.tsx
      sling.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/gimmicks/registry.ts stack.md
git commit -m "feat: 파티 포퍼 레지스트리 등록 — sling 첫 기믹"
```

---

### Task 6: 시뮬레이터 검증

**Files:**
- Modify(임시 후 원복): `src/app/index.tsx`

시뮬레이터는 스크린샷만 되고 터치는 못 넣는다 — 화면 이동은 임시 Redirect로 한다(리포 메모리 참조). 검증 가능한 것은 **휴지 상태 레이아웃**(포퍼 생김새·배경·셸 크롬)뿐이고, 조준·발사·파티클·햅틱은 실기기 몫이다(스펙 §10).

- [ ] **Step 1: 임시 Redirect 추가**

`src/app/index.tsx`의 갤러리 컴포넌트(default export) 함수 첫 줄에 임시로:

```tsx
import { Redirect } from 'expo-router';
// ...
  return <Redirect href="/gimmick/popper" />; // TODO: 검증용 임시 — 커밋 금지
```

- [ ] **Step 2: 빌드 + 실행 + 스크린샷**

```bash
npm run ios:sim
# 앱이 뜨고 popper 화면으로 리다이렉트되면:
xcrun simctl io booted screenshot /tmp/popper-rest.png
```

Read 도구로 `/tmp/popper-rest.png`를 열어 확인:
- 어두운 남보라 배경이 화면 전체(상태바 아래까지)를 덮는가
- 하단 중앙에 색동 고깔(코랄 바탕 + 기울어진 줄무늬 3색 + 금색 림 + 손잡이)이 위를 향해 서 있는가
- 조준 점이 **안 보이는가** (파워 0 = 투명이 정상)
- 상단에 뒤로가기·카운트(0)·리셋 크롬이 보이는가

- [ ] **Step 3: Redirect 원복**

Step 1에서 넣은 import와 return 줄을 삭제. `git diff src/app/index.tsx`로 Task 1의 `KIND_LABELS` 변경만 남았는지 확인.

- [ ] **Step 4: 최종 typecheck**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 5: 스크린샷 결과 보고**

문제가 보이면(포퍼 위치·비율·색) 해당 상수(`PIVOT_FROM_BOTTOM`, 고깔 좌표, 팔레트)를 수정하고 재확인 후:

```bash
git add src/gimmicks/popper/index.tsx
git commit -m "fix: 포퍼 레이아웃 시뮬레이터 확인 반영"
```

(수정이 없으면 이 커밋은 생략.)

---

## 남는 것 (실기기 후속 — 스펙 §11)

- `balloonPop` 확정, charge 범위 튜닝, 파티클 물리 상수 튜닝, Atlas 256개 60fps 확인, minPower 불발 체감 확인. 전부 실기기 필요 — 이 계획의 범위 밖.
