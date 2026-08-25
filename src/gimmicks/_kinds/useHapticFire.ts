import * as React from 'react';
import { usePatternComposer } from 'react-native-pulsar';

import { resolvePreset } from '@/haptics/presets';
import type { PatternHaptic, PresetHaptic } from '@/gimmicks/types';

/**
 * 단발 햅틱 스펙을 워크릿 호출 가능한 함수 하나로 만든다.
 *
 * discrete(터치 다운)와 tug(임계값 통과)가 공유한다 — 둘 다 "한 순간에
 * 한 방"이라 스펙 → 함수 변환이 같다.
 *
 * `usePatternComposer`는 훅이라 조건부로 호출할 수 없으므로, 프리셋인
 * 경우에도 pattern을 undefined로 넘겨 항상 호출한다(Pulsar가 undefined면
 * 파싱을 건너뛴다).
 */
export function useHapticFire(spec: PresetHaptic | PatternHaptic | undefined): () => void {
  const patternComposer = usePatternComposer(spec?.type === 'pattern' ? spec.pattern : undefined);
  const play = patternComposer.play;

  return React.useMemo(() => {
    if (!spec) {
      // 아무것도 안 쏘는 워크릿. 호출부에서 분기하지 않게 해준다.
      return () => {
        'worklet';
      };
    }
    if (spec.type === 'pattern') {
      return play;
    }
    return resolvePreset(spec.name);
  }, [spec, play]);
}
