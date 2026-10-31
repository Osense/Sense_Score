import type { ScaleType } from './types'

export const NOTE_NAMES_KO = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시']
export const NOTE_NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12)
export const pitchLabel = (p: number) => `${NOTE_NAMES_KO[p % 12]}${Math.floor(p / 12) - 1}`

export const SCALES: Record<ScaleType, { label: string; steps: number[]; hint: string }> = {
  major: { label: '장음계 (밝은 느낌)', steps: [0, 2, 4, 5, 7, 9, 11], hint: '도레미파솔라시' },
  minor: { label: '단음계 (슬픈 느낌)', steps: [0, 2, 3, 5, 7, 8, 10], hint: '어두운 분위기' },
  pentatonic: { label: '5음계 (어떻게 쳐도 어울림)', steps: [0, 2, 4, 7, 9], hint: '틀리기 어려운 음' },
  minorPent: { label: '단조 5음계', steps: [0, 3, 5, 7, 10], hint: '록·블루스 느낌' },
  blues: { label: '블루스', steps: [0, 3, 5, 6, 7, 10], hint: '블루스 느낌' },
}

export function inScale(pitch: number, root: number, type: ScaleType | 'none'): boolean {
  if (type === 'none') return true
  return SCALES[type].steps.includes(((pitch - root) % 12 + 12) % 12)
}

/** 장/단음계의 각 음 위에 쌓은 3화음(코드) 추천 */
export function diatonicChords(root: number, type: ScaleType | 'none') {
  const base = type === 'minor' || type === 'minorPent' ? 'minor' : 'major'
  const steps = SCALES[base].steps
  const quality = base === 'major'
    ? ['', 'm', 'm', '', '', 'm', '°']
    : ['m', '°', '', 'm', 'm', '', '']
  const roman = base === 'major'
    ? ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ']
    : ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ']
  return steps.map((s, i) => {
    const r = (root + s) % 12
    const third = steps[(i + 2) % 7] - s
    const fifth = steps[(i + 4) % 7] - s
    const norm = (n: number) => (n + 12) % 12
    return {
      roman: roman[i],
      name: NOTE_NAMES_EN[r] + quality[i],
      ko: NOTE_NAMES_KO[r] + (quality[i] === 'm' ? ' 단조' : quality[i] === '°' ? ' 감' : ''),
      offsets: [0, norm(third), norm(fifth)],
      root: r,
    }
  })
}

export const TRACK_COLORS = ['#4f8cff', '#ff7a59', '#3ecf8e', '#f5b83d', '#b072ff', '#ff5f9e', '#2ec4d6', '#9acd32']

/* ---------- 드럼 파트 ---------- */
export interface DrumPart {
  id: string
  label: string
  pitch: number // 대표 GM 드럼 번호
  aliases: number[]
  color: string
  key: string // 컴퓨터 키보드 연계
  slot: number // 타악 오선: 맨 아래 줄=0, 위로 반 칸씩
  head: 'x' | 'o' | 'tri'
}

/** 위쪽일수록 높은 소리 */
export const DRUM_PARTS: DrumPart[] = [
  { id: 'crash', label: '크래시', pitch: 49, aliases: [52, 55, 57], color: '#f5b83d', key: 'Q', slot: 10, head: 'x' },
  { id: 'ride', label: '라이드', pitch: 51, aliases: [53, 59], color: '#2ec4d6', key: 'W', slot: 8, head: 'x' },
  { id: 'hihat', label: '하이햇', pitch: 42, aliases: [44, 46], color: '#9acd32', key: 'E', slot: 9, head: 'x' },
  { id: 'cowbell', label: '카우벨', pitch: 56, aliases: [], color: '#b072ff', key: 'R', slot: 6, head: 'tri' },
  { id: 'snare', label: '스네어', pitch: 38, aliases: [37, 40], color: '#ff5f9e', key: 'T', slot: 3, head: 'o' },
  { id: 'tomH', label: '높은 탐', pitch: 50, aliases: [48], color: '#ff9a3c', key: 'A', slot: 5, head: 'o' },
  { id: 'tomM', label: '중간 탐', pitch: 47, aliases: [45], color: '#e0703f', key: 'S', slot: 4, head: 'o' },
  { id: 'tomF', label: '낮은 탐', pitch: 41, aliases: [43], color: '#c25a2b', key: 'D', slot: 2, head: 'o' },
  { id: 'kick', label: '킥', pitch: 36, aliases: [35], color: '#4f8cff', key: 'F', slot: 1, head: 'o' },
]

