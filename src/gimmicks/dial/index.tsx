import * as React from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { DetentedGimmick } from '@/gimmicks/_kinds/detented';
import type { GimmickScreenProps } from '@/gimmicks/types';

/**
 * 다이얼 — Detented 입력 모델. (§4)
 *
 * §1: 이 파일 안에서는 `className`을 쓰지 않는다. 드래그 중 매 프레임 회전이
 * 바뀌는 구간이다.
 *
 * 참고: Skia는 설치돼 있지만 여기선 쓰지 않는다. §2가 Skia에 배정한 역할은
 * 물리·그리기 기믹(스피너, 구슬)이고, 다이얼은 View 회전 하나로 끝난다.
 * 첫 Physics 기믹이 들어올 때 Skia가 등장한다.
 */
export default function Dial({ gimmick, onInteract }: GimmickScreenProps<'detented'>) {
  return (
    <View style={CONTAINER}>
      <DetentedGimmick haptic={gimmick.haptic} config={gimmick.config} onInteract={onInteract}>
        {({ angle }) => <Knob angle={angle} detentCount={gimmick.config.detentCount} />}
      </DetentedGimmick>
    </View>
  );
}

function Knob({ angle, detentCount }: { angle: SharedValue<number>; detentCount: number }) {
  /**
   * 손가락을 그대로 따라간다. 여기에 스프링이나 타이밍을 넣으면 안 된다 —
   * 눈금 햅틱은 실제 각도에서 발화하는데 화면이 뒤따라오면 손과 눈이
   * 어긋난다.
   */
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.value}deg` }],
  }));

  return (
    <View style={KNOB_WELL}>
      <Animated.View style={[KNOB, style]}>
        {/* 회전이 보이도록 하는 기준선. 눈금 자체는 아래 well에 그린다. */}
        <View style={KNOB_MARKER} />
      </Animated.View>
      <DetentTicks count={detentCount} />
    </View>
  );
}

/** 눈금 표시. 고정 요소라 매 프레임 다시 계산되지 않는다. */
const DetentTicks = React.memo(function DetentTicks({ count }: { count: number }) {
  const ticks = React.useMemo(
    () => Array.from({ length: count }, (_, index) => (index * 360) / count),
    [count]
  );

  return (
    <View style={TICKS_LAYER} pointerEvents="none">
      {ticks.map((rotation) => (
        <View key={rotation} style={[TICK_TRACK, { transform: [{ rotate: `${rotation}deg` }] }]}>
          <View style={TICK} />
        </View>
      ))}
    </View>
  );
});

const DIAL_SIZE = 260;
const KNOB_SIZE = 200;

const CONTAINER: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};

const KNOB_WELL: ViewStyle = {
  width: DIAL_SIZE,
  height: DIAL_SIZE,
  borderRadius: DIAL_SIZE / 2,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#f5f5f5',
  borderWidth: 1,
  borderColor: '#d4d4d4',
};

const KNOB: ViewStyle = {
  width: KNOB_SIZE,
  height: KNOB_SIZE,
  borderRadius: KNOB_SIZE / 2,
  backgroundColor: '#e5e5e5',
  borderWidth: 2,
  borderColor: '#a3a3a3',
  alignItems: 'center',
};

const KNOB_MARKER: ViewStyle = {
  width: 6,
  height: 34,
  borderRadius: 3,
  marginTop: 14,
  backgroundColor: '#525252',
};

const TICKS_LAYER: ViewStyle = {
  position: 'absolute',
  width: DIAL_SIZE,
  height: DIAL_SIZE,
  alignItems: 'center',
  justifyContent: 'center',
};

const TICK_TRACK: ViewStyle = {
  position: 'absolute',
  width: DIAL_SIZE,
  height: DIAL_SIZE,
  alignItems: 'center',
};

const TICK: ViewStyle = {
  width: 2,
  height: 10,
  marginTop: 3,
  borderRadius: 1,
  backgroundColor: '#a3a3a3',
};
