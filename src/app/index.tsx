import { Link, Stack } from 'expo-router';
import { ChevronRightIcon, MoonStarIcon, SunIcon } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { Uniwind, useUniwind } from 'uniwind';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { GIMMICKS } from '@/gimmicks/registry';
import type { Gimmick } from '@/gimmicks/types';
import { useGimmickCount } from '@/store/gimmickState';

/**
 * 갤러리. 앱 셸이므로 RNR + `className`을 쓴다. (§1)
 *
 * 기믹 화면과 달리 여기는 매 프레임 스타일이 바뀌지 않으므로 Tailwind가
 * 제 역할을 한다.
 *
 * §2: 캐러셀 라이브러리는 쓰지 않는다 — RNR 카드 + FlashList로 충분.
 * 지금은 기믹이 2개라 ScrollView로 둔다. 목록이 길어지면 FlashList로 바꾼다.
 */

const SCREEN_OPTIONS = {
  title: '만지작',
  headerRight: () => <ThemeToggle />,
};

export default function GalleryScreen() {
  return (
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
      <ScrollView contentContainerClassName="gap-3 p-4">
        <Text className="text-muted-foreground text-sm">손이 심심할 때</Text>
        {GIMMICKS.map((gimmick) => (
          <GimmickCard key={gimmick.id} gimmick={gimmick} />
        ))}
      </ScrollView>
    </>
  );
}

/**
 * §4 원칙 2: 갤러리에선 썸네일만. 카드는 기믹 컴포넌트를 import하지 않는다 —
 * 여기서 import하면 lazy가 무의미해지고 초기 번들에 Skia 씬까지 딸려온다.
 */
function GimmickCard({ gimmick }: { gimmick: Gimmick }) {
  const count = useGimmickCount(gimmick.id);

  return (
    <Link href={{ pathname: '/gimmick/[id]', params: { id: gimmick.id } }} asChild>
      <Button variant="outline" className="h-auto flex-row items-center justify-between gap-3 p-4">
        <View className="flex-1 items-start gap-1">
          <Text className="text-base font-medium">{gimmick.name}</Text>
          <Text className="text-muted-foreground text-xs">
            {KIND_LABELS[gimmick.kind]}
            {count > 0 ? ` · ${count.toLocaleString()}회` : ''}
          </Text>
        </View>
        <Icon as={ChevronRightIcon} className="text-muted-foreground size-5" />
      </Button>
    </Link>
  );
}

/** 입력 모델 이름. §4의 분류를 사용자에게 그대로 보여준다. */
const KIND_LABELS: Record<Gimmick['kind'], string> = {
  discrete: '누르기',
  detented: '돌리기',
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
      variant="ghost"
      className="ios:size-9 web:mx-4 rounded-full">
      <Icon as={THEME_ICONS[theme ?? 'light']} className="size-5" />
    </Button>
  );
}
