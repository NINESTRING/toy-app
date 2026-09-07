/**
 * 사운드 에셋 맵. (§5 오디오)
 *
 * registry의 `sound` 키가 여기 키로 제한된다(`SoundKey`). 프리셋 이름
 * (`PresetName`)과 같은 수법 — 없는 키는 런타임 무음이 아니라 컴파일 에러.
 *
 * `require`는 Metro가 에셋을 번들에 싸는 방식이다. 값은 에셋 id(number)이고
 * `expo-audio`의 `AudioSource`가 그대로 받는다.
 */
export const SOUND_ASSETS = {
  /** 목탁 타격음. `scripts/synth-moktak.mjs`가 만든 합성음이다. */
  moktak: require('../../assets/sounds/moktak.wav') as number,
} as const;

/** 사운드 키. registry의 `sound`가 이 유니온으로 제한된다. */
export type SoundKey = keyof typeof SOUND_ASSETS;
