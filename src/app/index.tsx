import { Link, Stack } from 'expo-router';
import { MoonStarIcon, SunIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Uniwind, useUniwind } from 'uniwind';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { GIMMICKS } from '@/gimmicks/registry';
import type { Gimmick } from '@/gimmicks/types';
import { resolvePreset, type PresetName } from '@/haptics/presets';
import { TINTS } from '@/lib/tints';
import { cn } from '@/lib/utils';
import { useGimmickCount, useGimmickStore } from '@/store/gimmickState';

/**
 * 갤러리. 앱 셸이므로 RNR + `className`을 쓴다. (§1)
 *
 * 기믹 화면과 달리 여기는 매 프레임 스타일이 바뀌지 않으므로 Tailwind가
 * 제 역할을 한다. 예외는 눌림 스케일 하나뿐이다 — 아래 `GimmickTile`.
 *
 * §2: 캐러셀 라이브러리는 쓰지 않는다 — RNR 카드 + FlashList로 충분.
 * 지금은 기믹이 4개라 ScrollView로 둔다. 목록이 길어지면 FlashList로 바꾼다.
 * 2열이 되면서 그 시점은 멀어졌다 — 같은 스크롤 길이가 기믹 두 배를 담는다.
 */

/**
 * 네이티브 헤더를 끈다. 기믹 화면도 `headerShown: false`이므로 앱 전체가
 * 네이티브 헤더 없이 굴러간다 — 구분선과 중앙 정렬 제목이 사라지고, 제목을
 * 화면 안에서 원하는 크기로 그릴 수 있다.
 *
 * 대가로 상단 인셋을 직접 넣어야 한다. 아래 `insets.top`.
 */
const SCREEN_OPTIONS = { headerShown: false };

