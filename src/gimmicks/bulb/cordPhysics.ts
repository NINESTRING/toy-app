/**
 * 풀코드 로프의 순수 물리. (개정 스펙 §3)
 *
 * **이 파일에 import가 하나도 없는 건 의도다.** 그래야 Node가 타입만
 * 벗겨내고 바로 실행할 수 있다(`node --experimental-strip-types`, Node 24
 * 기본값). 이 앱엔 테스트 러너가 없고 시뮬레이터엔 터치를 못 넣으므로
 * 적분기를 자동으로 검증할 수단이 이것뿐이다. import를 하나라도 들이면
 * 그 수단이 사라진다 — Skia도 Reanimated도 여기 오면 안 된다.
 *
 * `stepCord`·`maxNodeSpeed`는 워크릿이다. `useCord`의 프레임 콜백 안에서
 * 불린다(stack.md §4 — 시뮬레이션은 React 상태로 안 올라온다).
 */

/** 줄의 시작. index.tsx의 CAP 바닥 중앙과 맞춰져 있다 — 같이 움직여야 한다. */
export const CORD_ANCHOR = { x: 150, y: 226 };

/** 매듭의 휴지점. tug의 `drag`가 여기서의 변위다. */
export const CORD_REST = { x: 150, y: 372 };

/** 줄과 매듭의 굵기. 도형 상수지만 앵커·휴지점과 같이 읽혀야 해서 여기 둔다. */
export const CORD_WIDTH = 6;
export const KNOT_R = 9;

/** 마디 개수. 세그먼트는 11개다. */
export const NODE_COUNT = 12;

/**
 * 직선거리 대비 로프 길이. 1.0 — 쉴 때 정확히 팽팽하다.
 *
 * 여유를 상시로 주면(1.02 등) 쉴 때도 좌굴력이 새어나가 줄이 한쪽으로 기운
 * 채 굳는다. 출렁일 때 필요한 여유는 상수로 넣는 게 아니라 릴리스 스프링이
 * 매듭을 앵커 쪽으로 오버슈트시키면서 만들어진다 — 그때 현이 로프보다
 * 26pt쯤 짧아지고, 그 여유분이 S자로 접힌다.
 */
const CORD_SLACK = 1.0;

/** 앵커에서 휴지점까지의 직선거리 = 줄의 원래 길이. */
const SPAN = Math.sqrt((CORD_REST.x - CORD_ANCHOR.x) ** 2 + (CORD_REST.y - CORD_ANCHOR.y) ** 2);

/** 세그먼트 하나의 휴지 길이. */
export const SEGMENT_LEN = (SPAN * CORD_SLACK) / (NODE_COUNT - 1);

/** ⚠️ 물리 상수 전부 실기기 미검증 — 퍼퍼 색종이·다이얼과 같은 상태다. */
const GRAVITY = 2200; // pt/s²
const DRAG = 2.6; // /s — 공기저항
const CONSTRAINT_ITERATIONS = 8;

/**
 * 여유가 생긴 구간을 옆으로 밀어내는 가속도(pt/s²).
 *
 * 없으면 안 된다. 앵커·매듭·중력이 전부 x=150 위에 있어서 수직으로 당겼다
 * 놓으면 완벽히 대칭인 좌굴 문제가 되고, 여유분이 어느 쪽으로도 안 휘고
 * 제자리에서 수직으로 접힌다 — 줄이 자기 위로 겹쳐 보인다. 실제 줄은
 * 굽힘 강성과 미세한 비대칭 때문에 반드시 한쪽으로 휜다. 이건 그 비대칭의
 * 대역이다.
 *
 * 문이 두 개다: **접힌 만큼**(팽팽하면 0)과 **매듭 속력**(`BUCKLE_REF_SPEED`).
 * 둘 다 쉴 때 0이라 정지 상태에선 힘이 정확히 사라진다.
 *
 * 형태를 2차 모드(`sin 2πt`)로 준 건 사진의 S자가 그 모드라서다 — 씨앗만
 * 그 모양이고 자라는 건 물리가 한다.
 *
 * ⚠️ 실기기 미검증.
 */
const BUCKLE = 50000;

/**
 * 좌굴력이 최대가 되는 매듭 속력(pt/s). 이 밑에선 비례해서 약해진다.
 *
 * 여유(slack)만으로 문을 열면 안 된다 — PBD는 반복이 유한해서 쉴 때도
 * 구간마다 몇 %씩 접혀 있고, 그걸 여유로 치면 좌굴력이 영구히 살아서 줄이
 * 한쪽으로 기운 채로 굳는다. 매듭 속력은 쉴 때 정확히 0이라 그 새는 구멍이
 * 없다. 물리적으로도 채찍 에너지는 꼬리가 넣는 것이라 이쪽이 맞다.
 */
