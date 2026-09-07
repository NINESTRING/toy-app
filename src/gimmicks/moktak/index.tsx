import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Oval,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  Skia,
  vec,
  type SkSize,
} from '@shopify/react-native-skia';
import * as React from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { DiscreteGimmick } from '@/gimmicks/_kinds/discrete';
import type { GimmickScreenProps } from '@/gimmicks/types';
import { useGimmickCount } from '@/store/gimmickState';

import { lapsOf, progressOf, quoteIndexAt, remainingOf } from './cycle';
import { QUOTES, type Quote } from './quotes';

/**
 * 목탁 — Discrete 입력 모델. (§4, 스펙 2026-09-07)
 *
 * 목탁 몸통을 누르면 채가 즉시 내려와 치고, 손을 떼면 스프링으로 돌아온다.
 * 햅틱·카운트·소리는 터치 다운 순간(`_kinds/discrete.tsx`)이고 채 스윙은
 * 시각 연출이다. **몸통 위의 탭만 맞는다** — `hitTest`가 채·배경을 거른다.
 *
 * 위쪽에 108 카운트다운("N 남음", 진행 바, 바퀴 수). 전부 셸 카운트에서
 * 파생된다(`cycle.ts`).
 *
 * §1: 이 파일 안에서는 `className`을 쓰지 않는다. 텍스트는 RN `Text` +
 * 스타일 객체다.
 *
 * 왜 Skia인가: 키캡·전구·포퍼와 같다 — 배경을 소유하고, 양 OS가 같은 결과를
 * 내야 한다. 이미지 에셋 없이 전부 경로로 그린다.
 */

/** 설계 좌표계. 캔버스는 화면 전체, 도형은 이 상자 기준으로 적는다. */
const DESIGN_W = 320;
const DESIGN_H = 440;

/** 목탁 몸통 타원. 히트테스트도 이 값을 쓴다 — 보이는 것이 곧 맞는 영역. */
const BODY_SHAPE = { cx: 128, cy: 270, rx: 92, ry: 98 };

/** 위쪽 세로 홈. */
const SLIT = { x: 124, y: 176, width: 8, height: 70, r: 4 };

/** 앞면 구멍. */
const HOLE = { x: 100, y: 252, width: 44, height: 52 };

/** 아래 손잡이 고리. 몸통 뒤에 그려 겹치는 부분이 몸통에 가려진다. */
const RING = { cx: 96, cy: 392, outerR: 44, innerR: 24 };

/** 바닥 그림자. */
const FLOOR_SHADOW = { x: 53, y: 372, width: 150, height: 24, blur: 12 };

/**
 * 채. 위 끝이 회전축이고 그 축 기준 로컬 좌표로 그린다.
 * 휴지 각도는 몸통 반대쪽으로 살짝 기운 값, 타격 각도는 아래 끝이 몸통
 * 오른쪽 면에 닿는 값 — 팁 중심은 축에서 150 떨어져 있고(`tipY`), 몸통
 * 우측 가장자리(x≈208, y≈319)까지 sin⁻¹((268-221)/150) ≈ 0.32로 잡았다.
 * 실기기에서 미세 조정.
 */
const STICK = { pivotX: 268, pivotY: 160, shaftW: 12, shaftLen: 150, tipY: 150, tipR: 13 };
const REST_ANGLE = -0.12;
const STRIKE_ANGLE = 0.32;

/** 타격 순간 몸통이 눌리는 정도. */
const BODY_SQUASH = 0.03;

/**
 * 뗄 때의 복귀 스프링. 약한 오버슈트가 채의 반동이 된다 — 별도 반동
 * 애니메이션을 만들지 않는다(포퍼 포신, 전구 매듭과 같은 구조).
 *
 * ⚠️ 실기기 미검증. 출렁임이 과하면 damping ↑.
 */
const RETURN_SPRING = { damping: 12, stiffness: 220, mass: 1 };

/** 진행 바가 새 값으로 미끄러지는 시간. */
const PROGRESS_MS = 200;

