import {
  Box,
  BoxShadow,
  Canvas,
  Group,
  LinearGradient,
  Rect,
  RoundedRect,
  rect,
  rrect,
  vec,
} from '@shopify/react-native-skia';
import * as React from 'react';
import { View, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { DiscreteGimmick } from '@/gimmicks/_kinds/discrete';
import type { GimmickScreenProps } from '@/gimmicks/types';

import { paletteFor, type KeycapPalette } from './palette';

/**
 * 키캡 — Discrete 입력 모델. (§4)
 *
 * §4 표는 "키캡 패드"를 grid로 분류하지만 이건 키캡 하나다. 터치 다운 1회에
 * 햅틱 하나이므로 discrete이고, `_kinds/discrete.tsx`를 그대로 쓴다.
 *
 * §1: 이 파일 안에서는 `className`을 쓰지 않는다. 라벨도 RNR `Text`가 아니라
 * Reanimated의 `Animated.Text`를 쓴다 — RNR `Text`는 className을 쓴다.
 *
 * 왜 Skia인가: RN의 `shadowOffset`은 iOS 전용이라 방향 있는 그림자가
 * 안드로이드에서 사라진다. §0이 안드로이드를 우리 빈틈으로 지목한 앱에서
 * 그건 못 넘긴다. Skia는 양 OS가 같은 결과를 낸다. §4가 Skia에 배정한
 * "그리기" 용도에 해당한다.
 */

/** 캔버스 한 변. 다이얼(260)보다 크게 잡아 그림자가 잘리지 않게 한다. */
const SIZE = 300;

/** 키캡이 박힌 하우징. */
const HOUSING = { x: 74, y: 74, size: 152, radius: 20 };

/** 키캡 몸통(스커트). 이 아래쪽 측면이 두께로 읽힌다. */
const SKIRT = { x: 90, y: 84, size: 120, radius: 14 };

/**
 * 상판. 스커트보다 좁고 살짝 위에 앉는다 — 아래쪽에 남는 스커트가 키캡의
 * 앞면(경사)으로 읽힌다.
 */
const CAP_TOP = { x: 96, y: 86, width: 108, height: 104, radius: 10 };

/** 눌렸을 때 내려가는 거리(px). */
const PRESS_DEPTH = 7;

/** 그림자. 레퍼런스처럼 왼쪽 아래로 떨어지므로 dx가 음수다. */
const SHADOW_DX = -14;
const SHADOW_DY = 18;
const SHADOW_BLUR = 20;
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.42)';

/**
 * 뗄 때의 복귀 시간. 클리커와 같은 값이다 — 누를 때는 0ms로 즉시 내려가고
 * 뗄 때만 여운을 준다. 누를 때 애니메이션을 넣으면 그게 체감 지연으로
 * 읽힌다. (§0)
 */
const RELEASE_MS = 90;

/** 축을 바꿀 때 배경색이 넘어가는 시간. */
const BACKGROUND_FADE_MS = 220;

/** Skia에 넘길 도형은 미리 만들어둔다 — 워크릿에서 Skia 객체를 만들지 않는다. */
const SKIRT_BOX = rrect(rect(SKIRT.x, SKIRT.y, SKIRT.size, SKIRT.size), SKIRT.radius, SKIRT.radius);

export default function Keycap({ gimmick, variant, onInteract }: GimmickScreenProps<'discrete'>) {
  const { palettes, stops, activeIndex } = useVariantPalettes(gimmick, variant);

  return (
    <View style={CONTAINER}>
      <DiscreteGimmick haptic={variant.haptic} config={gimmick.config} onInteract={onInteract}>
        {({ pressed }) => (
          <KeycapBody
            pressed={pressed}
            palettes={palettes}
            stops={stops}
            activeIndex={activeIndex}
          />
        )}
      </DiscreteGimmick>
    </View>
  );
}

/**
 * 축 목록에서 보간용 팔레트 배열을 만든다.
 *
 * 색 전환을 "현재 축 인덱스"라는 숫자 하나로 다루면, 축이 몇 개든
 * `interpolateColor` 한 번으로 끝난다.
 */
function useVariantPalettes(
  gimmick: GimmickScreenProps<'discrete'>['gimmick'],
  variant: GimmickScreenProps<'discrete'>['variant']
) {
  return React.useMemo(() => {
    const ids = (gimmick.variants ?? []).map((candidate) => candidate.id);
    const list = ids.length > 0 ? ids : [variant.id];
    const palettes = list.map(paletteFor);

    /**
     * `interpolateColor`는 입력 구간이 2개 이상이어야 한다. 변형이 하나뿐인
     * 경우(또는 §7 OTA로 축이 빠진 경우) 같은 팔레트를 한 번 더 넣어
     * "변하지 않는 보간"으로 만든다.
     */
    if (palettes.length === 1) {
      palettes.push(palettes[0]);
    }

    return {
      palettes,
      stops: palettes.map((_, index) => index),
      /** 저장된 축이 목록에 없으면 첫 축으로 떨어진다. */
      activeIndex: Math.max(0, list.indexOf(variant.id)),
    };
  }, [gimmick.variants, variant.id]);
}

type BodyProps = {
  pressed: SharedValue<number>;
  palettes: KeycapPalette[];
  stops: number[];
  activeIndex: number;
};

