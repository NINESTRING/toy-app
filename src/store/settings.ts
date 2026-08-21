import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { setHapticsEnabled, setPresetSoundEnabled } from '@/haptics/engine';

import { mmkvStateStorage } from './storage';

/**
 * 전역 설정과 해금 상태. (§2)
 *
 * 카운트와 달리 이쪽은 변경이 드물다(설정 토글, 기믹 해금). 그래서 zustand의
 * `persist`로 즉시 쓰는 게 맞다 — 디바운스할 이유가 없고, 결제 직후 앱이
 * 죽었을 때 해금이 날아가면 안 된다.
 */

type SettingsStore = {
  hapticsEnabled: boolean;
  soundEnabled: boolean;
  /** 해금된 기믹 id. 코어 기믹은 레지스트리에서 항상 해금으로 취급한다. */
  unlocked: string[];

  setHapticsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  unlock: (gimmickId: string) => void;
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      hapticsEnabled: true,
      soundEnabled: true,
      unlocked: [],

      setHapticsEnabled: (enabled) => {
        setHapticsEnabled(enabled);
        set({ hapticsEnabled: enabled });
      },

      setSoundEnabled: (enabled) => {
        setPresetSoundEnabled(enabled);
        set({ soundEnabled: enabled });
      },

      unlock: (gimmickId) =>
        set((state) =>
          state.unlocked.includes(gimmickId) ? state : { unlocked: [...state.unlocked, gimmickId] }
        ),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => mmkvStateStorage),
      /**
       * 복원된 설정을 Pulsar 엔진에 반영한다. 저장된 값이 있어도 엔진은
       * 매 실행마다 기본값(켜짐)으로 시작하므로 여기서 다시 밀어줘야 한다.
       */
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        setHapticsEnabled(state.hapticsEnabled);
        setPresetSoundEnabled(state.soundEnabled);
      },
    }
  )
);