/** 문구 카드 타이밍(스펙 §4): 페이드 300ms, 유지 4초. */
const CARD_FADE_MS = 300;
const CARD_HOLD_MS = 4000;
/** 나타날 때 아래에서 올라오는 거리(pt). */
const CARD_LIFT = 12;

/**
 * 팔레트. 목탁 전용 시각 정보라 컴포넌트가 갖는다(키캡 전례).
 * 배경은 한지색 단색이고 테마와 무관하다 — 기믹이 배경을 소유한다.
 */
const PALETTE = {
  background: '#f3ede1',
  /** 몸통 방사형 그라디언트: 밝은 면 → 중간 → 그늘. 중간이 갤러리 틴트의 출처. */
  woodLight: '#d07a48',
  wood: '#b5532b',
  woodDark: '#7a3416',
  /** 홈·구멍. */
  cavity: '#2b1408',
  /** 채. 몸통보다 밝은 나무. */
  stickLight: '#e6b37a',
  stick: '#d9a066',
  stickDark: '#b98246',
  floorShadow: 'rgba(0, 0, 0, 0.18)',
  /** 텍스트. */
  ink: '#3a2f27',
  inkMuted: '#8a7b6e',
  track: 'rgba(58, 47, 39, 0.12)',
  fill: '#b5532b',
};

const BODY_GRADIENT_COLORS = [PALETTE.woodLight, PALETTE.wood, PALETTE.woodDark];
const STICK_GRADIENT_COLORS = [PALETTE.stickLight, PALETTE.stick, PALETTE.stickDark];

/** 정적인 도형은 미리 만든다 — 워크릿에서 Skia 객체를 만들지 않는다. */
const RING_PATH = Skia.PathBuilder.Make()
  .addCircle(RING.cx, RING.cy, RING.outerR)
  .addCircle(RING.cx, RING.cy, RING.innerR)
  .detach();

export default function Moktak({ gimmick, variant, onInteract }: GimmickScreenProps<'discrete'>) {
  /**
   * 캔버스 실측 크기. 그림과 히트테스트가 같은 값을 봐야 눈에 보이는 몸통이
   * 곧 맞는 영역이 된다 — 전구가 `canGrab`을 위해 올린 것과 같은 이유.
   */
  const canvasSize = useSharedValue<SkSize>({ width: 0, height: 0 });

  /**
   * 몸통 타원 또는 손잡이 고리 안이면 맞는다. 채·배경·상단 정보는 빗나간다.
   * 루트 뷰 좌표 → 설계 좌표는 `centerTransform`의 역변환이다.
   */
  const hitTest = React.useCallback(
    (x: number, y: number) => {
      'worklet';
      const { width, height } = canvasSize.value;
      /** 레이아웃 전이면 목탁이 어디 있는지 모른다 — 그 터치는 빗나간 걸로. */
      if (width === 0 || height === 0) {
        return false;
      }
      const dx = x - (width - DESIGN_W) / 2;
      const dy = y - (height - DESIGN_H) / 2;
      const ex = (dx - BODY_SHAPE.cx) / BODY_SHAPE.rx;
      const ey = (dy - BODY_SHAPE.cy) / BODY_SHAPE.ry;
      if (ex * ex + ey * ey <= 1) {
        return true;
      }
      const rx = dx - RING.cx;
      const ry = dy - RING.cy;
      return rx * rx + ry * ry <= RING.outerR * RING.outerR;
    },
    [canvasSize]
  );

  const count = useGimmickCount(gimmick.id);

  return (
    <View style={CONTAINER}>
      <DiscreteGimmick
        haptic={variant.haptic}
        config={gimmick.config}
        onInteract={onInteract}
        hitTest={hitTest}>
        {({ pressed }) => <MoktakBody pressed={pressed} canvasSize={canvasSize} count={count} />}
      </DiscreteGimmick>
    </View>
  );
}

type BodyProps = {
  pressed: SharedValue<number>;
  canvasSize: SharedValue<SkSize>;
  /** 셸 카운트. 108 사이클은 전부 여기서 파생된다. */
  count: number;
};

