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

import { ConfettiAtlas, useConfetti } from './confetti';

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

/**
 * 포를 잡을 수 있는 여유(pt). 실루엣 바깥으로 이만큼 넓힌 곳까지 잡힌다.
 *
 * 밑동은 반폭이 12pt뿐이라 실루엣대로만 받으면 손가락으로 못 짚는다. 24를
 * 더하면 제일 좁은 밑동도 72pt 폭이 되어 최소 터치 타깃을 넘긴다.
 */
const GRAB_PADDING = 24;

/** 포의 로컬 y 범위. 위는 포구 림 끝, 아래는 손잡이 밑. */
const TIP_Y = -(CONE_LENGTH + 14);
const BUTT_Y = HANDLE.height;

function clamp01(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

/**
 * 포퍼 로컬 y에서의 실루엣 반폭(pt).
 *
 * 고깔은 밑동 12에서 포구 36으로 벌어지고 그 위에 반폭 42인 림이 얹힌다.
 * 판정은 그걸 밑동 12 → 끝 42의 곧은 사다리꼴로 근사한다 — 고깔 중간에서
 * 실제보다 3pt쯤 넓지만 `GRAB_PADDING`이 그보다 훨씬 크므로 의미가 없다.
 */
function popperHalfWidth(localY: number): number {
  'worklet';
  if (localY > 0) {
    return HANDLE.width / 2;
  }
  const towardTip = Math.min(1, localY / TIP_Y);
  return 12 + (RIM.width / 2 - 12) * towardTip;
}

export default function Popper({ gimmick, variant, onInteract }: GimmickScreenProps<'sling'>) {
  /**
   * 캔버스 실측 크기. 포의 화면 위치가 여기서 나오므로 그리기와 잡기 판정이
   * 같은 값을 봐야 한다 — 그래서 `PopperBody`가 아니라 여기서 소유하고 내려준다.
   */
  const canvasSize = useSharedValue<SkSize>({ width: 0, height: 0 });

  /**
   * 포를 짚은 터치만 조준을 시작한다.
   *
   * 터치를 포퍼 **로컬 좌표로 되돌려** 판정한다. 포는 조준각으로 회전하고
   * 당김만큼 눌려 있어서 화면 좌표에 고정된 상자로는 못 잡는다. 되돌리는
   * 식은 `popperTransform`의 정확한 역이다 — 그리는 쪽이 바뀌면 여기도
   * 같이 바뀌어야 한다.
   */
  const canGrab = React.useCallback(
    (x: number, y: number, angle: number, power: number) => {
      'worklet';
      const { width, height } = canvasSize.value;
      /** 레이아웃 전이면 포가 어디 있는지 모른다 — 그 터치는 안 잡힌 걸로. */
      if (width === 0 || height === 0) {
        return false;
      }

      /** `popperTransform`의 역: 피벗으로 옮기고, 조준각만큼 되돌리고, 눌림을 뺀다. */
      const rotation = (angle - REST_ANGLE) * DEG2RAD;
      const dx = x - width / 2;
      const dy = y - (height - PIVOT_FROM_BOTTOM);
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos - power * PULLBACK_MAX;

      if (localY < TIP_Y - GRAB_PADDING || localY > BUTT_Y + GRAB_PADDING) {
        return false;
      }
      /** 여유 상자 안에서 y를 실루엣 구간으로 자른 뒤 반폭을 잰다. */
      const clampedY = Math.min(BUTT_Y, Math.max(TIP_Y, localY));
      return Math.abs(localX) <= popperHalfWidth(clampedY) + GRAB_PADDING;
    },
    [canvasSize]
  );

  return (
    <View style={CONTAINER}>
      {/* `canGrab`: 포를 짚은 터치만 조준을 시작한다. 배경은 안 받는다. */}
      <SlingGimmick
        haptic={variant.haptic}
        config={gimmick.config}
        onInteract={onInteract}
        canGrab={canGrab}>
        {({ angle, power, shot }) => (
          <PopperBody angle={angle} power={power} shot={shot} canvasSize={canvasSize} />
        )}
      </SlingGimmick>
    </View>
  );
}

type BodyProps = {
  angle: SharedValue<number>;
  power: SharedValue<number>;
  shot: SharedValue<SlingShot>;
  /** 캔버스 실측 크기. 전구와 같은 패턴 — `onSize`가 워크릿에서 채운다. */
  canvasSize: SharedValue<SkSize>;
};

function PopperBody({ angle, power, shot, canvasSize }: BodyProps) {
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

  /**
   * 색종이 파티클. 훅이 Canvas 바깥(이 RN 트리)에서 돌아야 한다 — Skia는
   * Canvas 자식을 별도 reconciler 루트에 마운트하기 때문이다(confetti.tsx 참조).
   */
  const confetti = useConfetti({ shot, muzzle, canvasSize });

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

        {/* 색종이 — 포퍼보다 뒤에 그려 포퍼가 항상 앞에 온다(스펙 §6). */}
        <ConfettiAtlas {...confetti} />

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
 * 제스처를 받는 뷰. 배경이 화면 전체라 이 뷰도 화면 전체지만, **조준이
 * 시작되는 건 포를 짚었을 때뿐이다**(판정은 `canGrab`).
 *
 * 원래는 화면 아무 데나 눌러도 잡혔다. 근거는 "당길수록 손가락이 포에서
 * 멀어지는데 조준은 계속돼야 한다"였는데, 그건 **잡은 뒤**의 이야기이고
 * 시작 지점과는 상관이 없었다 — 잡은 다음에는 지금도 화면 끝까지 끌 수 있다.
 * 실제로 남은 건 배경 아무 데나 스쳐도 폭죽이 터지는 오발뿐이었다.
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
