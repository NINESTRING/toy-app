# 파티 포퍼 기믹 설계

> 상태: 승인됨 · 2026-08-24
> 참조는 모두 [stack.md](../../../stack.md)의 절 번호다.
> 레퍼런스: J Scott Smith, [Confetti Cannon](https://codepen.io/jscottsmith/pen/VjPaLO) (Canvas 2D + GSAP Physics2D)

---

## 0. 무엇을 만드는가

화면 하단 중앙에 고정된 색동 고깔 파티 포퍼. **아무 데나 잡고 드래그하면
새총처럼 당기는 반대 방향으로 포신이 조준되고, 당긴 길이만큼 파워가 차오르며
손에는 차징 럼블이 점점 강해진다. 놓으면 "펑" 햅틱과 함께 색종이가 물리
궤적으로 흩날린다.**

레퍼런스 펜의 구성: 누른 지점이 포구가 되고, 드래그 벡터의 방향이 발사각,
길이가 파워·수량이 된다. 릴리스 시 GSAP Physics2D로 파티클 발사(중력·마찰·
틸트 플러터, 4초 감쇠).

---

## 1. 레퍼런스에서 바꾸는 것: 보이는 물체

펜은 포가 보이지 않는다 — 분홍 조준선과 파워 원이 전부라서, 처음 열면 뭘
해야 하는지 알 수 없다. "더 직관적이고 깔끔하게"의 답:

1. **포퍼가 항상 보인다.** 하단 중앙 고정. 물체가 있으니 "이걸 조작한다"가
   즉시 읽힌다.
2. **당기기 = 장전.** 드래그 반대 방향으로 포신이 회전(Angry Birds 문법),
   당김에 비례해 포신이 살짝 눌려 들어간다(스프링 압축 은유).
3. **조준 가이드가 파워 게이지를 겸한다.** 포구에서 발사 방향으로 점 4개가
   뻗고, 파워에 비례해 간격·불투명도가 커진다. 별도 게이지 UI 없음.
4. **손이 먼저 안다.** 당기는 동안 파워에 비례하는 연속 럼블(§0 — 햅틱이
   곧 제품). 파워를 눈으로 확인할 필요가 없어진다.
5. **발사각은 위쪽 부채꼴로 클램프.** 바닥으로 쏘는 무의미한 각도를 없애
   색종이가 항상 화면 위로 퍼진다.

---

## 2. 문제: 기존 입력 모델에 없다

§4 분류로 discrete(터치 다운)도, tug(당김 임계값 통과 순간 발화)도 아니다.
**릴리스 순간에 발사되고, 드래그가 각도·파워라는 연속 payload를 만든다.**
tug는 "당기면 무조건 같은 딸깍"이고 릴리스는 재장전일 뿐이다.

**해결: 입력 모델 `sling`(조준-릴리스)을 신설한다.** 전구가 tug를 신설한
수순 그대로 — KindSpec 한 줄 + `_kinds/sling.tsx` + registry 항목 +
stack.md §4 표에 행 추가. 새총, 농구공 던지기, 골프 등 "당겨서 쏘기"류가
전부 이 모델로 온다.

계획된 `physics` kind에 편입하지 않는 이유: §4의 physics는 "속도/충돌
임계값"(스피너·구슬)이다. 색종이 파티클은 물리지만 그건 **출력**이고, 분류
기준은 입력 모델이다. physics 자리를 여기 쓰면 진짜 스피너가 갈 곳이 없다.

---

## 3. 결정 목록

| 결정 | 대안 | 이유 |
|---|---|---|
| 입력 모델 `sling` 신설 | tug 재사용 / physics 편입 / 원오프 | 위 §2. 제스처·햅틱은 `_kinds`가 갖는 게 이 코드베이스의 계약 |
| 고정 포퍼 + 새총식 당김 조준 | 펜처럼 누른 곳이 포구 | 물체가 보여야 직관적이다. 당김-반대-발사는 모바일에 확립된 문법 |
| 차징 럼블 + 발사 펑 복합 햅틱 | 발사 펑 한 방만 | "장전되고 있다"가 손으로 전달되면 파워 게이지를 눈으로 안 봐도 된다. 사용자 결정 |
| 발사각 위쪽 부채꼴 클램프 | 전방향 발사 | 바닥 발사는 아무것도 안 보여주는 낭비 사이클. 클램프가 "깔끔하게"의 일부 |
| minPower 미만 릴리스는 불발 | 탭에도 최소 발사 | 오발이 없어야 "당겨서 쏜다"가 학습된다. 실기기에서 답답하면 소형 발사로 완화 |
| 파티클은 Skia `Atlas` 1 드로우콜 | 파티클마다 `<Rect>` | 256개 개별 컴포넌트는 SG 노드 낭비. Atlas는 정확히 이 용도(스프라이트 대량 + 개체별 변환·색) |
| 파티클 상수는 컴포넌트 소유 | config에 노출 | 중력·확산각·팔레트는 시각 정보다. config는 입력 모델 파라미터만(§4 원칙 1, 키캡 팔레트 전례) |
| 사운드 제외 | 펑 효과음 | 오디오 에셋 없음. 키캡·전구와 같은 범위 결정 |
| 변형 없음 | 색 테마 2종 등 | 프리셋 미검증 상태에서 변형부터 만드는 건 순서가 거꾸로다(전구 전례) |

---

## 4. 데이터 모델

```ts
// src/gimmicks/types.ts

/** Sling — 파티 포퍼, 새총. 당겨서 조준하고 놓는 순간 발사. */
export type SlingConfig = {
  /** 파워 1.0에 도달하는 당김 거리(pt). */
  maxPull: number;
  /** 이 파워(0~1) 미만에서 놓으면 불발 — 탭이 오발되지 않는다. */
  minPower: number;
  /** 발사각 허용 부채꼴(도). 수직 위를 중심으로 ±(fanDegrees/2)로 클램프. */
  fanDegrees: number;
};

/** 차징 럼블 + 발사 한 방. sling 전용 복합 햅틱. */
export type SlingHaptic = {
  type: 'sling';
  /** 당기는 동안의 연속 엔벨로프. 파워 0→1로 보간한다. */
  charge: {
    minAmplitude: number;
    maxAmplitude: number;
    /** 파워가 차면 주파수도 올라간다 — 세지면서 날카로워지는 것. */
    minFrequency: number;
    maxFrequency: number;
  };
  /** 릴리스 순간 한 방. */
  fire: PresetHaptic | PatternHaptic;
};

type KindSpec = {
  // ...discrete, detented, tug...
  sling: {
    config: SlingConfig;
    haptic: SlingHaptic;
  };
};
```

`SlingHaptic`은 `HapticSpec` 유니온에 넷째 멤버로 들어간다. **`BUNDLED_PRESETS`
수집 로직에 분기 하나 추가** — `type === 'sling'`이면 `fire` 쪽 프리셋을
수집한다(안 하면 첫 발의 펑이 씹힌다, §4 원칙 3).

registry 항목:

```ts
{
  id: 'popper',
  name: '파티 포퍼',
  kind: 'sling',
  haptic: {
    type: 'sling',
    charge: { minAmplitude: 0.1, maxAmplitude: 0.7, minFrequency: 0.2, maxFrequency: 0.6 },
    fire: { type: 'preset', name: 'pop' },
  },
  config: { maxPull: 160, minPower: 0.1, fanDegrees: 150 },
  component: () => import('./popper'),
}
```

> ⚠️ **`pop`과 charge 값 전부 미검증이다.** 키캡·다이얼·전구와 같은 상태 —
> §10의 Live Preview 절차는 실기기 작업이다. fire 후보: `pop`, `boom`,
> `burst`, `snap`. charge는 실기기에서 "당길수록 팽팽해진다"가 느껴질 때까지
> 진폭·주파수 범위를 조정한다.

---

## 5. `_kinds/sling.tsx`

tug처럼 제스처·조준·파워·발사 판정·햅틱을 소유하고 생김새는 render prop에
맡긴다. 모든 판정이 워크릿 안에서 끝난다(§4).

```ts
export type SlingShot = {
  /** 발사마다 1씩 증가. 자식이 useAnimatedReaction으로 받아 파티클을 뿌린다. */
  seq: number;
  /** 발사 방향(도, 화면 좌표계 — 위쪽 = 270). 클램프 적용 후 값. */
  angle: number;
  /** 발사 파워 0~1. */
  power: number;
};

export type SlingRenderState = {
  /** 현재 조준 방향(도). 드래그 중이 아니면 수직 위(270)로 복귀한다. */
  angle: SharedValue<number>;
  /** 현재 파워 0~1. 릴리스하면 0으로 복귀한다. */
  power: SharedValue<number>;
  active: SharedValue<boolean>;
  shot: SharedValue<SlingShot>;
};
```

- `Pan.onBegin` — `minDistance(0)`, 화면 어디서든 잡힌다(전구와 같은 원칙 —
  타깃이 큰 게 이득). 잡은 지점이 당김 벡터의 기점.
- `onUpdate` — 당김 벡터에서 계산:
  - `power = min(1, 거리 / maxPull)`
  - `angle = atan2(-pullY, -pullX)`를 수직 위 ±(fanDegrees/2)로 클램프
  - 차징 럼블: `useRealtimeComposer`의 연속 엔벨로프에 파워로 보간한
    진폭·주파수를 준다. detented의 `playDiscrete`(단발)와 달리 이쪽은
    §4가 적어둔 `set`(연속) 용법이 맞다 — 당기는 내내 울려야 하니까.
- `onFinalize` — 럼블 정지. `power ≥ minPower`면 `shot` 갱신(seq+1) +
  `fire` 햅틱(`useHapticFire` 재사용) + `runOnJS(onInteract)`. 미만이면
  불발. 이후 angle·power를 스프링으로 휴지값 복귀 — 이 스프링이 포신
  반동(recoil)의 타이밍 소스다.

발사(단발)와 차징(연속)은 서로 다른 컴포저를 쓰므로 충돌하지 않는다.
차징 set 호출은 매 프레임이어도 트랜지언트가 아니라 §5의 초당 20회 드랍
문제와 무관하지만, 구현에서 Pulsar 문서를 확인해 필요하면 스로틀한다.

---

## 6. 렌더링 (`src/gimmicks/popper/index.tsx`)

§1대로 이 파일에 `className`은 없다. 전구처럼 Skia 캔버스가 화면 전체를
덮고, 포퍼는 하단 중앙 기준의 설계 좌표계에 적은 뒤 transform으로 배치한다.

아래에서 위로:

1. **배경** — 어두운 남보라 그라디언트, 캔버스 전체. 색종이 대비가 사는 색.
   전구와 달리 상태에 따라 변하지 않는다(발사 플래시는 범위 밖).
2. **색종이 파티클** — 아래 §7. 포퍼보다 뒤에 그려 포퍼가 항상 앞에 온다.
3. **조준 가이드** — 포구에서 발사 방향으로 점 4개. 간격·불투명도가
   `power`에 비례. `power = 0`이면 투명해서 없는 것과 같다.
4. **포퍼 본체** — 색동 줄무늬 고깔(사다리꼴 경로 + 클립) + 금색 테두리
   림. `angle`로 회전, `power`에 비례해 발사 반대 방향으로 눌려 들어간다.
   릴리스하면 `_kinds`의 복귀 스프링이 오버슈트하면서 그대로 반동이 된다 —
   별도 반동 애니메이션을 만들지 않는다(전구가 복귀 스프링으로 채찍 반동을
   얻은 것과 같은 구조).

정적인 도형(고깔 경로·림)은 키캡처럼 모듈 상수로 미리 만든다. 매 프레임
바뀌는 건 transform과 조준 점 좌표뿐이라 워크릿에서 Skia 객체를 만들 일이
전구의 줄 경로보다도 적다.

---

## 7. 파티클 시스템 (포퍼 컴포넌트 소유)

**고정 풀 256개 링버퍼.** 발사 1회당 `round(40 + 80 × power)`발이 다음
슬롯들을 덮어쓴다. 연사로 풀이 넘치면 가장 오래된 것부터 재활용 — 눈치채기
어렵고, 할당이 없어 GC 걱정도 없다.

- **상태**: `useSharedValue`의 고정 길이 배열(x, y, vx, vy, 회전, 회전속도,
  색 인덱스, 남은 수명). React 상태로 절대 올라오지 않는다.
- **스폰**: `shot.seq`를 `useAnimatedReaction`으로 받아 워크릿에서 포구
  좌표에 뿌린다. 개체별로 발사각 ±25° 확산, 속도 0.7~1.0× 랜덤
  (`Math.random`은 워크릿에서 사용 가능).
- **시뮬레이션**: `useFrameCallback` 워크릿. 중력 + 공기저항(수평 감쇠) +
  회전 플러터, 수명 끝나면 페이드아웃. 레퍼런스의 Physics2D + 틸트 로직을
  명시적 오일러 적분으로 옮긴 것이다.
- **렌더링**: **Skia `Atlas`** — 작은 사각 스프라이트 1장 + RSXform
  버퍼(위치·회전·스케일) + 개체별 색 틴트. 256개가 드로우콜 1번.
  플러터는 회전 + 스케일 진동으로 표현한다(RSXform이 주는 자유도 안에서).
- **팔레트**: 축제 6색(코랄·옐로·민트·스카이·바이올렛·핑크), 컴포넌트
  모듈 상수. 펜의 전면 랜덤 RGB는 탁한 색이 절반이라 버린다 — 고정
  팔레트가 "깔끔하게"의 일부다.

프레임 콜백은 살아있는 파티클이 0이면 일찍 반환한다 — 가만히 있을 때
시뮬레이션 비용이 없어야 한다.

---

## 8. 범위 밖

- **사운드** — 에셋 없음. 키캡·전구와 동일.
- **낙하 crackle 햅틱** — 사용자 결정으로 제외. 연사 시 펑 임팩트를 묻는다.
- **발사 순간 배경 플래시** — 파티클만으로 충분한지 실기기에서 보고 후속.
- **색 테마 변형** — 프리셋 확정 후에.
- **파티클 상호 충돌·바닥 쌓임** — physics kind의 일이다.

---

## 9. 파일 변경

| 파일 | 작업 |
|---|---|
| `src/gimmicks/types.ts` | `SlingConfig`, `SlingHaptic`, `KindSpec.sling` |
| `src/gimmicks/_kinds/sling.tsx` | 신규 — 제스처·조준·파워·발사·차징 럼블 |
| `src/gimmicks/popper/index.tsx` | 신규 — Skia 도화 + 파티클 시스템 |
| `src/gimmicks/registry.ts` | `popper` 항목, `BUNDLED_PRESETS`에 sling 분기 |
| `src/app/index.tsx` | `KIND_LABELS.sling: '쏘기'` |
| `stack.md` | §4 표에 Sling 행, 폴더 구조에 `sling.tsx` |

새 의존성 없음.

---

## 10. 검증

| 확인할 것 | 방법 | 가능 여부 |
|---|---|---|
| 타입 | `npm run typecheck` | 가능 |
| 휴지 상태 레이아웃·포퍼 생김새 | `npm run ios:sim` + 스크린샷 | 가능 (터치를 못 넣으므로 조준·발사·파티클은 불가) |
| 기존 기믹 무회귀 | types.ts 변경이 추가뿐임을 diff로 확인 | 가능 |
| **차징 럼블 손맛, `pop` 적합성, 파티클 물리 상수, 60fps 유지** | `npm run ios:release` (실기기) | **불가 — 미검증으로 넘김** |

---

## 11. 후속

- [ ] 실기기에서 `pop` 확정 (후보: boom, burst, snap)
- [ ] charge 진폭·주파수 범위 실기기 튜닝 ("팽팽해진다"가 느껴질 때까지)
- [ ] 파티클 물리 상수(중력·저항·수명) 실기기 튜닝
- [ ] Atlas 256개 60fps 확인 — 밀리면 풀 축소 또는 스프라이트 단순화
- [ ] minPower 불발이 답답하면 소형 발사로 완화
- [ ] 펑 효과음 에셋 → `sound` 연결
