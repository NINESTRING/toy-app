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

import { useCord } from './cord';
import { CORD_REST, CORD_WIDTH, KNOT_R, isCordTaut } from './cordPhysics';

/**
 * 전구 — Tug 입력 모델. (§4)
 *
 * 레퍼런스: jh3y의 Tuggable Light Bulb (codepen.io/jh3y/pen/VwjgdLj).
 * 풀코드를 임계값 너머로 당겼다 **놓으면** 전구가 켜지고/꺼지고 배경이
 * 화면 전체로 밝아진다.
 *
 * 놓으면 줄이 출렁이며 돌아온다. 레퍼런스의 MorphSVG 출렁임을 마디 12개
 * 로프 시뮬(`cordPhysics.ts`)이 대신한다 — 복귀 스프링은 매듭만 끌고,
 * 파형은 줄이 스스로 만든다(개정 스펙 §3).
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

/**
 * 매듭을 잡을 수 있는 반경(pt). 매듭 중심에서 잰다.
 *
 * 매듭 자체는 반지름 9pt라 그것만 노리게 하면 손가락에 가려 보이지도 않는
 * 걸 조준하게 된다 — 그래서 넉넉히 감싼다(지름 88pt). 그래도 유리알·캡과는
 * 겹치지 않는다: 매듭 휴지점 y=372에서 위로 44면 328이고 캡 바닥은 226이다.
 * 화면 전체를 받던 예전 동작에서 여기로 좁힌 이유는 아래 `BODY` 주석에.
 */
const GRAB_RADIUS = 44;

/**
 * 줄의 앵커·휴지점·굵기는 `cordPhysics.ts`에 있다 — 로프 시뮬이 그 값을
 * 소유하고 여기선 굵기만 받아 쓴다. **앵커(150, 226)는 아래 CAP의 바닥
 * 중앙이다.** CAP을 옮기면 거기도 같이 옮겨야 한다.
 */

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
  /**
   * 캔버스 실측 크기. 그리기만 쓸 때는 `BulbBody`가 갖고 있었는데, 이제
   * 잡기 판정도 설계 좌표 → 화면 좌표 변환이 필요해서 여기로 올렸다 —
   * 제스처와 그림이 같은 값을 봐야 매듭 그림 위를 눌렀을 때 잡힌다.
   */
  const canvasSize = useSharedValue<SkSize>({ width: 0, height: 0 });

  /**
   * 매듭 근처를 눌렀을 때만 잡힌다.
   *
   * 매듭의 화면 위치는 `centerTransform`(설계 상자를 캔버스 가운데로)과
   * 매듭의 설계 좌표(`CORD_REST` + 변위)를 합친 것이다. 그리는 쪽과 같은
   * 식을 쓰므로 눈에 보이는 매듭이 곧 판정 중심이다.
   */
  const canGrab = React.useCallback(
    (x: number, y: number, dragX: number, dragY: number) => {
      'worklet';
      const { width, height } = canvasSize.value;
      /** 레이아웃 전이면 매듭이 어디 있는지 모른다 — 그 터치는 안 잡힌 걸로. */
      if (width === 0 || height === 0) {
        return false;
      }
      const knotX = (width - DESIGN_W) / 2 + CORD_REST.x + dragX;
      const knotY = (height - DESIGN_H) / 2 + CORD_REST.y + dragY;
      return (x - knotX) ** 2 + (y - knotY) ** 2 <= GRAB_RADIUS ** 2;
    },
    [canvasSize]
  );

  return (
    <View style={CONTAINER}>
      {/*
        `canFire`: 줄이 늘어진 채로 놓으면 불발이다. 줄을 위로 밀어 올린
        상태라는 뜻이고, 실제 풀체인은 밀어서 안 걸린다 — 당겨야 걸린다.

        `canGrab`: 매듭 근처에서 시작한 터치만 줄을 잡는다.
      */}
      <TugGimmick
        haptic={variant.haptic}
        config={gimmick.config}
        onInteract={onInteract}
        canFire={isCordTaut}
        canGrab={canGrab}>
        {({ dragX, dragY, on, active }) => (
          <BulbBody dragX={dragX} dragY={dragY} on={on} active={active} canvasSize={canvasSize} />
        )}
      </TugGimmick>
    </View>
  );
}

type BodyProps = {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  on: SharedValue<number>;
  /** 로프 시뮬의 수면 게이트가 읽는다 — 드래그가 시작되면 깨운다. */
  active: SharedValue<boolean>;
  /** 캔버스 실측 크기. 키캡과 같은 패턴 — `onSize`가 워크릿에서 채운다. */
  canvasSize: SharedValue<SkSize>;
};

function BulbBody({ dragX, dragY, on, active, canvasSize }: BodyProps) {
  const backgroundWidth = useDerivedValue(() => canvasSize.value.width);
  const backgroundHeight = useDerivedValue(() => canvasSize.value.height);
  const gradientEnd = useDerivedValue(() => ({ x: 0, y: canvasSize.value.height }));

  /** 설계 좌표계를 캔버스 가운데로 옮긴다. */
  const centerTransform = useDerivedValue(() => [
    { translateX: (canvasSize.value.width - DESIGN_W) / 2 },
    { translateY: (canvasSize.value.height - DESIGN_H) / 2 },
  ]);

  /**
   * 조명 진행값. `on`은 손을 떼는 순간 0↔1로 튀고, 색은 이걸 120ms로
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
  const cordColor = useDerivedValue(() => interpolateColor(progress.value, [0, 1], PALETTE.cord));
  const glassFillColor = useDerivedValue(() =>
    interpolateColor(progress.value, [0, 1], PALETTE.glassFill)
  );
  const filamentColor = useDerivedValue(() =>
    interpolateColor(progress.value, [0, 1], PALETTE.filament)
  );
  const capColor = useDerivedValue(() => interpolateColor(progress.value, [0, 1], PALETTE.cap));
  const shineColor = useDerivedValue(() => interpolateColor(progress.value, [0, 1], PALETTE.shine));
  const glowOpacity = useDerivedValue(() => progress.value * GLOW_MAX_OPACITY);

  /**
   * 줄. 마디 12개 로프 체인이다 — 꼬리(매듭)는 tug의 복귀 스프링을 따라가고
   * 몸통은 관성으로 뒤처지며 파형을 만든다(개정 스펙 §3). 원래는 2차 베지에
   * 1개였는데 한쪽으로밖에 못 휘어서 출렁임이 "휘었다 펴졌다"로 읽혔다.
   */
  const { path: cordPath, knotX, knotY } = useCord({ dragX, dragY, active });

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
 * 제스처를 받는 뷰. 배경이 화면 전체라 이 뷰도 화면 전체지만, **잡히는 건
 * 매듭 반경 안뿐이다**(`GRAB_RADIUS`, 판정은 `canGrab`).
 *
 * 원래는 화면 아무 데나 끌어도 잡혔다 — 9pt 매듭을 조준시키느니 타깃이 큰
 * 게 낫다는 판단이었다. 실제로 써 보니 반대였다: 줄과 상관없는 곳을 쓸어도
 * 전구가 켜져서 인과가 끊긴다. 조준 문제는 타깃을 화면 전체로 키우는 대신
 * 매듭을 88pt로 감싸서 푼다.
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