const BUCKLE_REF_SPEED = 600;

/**
 * 굽힘 강성. 한 칸 건너뛴 마디(i, i+2) 사이를 이 비율 × 2세그먼트보다 가깝게
 * 두지 않는다 — 즉 **밀어내기 전용** 제약이다(구간 제약은 당기기 전용).
 *
 * 없으면 좌굴력이 앵커 근처 한 마디에 몰려서 줄이 거의 반으로 접힌다(내각
 * 4도까지 봤다). 실제 줄은 굽힘 강성이 있어서 그렇게 못 접히고, 그 대신
 * 휘어짐이 길이 전체로 퍼진다 — 그게 채찍 파형이다.
 *
 * 등변 두 구간이 내각 θ일 때 (i, i+2) 거리는 2L·sin(θ/2)다. 0.8이면
 * θ ≈ 106도가 하한이 된다.
 */
const BEND_MIN = 0.85;
/** 굽힘 제약의 최소 간격. `BEND_MIN` 주석 참조. */
const BEND_SPAN = 2 * SEGMENT_LEN * BEND_MIN;

/** 자유 마디가 전부 이 속력 밑이면 멈춘 것으로 친다. `useCord`의 수면 판정. */
export const SLEEP_SPEED = 1.5; // pt/s

export type CordNode = {
  x: number;
  y: number;
  /** 직전 프레임 위치. 제약이 옮긴 만큼까지 속도로 되돌려 받는 데 쓴다. */
  px: number;
  py: number;
  vx: number;
  vy: number;
};

/** 앵커 → 휴지점 직선 위에 마디를 고르게 뿌린다. 첫 프레임의 시작 자세다. */
export function createCordNodes(): CordNode[] {
  const nodes: CordNode[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const t = i / (NODE_COUNT - 1);
    const x = CORD_ANCHOR.x + (CORD_REST.x - CORD_ANCHOR.x) * t;
    const y = CORD_ANCHOR.y + (CORD_REST.y - CORD_ANCHOR.y) * t;
    nodes.push({ x, y, px: x, py: y, vx: 0, vy: 0 });
  }
  return nodes;
}

/**
 * 한 프레임 적분. 마디 배열을 **제자리에서** 고친다 — 퍼퍼 색종이와 같은
 * 무할당 패턴이다.
 *
 * PBD(position-based dynamics): 적분 → 양 끝 핀 → 거리 제약 반복 →
 * 위치차로 속도 회수. 가변 dt에서 안전한 표준 형태고, 제약이 옮긴 만큼이
 * 속도에 반영되는 게 핵심이다.
 *
 * `tailX/tailY`는 매듭의 현재 위치다 — tug의 복귀 스프링이 소유한다.
 * 꼬리가 튀어오르면 몸통이 관성으로 뒤처지고, 제약이 그걸 따라 끌면서
 * 파형이 저절로 생긴다. 사진의 S자가 이거다.
 */
