import { Skia, type SkPath } from '@shopify/react-native-skia';
import {
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  CORD_REST,
  NODE_COUNT,
  SLEEP_SPEED,
  createCordNodes,
  maxNodeSpeed,
  stepCord,
  type CordNode,
} from './cordPhysics';

/**
 * 풀코드 줄 — 시뮬레이션 구동 + Skia 경로. (개정 스펙 §3)
 *
 * 물리는 `cordPhysics.ts`가 전부 갖고 있다. 여기는 공유값·프레임 콜백·
 * 수면 게이트·경로 생성만 한다. 그렇게 나눈 이유는 그 파일 주석에.
 *
 * 경계: **tug는 매듭 변위만 준다. 줄 모양은 bulb가 소유한다.** 복귀
 * 스프링은 `_kinds/tug.tsx`에 그대로 남고, 로프는 그 위에 얹히는 생김새다.
 *
 * 훅을 `Canvas` 바깥(RN 트리)에서 부르는 건 퍼퍼 색종이와 같은 이유다 —
 * Skia는 `Canvas`의 자식을 별도 react-reconciler 루트에 마운트하므로
 * Canvas 안에서 훅을 부르면 RN 트리가 아닌 그 루트의 생명주기를 탄다.
 */

/** 매듭이 이만큼 안쪽이면 휴지점에 있는 것으로 친다. */
const REST_EPSILON = 0.25;

/** 앱이 멈췄다 돌아온 프레임의 폭주 방지 — 퍼퍼와 같은 클램프. */
const MAX_FRAME_MS = 64;

type Props = {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  active: SharedValue<boolean>;
};

export type Cord = {
  /** 앵커에서 매듭까지의 줄. 매 프레임 다시 만들어진다. */
  path: SharedValue<SkPath>;
  /** 매듭 원의 중심. 로프의 꼬리 핀과 같은 점이다. */
  knotX: SharedValue<number>;
  knotY: SharedValue<number>;
};

export function useCord({ dragX, dragY, active }: Props): Cord {
  const nodes = useSharedValue<CordNode[]>(createCordNodes());
  /** 배열 제자리 변형은 파생값을 안 깨운다 — 프레임마다 이걸 올린다(퍼퍼와 동일). */
  const tick = useSharedValue(0);
  /** 참이면 프레임 콜백이 즉시 반환한다. 놀 때 비용 0. */
  const asleep = useSharedValue(false);

  const knotX = useDerivedValue(() => CORD_REST.x + dragX.value);
  const knotY = useDerivedValue(() => CORD_REST.y + dragY.value);

  /**
   * 깨우는 건 이것 하나다. 잠든 뒤 매듭이 움직이려면 새 제스처가 있어야
   * 하고, 그건 반드시 `active`를 세운다 — 스프링 복귀는 잠들기 전에 이미
   * 끝나 있다(수면 조건이 매듭의 휴지점 도달을 요구한다).
   */
  useAnimatedReaction(
    () => active.value,
    (isActive) => {
      if (isActive) {
        asleep.value = false;
      }
    }
  );

  useFrameCallback((frameInfo) => {
    if (asleep.value) {
      return;
    }
    const dtMs = frameInfo.timeSincePreviousFrame;
    if (dtMs === null) {
      return;
    }
    const dt = Math.min(dtMs, MAX_FRAME_MS) / 1000;

    stepCord(nodes.value, dt, CORD_REST.x + dragX.value, CORD_REST.y + dragY.value);
    tick.value = tick.value + 1;

    /** 드래그 중도 아니고, 매듭도 제자리고, 다 멈췄으면 잔다. */
    if (
      !active.value &&
      Math.abs(dragX.value) < REST_EPSILON &&
      Math.abs(dragY.value) < REST_EPSILON &&
      maxNodeSpeed(nodes.value) < SLEEP_SPEED
    ) {
      asleep.value = true;
    }
  });

  /**
   * 마디를 지나는 2차 베지에 체인 — 마디가 제어점, 이웃과의 중점이 끝점인
   * 표준 중점 스무딩이다. 마디 12개에 세그먼트 13.3pt라 꺾임은 안 보인다.
   *
   * 형태가 프레임마다 바뀌므로 경로는 미리 못 만든다(원본 스펙 §6). 마지막
   * 구간만 직선인 건 중점 스무딩의 끝 처리다 — 13.3pt짜리라 안 보인다.
   */
  const path = useDerivedValue(() => {
    void tick.value; // 매 프레임 재계산 트리거
    const chain = nodes.value;
    const builder = Skia.PathBuilder.Make().moveTo(chain[0].x, chain[0].y);
    for (let i = 1; i < NODE_COUNT - 1; i++) {
      const node = chain[i];
      const next = chain[i + 1];
      builder.quadTo(node.x, node.y, (node.x + next.x) / 2, (node.y + next.y) / 2);
    }
    const tail = chain[NODE_COUNT - 1];
    return builder.lineTo(tail.x, tail.y).detach();
  });

  return { path, knotX, knotY };
}
