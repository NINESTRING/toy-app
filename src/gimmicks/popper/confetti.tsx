import {
  Atlas,
  Rect,
  Skia,
  useColorBuffer,
  useRSXformBuffer,
  useTexture,
  type SkSize,
} from '@shopify/react-native-skia';
import * as React from 'react';
import {
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { SlingShot } from '@/gimmicks/_kinds/sling';

/**
 * 색종이 파티클 시스템. (스펙 §7)
 *
 * 고정 풀 256개 링버퍼 — 발사가 다음 슬롯들을 덮어쓰고, 연사로 넘치면
 * 가장 오래된 것부터 재활용한다. 할당이 없어 GC 걱정도 없다.
 *
 * 시뮬레이션은 useFrameCallback 워크릿(§4 — React 상태로 올라오지
 * 않는다), 렌더링은 Atlas 드로우콜 1번이다. 레퍼런스의 GSAP Physics2D +
 * 틸트 플러터를 명시적 오일러 적분으로 옮겼다.
 *
 * RSXform·색 버퍼의 modifier는 클로저의 shared value가 바뀔 때 다시
 * 도는 매퍼다. 파티클 배열은 제자리 변형이라 그것만으로는 안 깨어나므로,
 * 프레임 콜백이 tick을 증가시켜 매 프레임 갱신을 트리거한다.
 *
 * 훅(`useConfetti`)과 그리는 컴포넌트(`ConfettiAtlas`)를 나눠 둔 이유:
 * Skia는 `Canvas`의 자식을 별도 react-reconciler 루트에 마운트하므로
 * Canvas 안에서 훅을 부르면 RN 트리가 아닌 그 루트의 생명주기를 탄다.
 * Skia가 문서화한 Atlas 패턴대로 훅은 Canvas 바깥(RN 트리)에서 돌리고
 * 버퍼만 아래로 넘긴다 — 로직은 여전히 이 파일이 전부 소유한다.
 */

const POOL_SIZE = 256;

/** 스프라이트(직사각 색종이 조각) 원본 크기. 개체 스케일이 곱해진다. */
const SPRITE_W = 6;
const SPRITE_H = 10;

/** `useTexture`의 deps에 들어가므로 반드시 모듈 상수 — 인라인 리터럴이면 발사마다 텍스처를 새로 굽는다. */
const SPRITE_SIZE = { width: SPRITE_W, height: SPRITE_H };

/** 발사 1회당 개수: 40 + 80 × power. (스펙 §7) */
const COUNT_BASE = 40;
const COUNT_PER_POWER = 80;

/** ⚠️ 물리 상수 전부 실기기 미검증 — 60fps와 손맛을 실기기에서 본다. */
const GRAVITY = 1400; // pt/s²
const DRAG = 2.2; // /s — 공기저항. 종단속도 ≈ GRAVITY/DRAG ≈ 640pt/s
const SPREAD_DEG = 25; // 발사각 좌우 확산(각 방향)
const SPEED_BASE = 900; // pt/s, power 0에서
const SPEED_PER_POWER = 1500; // pt/s, power 1에서 +
const LIFE_BASE = 2.4; // s
const LIFE_JITTER = 1.2; // s
const FADE_SECONDS = 0.6; // 수명 끝 페이드아웃 구간

const DEG2RAD = Math.PI / 180;

/**
 * 축제 6색 — 고깔과 같은 계열(스펙 §7). 레퍼런스의 전면 랜덤 RGB는 탁한
 * 색이 절반이라 버렸다. SkColor(Float32Array)에 바로 쓰도록 0~1 RGB.
 */
const PALETTE: readonly (readonly [number, number, number])[] = [
  [1.0, 0.42, 0.42], // 코랄 #ff6b6b
  [1.0, 0.85, 0.24], // 옐로 #ffd93d
  [0.31, 0.8, 0.77], // 민트 #4ecdc4
  [0.27, 0.67, 0.95], // 스카이 #45aaf2
  [0.65, 0.37, 0.92], // 바이올렛 #a55eea
  [0.99, 0.47, 0.66], // 핑크 #fd79a8
];

/** Atlas의 스프라이트 소스 — 전 개체가 같은 조각을 쓴다. */
const SPRITES = new Array(POOL_SIZE).fill(Skia.XYWHRect(0, 0, SPRITE_W, SPRITE_H));

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number; // 라디안
  rotV: number; // 라디안/s
  scale: number;
  colorIndex: number;
  life: number; // 남은 초. 0 이하 = 죽음
};

