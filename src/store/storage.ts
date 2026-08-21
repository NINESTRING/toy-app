import { createMMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

/**
 * 영속화 계층. (§2)
 *
 * MMKV는 동기 API라 AsyncStorage보다 빠르다. 앱 시작 시 해금 상태를
 * 비동기로 기다리지 않아도 되므로 갤러리가 한 프레임도 깜빡이지 않는다.
 */
export const storage = createMMKV();

/** zustand `persist` 미들웨어용 어댑터. 동기 저장소라 그대로 얹힌다. */
export const mmkvStateStorage: StateStorage = {
  getItem: (name) => storage.getString(name) ?? null,
  setItem: (name, value) => storage.set(name, value),
  removeItem: (name) => void storage.remove(name),
};

/** §5: 기믹별 상태는 `gimmick:{id}:state` 키로. */
export function gimmickStateKey(gimmickId: string): string {
  return `gimmick:${gimmickId}:state`;
}

/**
 * 디바운스된 쓰기.
 *
 * §5: 카운트는 메모리에 두고 MMKV 저장은 디바운스한다. 뽁뽁이를 연타하면
 * 초당 수십 번 카운트가 오르는데 그때마다 디스크를 만질 이유가 없다.
 *
 * 마지막 값만 살아남는다. 같은 키에 대한 이전 예약은 덮어쓴다.
 */
const DEBOUNCE_MS = 800;

const pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();

export function writeDebounced(key: string, value: string): void {
  const existing = pending.get(key);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    pending.delete(key);
    storage.set(key, value);
  }, DEBOUNCE_MS);

  pending.set(key, { value, timer });
}

/**
 * 예약된 쓰기를 즉시 반영한다.
 *
 * 디바운스의 대가는 "앱이 죽으면 마지막 몇 백 ms가 날아간다"는 것이다.
 * 앱이 백그라운드로 갈 때 이걸 부르면 그 창이 닫힌다. (`_layout.tsx`)
 */
export function flushPendingWrites(): void {
  for (const [key, { value, timer }] of pending) {
    clearTimeout(timer);
    storage.set(key, value);
  }
  pending.clear();
}

/** 디바운스 예약까지 포함해 키를 지운다. 리셋 버튼용. (§5) */
export function deleteKey(key: string): void {
  const existing = pending.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    pending.delete(key);
  }
  storage.remove(key);
}
