import * as React from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';

import { DiscreteGimmick } from '@/gimmicks/_kinds/discrete';
import type { GimmickScreenProps } from '@/gimmicks/types';

/**
 * 클리커 — Discrete 입력 모델. (§4)
 *
 * §1: 이 파일 안에서는 `className`을 쓰지 않는다. 누르는 매 프레임 스타일이
 * 바뀌는 구간이라 Tailwind가 낄 자리가 없다. RNR과 Uniwind는 갤러리·설정
 * 화면까지만.
 */
export default function Clicker({ gimmick, onInteract }: GimmickScreenProps<'discrete'>) {
  return (
    <View style={CONTAINER}>
      <DiscreteGimmick haptic={gimmick.haptic} config={gimmick.config} onInteract={onInteract}>
        {({ pressed }) => <ClickerBody pressed={pressed} />}
      </DiscreteGimmick>
    </View>
  );
}

function ClickerBody({ pressed }: { pressed: SharedValue<number> }) {
  /**
   * 눌림 표현. 누르는 순간은 지연 없이 내려가고(0ms) 떼는 건 살짝 여운을
   * 준다 — 실제 버튼의 스프링 복귀에 가깝고, 무엇보다 누를 때 애니메이션을
   * 넣으면 그게 체감 지연으로 읽힌다. (§0)
   */
  const style = useAnimatedStyle(() => {
    const down = pressed.value === 1;
    return {
      transform: [{ scale: down ? 0.92 : withTiming(1, { duration: 90 }) }],
      backgroundColor: down ? '#d4d4d4' : withTiming('#e5e5e5', { duration: 90 }),
    };
  });

  return (
    <Animated.View style={[BUTTON, style]}>
      <View style={BUTTON_INNER} />
    </Animated.View>
  );
}

const CONTAINER: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};

const BUTTON: ViewStyle = {
  width: 220,
  height: 220,
  borderRadius: 110,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 2,
  borderColor: '#a3a3a3',
};

const BUTTON_INNER: ViewStyle = {
  width: 120,
  height: 120,
  borderRadius: 60,
  backgroundColor: '#fafafa',
  borderWidth: 1,
  borderColor: '#a3a3a3',
};
