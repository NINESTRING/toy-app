import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioSource,
} from 'expo-audio';

/**
 * 사운드 플레이어 풀. (§5 오디오)
 *
 * §5: 인스턴스 하나로는 연타가 불가능하다. 재생이 끝나기 전에 같은
 * 플레이어를 다시 틀 수 없기 때문이다. 플레이어를 4~5개 만들어
 * 라운드로빈으로 돌린다.
 */

/** §5의 "4~5개" 중 위쪽. 뽁뽁이 멀티터치까지 감당하려면 여유가 필요하다. */
const POOL_SIZE = 5;

export class SoundPool {
  private readonly players: AudioPlayer[];
  private next = 0;

  constructor(source: AudioSource, size: number = POOL_SIZE) {
    this.players = Array.from({ length: size }, () => createAudioPlayer(source));
  }

  /**
   * 즉시 재생. 다음 플레이어로 넘어간다.
   *
   * `seekTo`를 await하지 않는다 — 딸깍의 체감 지연이 제품 품질이므로(§0)
   * 한 프레임이라도 미룰 수 없다. 라운드로빈 덕분에 재사용되는 플레이어는
   * 이미 재생이 끝나 있는 게 정상이고, seek는 네이티브에서 같은 순서로
   * 처리되므로 결과적으로 처음부터 재생된다.
   */
  play(volume: number = 1): void {
    const player = this.players[this.next];
    this.next = (this.next + 1) % this.players.length;

    player.volume = volume;
    void player.seekTo(0);
    player.play();
  }

  /** 기믹 화면을 떠날 때 호출. 네이티브 플레이어를 해제한다. */
  release(): void {
    for (const player of this.players) {
      player.remove();
    }
  }
}

/**
 * 앱 시작 시 한 번. 오디오 세션 성격을 정한다.
 *
 * 기본값 중 하나만 바꾼다: `playsInSilentMode`는 기본 true라서 무음 모드에서도
 * 소리가 난다. 피젯 앱이 무음 스위치를 무시하면 회의실에서 사고가 나므로 끈다.
 *
 * 나머지 기본값은 그대로 두는 게 맞다:
 *   interruptionMode: 'mixWithOthers' — 음악 들으면서 만지작거리는 게 주 사용
 *     패턴이다. 'duckOthers'/'doNotMix'면 딸깍마다 음악이 줄거나 끊긴다.
 *   shouldPlayInBackground: false     — 백그라운드 재생할 이유가 없다. (app.config.ts 참고)
 */
export function configureAudioSession(): Promise<void> {
  return setAudioModeAsync({ playsInSilentMode: false });
}
