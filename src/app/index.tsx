import { Link, Stack } from 'expo-router';
import { MoonStarIcon, SunIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Uniwind, useUniwind } from 'uniwind';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { GIMMICKS } from '@/gimmicks/registry';
import type { Gimmick } from '@/gimmicks/types';
import { resolvePreset, type PresetName } from '@/haptics/presets';
import { cn } from '@/lib/utils';
import { useGimmickCount, useGimmickStore } from '@/store/gimmickState';

/**
 * 갤러리. 앱 셸이므로 RNR + `className`을 쓴다. (§1)
 *
 * 잠금화면 월페이퍼처럼 보이게 만든다 — 짙은 초록 배경, 가늘고 큰 숫자, 그
 * 아래로 살짝 기울어진 둥근 색 띠가 층층이 겹쳐 내려온다. 띠 하나가 기믹
 * 하나다. 설계: `docs/superpowers/specs/2026-09-09-gallery-wallpaper-stack-design.md`
 *
 * 매 프레임 스타일이 바뀌지 않으므로 색·글자는 Tailwind가, 띠의 기하(폭·높이·
 * 겹침·회전)는 `style`이 맡는다. 화면 폭에 따라 계산되는 값이라 클래스로 적을
 * 수 없다. 눌림 스케일만 shared value다 — 아래 `GimmickBand`.
 *
 * §2: 캐러셀 라이브러리는 쓰지 않는다. 기믹 5개라 ScrollView로 둔다. 띠는
 * 하나가 104pt를 차지하므로 한 화면에 6개쯤 들어간다.
 */

/**
 * 네이티브 헤더를 끈다. 기믹 화면도 `headerShown: false`이므로 앱 전체가
 * 네이티브 헤더 없이 굴러간다. 대가로 상단 인셋을 직접 넣어야 한다.
 */
const SCREEN_OPTIONS = { headerShown: false };

/**
 * 월페이퍼 팔레트(`global.css`의 `@theme`). 라이트는 크림 바탕에 숲 초록 글자,
 * 다크는 그 반대다. 띠 색은 아래 `STOPS`.
 */
const SCREEN_BG = 'bg-cream-100 dark:bg-forest-950';
const INK = 'text-forest-950 dark:text-cream-100';
const INK_SOFT = 'text-forest-950/60 dark:text-cream-100/70';
const RULE = 'bg-forest-950/30 dark:bg-cream-100/40';

export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const hydrate = useGimmickStore((state) => state.hydrate);

  /**
   * 갤러리도 카운트를 읽으므로 여기서 MMKV를 올린다.
   *
   * 없으면 **콜드 스타트 직후 모든 카운트가 0으로 보인다** — 기믹 화면이
   * `hydrate`를 부르기 때문에, 이 세션에 들어가 본 기믹만 숫자가 맞았다.
   * 띠는 0을 "아직 안 만져봤다"는 뜻으로 쓰므로(아래 `GimmickBand`) 그대로
   * 두면 1000번 만진 장난감에 "누르기"라고 적히고, 헤더의 총 횟수도 틀린다.
   *
   * MMKV 읽기는 동기이고 기믹 수만큼(지금 5번)이라 마운트 때 한 번 도는 건
   * 문제가 아니다. 이미 올라간 기믹은 `hydrate`가 자기 가드로 걸러낸다.
   */
  React.useEffect(() => {
    for (const gimmick of GIMMICKS) {
      hydrate(gimmick.id);
    }
  }, [hydrate]);

  const contentStyle = React.useMemo(
    () => ({ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }),
    [insets.top, insets.bottom]
  );

  return (
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
      <ScrollView className={cn('flex-1', SCREEN_BG)} contentContainerStyle={contentStyle}>
        <GalleryHeader />
        <BandStack />
      </ScrollView>
    </>
  );
}

// ---------------------------------------------------------------------------
// 헤더 — 라벨 · 큰 숫자 · 캡션
// ---------------------------------------------------------------------------

/**
 * 사진의 시계 자리에 모든 기믹을 만진 총 횟수가 온다. 이 앱에서 시간만큼
 * 자연스럽게 커지는 숫자가 이것이다.
 */
function useTotalCount(): number {
  return useGimmickStore((state) => {
    let sum = 0;
    for (const gimmick of GIMMICKS) {
      sum += state.states[gimmick.id]?.count ?? 0;
    }
    return sum;
  });
}

