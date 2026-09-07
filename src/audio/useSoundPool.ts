import * as React from 'react';

import { SOUND_ASSETS, type SoundKey } from './assets';
import { SoundPool } from './pool';

/**
 * 기믹 화면이 registry의 `sound` 키로 플레이어 풀을 얻는다. (§5 오디오)
 *
 * 마운트 시 풀을 만들고 언마운트 시 해제한다. 반환값은 재생 함수 하나 —
 * 키가 없는 기믹(키캡·다이얼·전구·포퍼)에는 아무것도 안 하는 함수가 온다.
 * 호출부가 분기하지 않게 하기 위해서다(`useHapticFire`가 undefined 스펙에
 * 하는 것과 같다).
 *
 * 재생은 JS 스레드다. `onInteract`가 `runOnJS`를 타고 오므로 햅틱(UI
 * 스레드)보다 늦다 — expo-audio에 워크릿 경로가 없어 지금 구조에선 더
 * 당길 수 없다. 어긋남이 체감되는지는 실기기 몫이다(스펙 §5).
 */
export function useSoundPool(key: SoundKey | undefined): () => void {
  const poolRef = React.useRef<SoundPool | null>(null);

  React.useEffect(() => {
    if (key === undefined) {
      return;
    }
    const pool = new SoundPool(SOUND_ASSETS[key]);
    poolRef.current = pool;
    return () => {
      poolRef.current = null;
      pool.release();
    };
  }, [key]);

  return React.useCallback(() => {
    poolRef.current?.play();
  }, []);
}
