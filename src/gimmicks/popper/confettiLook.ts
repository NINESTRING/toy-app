/**
 * 색종이의 겉모습을 정하는 순수 상수·함수. (화려화 스펙 §1, §2)
 *
 * **이 파일에 import가 하나도 없는 건 의도다** — `bulb/cordPhysics.ts`와
 * 같은 이유다. 이 앱엔 테스트 러너가 없고, 발사가 터치 제스처라
 * 시뮬레이터에서 트리거할 수도 없다. 색·모양 배정을 자동으로 검증할 수단이
 * Node의 타입 스트리핑(Node 24 기본값)으로 이 파일을 직접 실행하는 것뿐이다.
 * import를 하나라도 들이면 그 수단이 사라진다 — Skia도 Reanimated도 여기
 * 오면 안 된다.
 *
 * 아래 함수는 전부 워크릿이다. `confetti.tsx`의 변환·색 버퍼 안에서 불린다.
 */

/**
 * 스프라이트 시트의 칸 하나. **정사각이어야 한다** — RSXform은 스프라이트
 * (0,0)을 기준으로 변환하므로 회전을 조각 중심축으로 돌리려면 평행이동에서
 * 중심 오프셋을 빼야 하는데(`confetti.tsx`의 변환 버퍼), 칸이 모양마다 다른
 * 크기면 그 보정값이 개체마다 갈라져 워크릿에 분기가 들어온다.
 */
export const CELL = 12;

/** 칸 개수. `POOL_SIZE`가 이 값으로 나누어떨어져야 한다 — `cellX` 참조. */
export const SHAPE_COUNT = 4;

/** 시트는 칸을 가로로 이은 한 줄이다. `useTexture`에 넘길 크기의 출처. */
export const TEXTURE_WIDTH = CELL * SHAPE_COUNT;
export const TEXTURE_HEIGHT = CELL;

/**
 * 슬롯이 영구히 가리키는 칸의 x 오프셋.
 *
 * 모양이 파티클이 아니라 **풀 슬롯**에 붙는 이유: `Atlas`에서 워크릿 버퍼는
 * `transforms`와 `colors` 둘뿐이고 `sprites`는 정적 배열이라 런타임에 못
 * 바꾼다. 대신 스폰이 링버퍼를 순차로 훑으므로 한 발(최소 40개)이면 네
 * 모양이 저절로 균등하게 섞인다 — 분기도 랜덤 호출도 없다.
 *
 * ⚠️ `POOL_SIZE % SHAPE_COUNT === 0`이어야 랩어라운드에서도 정렬이 유지된다.
 * 풀을 250 같은 값으로 바꾸면 특정 모양이 조용히 더 자주 나온다.
 */
export function cellX(slot: number): number {
  'worklet';
  return (slot % SHAPE_COUNT) * CELL;
}

/**
 * 회전 한 바퀴당 플러터 진동 수.
 *
 * 변환의 스케일 진동과 색의 번쩍임이 **같은 위상**을 써야 한다 — 조각이
 * 정면으로 가장 넓게 보이는 순간이 빛을 반사할 순간이다. 한쪽에만 박아두면
 * 나중에 조용히 어긋나므로 상수를 하나만 둔다.
 */
const FLUTTER_CYCLES = 3;

/**
 * 조각이 정면(1.0)과 비스듬(0.5)을 오가는 스케일. RSXform이 균일 스케일만
 * 주므로 종횡 눌림 대신 이걸로 낙엽 느낌을 낸다.
 */
export function flutterScale(rot: number): number {
  'worklet';
  return 0.75 + 0.25 * Math.sin(rot * FLUTTER_CYCLES);
}

/**
 * 축제 6색 — 고깔과 같은 계열(포퍼 스펙 §7). 레퍼런스의 전면 랜덤 RGB는 탁한
 * 색이 절반이라 버렸다. SkColor(Float32Array)에 바로 쓰도록 0~1 RGB.
 */
export const PALETTE: readonly (readonly [number, number, number])[] = [
  [1.0, 0.42, 0.42], // 코랄 #ff6b6b
  [1.0, 0.85, 0.24], // 옐로 #ffd93d
  [0.31, 0.8, 0.77], // 민트 #4ecdc4
  [0.27, 0.67, 0.95], // 스카이 #45aaf2
  [0.65, 0.37, 0.92], // 바이올렛 #a55eea
  [0.99, 0.47, 0.66], // 핑크 #fd79a8
];

/**
 * 금박이 빛을 스칠 때의 색. 순수 흰색이면 형광으로 읽혀서 살짝 노랗다 —
 * 금박으로 보이게 하는 건 밝기가 아니라 이 온도다.
 */
const SHEEN: readonly [number, number, number] = [1.0, 0.97, 0.86];

/**
 * 금박으로 태어날 확률. 전부 반짝이면 균질해져서 종이가 아니라 플라스틱으로
 * 읽힌다 — 무광이 섞여 있어야 번쩍이는 조각이 도드라진다.
 *
 * ⚠️ 실기기 미검증. 손맛 보고 조정할 값이다.
 */
export const FOIL_RATIO = 0.34;

/** 번쩍임이 SHEEN 쪽으로 끌어당기는 최대치. ⚠️ 실기기 미검증. */
const GLINT_STRENGTH = 0.65;

/** 뒷면이 어두워지는 최대치. 이 대비가 있어야 깜빡임이 아니라 회전으로 읽힌다. */
const SHADE_STRENGTH = 0.25;

/**
 * 개체의 RGB를 `out[0..2]`에 쓴다. `out`은 색 버퍼가 준
 * SkColor(Float32Array)다 — 제자리에 채우므로 할당이 없다. 알파는 건드리지
 * 않는다(수명 페이드는 호출부의 일이다).
 *
 * 무광(`foil === 0`)은 팔레트 색 그대로다. 금박은 회전 위상에 따라
 * 갈린다 — 정면을 향할 때 `s⁴`로 날카롭게 번쩍이고(부드럽게 부풀면 "빛나는
 * 색"이 되지 "빛을 스치는 종이"가 안 된다), 뒷면일 때 `s²`로 어두워진다.
 * 두 갈래는 부호로 갈리므로 동시에 적용되지 않는다.
 */
export function writeConfettiRgb(
  out: { [index: number]: number },
  colorIndex: number,
  rot: number,
  foil: number
): void {
  'worklet';
  const rgb = PALETTE[colorIndex];

  if (foil === 0) {
    out[0] = rgb[0];
    out[1] = rgb[1];
    out[2] = rgb[2];
    return;
  }

  const s = Math.sin(rot * FLUTTER_CYCLES);

  if (s > 0) {
    const k = GLINT_STRENGTH * s * s * s * s;
    out[0] = rgb[0] + (SHEEN[0] - rgb[0]) * k;
    out[1] = rgb[1] + (SHEEN[1] - rgb[1]) * k;
    out[2] = rgb[2] + (SHEEN[2] - rgb[2]) * k;
    return;
  }

  const shade = 1 - SHADE_STRENGTH * s * s;
  out[0] = rgb[0] * shade;
  out[1] = rgb[1] * shade;
  out[2] = rgb[2] * shade;
}
