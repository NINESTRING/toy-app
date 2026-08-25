import { Canvas, Circle, Group, RadialGradient, Shadow, vec } from '@shopify/react-native-skia';
import * as React from 'react';
import { View, type ViewStyle } from 'react-native';
import {
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
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
 * 밝은 회색 몸체 안쪽에서 마커 점이 돌고, 바깥 링의 불빛들이 그 점을 혜성
 * 꼬리처럼 따라온다. 누르면 몸체가 살짝 눌렸다가 놓으면 탄성으로 복귀한다.
 *
 * 원본·이전 버전과 다른 점:
 *
 * 1. 원본은 0~270° 클램프 노브지만 이 다이얼은 무한 회전이다. 불빛을 온전한
 *    원에 두고 마커가 계속 돈다.
 * 2. 이전 버전은 지나온 만큼 링이 **누적**으로 물들고 한 바퀴마다 리셋됐다
 *    (초록→노랑→빨강 램프). 지금은 누적이 아니라 마커 뒤를 따라오는 혜성
 *    꼬리다 — 링이 마커의 현재 위치를 말하지 지나온 총량을 말하지 않는다.
 *    자리마다 고정이던 램프 색도 지날 때마다 새로 뽑는 색이 됐다.
 * 3. 꼬리는 **회전 속력**을 탄다. 멈추면 통째로 꺼지고, 빠를수록 길어진다.
 *    링이 상태 표시가 아니라 지금 손이 하고 있는 일의 반영이 된다.
 * 4. 카운트가 눈금 1칸당 1에서 **한 바퀴당 1**로 바뀌었다. 이건 여기가 아니라
 *    registry의 `detentsPerCount`와 `_kinds/detented.tsx`가 한다.
 *
 * §1: 이 파일 안에서는 `className`을 쓰지 않는다. 드래그 중 매 프레임 회전과
 * 색이 바뀌는 구간이다.
 *
 * 왜 Skia인가: 몸체의 라디얼 그라디언트와 부드러운 드롭섀도가 이 디자인의
 * 정체성인데, RN 뷰로는 양 OS가 같게 안 나온다. 전구·키캡과 같은 이유다.
 * (이전 View 회전 버전이 §2를 근거로 Skia를 피했지만, 그 근거는 "회전 하나로
 * 끝난다"였고 이 디자인은 아니다.)
 *
 * 레퍼런스에서 의도적으로 뺀 것: 불빛을 탭하면 그 자리로 점프하는 기능.
 * Detented 모델의 트리거는 드래그 회전이고, 점프는 눈금 여러 개를 한 번에
 * 건너뛰어 햅틱 정책(눈금당 1딸깍)과 충돌한다.
 */
export default function Dial({ gimmick, variant, onInteract }: GimmickScreenProps<'detented'>) {
  return (
    <View style={CONTAINER}>
      <DetentedGimmick haptic={variant.haptic} config={gimmick.config} onInteract={onInteract}>
        {({ angle, active }) => (
          <SoftDial angle={angle} active={active} detentCount={gimmick.config.detentCount} />
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
/** 불빛 링. 몸체 바깥이다. */
const LIGHT_ORBIT = 140;
const LIGHT_R = 3.5;
/** 켜진 불빛 뒤로 번지는 후광. */
const GLOW_R = 13;

/**
 * 꼬리 길이(불빛 개수) 범위. 회전이 빠를수록 길어진다.
 *
 * 32개 링에서 3이면 마커에 붙은 짧은 불티, 10이면 링의 1/3을 쓸고 가는
 * 혜성이다. 최소를 1~2로 두면 "꼬리"가 아니라 그냥 점 하나가 되어 방향이
 * 안 읽히고, 최대를 링의 절반 이상으로 두면 머리와 꼬리 끝이 만나 원형
 * 게이지처럼 보인다.
 */
const TRAIL_MIN = 3;
const TRAIL_MAX = 10;

/**
 * 이 속력(도/초)에서 불빛이 완전히 밝다. 32눈금 링에서 초당 3.5눈금쯤 —
 * "돌리고 있다"고 할 만한 제일 느린 속도다.
 *
 * 밝기와 꼬리 길이의 기준 속력을 따로 두는 게 중요하다. 하나로 묶으면 천천히
 * 돌릴 때 꼬리가 짧아지는 동시에 어두워져서 거의 안 보인다. 천천히 돌려도
 * 불빛은 또렷하고 꼬리만 짧은 게 맞다.
 */
const SPEED_FOR_FULL_LIGHT = 40;

/**
 * 이 속력(도/초) 아래로 떨어지면 불빛이 완전히 꺼진다. 초당 0.44눈금 —
 * 사실상 멈춘 것이다.
 *
 * 0이 아니라 바닥을 두는 이유: 지수 감쇠는 0에 닿지 않으므로 0을 기준으로
 * 삼으면 아주 희미한 잔광이 몇 초씩 남는다. 살살 돌리다 멈췄을 때 0.6초가
 * 걸리던 게 이것 때문이었다.
 *
 * **프레임 콜백이 자는 지점도 같은 값이다.** 끊기는 순간 이미 완전히 검으므로
 * 잘라도 눈에 안 보이고, 검은 링을 위해 프레임을 도는 낭비도 없앤다.
 */
const SPEED_FOR_DARK = 5;

/** 이 속력(도/초)에서 꼬리가 `TRAIL_MAX`가 된다. 초당 2.5바퀴. */
const SPEED_FOR_MAX_TAIL = 900;

/**
 * 속력이 붙고 빠지는 시간 상수(초). 붙는 쪽이 훨씬 짧다 — 돌리기 시작하면
 * 즉시 켜져야 하고(§0: 지연은 곧 손맛의 손실), 멈췄을 때만 여운이 남는다.
 *
 * 감쇠가 속력에 걸려 있어서 여운의 길이가 속도에 비례한다. 휙 돌리고 놓으면
 * 꼬리가 줄어들며 한참 사그라들고, 살살 돌리다 멈추면 곧바로 꺼진다 —
 * 실제 잔광이 그렇다.
 */
const ATTACK_TAU = 0.06;
const RELEASE_TAU = 0.13;

/** 앱이 멈췄다 돌아온 프레임의 폭주 방지 — 전구의 로프와 같은 클램프. */
const MAX_FRAME_MS = 64;

/**
 * 꼬리가 반대쪽으로 붙기까지 필요한 역주행 눈금 수.
 *
 * 없으면 안 된다. 손가락이 멈춘 순간의 미세한 떨림에도 진행 방향 부호가
 * 뒤집히고, 그때마다 꼬리가 링 반대편으로 순간이동해서 깜빡이는 것처럼 보인다.
 * 한 눈금 반쯤 되돌려야 방향을 바꾼 것으로 친다.
 */
const DIRECTION_HYSTERESIS_LIGHTS = 1.5;

/**
 * 0점의 각도(도, 화면 좌표계 시계방향). -90°는 12시 방향 — 원본의 135°
 * 시작은 270° 부채꼴이 아래쪽에 틈을 남기는 배치였고, 온전한 원에는 틈이
 * 없으므로 시계처럼 위에서 시작하는 게 자연스럽다. 마커의 0점도 여기다.
 */
const START_DEGREES = -90;

const BACKGROUND = '#dfdfdf';
/** 꺼진 불빛. 링의 자리를 늘 보여주는 바닥이라 배경보다 살짝만 어둡다. */
const LIGHT_OFF = '#d9d9d9';
const SHADOW_COLOR = 'rgba(105, 118, 131, 0.22)';

/**
 * 불빛이 켜질 때 뽑는 색 후보.
 *
 * 진짜 무작위 색상(hsl 난수)을 안 쓰는 이유는 두 가지다. 채도·명도가 제멋대로면
 * 밝은 회색 배경에서 안 보이는 색이 섞이고, 워크릿에서 매 프레임 색 문자열을
 * 만들면 그만큼이 다 쓰레기다. 미리 골라둔 선명한 색 중에서 뽑는다.
 *
 * 앞의 셋은 이전 버전의 초록→노랑→빨강 램프 색이다 — 링의 인상이 완전히
 * 남남이 되지 않게 남겨뒀다.
 */
const LIGHTS = [
  '#1DD1A1',
  '#FECA57',
  '#FF6B6B',
  '#48DBFB',
  '#5F27CD',
  '#FF9FF3',
  '#54A0FF',
  '#00D2D3',
  '#FF9F43',
  '#C56CF0',
] as const;

/**
 * 후광용 그라디언트 색쌍(중심 → 투명). `LIGHTS`와 인덱스가 같다.
 *
 * 미리 만들어 두는 게 중요하다. 워크릿은 배열을 **그대로 돌려주기만** 하므로
 * 프레임마다 새 배열이 안 생긴다.
 */
const GLOWS = [
  ['rgba(29, 209, 161, 0.55)', 'rgba(29, 209, 161, 0)'],
  ['rgba(254, 202, 87, 0.55)', 'rgba(254, 202, 87, 0)'],
  ['rgba(255, 107, 107, 0.55)', 'rgba(255, 107, 107, 0)'],
  ['rgba(72, 219, 251, 0.55)', 'rgba(72, 219, 251, 0)'],
  ['rgba(95, 39, 205, 0.55)', 'rgba(95, 39, 205, 0)'],
  ['rgba(255, 159, 243, 0.55)', 'rgba(255, 159, 243, 0)'],
  ['rgba(84, 160, 255, 0.55)', 'rgba(84, 160, 255, 0)'],
  ['rgba(0, 210, 211, 0.55)', 'rgba(0, 210, 211, 0)'],
  ['rgba(255, 159, 67, 0.55)', 'rgba(255, 159, 67, 0)'],
  ['rgba(197, 108, 240, 0.55)', 'rgba(197, 108, 240, 0)'],
];

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

/**
 * `index`번 자리가 지금 무슨 색인지 — `LIGHTS`의 인덱스로 돌려준다.
 *
 * `head`는 마커의 위치를 불빛 좌표로 나타낸 연속값이다(0이 12시, 1이 그 다음
 * 자리, 한 바퀴가 `lightCount`). `pass`는 마커가 이 자리를 지나간 횟수 —
 * 앞으로 돌면 늘고 뒤로 돌면 준다.
 *
 * **난수 대신 해시를 쓴다.** 셋 다 얻으려고 그랬다:
 *   1. 워크릿이 상태를 안 들어도 된다. 자리별 색을 배열에 들고 있으면 UI
 *      스레드에서 그걸 갱신하고 파생값을 깨우는 배관이 통째로 필요하다.
 *   2. 거꾸로 돌리면 아까 그 색이 그대로 돌아온다. 진짜 난수였다면 되감을
 *      때마다 지나온 자리들이 딴 색으로 튀어서 되돌린 느낌이 안 난다.
 *   3. 자리와 회차가 둘 다 섞여 들어가므로 이웃끼리도, 다음 바퀴에서도
 *      같은 색이 규칙적으로 반복되지 않는다.
 *
 * 상수 127.1 / 311.7 / 43758.5453은 셰이더에서 흔히 쓰는 해시 상수다. 이
 * 조합이 특별해서가 아니라 서로 무리수에 가까워 사인 곡선을 잘게 접기 때문이다.
 */
function lightIndexAt(index: number, head: number, lightCount: number): number {
  'worklet';
  const pass = Math.floor((head - index) / lightCount);
  const noise = Math.sin(index * 127.1 + pass * 311.7) * 43758.5453;
  return Math.floor((noise - Math.floor(noise)) * LIGHTS.length);
}

type SoftDialProps = {
  angle: SharedValue<number>;
  active: SharedValue<boolean>;
  detentCount: number;
};

function SoftDial({ angle, active, detentCount }: SoftDialProps) {
  /** 불빛 개수. 원이 닫혀 있어 자리 0이 곧 한 바퀴 자리이므로 detent 개수와 같다. */
  const lightCount = detentCount;
  const degreesPerLight = 360 / lightCount;

  /**
   * 마커 위치를 불빛 좌표로 옮긴 값. 링이 읽는 유일한 입력이다.
   *
   * 눈금 인덱스(`detent`)가 아니라 각도에서 바로 내는 게 중요하다. 인덱스는
   * 반올림된 값이라 그걸로 밝기를 만들면 꼬리가 한 칸씩 끊겨서 움직인다.
   * 연속값이면 꼬리가 마커에 붙어 미끄러진다.
   */
  const head = useDerivedValue(() => angle.value / degreesPerLight);

  /**
   * 진행 방향(+1 / -1). 꼬리가 마커의 어느 쪽에 붙을지를 정한다.
   *
   * `anchor`는 지금 방향으로 가장 멀리 간 지점이다. 계속 나아가면 같이 끌려가고,
   * 되돌아오기 시작하면 그 자리에 남아 얼마나 역주행했는지를 재는 자가 된다.
   */
  const direction = useSharedValue(1);
  const anchor = useSharedValue(0);

  useAnimatedReaction(
    () => angle.value,
    (current) => {
      const moved = current - anchor.value;
      if (moved * direction.value > 0) {
        anchor.value = current;
        return;
      }
      if (Math.abs(moved) >= degreesPerLight * DIRECTION_HYSTERESIS_LIGHTS) {
        direction.value = -direction.value;
        anchor.value = current;
      }
    }
  );

  /**
   * 회전 속력(도/초). **밝기와 꼬리 길이가 둘 다 여기서 나온다.**
   *
   * `angle`의 프레임 간 변화로 잰다 — detented가 `onUpdate` 안에서 이미
   * 각속도를 계산하지만 그건 못 쓴다. 손가락이 **움직일 때만** 갱신되므로
   * 손을 댄 채 멈추면 마지막 속도에 얼어붙고, 그러면 꼬리가 안 꺼진다.
   * 프레임을 기준으로 재면 "멈췄다"가 저절로 0이 된다.
   */
  const speed = useSharedValue(0);
  const previousAngle = useSharedValue(0);
  /** 참이면 프레임 콜백이 즉시 반환한다. 멈춰 있을 때 비용 0 — 전구의 줄과 같다. */
  const asleep = useSharedValue(false);

  /**
   * 깨우는 건 이것 하나다. 잠든 뒤 각도가 움직이려면 새 제스처가 있어야 하고
   * 그건 반드시 `active`를 세운다 — detented에는 관성 회전이 없다.
   *
   * 깨면서 기준 각도를 지금으로 맞춘다. 안 그러면 잠들기 직전 각도와의 차이가
   * 한 프레임 만에 속력으로 잡혀 꼬리가 튄다.
   */
  useAnimatedReaction(
    () => active.value,
    (isActive) => {
      if (isActive) {
        previousAngle.value = angle.value;
        asleep.value = false;
      }
    }
  );

  useFrameCallback((frameInfo) => {
    if (asleep.value) {
      return;
    }
    const dtMs = frameInfo.timeSincePreviousFrame;
    if (dtMs === null) {
      return;
    }
    const dt = Math.min(dtMs, MAX_FRAME_MS) / 1000;

    const measured = Math.abs(angle.value - previousAngle.value) / dt;
    previousAngle.value = angle.value;

    /**
     * 비대칭 1차 저역통과. 붙을 땐 `ATTACK_TAU`, 빠질 땐 `RELEASE_TAU`.
     * 프레임 간 각도차를 날것으로 쓰면 손 떨림에 꼬리 길이가 덜덜거린다.
     */
    const tau = measured > speed.value ? ATTACK_TAU : RELEASE_TAU;
    speed.value += (measured - speed.value) * (1 - Math.exp(-dt / tau));

    /** 이미 완전히 검은 지점이다(`SPEED_FOR_DARK` 주석). 여기서 끊고 잔다. */
    if (!active.value && speed.value < SPEED_FOR_DARK) {
      speed.value = 0;
      asleep.value = true;
    }
  });

  /**
   * 링 전체의 밝기 게이트. 멈추면 0 — 불빛이 통째로 꺼진다.
   *
   * `SPEED_FOR_DARK`에서 0, `SPEED_FOR_FULL_LIGHT`에서 1로 훑는다. 0에서
   * 시작하지 않는 이유는 그 상수 주석에.
   */
  const lit = useDerivedValue(() =>
    Math.min(
      1,
      Math.max(0, (speed.value - SPEED_FOR_DARK) / (SPEED_FOR_FULL_LIGHT - SPEED_FOR_DARK))
    )
  );

  /** 지금 꼬리 길이(불빛 개수). 빠를수록 길다. */
  const tail = useDerivedValue(
    () => TRAIL_MIN + (TRAIL_MAX - TRAIL_MIN) * Math.min(1, speed.value / SPEED_FOR_MAX_TAIL)
  );

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

  /**
   * 마커 색 = 지금 올라탄 불빛과 같은 색. 꼬리의 머리와 마커가 한 색이라
   * "이 점이 불빛을 켜면서 간다"로 읽힌다.
   *
   * 어느 자리에 올라탔는지는 진행 방향에 달렸다. 앞으로 갈 땐 방금 지나온
   * 자리(floor), 뒤로 갈 땐 방금 되돌아온 자리(ceil)가 꼬리의 머리다.
   */
  const markerColor = useDerivedValue(() => {
    const current = head.value;
    const nearest = direction.value > 0 ? Math.floor(current) : Math.ceil(current);
    const index = ((nearest % lightCount) + lightCount) % lightCount;
    return LIGHTS[lightIndexAt(index, current, lightCount)];
  });

  const markerStart = pointOnRing(MARKER_ORBIT, 0, lightCount);

  /** 자리 좌표는 개수가 바뀔 때만 다시 만든다. */
  const seats = React.useMemo(
    () =>
      Array.from({ length: lightCount }, (_, index) => ({
        index,
        ...pointOnRing(LIGHT_ORBIT, index, lightCount),
      })),
    [lightCount]
  );

  return (
    <Canvas style={CANVAS}>
      {/* 몸체와 마커가 한 덩어리로 눌린다. 불빛 링은 고정. */}
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

      {seats.map((seat) => (
        <Light
          key={seat.index}
          index={seat.index}
          x={seat.x}
          y={seat.y}
          lightCount={lightCount}
          head={head}
          direction={direction}
          lit={lit}
          tail={tail}
        />
      ))}
    </Canvas>
  );
}

/** 원 위 `index`번째 자리의 좌표. 화면 좌표계라 시계방향이 양의 각. */
function pointOnRing(radius: number, index: number, lightCount: number) {
  const step = 360 / lightCount;
  const radians = ((START_DEGREES + index * step) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(radians), y: CENTER + radius * Math.sin(radians) };
}

type LightProps = {
  index: number;
  x: number;
  y: number;
  lightCount: number;
  head: SharedValue<number>;
  direction: SharedValue<number>;
  /** 링 전체 밝기 게이트 0~1. 멈추면 0. */
  lit: SharedValue<number>;
  /** 지금 꼬리 길이(불빛 개수). */
  tail: SharedValue<number>;
};

/**
 * 불빛 하나. 자리는 고정이고 밝기와 색만 마커를 따라 바뀐다.
 *
 * 파생값이 자리마다 셋(색·후광색·밝기)이라 32자리면 96개다. 하나하나는
 * 사인 한 번과 나머지연산 몇 개뿐이라 전구의 로프 시뮬(마디 12개 × 제약 8회)
 * 보다 가볍다.
 */
const Light = React.memo(function Light({
  index,
  x,
  y,
  lightCount,
  head,
  direction,
  lit,
  tail,
}: LightProps) {
  const center = React.useMemo(() => vec(x, y), [x, y]);

  /**
   * 색은 `head`가 매 프레임 바뀌어도 마커가 이 자리를 넘는 순간에만 달라진다 —
   * `lightIndexAt`이 회차를 정수로 끊기 때문이다. 그래서 딸깍과 정확히 같은
   * 순간에 새 색이 켜진다.
   */
  const coreColor = useDerivedValue(() => LIGHTS[lightIndexAt(index, head.value, lightCount)]);
  const glowColors = useDerivedValue(() => GLOWS[lightIndexAt(index, head.value, lightCount)]);

  /**
   * 밝기 = 꼬리에서의 자리 × 링 전체 게이트.
   *
   * 마커에서 진행 방향 **뒤로** 몇 칸인지를 재고 `tail`칸에서 0이 된다.
   * 마커 앞쪽은 되감으면 링 한 바퀴만큼 뒤가 되므로 자연히 0이다.
   * 거기에 `lit`을 곱해서 다이얼이 멈추면 꼬리째 사라진다.
   */
  const brightness = useDerivedValue(() => {
    const behind = (head.value - index) * direction.value;
    const wrapped = ((behind % lightCount) + lightCount) % lightCount;
    return lit.value * Math.max(0, 1 - wrapped / tail.value);
  });

  return (
    <>
      {/* 꺼진 자리. 늘 깔려 있어 링의 눈금이 사라지지 않는다. */}
      <Circle cx={x} cy={y} r={LIGHT_R} color={LIGHT_OFF} />
      {/* 후광과 심지가 같은 밝기로 함께 뜬다 — 파생값 하나로 둘을 덮는다. */}
      <Group opacity={brightness}>
        <Circle cx={x} cy={y} r={GLOW_R}>
          <RadialGradient c={center} r={GLOW_R} colors={glowColors} />
        </Circle>
        <Circle cx={x} cy={y} r={LIGHT_R} color={coreColor} />
      </Group>
    </>
  );
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
