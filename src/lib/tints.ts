/**
 * 갤러리 타일 틴트. 셸 전용이다. (§1)
 *
 * 네 색은 각 기믹 씬에 **이미 존재하는 지배색**에서 따왔다 — 타일을 눌러
 * 들어가면 같은 색이 화면을 채운다. 새 기믹의 틴트를 정하는 규칙도 그것이다:
 * 그 기믹의 지배색에 가장 가까운 이름을 고른다.
 *
 *   blue    ← 키캡 배경 그라디언트 #1a5ce0
 *   emerald ← 다이얼 혜성 팔레트 첫 색 #1DD1A1
 *   amber   ← 전구 글로우 #ffd97a
 *   rose    ← 파티 포퍼 콘 베이스 #ff6b6b
 *   orange  ← 목탁 몸통 #b5532b
 *
 * **테마 토큰이 아니다.** `theme.ts`와 `global.css`의 무채색 토큰은 그대로
 * 두고, 이 색은 갤러리 타일에서만 쓴다. `--color-tint-*`를 만들면 셸 전체가
 * 색을 쓸 수 있다고 선언하는 것이 되는데, 그건 결정한 바가 없다.
 */

type Tint = {
  /** 타일 배경 + 테두리. */
  surface: string;
  /** 아이콘 색. 타일 위 텍스트는 기존 `foreground` 토큰을 그대로 쓴다. */
  icon: string;
};

/**
 * ⚠️ 클래스 문자열은 **반드시 리터럴로** 적는다.
 *
 * Tailwind는 소스를 스캔해서 실제로 등장한 클래스만 생성한다.
 * `bg-${tint}-500/10`처럼 조립하면 스캐너가 못 보고 런타임에 색이 안 나온다.
 * 네 벌을 그대로 나열하는 게 그 제약에 대한 값이다.
 *
 * 배경 투명도를 10~15%로 낮게 잡은 이유: 타일 위에 `foreground` 색 텍스트가
 * 올라간다. 채도가 높으면 라이트 모드의 검정 글씨와 다크 모드의 흰 글씨가
 * 둘 다 읽히지 않는다. 색은 "어느 장난감인지 알아보는 신호"까지만 하고
 * 가독성은 기존 토큰에 맡긴다.
 */
export const TINTS = {
  blue: {
    surface: 'bg-blue-500/10 dark:bg-blue-500/15 border-blue-500/20',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  emerald: {
    surface: 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    surface: 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/20',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  rose: {
    surface: 'bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/20',
    icon: 'text-rose-600 dark:text-rose-400',
  },
  orange: {
    surface: 'bg-orange-500/10 dark:bg-orange-500/15 border-orange-500/20',
    icon: 'text-orange-600 dark:text-orange-400',
  },
} as const satisfies Record<string, Tint>;

/** 틴트 이름. registry의 `look.tint`가 이 유니온으로 제한된다. */
export type TintName = keyof typeof TINTS;