function MoktakBody({ pressed, canvasSize, count }: BodyProps) {
  const backgroundWidth = useDerivedValue(() => canvasSize.value.width);
  const backgroundHeight = useDerivedValue(() => canvasSize.value.height);

  /** 설계 좌표계를 캔버스 가운데로 옮긴다. */
  const centerTransform = useDerivedValue(() => [
    { translateX: (canvasSize.value.width - DESIGN_W) / 2 },
    { translateY: (canvasSize.value.height - DESIGN_H) / 2 },
  ]);

  /**
   * 스윙 0~1. 누를 때 즉시 1(§0 — 누를 때 애니메이션은 체감 지연이다),
   * 뗄 때 스프링으로 0. 채 각도와 몸통 눌림이 여기서 파생된다.
   */
  const swing = useSharedValue(0);

  useAnimatedReaction(
    () => pressed.value,
    (value) => {
      if (value === 1) {
        cancelAnimation(swing);
        swing.value = 1;
      } else {
        swing.value = withSpring(0, RETURN_SPRING);
      }
    }
  );

  const stickTransform = useDerivedValue(() => [
    { translateX: STICK.pivotX },
    { translateY: STICK.pivotY },
    { rotate: REST_ANGLE + (STRIKE_ANGLE - REST_ANGLE) * swing.value },
  ]);

  const bodyTransform = useDerivedValue(() => [{ scale: 1 - BODY_SQUASH * swing.value }]);

  /** 진행 바. React 상태(count)가 바뀌면 200ms로 미끄러진다. */
  const progress = useSharedValue(progressOf(count));
  /** 마운트 시점 값으로 씨딩 — 진입 시엔 실제로 바뀐 게 없으니 미끄러질
   * 이유가 없다(QuoteCard의 F1 수정과 같은 이유). */
  const seenProgress = React.useRef(count);
  React.useEffect(() => {
    const previous = seenProgress.current;
    seenProgress.current = count;
    if (count === previous) {
      return;
    }
    progress.value = withTiming(progressOf(count), { duration: PROGRESS_MS });
  }, [count, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    /**
     * 키캡과 같은 지뢰 주의: 스타일만 있는 루트 뷰는 Fabric이 flatten할 수
     * 있고, 그러면 GestureDetector가 엉뚱한 view tag에 붙는다.
     */
    <View style={BODY} collapsable={false}>
      <Canvas style={CANVAS} onSize={canvasSize}>
        {/* 배경은 캔버스 전체 — 즉 화면 전체를 덮는다. */}
        <Rect
          x={0}
          y={0}
          width={backgroundWidth}
          height={backgroundHeight}
          color={PALETTE.background}
        />

        <Group transform={centerTransform}>
          {/* 바닥 그림자. 몸통보다 먼저 그려 뒤에 깔린다. */}
          <Oval
            x={FLOOR_SHADOW.x}
            y={FLOOR_SHADOW.y}
            width={FLOOR_SHADOW.width}
            height={FLOOR_SHADOW.height}
            color={PALETTE.floorShadow}>
            <BlurMask blur={FLOOR_SHADOW.blur} style="normal" />
          </Oval>

          {/* 손잡이 고리. 몸통 뒤. 두 원 + evenOdd로 구멍을 낸다. */}
          <Path path={RING_PATH} fillType="evenOdd">
            <LinearGradient
              start={vec(RING.cx - RING.outerR, RING.cy)}
              end={vec(RING.cx + RING.outerR, RING.cy)}
              colors={BODY_GRADIENT_COLORS}
            />
          </Path>

          {/* 몸통. 타격 순간 살짝 눌린다 — 중심 기준 scale. */}
          <Group transform={bodyTransform} origin={vec(BODY_SHAPE.cx, BODY_SHAPE.cy)}>
            <Oval
              x={BODY_SHAPE.cx - BODY_SHAPE.rx}
              y={BODY_SHAPE.cy - BODY_SHAPE.ry}
              width={BODY_SHAPE.rx * 2}
              height={BODY_SHAPE.ry * 2}>
              <RadialGradient
                c={vec(BODY_SHAPE.cx - 28, BODY_SHAPE.cy - 34)}
                r={150}
                colors={BODY_GRADIENT_COLORS}
              />
            </Oval>
            <RoundedRect
              x={SLIT.x}
              y={SLIT.y}
              width={SLIT.width}
              height={SLIT.height}
              r={SLIT.r}
              color={PALETTE.cavity}
            />
            <Oval
              x={HOLE.x}
              y={HOLE.y}
              width={HOLE.width}
              height={HOLE.height}
              color={PALETTE.cavity}
            />
          </Group>

          {/* 채. 위 끝이 축. 로컬 좌표는 축이 원점이다. */}
          <Group transform={stickTransform}>
            <RoundedRect
              x={-STICK.shaftW / 2}
              y={0}
              width={STICK.shaftW}
              height={STICK.shaftLen}
              r={STICK.shaftW / 2}>
              <LinearGradient
                start={vec(-STICK.shaftW / 2, 0)}
                end={vec(STICK.shaftW / 2, 0)}
                colors={STICK_GRADIENT_COLORS}
              />
            </RoundedRect>
            <Circle cx={0} cy={STICK.tipY} r={STICK.tipR}>
              <LinearGradient
                start={vec(-STICK.tipR, 0)}
                end={vec(STICK.tipR, 0)}
                colors={STICK_GRADIENT_COLORS}
              />
            </Circle>
          </Group>
        </Group>
      </Canvas>

      {/*
        텍스트는 RN 쪽이다. Skia 텍스트는 폰트 에셋을 요구하므로 피한다(키캡
        전례). 설계 상자와 같은 크기의 뷰를 BODY가 가운데 정렬해주므로 좌표를
        캔버스의 센터링 transform과 따로 계산할 필요가 없다.
      */}
      <View style={DESIGN_BOX} pointerEvents="none">
        <Text style={TITLE}>번뇌가 사라지는 중</Text>
        <View style={COUNT_ROW}>
          <Text style={REMAINING}>{remainingOf(count)}</Text>
          <Text style={REMAINING_UNIT}>남음</Text>
        </View>
        <View style={TRACK}>
          <Animated.View style={[FILL, fillStyle]} />
        </View>
        <Text style={SUBLINE}>
          총 {count.toLocaleString()}개 소멸 · {lapsOf(count)}바퀴 완주
        </Text>

        <QuoteCard count={count} />
      </View>
    </View>
  );
}

/**
 * 27타마다 뜨는 문구 카드. (스펙 §4)
 *
 * `count`가 바뀔 때 `quoteIndexAt`이 인덱스를 주면 문구를 갈고 페이드 인 →
 * 4초 유지 → 페이드 아웃. 표시 중에 다음 27이 오면 문구를 갈고 타이머를
 * 다시 잰다. `pointerEvents="none"` — 카드 아래 목탁을 치면 그대로 친다.
 *
 * 문구 선택이 결정적이라(카운트에서 계산) 같은 횟수에 같은 문구가 뜬다.
 */
function QuoteCard({ count }: { count: number }) {
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const opacity = useSharedValue(0);
  const lift = useSharedValue(CARD_LIFT);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 마운트 시점 값으로 씨딩 — 첫 커밋은 변화가 아니다(아래 참고). */
  const seen = React.useRef(count);

  React.useEffect(() => {
    /**
     * 마운트·재렌더는 타격이 아니다 — 카드는 27번째 타격의 보상이다. 갤러리가
     * 진입 전에 이미 카운트를 하이드레이트해두므로, 27의 배수를 들고
     * 화면에 들어오거나(딥링크로 0→N 하이드레이트) 부모 리렌더로 이 컴포넌트가
     * 다시 커밋돼도 `count`가 실제로는 안 바뀐 첫 실행에서 카드가 뜨면 안 된다.
     */
    const previous = seen.current;
    seen.current = count;
    if (count === previous) {
      return;
    }
    const index = quoteIndexAt(count, QUOTES.length);
    if (index === null) {
      return;
    }
    const next = QUOTES[index];
    if (next === undefined) {
      return;
    }
    setQuote(next);

    cancelAnimation(opacity);
    cancelAnimation(lift);
    opacity.value = withTiming(1, { duration: CARD_FADE_MS });
    lift.value = withTiming(0, { duration: CARD_FADE_MS });

    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      opacity.value = withTiming(0, { duration: CARD_FADE_MS });
      lift.value = withTiming(CARD_LIFT, { duration: CARD_FADE_MS });
    }, CARD_FADE_MS + CARD_HOLD_MS);
  }, [count, opacity, lift]);

  /** 언마운트 시 타이머 정리 — 화면을 떠난 뒤 shared value를 만지지 않는다. */
  React.useEffect(
    () => () => {
      if (hideTimer.current !== null) {
        clearTimeout(hideTimer.current);
      }
    },
    []
  );

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }],
  }));

  if (quote === null) {
    return null;
  }

  return (
    <Animated.View style={[CARD, cardStyle]} pointerEvents="none">
      <Text style={CARD_TEXT}>{quote.text}</Text>
      <Text style={CARD_SOURCE}>— {quote.source}</Text>
    </Animated.View>
  );
}

