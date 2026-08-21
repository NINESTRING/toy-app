/**
 * 축별 팔레트.
 *
 * 색을 registry의 variant가 아니라 여기 두는 이유: §4 원칙 1이 데이터로
 * 규정한 건 햅틱이고, 팔레트는 키캡 전용 시각 정보다. 클리커도 자기 색을
 * 컴포넌트에 갖고 있다.
 *
 * 대가는 registry의 variant id와 이 맵의 키가 문자열로 결합된다는 것이다.
 * 그래서 `paletteFor`가 모르는 id를 기본 팔레트로 흘린다 — §7 OTA로 축이
 * 추가돼도 화면이 죽지 않아야 한다.
 */
export type KeycapPalette = {
  /** 배경 그라디언트. 위 → 아래 */
  backgroundTop: string;
  backgroundBottom: string;
  /** 키캡이 박힌 하우징. 레퍼런스의 검은 타 */
  housing: string;
  /** 키캡 상판 */
  capTop: string;
  /** 키캡 측면. 상판보다 어두워야 두께로 읽힌다 */
  capSkirt: string;
  /** 라벨 글자색 */
  label: string;
};

/** 적축 — 레퍼런스 이미지의 파랑/노랑. */
const LINEAR: KeycapPalette = {
  backgroundTop: '#1a5ce0',
  backgroundBottom: '#0a2f9c',
  housing: '#0b1020',
  capTop: '#f2cf1f',
  capSkirt: '#c39f08',
  label: '#1a1a1a',
};

/** 갈축 — 붉은기 배경에 크림색 키캡. */
const TACTILE: KeycapPalette = {
  backgroundTop: '#b4442c',
  backgroundBottom: '#6f2114',
  housing: '#1a0f0b',
  capTop: '#efe3cb',
  capSkirt: '#bfae8c',
  label: '#2a1c14',
};

/** 사일런트 — 자턴 배경에 훈연 회색 키캡. */
const SILENT: KeycapPalette = {
  backgroundTop: '#4a3f72',
  backgroundBottom: '#241e3c',
  housing: '#120f1c',
  capTop: '#8d8598',
  capSkirt: '#655e70',
  label: '#f0edf5',
};

/** 모르는 id를 흘려보낼 기본값. 레퍼런스 이미지가 적축이므로 그것으로 둔다. */
const DEFAULT_PALETTE = LINEAR;

/** 값 타입에 undefined를 넣어야 아래 `??`가 타입 체커에도 의미를 갖는다. */
const PALETTES: Record<string, KeycapPalette | undefined> = {
  linear: LINEAR,
  tactile: TACTILE,
  silent: SILENT,
};

export function paletteFor(variantId: string): KeycapPalette {
  return PALETTES[variantId] ?? DEFAULT_PALETTE;
}