export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const hydrate = useGimmickStore((state) => state.hydrate);

  /**
   * 갤러리도 카운트를 읽으므로 여기서 MMKV를 올린다.
   *
   * 없으면 **콜드 스타트 직후 모든 카운트가 0으로 보인다** — 기믹 화면이
   * `hydrate`를 부르기 때문에, 이 세션에 들어가 본 기믹만 숫자가 맞았다.
   * 예전 목록은 0일 때 "· 156회"를 그냥 안 붙여서 조용히 넘어갔지만, 타일은
   * 0을 "아직 안 만져봤다"는 뜻으로 쓰므로(아래 `GimmickTile`) 그대로 두면
   * 1000번 만진 장난감에 "누르기"라고 적힌다.
   *
   * MMKV 읽기는 동기이고 기믹 수만큼(지금 4번)이라 마운트 때 한 번 도는 건
   * 문제가 아니다. 이미 올라간 기믹은 `hydrate`가 자기 가드로 걸러낸다.
   */
  React.useEffect(() => {
    for (const gimmick of GIMMICKS) {
      hydrate(gimmick.id);
    }
  }, [hydrate]);

  /**
   * 헤더가 없으니 상태바·홈 인디케이터 여백을 직접 준다.
   *
   * Uniwind는 `contentContainerStyle`을 `[클래스에서 만든 스타일, 이 prop]`
   * 순서로 넘기므로 여기 값이 클래스를 이긴다(`uniwind/…/ScrollView`). 그래도
   * `px-4`와 겹치지 않게 세로만 여기서 준다 — 우선순위에 기대는 코드보다
   * 겹치지 않는 코드가 읽기 쉽다.
   */
  const contentStyle = React.useMemo(
    () => ({ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }),
    [insets.top, insets.bottom]
  );

  return (
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
      <ScrollView contentContainerClassName="gap-6 px-4" contentContainerStyle={contentStyle}>
        <GalleryHeader />
        <View className="gap-3">
          {TILE_ROWS.map((row) => (
            <View key={row[0].id} className="flex-row gap-3">
              {row.map((gimmick) => (
                <GimmickTile key={gimmick.id} gimmick={gimmick} />
              ))}
              {/*
                마지막 줄이 덜 찼을 때의 빈 자리. 이게 없으면 홀수 번째 기믹의
                타일이 줄을 독차지해 `aspect-square`가 화면 폭짜리 정사각형을
                만든다. 기믹이 4개인 지금은 안 쓰이지만, 5개가 되는 순간
                필요해지는 자리다.
              */}
              {row.length < TILE_COLUMNS ? <View className="flex-1" /> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

function GalleryHeader() {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="flex-1 text-3xl font-bold tracking-tight">토이앱</Text>
      <ThemeToggle />
    </View>
  );
}

const TILE_COLUMNS = 2;

/**
 * 타일을 2열로 끊어둔다. `flex-wrap` + 퍼센트 폭 대신 줄을 명시하는 이유는
 * 폭이 정확해지기 때문이다 — 각 타일이 `flex-1`이라 `gap`을 뺀 나머지를
 * 정확히 반씩 나눠 갖는다. 퍼센트로 하면 좁은 화면에서 gap과 경쟁한다.
 *
 * `GIMMICKS`가 정적이므로 모듈 로드 때 한 번 계산한다.
 */
const TILE_ROWS: readonly (readonly Gimmick[])[] = ((): Gimmick[][] => {
  /**
   * `as const` 배열은 항목마다 리터럴 타입이라 한 번 넓혀 받는다 —
   * registry의 `ALL_GIMMICKS`와 같은 이유이고, 거기 주석에 자세히 있다.
   */
  const all: readonly Gimmick[] = GIMMICKS;
  const rows: Gimmick[][] = [];
  for (const gimmick of all) {
    const last = rows[rows.length - 1];
    if (last !== undefined && last.length < TILE_COLUMNS) {
      last.push(gimmick);
    } else {
      rows.push([gimmick]);
    }
  }
  return rows;
})();

/** 눌린 정도. 0.96은 "손끝에 눌렸다"가 보이는 최소치 정도다. */
const PRESSED_SCALE = 0.96;

/** 짧고 단단하게. 튕기면 장난감이 아니라 젤리가 된다. */
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.5 };

/**
 * 타일을 누를 때의 한 방. §0이 "햅틱이 곧 제품"이라고 한 앱에서 첫 화면이
 * 무반응인 건 어색하다 — 손맛이 갤러리에서부터 시작하는 게 맞다.
 *
 * ⚠️ **실기기 미검증.** 시뮬레이터에는 햅틱이 없다(§5). registry가 미검증
 * 프리셋에 붙인 표시와 같은 뜻이고, 실기기에서 후보를 손으로 비교해 고쳐야
 * 한다. 후보: nudge, blip, pip, poke, flick.
 *
 * 무음 프리셋이 실재한다는 것도 함께 확인할 것 — `balloonPop`이 그랬다.
 */
const TILE_PRESET: PresetName = 'nudge';

/**
 * JS 스레드에서 부른다. Pulsar 프리셋은 내부가 `Pulsar_play(name)` 네이티브
 * 호출 하나뿐이고, `'worklet'` 지시자는 UI 스레드에서도 부를 수 있게 하는
 * 것이지 JS 스레드를 막는 게 아니다. 기믹들이 워크릿에서 부르는 건 제스처
 * 핸들러가 UI 스레드에 있기 때문이고, 여기는 `Pressable`의 JS 콜백이므로
 * 스레드 홉을 만들 이유가 없다.
 *
 * `useThrottledHaptic`도 쓰지 않는다. 그건 드래그 중 초당 수십 회를 스로틀하는
 * 장치다(§5의 초당 20회 드랍 한계). 타일 탭은 손가락이 한 번 닿는 것이라
 * 스로틀할 대상이 없다.
 *
 * preload도 하지 않는다 — 앱 시작 직후의 preload가 프리셋을 영구히 무음으로
 * 만들었다. 이유는 `haptics/engine.ts` 주석에.
 */
const fireTileHaptic = resolvePreset(TILE_PRESET);

/**
 * §4 원칙 2: 갤러리에선 썸네일만. 타일은 기믹 컴포넌트를 import하지 않는다 —
 * 여기서 import하면 lazy가 무의미해지고 초기 번들에 Skia 씬까지 딸려온다.
 *
 * 그래서 타일 안에서 실제 기믹이 움직이게 할 수는 없다. 겉모습은 registry의
 * `look`(아이콘 + 틴트 이름)에서만 온다.
 */
function GimmickTile({ gimmick }: { gimmick: Gimmick }) {
  const count = useGimmickCount(gimmick.id);
  const tint = TINTS[gimmick.look.tint];

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPressIn = React.useCallback(() => {
    scale.value = withSpring(PRESSED_SCALE, PRESS_SPRING);
    fireTileHaptic();
  }, [scale]);

  const onPressOut = React.useCallback(() => {
    scale.value = withSpring(1, PRESS_SPRING);
  }, [scale]);

  return (
    <Link href={{ pathname: '/gimmick/[id]', params: { id: gimmick.id } }} asChild>
      <Pressable className="flex-1" onPressIn={onPressIn} onPressOut={onPressOut}>
        {/*
          스케일은 `style`만 받는 이 `Animated.View`가 갖고, 타일의 생김새는
          안쪽 `View`가 `className`으로 갖는다. Uniwind가 Reanimated의
          컴포넌트를 알 필요가 없어지므로 둘이 서로를 안 건드린다.

          `Link asChild`가 자식을 복제해 `onPress`를 주입하는 대상도 바깥
          `Pressable`로 남는다 — 주입과 애니메이션이 같은 컴포넌트에서 만나지
          않는다.
        */}
        <Animated.View style={pressStyle}>
          <View
            className={cn('aspect-square justify-between rounded-2xl border p-4', tint.surface)}>
            <Icon as={gimmick.look.icon} className={cn('size-11', tint.icon)} />
            <View className="gap-0.5">
              <Text className="text-base font-semibold" numberOfLines={1}>
                {gimmick.name}
              </Text>
              {/*
                아직 안 만져본 장난감에는 횟수 대신 조작법을 보여준다. 타일은
                높이가 고정이라 이 줄이 비면 레이아웃이 뜨고, 0회라는 정보보다
                "어떻게 만지는 물건인가"가 그 자리에 쓸모 있다. 한 번 만지면
                횟수로 바뀌므로 입력 모델 라벨은 첫 조작까지의 힌트다.
              */}
              <Text className="text-muted-foreground text-xs">
                {count > 0 ? `${count.toLocaleString()}회` : KIND_LABELS[gimmick.kind]}
              </Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Link>
  );
}

/** 입력 모델 이름. §4의 분류를 사용자에게 그대로 보여준다. */
const KIND_LABELS: Record<Gimmick['kind'], string> = {
  discrete: '누르기',
  detented: '돌리기',
  tug: '당기기',
  sling: '쏘기',
};

const THEME_ICONS = {
  light: SunIcon,
  dark: MoonStarIcon,
};

function ThemeToggle() {
  const { theme } = useUniwind();

  function toggleTheme() {
    Uniwind.setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <Button
      onPressIn={toggleTheme}
      size="icon"
      variant="secondary"
      className="ios:size-9 rounded-full">
      <Icon as={THEME_ICONS[theme ?? 'light']} className="size-5" />
    </Button>
  );
}