/** 셸이 기믹에 콘텐츠 영역 전체를 준다. 배경이 화면을 채우려면 다 받아야 한다. */
const CONTAINER: ViewStyle = {
  flex: 1,
};

/**
 * 제스처를 받는 뷰. 화면 전체다 — 판정은 `hitTest`가 하므로 뷰를 목탁
 * 크기로 줄일 필요가 없고, 배경 캔버스가 `pressed`를 읽으려면 같은 루트
 * 안에 있어야 한다.
 */
const BODY: ViewStyle = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
};

/** 캔버스는 BODY 전체를 덮는다. */
const CANVAS: ViewStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

/** 설계 좌표계와 같은 크기의 상자. 텍스트 좌표는 이 상자 기준이다. */
const DESIGN_BOX: ViewStyle = {
  width: DESIGN_W,
  height: DESIGN_H,
};

const TITLE: TextStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  textAlign: 'center',
  fontSize: 16,
  color: PALETTE.inkMuted,
};

const COUNT_ROW: ViewStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 22,
  flexDirection: 'row',
  alignItems: 'baseline',
  justifyContent: 'center',
  gap: 10,
};

const REMAINING: TextStyle = {
  fontSize: 64,
  fontWeight: '700',
  letterSpacing: -1,
  color: PALETTE.ink,
};