function makeDeadParticle(): Particle {
  return { x: 0, y: 0, vx: 0, vy: 0, rot: 0, rotV: 0, scale: 1, colorIndex: 0, life: 0 };
}

type Props = {
  shot: SharedValue<SlingShot>;
  /** 포구 월드 좌표 — 스폰 지점. index.tsx의 derived value. */
  muzzle: SharedValue<{ x: number; y: number }>;
  /** 화면 밖(아래) 컬링 기준. */
  canvasSize: SharedValue<SkSize>;
};

/** `useConfetti`가 돌려주는, `ConfettiAtlas`에 그대로 펼쳐 넘기는 버퍼 묶음. */
export type ConfettiAtlasProps = {
  texture: ReturnType<typeof useTexture>;
  transforms: ReturnType<typeof useRSXformBuffer>;
  colors: ReturnType<typeof useColorBuffer>;
};

export function useConfetti({ shot, muzzle, canvasSize }: Props): ConfettiAtlasProps {
  /**
   * 흰 조각 하나를 GPU 텍스처로. 색은 Atlas colors가 개체별로 입힌다 —
   * srcIn이라 스프라이트의 알파만 남기고 색을 통째로 덮는다.
   *
   * 엘리먼트는 인라인이어도 된다 — `useTexture`가 그리기 이펙트에 넘기는
   * deps는 세 번째 인자(생략 시 `[]`)뿐이라 엘리먼트 identity는 안 본다.
   * 반면 size는 `usePictureAsTexture`의 deps에 그대로 들어가므로 상수여야 한다.
   */
  const texture = useTexture(
    <Rect x={0} y={0} width={SPRITE_W} height={SPRITE_H} color="white" />,
    SPRITE_SIZE
  );

  const particles = useSharedValue<Particle[]>(
    Array.from({ length: POOL_SIZE }, makeDeadParticle)
  );
  /** 링버퍼 커서 — 다음 스폰이 덮어쓸 슬롯. */
  const cursor = useSharedValue(0);
  /** 살아있는 개수. 0이면 프레임 콜백이 일찍 반환한다(스펙 §7). */
  const aliveCount = useSharedValue(0);
  /** 버퍼 매퍼를 매 프레임 깨우는 신호. */
  const tick = useSharedValue(0);

  /** 발사 → 스폰. seq 증가가 이벤트다. */
  useAnimatedReaction(
    () => shot.value.seq,
    (seq, previousSeq) => {
      if (seq === 0 || seq === previousSeq) {
        return;
      }
      const { angle, power } = shot.value;
      const origin = muzzle.value;
      const pool = particles.value;
      const count = Math.round(COUNT_BASE + COUNT_PER_POWER * power);

      for (let i = 0; i < count; i++) {
        const particle = pool[cursor.value];
        cursor.value = (cursor.value + 1) % POOL_SIZE;

        const direction = (angle + (Math.random() - 0.5) * 2 * SPREAD_DEG) * DEG2RAD;
        const speed = (SPEED_BASE + SPEED_PER_POWER * power) * (0.7 + 0.3 * Math.random());

        particle.x = origin.x;
        particle.y = origin.y;
        particle.vx = Math.cos(direction) * speed;
        particle.vy = Math.sin(direction) * speed;
        particle.rot = Math.random() * Math.PI * 2;
        particle.rotV = (Math.random() - 0.5) * 12;
        particle.scale = 1 + Math.random() * 0.8;
        particle.colorIndex = Math.floor(Math.random() * PALETTE.length);
        particle.life = LIFE_BASE + Math.random() * LIFE_JITTER;
      }

      aliveCount.value = Math.min(POOL_SIZE, aliveCount.value + count);
      tick.value = tick.value + 1;
    }
  );

  /** 물리 적분. 살아있는 게 없으면 비용 0(스펙 §7). */
  useFrameCallback((frameInfo) => {
    if (aliveCount.value === 0) {
      return;
    }
    const dtMs = frameInfo.timeSincePreviousFrame;
    if (dtMs === null) {
      return;
    }
    /** 앱이 멈췄다 돌아온 프레임의 폭주 방지. */
    const dt = Math.min(dtMs, 64) / 1000;

    const pool = particles.value;
    const cullY = canvasSize.value.height + 60;
    let alive = 0;

    for (let i = 0; i < POOL_SIZE; i++) {
      const particle = pool[i];
      if (particle.life <= 0) {
        continue;
      }
      particle.life -= dt;
      particle.vx *= Math.max(0, 1 - DRAG * dt);
      particle.vy = particle.vy * Math.max(0, 1 - DRAG * dt) + GRAVITY * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rot += particle.rotV * dt;
      if (particle.y > cullY) {
        particle.life = 0;
        continue;
      }
      if (particle.life > 0) {
        alive++;
      }
    }

    aliveCount.value = alive;
    tick.value = tick.value + 1;
  });

  /**
   * 개체 변환. 회전이 스프라이트 중심을 축으로 돌도록 평행이동을 보정한다
   * (RSXform은 스프라이트 (0,0) 기준이다). 플러터는 회전 + 스케일 진동 —
   * RSXform이 균일 스케일만 주므로 종횡 눌림 대신 이걸로 낙엽 느낌을 낸다.
   */
  const transforms = useRSXformBuffer(POOL_SIZE, (xform, index) => {
    'worklet';
    void tick.value; // 매 프레임 재계산 트리거
    const particle = particles.value[index];
    if (particle.life <= 0) {
      xform.set(0, 0, 0, 0); // 스케일 0 — 그려지지 않는다
      return;
    }
    const flutter = 0.75 + 0.25 * Math.sin(particle.rot * 3);
    const scale = particle.scale * flutter;
    const scos = Math.cos(particle.rot) * scale;
    const ssin = Math.sin(particle.rot) * scale;
    const cx = SPRITE_W / 2;
    const cy = SPRITE_H / 2;
    xform.set(
      scos,
      ssin,
      particle.x - (scos * cx - ssin * cy),
      particle.y - (ssin * cx + scos * cy)
    );
  });

  /** 개체 색 + 수명 끝 페이드아웃. SkColor는 [r,g,b,a] Float32Array다. */
  const colors = useColorBuffer(POOL_SIZE, (color, index) => {
    'worklet';
    void tick.value;
    const particle = particles.value[index];
    const rgb = PALETTE[particle.colorIndex];
    color[0] = rgb[0];
    color[1] = rgb[1];
    color[2] = rgb[2];
    color[3] = particle.life <= 0 ? 0 : Math.min(1, particle.life / FADE_SECONDS);
  });

  return { texture, transforms, colors };
}

/**
 * 그리기 전담. Canvas 안에 놓이는 유일한 조각이고 훅을 하나도 쓰지 않는다 —
 * 시뮬레이션은 전부 `useConfetti`가 RN 트리에서 끝낸 뒤라, 여기는 버퍼를
 * Atlas 드로우콜 1번으로 흘려보내기만 한다.
 */
export function ConfettiAtlas({ texture, transforms, colors }: ConfettiAtlasProps) {
  return (
    <Atlas
      image={texture}
      sprites={SPRITES}
      transforms={transforms}
      colors={colors}
      colorBlendMode="srcIn"
    />
  );
}
