import '@/global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useUniwind } from 'uniwind';

import { configureAudioSession } from '@/audio/pool';
import { initHaptics } from '@/haptics/engine';
import { NAV_THEME } from '@/lib/theme';
import { flushPendingWrites } from '@/store/storage';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  const { theme } = useUniwind();

  /**
   * 햅틱 엔진은 앱 시작 시 한 번 올리고 내리지 않는다. (§4 원칙 3)
   * 기믹 전환마다 엔진을 새로 만들면 첫 딸깍이 씹힌다.
   *
   * 프리셋 preload는 여기서 하지 않는다 — 릴리스 빌드에서 그게 프리셋을
   * 무음으로 만들었다. 이유는 `initHaptics` 주석에.
   */
  React.useEffect(() => {
    initHaptics();
    void configureAudioSession();
  }, []);

  /**
   * 디바운스된 MMKV 쓰기를 앱이 백그라운드로 갈 때 확정한다. (§5)
   * 이게 없으면 카운트의 마지막 몇 백 ms가 날아간다.
   */
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        flushPendingWrites();
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={NAV_THEME[theme ?? 'light']}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <Stack />
        <PortalHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
