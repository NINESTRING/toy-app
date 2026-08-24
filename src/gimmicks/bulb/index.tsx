import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Line,
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
import {
  interpolateColor,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { TugGimmick } from '@/gimmicks/_kinds/tug';
import type { GimmickScreenProps } from '@/gimmicks/types';

/**
 * 전구 — Tug 입력 모델. (§4)
 *
 * 레퍼런스: jh3y의 Tuggable Light Bulb (codepen.io/jh3y/pen/VwjgdLj).
 * 풀코드를 잡아당기면 전구가 켜지고/꺼지고 배경이 화면 전체로 밝아진다.
 * 놓으면 줄이 스프링 오버슈트로 출렁이며 돌아온다 — 레퍼런스의 MorphSVG
 * 출렁임을 `_kinds/tug.tsx`의 복귀 스프링이 대신한다(스펙 §3).
 *
 * §1: 이 파일 안에서는 `className`을 쓰지 않는다.
 *
 * 왜 Skia인가: 키캡과 같은 이유다 — 배경을 소유하는 기믹이고, 글로우처럼
 * RN 뷰로는 양 OS가 같게 안 나오는 표현이 있다.
 */

/** 설계 좌표계. 캔버스는 화면 전체, 도형은 이 상자 기준으로 적는다. */
const DESIGN_W = 300;
const DESIGN_H = 460;

/** 유리알. */
const GLASS = { x: 150, y: 118, r: 62 };

/** 켜졌을 때 유리 뒤로 번지는 글로우. */
const GLOW_R = 95;
const GLOW_BLUR = 40;
const GLOW_MAX_OPACITY = 0.55;

/** 소켓 캡. 유리 아래를 살짝 덮는다. */
const CAP = { x: 124, y: 172, width: 52, height: 54, radius: 10 };

/** 줄의 시작(캡 바닥)과 휴지점 끝. `drag`는 끝점의 변위다. */
const CORD_ANCHOR = { x: 150, y: 226 };
const CORD_REST = { x: 150, y: 372 };
const CORD_WIDTH = 6;
const KNOT_R = 9;

/**
 * 줄이 당겨졌을 때 제어점이 변위의 반대쪽으로 처지는 비율. 스프링이
 * 오버슈트할 때 제어점이 교대로 반대편에 남으며 줄이 S자로 출렁인다.
 */
const CORD_BEND = 0.35;

/**
 * 조명 전환 시간. 실제 전구는 즉시 켜진다 — 길게 잡으면 그게 체감 지연으로
 * 읽힌다(§0). 0이 아닌 건 배경 전체가 한 프레임에 튀는 게 오히려 깜빡임으로
 * 보이기 때문.
 */
const LIGHT_MS = 120;

/**
 * 꺼짐 → 켜짐 색. 레퍼런스의 `--on` CSS 변수 계산식(hsl에 on을 섞는 것)을
 * 양 끝값으로 풀어둔 것이다. 중간은 `interpolateColor`가 만든다.
 */
const PALETTE = {
  backgroundTop: ['#232f36', '#f4e3b2'],
  backgroundBottom: ['#161d22', '#e7c684'],
  /** 줄·유리 테두리. 켜지면 어두워진다 — 밝은 배경 위에서 실루엣이 살게. */
  cord: ['#9aa0a3', '#262626'],
  glassFill: ['rgba(173, 216, 222, 0.10)', 'rgba(255, 224, 130, 0.55)'],
  filament: ['#4d4438', '#fff6d8'],
  cap: ['#5c6266', '#a9adb0'],
  shine: ['rgba(255, 255, 255, 0.75)', 'rgba(255, 255, 255, 0.28)'],
} as const;

const GLOW_COLOR = '#ffd97a';
/** 캡의 나사산 골. 양 상태에서 그늘로 읽히므로 보간하지 않는다. */
const CAP_RIDGE_COLOR = 'rgba(0, 0, 0, 0.25)';

/** 정적인 도형은 키캡처럼 미리 만든다 — 워크릿에서 만드는 건 줄뿐이다. */
const FILAMENT_PATH = Skia.PathBuilder.Make()
  .moveTo(140, 182)
  .lineTo(130, 142)
  .moveTo(160, 182)
  .lineTo(170, 142)
  .detach();

const SHINE_PATH = Skia.PathBuilder.Make()
  .addArc({ x: GLASS.x - 44, y: GLASS.y - 44, width: 88, height: 88 }, 190, 55)
  .detach();

export default function Bulb({ gimmick, variant, onInteract }: GimmickScreenProps<'tug'>) {
  return (
    <View style={CONTAINER}>
      <TugGimmick haptic={variant.haptic} config={gimmick.config} onInteract={onInteract}>
        {({ dragX, dragY, on }) => <BulbBody dragX={dragX} dragY={dragY} on={on} />}
      </TugGimmick>
    </View>
  );
}

type BodyProps = {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  on: SharedValue<number>;
};

function BulbBody({ dragX, dragY, on }: BodyProps) {
  /** 캔버스 실측 크기. 키캡과 같은 패턴 — `onSize`가 워크릿에서 채운다. */
  const canvasSize = useSharedValue<SkSize>({ width: 0, height: 0 });

  const backgroundWidth = useDerivedValue(() => canvasSize.value.width);
  const backgroundHeight = useDerivedValue(() => canvasSize.value.height);
  const gradientEnd = useDerivedValue(() => ({ x: 0, y: canvasSize.value.height }));

  /** 설계 좌표계를 캔버스 가운데로 옮긴다. */
  const centerTransform = useDerivedValue(() => [
    { translateX: (canvasSize.value.width - DESIGN_W) / 2 },
    { translateY: (canvasSize.value.height - DESIGN_H) / 2 },
  ]);

  /**
   * 조명 진행값. `on`은 임계값 통과 순간 0↔1로 튀고, 색은 이걸 120ms로
   * 따라간다. 햅틱·카운트는 `on`과 같은 순간에 이미 터져 있다(§0).
   */
  const progress = useSharedValue(0);

  useAnimatedReaction(
    () => on.value,
    (value) => {
      progress.value = withTiming(value, { duration: LIGHT_MS });
    }
  );

  const backgroundColors = useDerivedValue(() => [
    interpolateColor(progress.value, [0, 1], PALETTE.backgroundTop),
    interpolateColor(progress.value, [0, 1], PALETTE.backgroundBottom),
  ]);
  const cordColor = useDerivedValue(() =>
    interpolateColor(progress.value, [0, 1], PALETTE.cord)
  );
  const glassFillColor = useDerivedValue(() =>
    interpolateColor(progress.value, [0, 1], PALETTE.glassFill)
  );
  const filamentColor = useDerivedValue(() =>
    interpolateColor(progress.value, [0, 1], PALETTE.filament)
  );
  const capColor = useDerivedValue(() =>
    interpolateColor(progress.value, [0, 1], PALETTE.cap)
  );
  const shineColor = useDerivedValue(() =>
    interpolateColor(progress.value, [0, 1], PALETTE.shine)
  );
  const glowOpacity = useDerivedValue(() => progress.value * GLOW_MAX_OPACITY);

  /**
   * 줄. 앵커에서 끝점까지의 2차 베지어로, 제어점이 변위의 반대쪽으로
   * 처진다 — 복귀 스프링이 오버슈트할 때마다 줄이 교대로 휘며 출렁인다.
   *
   * 키캡은 "워크릿에서 Skia 객체를 만들지 않는다"를 지켰지만 그건 도형이
   * 전부 정적이라 가능했던 것이다. 줄은 형태 자체가 프레임마다 바뀌므로
   * 여기서 만든다. 세그먼트 2개짜리 경로 하나라 할당 비용은 무시할 수 있다.
   */
  const cordPath = useDerivedValue(() => {
    const endX = CORD_REST.x + dragX.value;
    const endY = CORD_REST.y + dragY.value;
    const controlX = (CORD_ANCHOR.x + endX) / 2 - dragX.value * CORD_BEND;
    const controlY = (CORD_ANCHOR.y + endY) / 2 - dragY.value * CORD_BEND;
    return Skia.PathBuilder.Make()
      .moveTo(CORD_ANCHOR.x, CORD_ANCHOR.y)
      .quadTo(controlX, controlY, endX, endY)
      .detach();
  });

  const knotX = useDerivedValue(() => CORD_REST.x + dragX.value);
  const knotY = useDerivedValue(() => CORD_REST.y + dragY.value);

  return (
    /**
     * 키캡과 같은 지뢰 주의: 스타일만 있는 루트 뷰는 Fabric이 flatten할 수
     * 있고, 그러면 GestureDetector가 엉뚱한 view tag에 붙는다.
     */
    <View style={BODY} collapsable={false}>
      <Canvas style={CANVAS} onSize={canvasSize}>
        {/* 배경은 캔버스 전체 — 즉 화면 전체를 덮는다. */}
        <Rect x={0} y={0} width={backgroundWidth} height={backgroundHeight}>
          <LinearGradient start={vec(0, 0)} end={gradientEnd} colors={backgroundColors} />
        </Rect>

        <Group transform={centerTransform}>
          {/* 글로우 — 꺼져 있으면 투명해서 없는 것과 같다. */}
          <Circle cx={GLASS.x} cy={GLASS.y} r={GLOW_R} color={GLOW_COLOR} opacity={glowOpacity}>
            <BlurMask blur={GLOW_BLUR} style="normal" />
          </Circle>

          {/* 유리 — 채움과 테두리. 테두리는 줄과 같은 색(레퍼런스의 --stroke). */}
          <Circle cx={GLASS.x} cy={GLASS.y} r={GLASS.r} color={glassFillColor} />
          <Circle
            cx={GLASS.x}
            cy={GLASS.y}
            r={GLASS.r}
            style="stroke"
            strokeWidth={5}
            color={cordColor}
          />

          {/* 필라멘트 — 아래쪽 끝은 캡이 덮는다. */}
          <Path
            path={FILAMENT_PATH}
            style="stroke"
            strokeWidth={4}
            strokeCap="round"
            color={filamentColor}
          />

          <Path
            path={SHINE_PATH}
            style="stroke"
            strokeWidth={10}
            strokeCap="round"
            color={shineColor}
          />

          {/* 소켓 캡 + 나사산 골 2줄. */}
          <RoundedRect
            x={CAP.x}
            y={CAP.y}
            width={CAP.width}
            height={CAP.height}
            r={CAP.radius}
            color={capColor}
          />
          <Line
            p1={vec(CAP.x + 6, CAP.y + 18)}
            p2={vec(CAP.x + CAP.width - 6, CAP.y + 18)}
            strokeWidth={3}
            color={CAP_RIDGE_COLOR}
          />
          <Line
            p1={vec(CAP.x + 6, CAP.y + 32)}
            p2={vec(CAP.x + CAP.width - 6, CAP.y + 32)}
            strokeWidth={3}
            color={CAP_RIDGE_COLOR}
          />

          {/* 풀코드. */}
          <Path
            path={cordPath}
            style="stroke"
            strokeWidth={CORD_WIDTH}
            strokeCap="round"
            color={cordColor}
          />
          <Circle cx={knotX} cy={knotY} r={KNOT_R} color={cordColor} />
        </Group>
      </Canvas>
    </View>
  );
}

/** 셸이 기믹에 콘텐츠 영역 전체를 준다. 배경이 화면을 채우려면 다 받아야 한다. */
const CONTAINER: ViewStyle = {
  flex: 1,
};

/**
 * 제스처를 받는 뷰. 화면 전체다 — 줄 끝만 잡게 하면 손가락에 가려 보이지도
 * 않는 9pt 원을 조준하게 된다. 피젯 토이에선 타깃이 큰 게 이득이다.
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
