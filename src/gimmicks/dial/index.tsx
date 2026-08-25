import { Canvas, Circle, Group, RadialGradient, Shadow, vec } from '@shopify/react-native-skia';
import * as React from 'react';
import { View, type ViewStyle } from 'react-native';
import {
  Easing,
  interpolateColor,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { DetentedGimmick } from '@/gimmicks/_kinds/detented';
import type { GimmickScreenProps } from '@/gimmicks/types';

/**
 * 다이얼 — Detented 입력 모델. (§4)
 *
 * 레퍼런스: Chris Gannon의 Soft Dial (codepen.io/chrisgannon/pen/yLQyeEy).
 * 밝은 회색 몸체 안쪽에서 컬러 마커 점이 돌고, 바깥 링의 눈금 점들이 지나온
 * 만큼 초록→노랑→빨강 그라디언트로 물든다. 누르면 몸체가 살짝 눌렸다가
 * 놓으면 탄성으로 복귀한다.
 *
 * 원본과 다른 점 하나: 원본은 0~270° 클램프 노브지만 이 다이얼은 무한
 * 회전이다. 눈금 점을 온전한 원에 두고, 한 바퀴를 채우면 색이 리셋되어
 * 처음부터 다시 물든다. 거꾸로 돌려 0점을 지나면 반대로 가득 찬 상태에서
 * 줄어든다 — 랩어라운드의 자연스러운 귀결이다.
 *
 * §1: 이 파일 안에서는 `className`을 쓰지 않는다. 드래그 중 매 프레임 회전과
 * 색이 바뀌는 구간이다.
 *
 * 왜 Skia인가: 몸체의 라디얼 그라디언트와 부드러운 드롭섀도가 이 디자인의
 * 정체성인데, RN 뷰로는 양 OS가 같게 안 나온다. 전구·키캡과 같은 이유다.
 * (이전 View 회전 버전이 §2를 근거로 Skia를 피했지만, 그 근거는 "회전 하나로
 * 끝난다"였고 이 디자인은 아니다.)
 *
 * 레퍼런스에서 의도적으로 뺀 것: 눈금 점을 탭하면 그 자리로 점프하는 기능.
 * Detented 모델의 트리거는 드래그 회전이고, 점프는 눈금 여러 개를 한 번에
 * 건너뛰어 햅틱 정책(눈금당 1딸깍)과 충돌한다.
 */
export default function Dial({ gimmick, variant, onInteract }: GimmickScreenProps<'detented'>) {
  return (
    <View style={CONTAINER}>
      <DetentedGimmick haptic={variant.haptic} config={gimmick.config} onInteract={onInteract}>
        {({ angle, detent, active }) => (
          <SoftDial
            angle={angle}
            detent={detent}
            active={active}
            detentCount={gimmick.config.detentCount}
          />
        )}
      </DetentedGimmick>
    </View>
  );
}

/** 설계 좌표계. 캔버스는 이 정사각형이고 도형은 전부 중심 기준으로 적는다. */
const SIZE = 340;
const CENTER = SIZE / 2;
const CENTER_VEC = vec(CENTER, CENTER);

/** 몸체. 레퍼런스(r 130.76, viewBox 800×600)를 0.82배로 옮겼다. */
const BODY_R = 107;
/** 마커 점이 도는 궤도 반지름과 크기. 몸체 가장자리 안쪽이다. */
const MARKER_ORBIT = 71;
const MARKER_R = 7;
/** 눈금 점 링. 몸체 바깥이다. */
const TOOTH_ORBIT = 140;
const TOOTH_R = 3.5;

/**
 * 0점의 각도(도, 화면 좌표계 시계방향). -90°는 12시 방향 — 원본의 135°
 * 시작은 270° 부채꼴이 아래쪽에 틈을 남기는 배치였고, 온전한 원에는 틈이
 * 없으므로 시계처럼 위에서 시작하는 게 자연스럽다. 마커의 0점도 여기다.
 */
const START_DEGREES = -90;

const BACKGROUND = '#dfdfdf';
const TOOTH_GREY = '#d9d9d9';
/** 지나온 눈금이 물드는 색 램프. 초록 → 노랑 → 빨강. */
const RAMP = ['#1DD1A1', '#FECA57', '#FF6B6B'];
const SHADOW_COLOR = 'rgba(105, 118, 131, 0.22)';

/**
 * 몸체 그라디언트 2겹. 레퍼런스의 dialBody(중심을 살짝 아래로 둔 밝은 면) +
 * dialBody-2(중심을 살짝 위로 둔 가장자리 음영)를 그대로 옮겼다 — 두 겹이
 * 겹치며 위에서 빛을 받은 볼록한 면이 된다.
 */
const GRADIENT_R = BODY_R * 1.11;
const SHINE_CENTER = vec(CENTER, CENTER + 13);
const SHINE_COLORS = ['#f1f1f1', '#f1f1f1', '#ffffff'];
const SHINE_POSITIONS = [0, 0.78, 0.95];
const SHADE_CENTER = vec(CENTER, CENTER - 17);
const SHADE_COLORS = ['rgba(240, 240, 240, 0)', 'rgba(240, 240, 240, 0)', '#e5e5e5'];
const SHADE_POSITIONS = [0, 0.78, 0.96];

type SoftDialProps = {
  angle: SharedValue<number>;
  detent: SharedValue<number>;
  active: SharedValue<boolean>;
  detentCount: number;
};

function SoftDial({ angle, detent, active, detentCount }: SoftDialProps) {
  /** 눈금 점 개수. 원이 닫혀 있어 점 0이 곧 한 바퀴 자리이므로 detent 개수와 같다. */
  const teethCount = detentCount;

  /**
   * 색 전환용으로 부드럽게 만든 눈금 인덱스. 레퍼런스가 fill을 0.25초
   * 트윈으로 바꾸는 것에 대응한다 — 회전(`angle`)은 §1대로 손가락을
   * 즉시 따라가고, 색만 반 박자 늦게 따라온다.
   *
   * 무한 회전이라 detent가 무한히 쌓이므로 한 바퀴 안으로 되감는다.
   * 바퀴 경계(31→0)에서 트윈이 중간값을 훑으며 링이 좌르륵 비워지는데,
   * 리셋을 눈으로 따라갈 수 있어 오히려 낫다.
   */
  const litLevel = useDerivedValue(() => {
    const wrapped = ((detent.value % teethCount) + teethCount) % teethCount;
    return withTiming(wrapped, { duration: 200 });
  });

  /** 등장: 몸체가 0에서 펴진다. 레퍼런스의 initTl에 대응. */
  const entry = useSharedValue(0);
  React.useEffect(() => {
    entry.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.exp) });
  }, [entry]);

  /** 누르면 눌리고(빠른 감속) 놓으면 탄성으로 복귀. 레퍼런스의 onDial. */
  const press = useDerivedValue(() =>
    active.value
      ? withTiming(0.96, { duration: 350, easing: Easing.out(Easing.exp) })
      : withSpring(1, { damping: 9, stiffness: 160 })
  );
  const bodyTransform = useDerivedValue(() => [{ scale: entry.value * press.value }]);

  /**
   * 마커는 손가락을 그대로 따라간다. 여기에 스프링을 넣으면 안 된다 —
   * 눈금 햅틱은 실제 각도에서 발화하는데 화면이 뒤따라오면 손과 눈이
   * 어긋난다.
   */
  const markerTransform = useDerivedValue(() => [{ rotate: (angle.value * Math.PI) / 180 }]);

  /** 마커 색 = 현재 위치의 램프 색. 레퍼런스의 dialMarker fill. */
  const markerColor = useDerivedValue(() =>
    interpolateColor(litLevel.value / teethCount, [0, 0.5, 1], RAMP)
  );

  const markerStart = pointOnRing(MARKER_ORBIT, 0, teethCount);

  return (
    <Canvas style={CANVAS}>
      {/* 몸체와 마커가 한 덩어리로 눌린다. 눈금 링은 고정. */}
      <Group origin={CENTER_VEC} transform={bodyTransform}>
        <Circle c={CENTER_VEC} r={BODY_R}>
          <Shadow dx={0} dy={16} blur={12} color={SHADOW_COLOR} />
          <RadialGradient
            c={SHINE_CENTER}
            r={GRADIENT_R}
            colors={SHINE_COLORS}
            positions={SHINE_POSITIONS}
          />
        </Circle>
        <Circle c={CENTER_VEC} r={BODY_R}>
          <RadialGradient
            c={SHADE_CENTER}
            r={GRADIENT_R}
            colors={SHADE_COLORS}
            positions={SHADE_POSITIONS}
          />
        </Circle>
        <Group origin={CENTER_VEC} transform={markerTransform}>
          <Circle cx={markerStart.x} cy={markerStart.y} r={MARKER_R} color={markerColor} />
        </Group>
      </Group>

      {Array.from({ length: teethCount }, (_, index) => (
        <Tooth key={index} index={index} teethCount={teethCount} litLevel={litLevel} />
      ))}
    </Canvas>
  );
}