export function drumPartFor(pitch: number): DrumPart {
  const hit = DRUM_PARTS.find((d) => d.pitch === pitch || d.aliases.includes(pitch))
  if (hit) return hit
  return DRUM_PARTS.reduce((a, b) => (Math.abs(b.pitch - pitch) < Math.abs(a.pitch - pitch) ? b : a))
}

/* ---------- 오선보: 음 이름(계이름) 단계 ---------- */
const DEG = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const SHARP = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]
const DEG_SEMI = [0, 2, 4, 5, 7, 9, 11]

/** C0=0, D0=1 ... 한 옥타브 7단계. 가온 도(C4=60)는 35 */
export const stepOf = (pitch: number) => Math.floor(pitch / 12) * 7 + DEG[pitch % 12]
export const isSharp = (pitch: number) => SHARP[pitch % 12] === 1
export const pitchOfStep = (step: number, accidental = 0) =>
  Math.min(127, Math.max(0, Math.floor(step / 7) * 12 + DEG_SEMI[((step % 7) + 7) % 7] + accidental))

/* ---------- 조성(조표) ---------- */
export interface KeySig {
  fifths: number // +n = 샵 n개, -n = 플랫 n개
  acc: number[] // 계이름(도레미파솔라시)별 조표 변화: +1 ♯ / -1 ♭ / 0
  name: string
  minor: boolean
}

// 장조 으뜸음(0=C…11=B) → 조표 개수
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5]
const SHARP_DEGS = [3, 0, 4, 1, 5, 2, 6] // 파 도 솔 레 라 미 시
const FLAT_DEGS = [6, 2, 5, 1, 4, 0, 3] // 시 미 라 레 솔 도 파
const MAJOR_KO = ['다', '내림라', '라', '내림마', '마', '바', '올림바', '사', '내림가', '가', '내림나', '나']
const MINOR_KO = ['다', '올림다', '라', '올림라', '마', '바', '올림바', '사', '올림사', '가', '내림나', '나']

export const KEY_CHOICES: { value: string; label: string }[] = [
  { value: 'none', label: '조표 없음 (다장조)' },
  ...MAJOR_KO.map((n, pc) => ({ value: `${pc}:major`, label: `${n}장조 (${NOTE_NAMES_EN[pc]} Major)` })),
  ...MINOR_KO.map((n, pc) => ({ value: `${pc}:minor`, label: `${n}단조 (${NOTE_NAMES_EN[pc]} minor)` })),
]

export function keyOf(root: number, type: ScaleType | 'none'): KeySig {
  const minor = type === 'minor' || type === 'minorPent' || type === 'blues'
  const tonic = type === 'none' ? 0 : root
  const fifths = MAJOR_FIFTHS[(tonic + (minor ? 3 : 0)) % 12]
  const acc = Array(7).fill(0)
  if (fifths > 0) SHARP_DEGS.slice(0, fifths).forEach((d) => (acc[d] = 1))
  if (fifths < 0) FLAT_DEGS.slice(0, -fifths).forEach((d) => (acc[d] = -1))
  const name = type === 'none' ? '다장조' : `${(minor ? MINOR_KO : MAJOR_KO)[tonic]}${minor ? '단조' : '장조'}`
  return { fifths, acc, name, minor }
}

/** 조표 계이름 위치(오선 위 단계). 대보표의 높은음자리/낮은음자리용 */
export const KEYSIG_STEPS = {
  treble: { sharp: [45, 42, 46, 43, 40, 44, 41], flat: [41, 44, 40, 43, 39, 42, 38] },
  bass: { sharp: [31, 28, 32, 29, 26, 30, 27], flat: [27, 30, 26, 29, 25, 28, 24] },
}

/** 음높이를 조성에 맞는 철자(오선 위치 + 변화표)로 나타낸다 */
export function spell(pitch: number, ks: KeySig): { step: number; alt: number } {
  const pc = pitch % 12
  const prefer = ks.fifths < 0 ? -1 : 1
  let best = { d: 0, a: 0, score: 99 }
  for (let d = 0; d < 7; d++)
    for (const a of [0, 1, -1]) {
      if ((DEG_SEMI[d] + a + 12) % 12 !== pc) continue
      const score = a === ks.acc[d] ? 0 : a === 0 ? 1 : a === prefer ? 2 : 3
      if (score < best.score) best = { d, a, score }
    }
  return { step: Math.floor((pitch - best.a) / 12) * 7 + best.d, alt: best.a }
}