const REMAINING_UNIT: TextStyle = {
  fontSize: 20,
  fontWeight: '600',
  color: PALETTE.inkMuted,
};

const TRACK: ViewStyle = {
  position: 'absolute',
  left: 40,
  right: 40,
  top: 108,
  height: 8,
  borderRadius: 4,
  backgroundColor: PALETTE.track,
  overflow: 'hidden',
};

const FILL: ViewStyle = {
  height: '100%',
  borderRadius: 4,
  backgroundColor: PALETTE.fill,
};

const SUBLINE: TextStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 126,
  textAlign: 'center',
  fontSize: 14,
  color: PALETTE.inkMuted,
};

/**
 * 카드는 상단 정보 아래, 몸통 위쪽에 겹친다. 그림자는 iOS `shadow*` +
 * 안드로이드 `elevation` 둘 다 — 방향 없는 부드러운 그림자라 두 OS 차이가
 * 눈에 안 띈다(키캡이 Skia 그림자를 택한 이유였던 방향성이 여기엔 없다).
 */
const CARD: ViewStyle = {
  position: 'absolute',
  left: 8,
  right: 8,
  top: 156,
  paddingHorizontal: 20,
  paddingVertical: 18,
  borderRadius: 20,
  backgroundColor: '#ffffff',
  shadowColor: '#000000',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

const CARD_TEXT: TextStyle = {
  textAlign: 'center',
  fontSize: 17,
  lineHeight: 26,
  fontWeight: '600',
  color: PALETTE.ink,
};

const CARD_SOURCE: TextStyle = {
  marginTop: 8,
  textAlign: 'center',
  fontSize: 13,
  color: PALETTE.inkMuted,
};