function GalleryHeader() {
  const total = useTotalCount();

  return (
    <View className="gap-1 px-6 pb-4">
      <View className="flex-row items-center justify-between">
        <Text className={cn('text-sm tracking-widest', INK_SOFT)}>토이앱</Text>
        <ThemeToggle />
      </View>
      {/*
        가늘고 크게. 7자리를 넘으면 폭을 넘치므로 글자 크기를 줄여 한 줄에
        맞춘다 — 숫자가 두 줄로 꺾이는 것보다 낫다.
      */}
      <Text
        className={cn('text-8xl leading-none font-extralight tracking-tighter', INK)}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {total.toLocaleString()}
      </Text>
      {/* 사진처럼 캡션 위아래에 서로 어긋난 가는 선. */}
      <View className="gap-1.5 pt-2">
        <View className={cn('h-px w-2/5', RULE)} />
        <Text className={cn('text-xs tracking-widest', INK_SOFT)}>모두 만진 횟수</Text>
        <View className={cn('ml-24 h-px w-2/5', RULE)} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 띠 스택
// ---------------------------------------------------------------------------

/** 띠 하나의 높이. 다음 띠가 덮고 남는 위쪽 `BAND_STEP`만 보인다. */
const BAND_HEIGHT = 168;
/** 띠와 띠의 간격. 마지막 띠만 `BAND_HEIGHT` 전체가 보인다. */
const BAND_STEP = 104;
/** 오른쪽이 올라가는 기울기. 글자도 함께 기울어진다 — 사진이 그렇다. */
const BAND_TILT_DEG = -10;
/** 띠 사이의 틈. 배경색 테두리라 겹친 자리에서만 선으로 보인다. */
const BAND_GAP = 3;

/**
 * 위치별 띠 색. 다크는 배경(forest-950)에 가까운 짙은 초록에서 시작해 크림으로
 * 끊기고, 라이트는 배경(cream)에 가까운 sage에서 시작해 짙은 초록으로 끝난다.
 * 어느 테마든 배경과 가장 가까운 띠가 위에 온다.
 *
 * 리터럴 문자열이어야 한다 — Tailwind는 소스를 스캔해 쓰인 클래스만 만들므로
 * 조립한 클래스는 런타임에 색이 안 나온다. 기믹이 5개를 넘으면 처음부터 돈다.
 */
const STOPS = [
  { surface: 'bg-sage-200 dark:bg-forest-800', ink: 'text-forest-950 dark:text-cream-100' },
  { surface: 'bg-forest-600 dark:bg-forest-700', ink: 'text-cream-100' },
  { surface: 'bg-forest-700 dark:bg-forest-600', ink: 'text-cream-100' },
  { surface: 'bg-forest-800 dark:bg-sage-200', ink: 'text-cream-100 dark:text-forest-950' },
  { surface: 'bg-forest-950 dark:bg-cream-100', ink: 'text-cream-100 dark:text-forest-950' },
] as const;

/** 틈 테두리는 화면 배경과 같은 색이어야 바깥 테두리가 보이지 않는다. */
const GAP_BORDER = 'border-cream-100 dark:border-forest-950';

function BandStack() {
  const { width } = useWindowDimensions();

  /**
   * 회전한 띠의 끝이 자기 박스 위아래로 튀어나오는 높이. 첫 띠의 오른쪽 끝이
   * 헤더를 침범하지 않고 마지막 띠의 왼쪽 끝이 잘리지 않게 그만큼 패딩을 준다.
   * 좌우로 튀어나온 모서리는 ScrollView가 자른다 — 사진에서 띠 끝이 화면
   * 밖으로 잘리는 것과 같다.
   */
  const lift = Math.ceil((width / 2) * Math.sin((Math.abs(BAND_TILT_DEG) * Math.PI) / 180));
  const stackStyle = React.useMemo(() => ({ paddingTop: lift, paddingBottom: lift }), [lift]);

  /**
   * `as const` 배열은 항목마다 리터럴 타입이라 한 번 넓혀 받는다 —
   * registry의 `ALL_GIMMICKS`와 같은 이유이고, 거기 주석에 자세히 있다.
   */
  const all: readonly Gimmick[] = GIMMICKS;

  return (
    <View style={stackStyle}>
      {all.map((gimmick, index) => (
        <GimmickBand key={gimmick.id} gimmick={gimmick} index={index} width={width} />
      ))}
    </View>
  );
}

/** 눌린 정도. 띠가 넓어 타일의 0.96은 과하다. */
const PRESSED_SCALE = 0.98;

/** 짧고 단단하게. 튕기면 장난감이 아니라 젤리가 된다. */
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.5 };

/**
 * 띠를 누를 때의 한 방. §0이 "햅틱이 곧 제품"이라고 한 앱에서 첫 화면이
 * 무반응인 건 어색하다 — 손맛이 갤러리에서부터 시작하는 게 맞다.
 *
 * ⚠️ **실기기 미검증.** 시뮬레이터에는 햅틱이 없다(§5). 후보: nudge, blip,
 * pip, poke, flick.
 */
const TILE_PRESET: PresetName = 'nudge';

/**
 * JS 스레드에서 부른다. Pulsar 프리셋은 내부가 네이티브 호출 하나뿐이고 여기는
 * `Pressable`의 JS 콜백이라 스레드 홉을 만들 이유가 없다. `useThrottledHaptic`도
 * 드래그용이라 쓰지 않는다. preload도 하지 않는다 — 앱 시작 직후의 preload가
 * 프리셋을 영구히 무음으로 만들었다(`haptics/engine.ts`).
 */
const fireBandHaptic = resolvePreset(TILE_PRESET);

const FILL = { flex: 1 };
const GAP_BORDER_WIDTH = { borderWidth: BAND_GAP };

/**
 * §4 원칙 2: 갤러리에선 썸네일만. 띠는 기믹 컴포넌트를 import하지 않는다 —
 * 겉모습은 registry의 `look.icon`과 위치별 `STOPS` 색에서만 온다.
 *
 * 구조: `Link asChild → Pressable(회전) → Animated.View(스케일) → 내용`.
 * 회전을 `Pressable`에 두는 이유는 터치 영역이 보이는 띠와 같이 돌아야 하기
 * 때문이다 — 안쪽에 두면 눌리는 사각형은 그대로인데 그림만 돈다. 스케일은
 * Reanimated가 갖고 Link의 `onPress` 주입은 Pressable에 남아 둘이 한 컴포넌트
 * 에서 만나지 않는다. 겹친 자리는 뒤에 그려지는(아래) 띠가 터치를 받는다.
 */
function GimmickBand({
  gimmick,
  index,
  width,
}: {
  gimmick: Gimmick;
  index: number;
  width: number;
}) {
  const count = useGimmickCount(gimmick.id);
  const stop = STOPS[index % STOPS.length];

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPressIn = React.useCallback(() => {
    scale.value = withSpring(PRESSED_SCALE, PRESS_SPRING);
    fireBandHaptic();
  }, [scale]);

  const onPressOut = React.useCallback(() => {
    scale.value = withSpring(1, PRESS_SPRING);
  }, [scale]);

  const bandStyle = React.useMemo(
    () => ({
      width,
      height: BAND_HEIGHT,
      marginTop: index === 0 ? 0 : BAND_STEP - BAND_HEIGHT,
      transform: [{ rotate: `${BAND_TILT_DEG}deg` }],
    }),
    [width, index]
  );

  return (
    <Link href={{ pathname: '/gimmick/[id]', params: { id: gimmick.id } }} asChild>
      <Pressable style={bandStyle} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Animated.View style={[FILL, pressStyle]}>
          {/*
            내용은 위쪽에 붙인다 — 다음 띠가 아래 64pt를 덮으므로 보이는 건
            위쪽 약 100pt다. 마지막 띠만 전체가 보인다.
          */}
          <View
            className={cn(
              'flex-1 flex-row items-start justify-between rounded-3xl px-7 pt-5',
              stop.surface,
              GAP_BORDER
            )}
            style={GAP_BORDER_WIDTH}>
            <View className="gap-0.5">
              <Text
                className={cn('text-2xl font-semibold tracking-tight', stop.ink)}
                numberOfLines={1}>
                {gimmick.name}
              </Text>
              {/*
                아직 안 만져본 장난감에는 횟수 대신 조작법을 보여준다. 한 번
                만지면 횟수로 바뀌므로 입력 모델 라벨은 첫 조작까지의 힌트다.
              */}
              <Text className={cn('text-sm opacity-70', stop.ink)}>
                {count > 0 ? `${count.toLocaleString()}회` : KIND_LABELS[gimmick.kind]}
              </Text>
            </View>
            <View className="opacity-80">
              <Icon as={gimmick.look.icon} className={cn('size-7', stop.ink)} />
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

// ---------------------------------------------------------------------------
// 테마 토글
// ---------------------------------------------------------------------------

const THEME_ICONS = {
  light: SunIcon,
  dark: MoonStarIcon,
};

/**
 * RNR `Button`을 쓰지 않는다 — `secondary` 변형은 무채색 시맨틱 토큰을 쓰는데
 * 월페이퍼 위에서는 회색 원이 되어 어색하다. 잉크색의 반투명 원으로 그린다.
 */
function ThemeToggle() {
  const { theme } = useUniwind();

  function toggleTheme() {
    Uniwind.setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <Pressable
      onPressIn={toggleTheme}
      className="bg-forest-950/10 dark:bg-cream-100/15 size-9 items-center justify-center rounded-full">
      <Icon as={THEME_ICONS[theme ?? 'light']} className={cn('size-5', INK)} />
    </Pressable>
  );
}
