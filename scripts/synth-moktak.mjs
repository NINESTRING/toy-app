// 목탁 타격음 합성. 실행: node scripts/synth-moktak.mjs
//
// 실제 녹음이 없어 감쇠 사인 3개 + 어택 노이즈 클릭으로 "나무를 친 소리"를
// 만든다(스펙 §5). 실기기에서 들어보고 PARTIALS의 주파수·감쇠를 바꿔 다시
// 돌리면 된다 — 그래서 스크립트를 결과 WAV와 함께 커밋한다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/sounds/moktak.wav');

const SAMPLE_RATE = 44100;
const DURATION_S = 0.25;

/** 부분음. 기본음 + 배음 둘. 높은 배음이 먼저 죽어야 "나무"로 들린다. */
const PARTIALS = [
  { freq: 820, decayMs: 80, gain: 1.0 },
  { freq: 1650, decayMs: 60, gain: 0.5 },
  { freq: 2400, decayMs: 40, gain: 0.3 },
];

/** 어택의 노이즈 클릭. 이게 없으면 목탁이 아니라 실로폰이다. */
const CLICK_MS = 5;
const CLICK_GAIN = 0.6;

/** 꼬리를 잘라 끝에서 클릭이 나지 않게 한다. */
const TAIL_FADE_MS = 20;

/** 피크 정규화 목표. */
const PEAK_DBFS = -1;

/** 결정적 노이즈 — 같은 입력이면 같은 파일이 나와 diff가 깨끗하다. */
let seed = 0x9e3779b9;
function noise() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 4294967296) * 2 - 1;
}

const n = Math.round(SAMPLE_RATE * DURATION_S);
const samples = new Float64Array(n);

for (let i = 0; i < n; i += 1) {
  const t = i / SAMPLE_RATE;
  const ms = t * 1000;
  let v = 0;
  for (const p of PARTIALS) {
    v += p.gain * Math.exp(-ms / p.decayMs) * Math.sin(2 * Math.PI * p.freq * t);
  }
  if (ms < CLICK_MS) {
    v += CLICK_GAIN * noise() * (1 - ms / CLICK_MS);
  }
  const remainingMs = (DURATION_S - t) * 1000;
  if (remainingMs < TAIL_FADE_MS) {
    v *= remainingMs / TAIL_FADE_MS;
  }
  samples[i] = v;
}

let peak = 0;
for (const v of samples) {
  peak = Math.max(peak, Math.abs(v));
}
const scale = Math.pow(10, PEAK_DBFS / 20) / peak;

/** 16bit PCM 모노 WAV. 헤더 44바이트. */
const data = Buffer.alloc(n * 2);
for (let i = 0; i < n; i += 1) {
  const s = Math.max(-1, Math.min(1, samples[i] * scale));
  data.writeInt16LE(Math.round(s * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16); // fmt 청크 크기
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // 모노
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([header, data]));
console.log(`wrote ${OUT} — ${n} samples, ${(DURATION_S * 1000).toFixed(0)}ms, peak ${PEAK_DBFS}dBFS`);
