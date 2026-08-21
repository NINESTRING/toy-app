import { create } from 'zustand';

import { deleteKey, gimmickStateKey, storage, writeDebounced } from './storage';

/**
 * 기믹별 상태. (§5 저장)
 *
 * 카운트는 메모리(zustand)에 두고 MMKV 저장은 디바운스한다. 연타 중에
 * 디스크를 만지지 않는 게 목적이므로, zustand의 `persist` 미들웨어는
 * 쓰지 않는다 — 그건 상태가 바뀔 때마다 즉시 쓴다.
 */

export type GimmickState = {
  /** 총 조작 횟수. 딸깍 1회, 눈금 1칸이 1이다. */
  count: number;
};

const EMPTY: GimmickState = { count: 0 };

function load(gimmickId: string): GimmickState {
  const raw = storage.getString(gimmickStateKey(gimmickId));
  if (!raw) {
    return EMPTY;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<GimmickState>;
    return { count: typeof parsed.count === 'number' ? parsed.count : 0 };
  } catch {
    // 저장 형식이 깨진 경우 기믹을 못 열게 하는 것보다 0에서 다시 세는 게 낫다.
    return EMPTY;
  }
}

type Store = {
  states: Record<string, GimmickState>;
  /** 화면 진입 시 호출. MMKV에서 한 번 읽어 메모리로 올린다. */
  hydrate: (gimmickId: string) => void;
  /** 조작 1회. 메모리는 즉시, 디스크는 디바운스. */
  interact: (gimmickId: string) => void;
  /** §5: 리셋 버튼 필수 — 다 터진 뽁뽁이는 쓸모가 없다. */
  reset: (gimmickId: string) => void;
};

export const useGimmickStore = create<Store>((set, get) => ({
  states: {},

  hydrate: (gimmickId) => {
    if (get().states[gimmickId]) {
      return;
    }
    set((state) => ({ states: { ...state.states, [gimmickId]: load(gimmickId) } }));
  },

  interact: (gimmickId) => {
    const current = get().states[gimmickId] ?? EMPTY;
    const next: GimmickState = { count: current.count + 1 };

    set((state) => ({ states: { ...state.states, [gimmickId]: next } }));
    writeDebounced(gimmickStateKey(gimmickId), JSON.stringify(next));
  },

  reset: (gimmickId) => {
    set((state) => ({ states: { ...state.states, [gimmickId]: EMPTY } }));
    deleteKey(gimmickStateKey(gimmickId));
  },
}));

/** 리렌더를 카운트가 실제로 바뀔 때로 좁히는 셀렉터. */
export function useGimmickCount(gimmickId: string): number {
  return useGimmickStore((state) => state.states[gimmickId]?.count ?? 0);
}