function KeycapBody({ pressed, palettes, stops, activeIndex }: BodyProps) {
  /**
   * 눌린 깊이(px). `pressed`를 그대로 쓰지 않고 한 겹 두는 이유는 누를 때와
   * 뗄 때의 시간이 달라야 하기 때문이다 — 누를 때 즉시, 뗄 때 90ms. (§0)
   */
  const depth = useSharedValue(0);

  useAnimatedReaction(
    () => pressed.value,
    (value) => {
      depth.value = value === 1 ? PRESS_DEPTH : withTiming(0, { duration: RELEASE_MS });
    }
  );

  /** 축 전환용 진행값. 첫 렌더에서는 애니메이션 없이 현재 축에서 시작한다. */
  const progress = useSharedValue(activeIndex);
  const mounted = React.useRef(false);

  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    progress.value = withTiming(activeIndex, { duration: BACKGROUND_FADE_MS });
  }, [activeIndex, progress]);

  const backgroundColors = useDerivedValue(() => [
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.backgroundTop)
    ),
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.backgroundBottom)
    ),
  ]);

  const housingColor = useDerivedValue(() =>
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.housing)
    )
  );

  const skirtColor = useDerivedValue(() =>
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.capSkirt)
    )
  );

  const capTopColor = useDerivedValue(() =>
    interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.capTop)
    )
  );

  /** 키캡 전체가 내려간다. 하우징은 제자리에 있어 눌림이 보인다. */
  const capTransform = useDerivedValue(() => [{ translateY: depth.value }]);

  /**
   * 그림자는 Box의 자식이라 키캡과 함께 내려간다. 내려간 만큼 dy를 줄여
   * 바닥에 붙어 있게 만든다 — 결과적으로 키캡이 자기 그림자에 가까워진다.
   */
  const shadowDy = useDerivedValue(() => SHADOW_DY - depth.value);
  const shadowBlur = useDerivedValue(() => SHADOW_BLUR - depth.value * 0.8);

  /**
   * 라벨은 상판에 붙어 있어야 하므로 같은 깊이로 내린다. 색도 축에 따라
   * 바뀌는데, 캔버스 안의 색들과 달리 이건 Skia가 읽지 않으므로 워크릿
   * 값을 스타일로 옮긴다.
   */
  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: depth.value }],
    color: interpolateColor(
      progress.value,
      stops,
      palettes.map((palette) => palette.label)
    ),
  }));

  return (
    <View style={BODY} collapsable={false}>
      <Canvas style={CANVAS}>
        <Rect x={0} y={0} width={SIZE} height={SIZE}>
          <LinearGradient start={vec(0, 0)} end={vec(0, SIZE)} colors={backgroundColors} />
        </Rect>

        <RoundedRect
          x={HOUSING.x}
          y={HOUSING.y}
          width={HOUSING.size}
          height={HOUSING.size}
          r={HOUSING.radius}
          color={housingColor}
        />

        <Group transform={capTransform}>
          <Box box={SKIRT_BOX} color={skirtColor}>
            <BoxShadow dx={SHADOW_DX} dy={shadowDy} blur={shadowBlur} color={SHADOW_COLOR} />
          </Box>
          <RoundedRect
            x={CAP_TOP.x}
            y={CAP_TOP.y}
            width={CAP_TOP.width}
            height={CAP_TOP.height}
            r={CAP_TOP.radius}
            color={capTopColor}
          />
        </Group>
      </Canvas>

      {/* 캔버스 위에 얹는 라벨. Skia 텍스트는 폰트 에셋을 요구하므로 피한다. */}
      <Animated.Text style={[LABEL, labelStyle]}>Esc</Animated.Text>
    </View>
  );
}

const CONTAINER: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};

/**
 * 제스처를 받는 뷰. Canvas가 아니라 이 뷰가 터치를 받는다.
 *
 * `collapsable={false}`가 붙어 있는 이유(JSX 쪽): 이 뷰는 스타일이
 * width/height뿐이라 Fabric이 네이티브 뷰 계층에서 없앨 수 있다. 그러면
 * GestureDetector가 엉뚱한 view tag에 붙어 탭이 안 먹는다.
 *
 * GestureDetector도 자식에게 같은 prop을 주입하려 하지만, `_kinds/discrete.tsx`가
 * render-prop 구조라 그 자식이 `<View>`가 아니라 이 컴포넌트다 — 주입된 prop이
 * 컴포넌트에서 멈추고 실제 뷰까지 내려오지 않는다. 그래서 여기서 직접 붙인다.
 *
 * 클리커는 `backgroundColor`가 있어서 flatten 대상이 아니라 우연히 무사했다.
 * 앞으로 discrete 기믹을 추가할 때 루트가 스타일만 있는 뷰라면 같은 걸 붙여야 한다.
 */
const BODY: ViewStyle = {
  width: SIZE,
  height: SIZE,
};

const CANVAS: ViewStyle = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: SIZE,
  height: SIZE,
};

/**
 * 상판 중심(y ≈ 138)에 글자 중심을 맞춘 값. 상판 기하가 바뀌면 여기도 같이
 * 옮겨야 한다.
 *
 * `pointerEvents`를 스타일에 두는 이유: 라벨이 상판을 덮고 있어서 탭이
 * 라벨에 먹히면 딸깍이 안 난다.
 */
const LABEL: TextStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 124,
  textAlign: 'center',
  fontSize: 22,
  fontWeight: '600',
  letterSpacing: 0.5,
  pointerEvents: 'none',
};