export function stepCord(nodes: CordNode[], dt: number, tailX: number, tailY: number): void {
  'worklet';
  const last = NODE_COUNT - 1;
  const damp = Math.max(0, 1 - DRAG * dt);

  /** 매듭이 이번 프레임에 움직인 속력. 좌굴력의 세기를 여기서 받는다. */
  const tailSpeed = Math.sqrt((tailX - nodes[last].x) ** 2 + (tailY - nodes[last].y) ** 2) / dt;
  const buckle = BUCKLE * Math.min(1, tailSpeed / BUCKLE_REF_SPEED);

  for (let i = 1; i < last; i++) {
    const node = nodes[i];
    node.px = node.x;
    node.py = node.y;
    node.vx *= damp;
    node.vy = node.vy * damp + GRAVITY * dt;

    /**
     * 좌굴 씨앗. 양옆 구간이 얼마나 접혔는지를 0~1로 재서 그만큼만 민다 —
     * 팽팽하면 정확히 0이다. 이유는 `BUCKLE` 주석에.
     */
    const previous = nodes[i - 1];
    const next = nodes[i + 1];
    const backSlack =
      1 - Math.sqrt((node.x - previous.x) ** 2 + (node.y - previous.y) ** 2) / SEGMENT_LEN;
    const frontSlack = 1 - Math.sqrt((next.x - node.x) ** 2 + (next.y - node.y) ** 2) / SEGMENT_LEN;
    const slack = Math.max(0, (backSlack + frontSlack) / 2);
    const shape = Math.sin((2 * Math.PI * i) / last);
    node.vx += buckle * slack * shape * dt;

    node.x += node.vx * dt;
    node.y += node.vy * dt;
  }

  /** 머리는 캡 바닥, 꼬리는 매듭. 둘 다 제약이 못 움직인다. */
  nodes[0].x = CORD_ANCHOR.x;
  nodes[0].y = CORD_ANCHOR.y;
  nodes[last].x = tailX;
  nodes[last].y = tailY;

  /**
   * 거리 제약. **늘어났을 때만** 당긴다 — 로프지 막대가 아니다.
   *
   * 양방향(막대)으로 하면 여유 길이가 있는 수직 줄이 압축에 저항하면서
   * 좌우 어느 쪽으로 좌굴할지를 수치 오차가 정하게 되고, 쉴 때 미세하게
   * 떤다. 당기기 전용이면 여유분은 그냥 아래로 처진다.
   *
   * 매듭을 로프 길이 밖으로 끌면 양 끝 핀이 이기고 중간이 직선으로 펴진다
   * — 팽팽해진다. 예외 처리 없이 나온다.
   */
  for (let iteration = 0; iteration < CONSTRAINT_ITERATIONS; iteration++) {
    for (let i = 0; i < last; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= SEGMENT_LEN || distance === 0) {
        continue;
      }
      const excess = (distance - SEGMENT_LEN) / distance;
      const aPinned = i === 0;
      const bPinned = i + 1 === last;
      /** 핀은 안 움직이므로 자유인 쪽이 초과분을 전부 흡수한다. */
      const aShare = aPinned ? 0 : bPinned ? 1 : 0.5;
      const bShare = bPinned ? 0 : aPinned ? 1 : 0.5;
      a.x += dx * excess * aShare;
      a.y += dy * excess * aShare;
      b.x -= dx * excess * bShare;
      b.y -= dy * excess * bShare;
    }

    /** 굽힘 강성 — 한 칸 건너 마디를 밀어내 날카로운 접힘을 막는다. */
    for (let i = 0; i < last - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 2];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance >= BEND_SPAN || distance === 0) {
        continue;
      }
      const deficit = (distance - BEND_SPAN) / distance;
      const aPinned = i === 0;
      const bPinned = i + 2 === last;
      const aShare = aPinned ? 0 : bPinned ? 1 : 0.5;
      const bShare = bPinned ? 0 : aPinned ? 1 : 0.5;
      a.x += dx * deficit * aShare;
      a.y += dy * deficit * aShare;
      b.x -= dx * deficit * bShare;
      b.y -= dy * deficit * bShare;
    }
  }

  /**
   * 제약이 옮긴 만큼도 속도다. 이게 없으면 파형이 한 프레임 만에 죽고
   * 줄이 고무줄처럼 늘어졌다 붙는 걸로 보인다.
   */
  for (let i = 1; i < last; i++) {
    const node = nodes[i];
    node.vx = (node.x - node.px) / dt;
    node.vy = (node.y - node.py) / dt;
  }
}

/** 자유 마디 중 가장 빠른 속력(pt/s). `useCord`가 잠들 때를 정하는 데 쓴다. */
export function maxNodeSpeed(nodes: CordNode[]): number {
  'worklet';
  let fastest = 0;
  for (let i = 1; i < NODE_COUNT - 1; i++) {
    const node = nodes[i];
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > fastest) {
      fastest = speed;
    }
  }
  return fastest;
}

/**
 * 지금 줄이 팽팽한지 — 앵커에서 매듭까지가 원래 길이 이상인지.
 *
 * tug가 릴리스에서 이걸 물어보고, 거짓이면 토글을 쏘지 않는다. 줄이 늘어진
 * 채로 놓는 건 줄을 **위로 밀어 올린** 상태라는 뜻이고, 실제 풀체인 스위치는
 * 밀어 올려서는 안 걸린다 — 당겨야 걸린다.
 *
 * 기하가 이 파일에 있으므로 판정도 여기서 만들어 tug에 넘긴다. `_kinds`는
 * 기믹의 도형을 몰라야 한다(§4의 역할 분담).
 */
export function isCordTaut(dragX: number, dragY: number): boolean {
  'worklet';
  /** 휴지점은 앵커 바로 아래 SPAN만큼이므로, 매듭까지의 현은 이렇게 된다. */
  const chord = Math.sqrt(dragX * dragX + (SPAN + dragY) ** 2);
  return chord >= SPAN;
}
