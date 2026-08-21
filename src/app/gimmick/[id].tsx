import { useKeepAwake } from 'expo-keep-awake';
import { Stack, useLocalSearchParams } from 'expo-router';
import { RotateCcwIcon } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { findGimmick } from '@/gimmicks/registry';
import type { Gimmick } from '@/gimmicks/types';
import { stopHaptics } from '@/haptics/engine';
import { useHapticCapability } from '@/haptics/useHapticCapability';
import { useGimmickCount, useGimmickStore } from '@/store/gimmickState';

/**
 * 기믹 화면.
 *
 * 이 파일은 앱 셸에 속한다(헤더, 카운트, 리셋 버튼) — 그래서 `className`을
 * 쓴다. 실제 기믹은 아래 `<Body>`로 lazy 로드되고, 그 안쪽에서는 §1 규칙대로
 * `className`이 등장하지 않는다.
 */
export default function GimmickScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gimmick = findGimmick(id);

  /** §2: 만지작거리는 동안 화면이 꺼지면 안 된다. */
  useKeepAwake();

  /** 화면을 떠날 때 진행 중인 햅틱을 끊는다. 엔진은 내리지 않는다. (§4 원칙 3) */
  React.useEffect(() => stopHaptics, []);

  if (!gimmick) {
    return (
      <>
        <Stack.Screen options={{ title: '없는 기믹' }} />
        <View className="flex-1 items-center justify-center p-4">
          <Text className="text-muted-foreground">기믹 “{id}”을 찾을 수 없습니다.</Text>
        </View>
      </>
    );
  }

  return <GimmickView gimmick={gimmick} />;
}

function GimmickView({ gimmick }: { gimmick: Gimmick }) {
  const hydrate = useGimmickStore((state) => state.hydrate);
  const interact = useGimmickStore((state) => state.interact);
  const reset = useGimmickStore((state) => state.reset);
  const count = useGimmickCount(gimmick.id);
  const capability = useHapticCapability();

  React.useEffect(() => {
    hydrate(gimmick.id);
  }, [hydrate, gimmick.id]);

  const onInteract = React.useCallback(() => {
    interact(gimmick.id);
  }, [interact, gimmick.id]);

  const onReset = React.useCallback(() => {
    reset(gimmick.id);
  }, [reset, gimmick.id]);

  /**
   * §4 원칙 2: `component`는 반드시 lazy. 기믹 30개 + Skia 씬이면 초기
   * 번들이 터진다. 진입한 지금 로드한다.
   *
   * 캐스팅이 하나 필요하다: `Gimmick`이 kind별 유니온이라 `component`도
   * 유니온이고, `React.lazy`는 유니온 시그니처를 못 받는다. kind ·
   * config · component가 서로 맞는다는 건 registry.ts의
   * `satisfies readonly Gimmick[]`이 이미 컴파일 타임에 보장하므로,
   * 여기 캐스팅은 그 보장을 통과시키는 것뿐이다.
   */
  const Body = React.useMemo(
    () => React.lazy(gimmick.component as () => Promise<{ default: GimmickBodyComponent }>),
    [gimmick]
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: gimmick.name,
          headerRight: () => (
            <Button onPressIn={onReset} size="icon" variant="ghost" className="ios:size-9 web:mx-4">
              {/* §5: 리셋 버튼 필수 — 다 터진 뽁뽁이는 쓸모가 없다. */}
              <Icon as={RotateCcwIcon} className="size-5" />
            </Button>
          ),
        }}
      />
      <View className="flex-1 items-center justify-center gap-8 p-4">
        {capability.needsFallback ? <HapticFallbackNotice /> : null}

        <React.Suspense fallback={<ActivityIndicator />}>
          <Body gimmick={gimmick} onInteract={onInteract} />
        </React.Suspense>

        <Text className="text-muted-foreground font-mono text-sm">{count.toLocaleString()}</Text>
      </View>
    </>
  );
}

type GimmickBodyComponent = React.ComponentType<{
  gimmick: Gimmick;
  onInteract: () => void;
}>;

/**
 * §5: 햅틱이 아예 안 나올 수 있다 — 저전력 모드, 설정에서 Taptic Engine 끔,
 * 저가 안드로이드 모터. 햅틱이 제품 자체인 앱이 아무 설명 없이 무반응이
 * 되는 게 최악이므로, 원인을 알 수 있을 때는 알려준다.
 *
 * TODO: 사운드/시각 폴백을 여기에 연결한다. 지금은 안내만 — 사운드 에셋이
 * 아직 없다(`src/audio/pool.ts`는 준비돼 있음).
 */
function HapticFallbackNotice() {
  return (
    <View className="bg-muted w-full rounded-md p-3">
      <Text className="text-muted-foreground text-center text-xs">
        진동이 약하거나 꺼져 있을 수 있습니다. 저전력 모드를 끄면 손맛이 살아납니다.
      </Text>
    </View>
  );
}
