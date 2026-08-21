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
  /**
   * 선택된 변형 id. 없으면 기믹의 기본 변형을 쓴다.
   *
   * 카운트와 같은 키에 얹는다 — 기믹당 상태가 한 덩어리라 §5의
   * `gimmick:{id}:state` 규칙을 그대로 따르고 디바운스도 공유한다.
   */
  variantId?: string;
};

const EMPTY: GimmickState = { count: 0 };

function load(gimmickId: string): GimmickState {
  const raw = storage.getString(gimmickStateKey(gimmickId));
  if (!raw) {
    return EMPTY;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<GimmickState>;
    return {
      count: typeof parsed.count === 'number' ? parsed.count : 0,
      variantId: typeof parsed.variantId === 'string' ? parsed.variantId : undefined,
    };
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
  /** 축(변형) 선택. 카운트와 같은 키에 함께 저장된다. */
  setVariant: (gimmickId: string, variantId: string) => void;
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
    /** 전개가 필요하다 — 새로 만들면 딸깍 한 번에 축 선택이 날아간다. */
    const next: GimmickState = { ...current, count: current.count + 1 };

    set((state) => ({ states: { ...state.states, [gimmickId]: next } }));
    writeDebounced(gimmickStateKey(gimmickId), JSON.stringify(next));
  },

  setVariant: (gimmickId, variantId) => {
    const current = get().states[gimmickId] ?? EMPTY;
    const next: GimmickState = { ...current, variantId };

    set((state) => ({ states: { ...state.states, [gimmickId]: next } }));
    writeDebounced(gimmickStateKey(gimmickId), JSON.stringify(next));
  },

  reset: (gimmickId) => {
    const { variantId } = get().states[gimmickId] ?? EMPTY;
    /**
     * 카운트만 0으로 하고 축 선택은 유지한다. §5가 리셋을 요구한 건 진행
     * 상태("다 터진 뽁뽁이") 때문이고, 축은 취향이라 리셋 대상이 아니다.
     */
    const next: GimmickState = { count: 0, variantId };

    set((state) => ({ states: { ...state.states, [gimmickId]: next } }));

    if (variantId === undefined) {
      // 남길 게 없으면 키를 지운다. 예약된 쓰기까지 취소된다.
      deleteKey(gimmickStateKey(gimmickId));
      return;
    }
    /**
     * 축을 남겨야 하므로 지우는 대신 덮어쓴다. 디바운스라 앱이 곧바로 죽으면
     * 이전 카운트가 살아남을 수 있다 — §5가 디바운스를 택한 대가와 같은
     * 것이고, 백그라운드 진입 시 `flushPendingWrites`가 닫아준다.
     */
    writeDebounced(gimmickStateKey(gimmickId), JSON.stringify(next));
  },
}));

/** 리렌더를 카운트가 실제로 바뀔 때로 좁히는 셀렉터. */
export function useGimmickCount(gimmickId: string): number {
  return useGimmickStore((state) => state.states[gimmickId]?.count ?? 0);
}

/** 저장된 축 id. 목록에 없는 값일 수 있으므로 셸에서 검증한다. */
export function useGimmickVariantId(gimmickId: string): string | undefined {
  return useGimmickStore((state) => state.states[gimmickId]?.variantId);
}