/** 원 위 `index`번째 자리의 좌표. 화면 좌표계라 시계방향이 양의 각. */
function pointOnRing(radius: number, index: number, teethCount: number) {
  const step = 360 / teethCount;
  const radians = ((START_DEGREES + index * step) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(radians), y: CENTER + radius * Math.sin(radians) };
}

type ToothProps = {
  index: number;
  teethCount: number;
  litLevel: SharedValue<number>;
};

/** 눈금 점 하나. 위치는 고정이고 색만 `litLevel`을 따라 물들거나 바랜다. */
const Tooth = React.memo(function Tooth({ index, teethCount, litLevel }: ToothProps) {
  const { x, y } = pointOnRing(TOOTH_ORBIT, index, teethCount);

  /** 이 눈금이 물들 때의 색. 자리마다 다르고 바뀌지 않으므로 JS에서 한 번. */
  const litColor = interpolateColor(index / teethCount, [0, 0.5, 1], RAMP);

  /**
   * 마커가 이 눈금(index)에 도달하면 1, 직전 눈금 아래면 0. `litLevel`이
   * 트윈이므로 그 사이에서 회색과 램프 색이 크로스페이드된다.
   */
  const color = useDerivedValue(() => {
    const lit = Math.min(1, Math.max(0, litLevel.value - (index - 1)));
    return interpolateColor(lit, [0, 1], [TOOTH_GREY, litColor]);
  });

  return <Circle cx={x} cy={y} r={TOOTH_R} color={color} />;
});

/** 셸이 기믹에 콘텐츠 영역 전체를 준다. 레퍼런스의 페이지 배경색을 소유한다. */
const CONTAINER: ViewStyle = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: BACKGROUND,
};

const CANVAS: ViewStyle = {
  width: SIZE,
  height: SIZE,
};
