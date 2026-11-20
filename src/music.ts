import { isEn, L } from './i18n'
import type { ScaleType } from './types'

export const NOTE_NAMES_KO = [L("도"), L("도#"), L("레"), L("레#"), L("미"), L("파"), L("파#"), L("솔"), L("솔#"), L("라"), L("라#"), L("시")]
export const NOTE_NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12)
export const pitchLabel = (p: number) => `${NOTE_NAMES_KO[p % 12]}${Math.floor(p / 12) - 1}`

export type ScaleFamily = 'major' | 'minor'
/**
 * 음계: 계열(장조·단조), 쓰는 음(steps), 화음을 쌓을 7음 바탕(hept), 조표를 정할 때 쓰는 ‘같은 음을 쓰는 장조’까지의 거리(toMajor).
 * 5음계·블루스는 화음을 7음 장·단음계로 쌓는다. 모드는 그 모드의 7음 그대로 쌓아서(도리안의 Ⅳ는 장3화음 등) 고유한 색이 난다.
 */
export const SCALES: Record<ScaleType, { label: string; steps: number[]; hint: string; family: ScaleFamily; hept: number[]; toMajor: number; mode?: boolean }> = {
  major: { label: L("장음계 (밝은 느낌)"), steps: [0, 2, 4, 5, 7, 9, 11], hint: L("도레미파솔라시"), family: 'major', hept: [0, 2, 4, 5, 7, 9, 11], toMajor: 0 },
  pentatonic: { label: L("5음계 (어떻게 쳐도 어울림)"), steps: [0, 2, 4, 7, 9], hint: L("틀리기 어려운 음"), family: 'major', hept: [0, 2, 4, 5, 7, 9, 11], toMajor: 0 },
  lydian: { label: L("리디안 (꿈꾸듯 떠 있는)"), steps: [0, 2, 4, 6, 7, 9, 11], hint: L("올라간 4음(#4)"), family: 'major', hept: [0, 2, 4, 6, 7, 9, 11], toMajor: 7, mode: true },
  mixolydian: { label: L("믹솔리디안 (느긋한 록)"), steps: [0, 2, 4, 5, 7, 9, 10], hint: L("내려간 7음(♭7)"), family: 'major', hept: [0, 2, 4, 5, 7, 9, 10], toMajor: 5, mode: true },
  minor: { label: L("단음계 (슬픈 느낌)"), steps: [0, 2, 3, 5, 7, 8, 10], hint: L("어두운 분위기"), family: 'minor', hept: [0, 2, 3, 5, 7, 8, 10], toMajor: 3 },
  minorPent: { label: L("단조 5음계"), steps: [0, 3, 5, 7, 10], hint: L("록·블루스 느낌"), family: 'minor', hept: [0, 2, 3, 5, 7, 8, 10], toMajor: 3 },
  blues: { label: L("블루스"), steps: [0, 3, 5, 6, 7, 10], hint: L("블루스 느낌"), family: 'minor', hept: [0, 2, 3, 5, 7, 8, 10], toMajor: 3 },
  dorian: { label: L("도리안 (세련된 어두움)"), steps: [0, 2, 3, 5, 7, 9, 10], hint: L("올라간 6음(♮6)"), family: 'minor', hept: [0, 2, 3, 5, 7, 9, 10], toMajor: 10, mode: true },
  phrygian: { label: L("프리지안 (스페인·메탈)"), steps: [0, 1, 3, 5, 7, 8, 10], hint: L("내려간 2음(♭2)"), family: 'minor', hept: [0, 1, 3, 5, 7, 8, 10], toMajor: 8, mode: true },
  harmonicMinor: { label: L("화성단음계 (이국적·클래식)"), steps: [0, 2, 3, 5, 7, 8, 11], hint: L("올라간 7음(이끈음)"), family: 'minor', hept: [0, 2, 3, 5, 7, 8, 11], toMajor: 3 },
}
/** 단조 계열인지 (화음 진행 목록·평가·조표 이름에 쓴다) */
export const isMinorType = (t: ScaleType | 'none'): boolean => t !== 'none' && SCALES[t].family === 'minor'

export function inScale(pitch: number, root: number, type: ScaleType | 'none'): boolean {
  if (type === 'none') return true
  return SCALES[type].steps.includes(((pitch - root) % 12 + 12) % 12)
}

/** 장/단음계의 각 음 위에 쌓은 3화음(코드) 추천 */
export function diatonicChords(root: number, type: ScaleType | 'none') {
  const base = isMinorType(type) ? 'minor' : 'major'
  const steps = type === 'none' ? SCALES.major.hept : SCALES[type].hept
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
      ko: NOTE_NAMES_KO[r] + (quality[i] === 'm' ? L(" 단조") : quality[i] === '°' ? L(" 감") : ''),
      offsets: [0, norm(third), norm(fifth)],
      root: r,
    }
  })
}

export const TRACK_COLORS = ['#e0605c', '#6f8fb3', '#c99a45', '#7fa77f', '#9c7bb5', '#5f9e98', '#c97b63', '#a8999a']

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
/**
 * 드럼 파트와 컴퓨터 키보드 자리. 실제 드럼을 칠 때의 손발 자리를 따랐다(책상 위 드럼 패드처럼):
 * 왼손 = F 스네어 · R 크래시(왼쪽 위 심벌), 오른손 = J 하이햇(가장 자주 치니 오른손 검지) · O 라이드(오른쪽 위 심벌),
 * 가운데 = G·H 탐(스네어와 하이햇 사이), L 플로어 탐(오른쪽 아래), 발 = B(또는 녹음 화면의 스페이스) 킥
 */
export const DRUM_PARTS: DrumPart[] = [
  { id: 'crash', label: L("크래시"), pitch: 49, aliases: [52, 55, 57], color: '#f5b83d', key: 'R', slot: 10, head: 'x' },
  { id: 'ride', label: L("라이드"), pitch: 51, aliases: [53, 59], color: '#2ec4d6', key: 'O', slot: 8, head: 'x' },
  { id: 'hihat', label: L("하이햇"), pitch: 42, aliases: [44, 46], color: '#9acd32', key: 'J', slot: 9, head: 'x' },
  { id: 'cowbell', label: L("카우벨"), pitch: 56, aliases: [], color: '#b072ff', key: 'Y', slot: 6, head: 'tri' },
  { id: 'snare', label: L("스네어"), pitch: 38, aliases: [37, 40], color: '#ff5f9e', key: 'F', slot: 3, head: 'o' },
  { id: 'tomH', label: L("높은 탐"), pitch: 50, aliases: [48], color: '#ff9a3c', key: 'G', slot: 5, head: 'o' },
  { id: 'tomM', label: L("중간 탐"), pitch: 47, aliases: [45], color: '#e0703f', key: 'H', slot: 4, head: 'o' },
  { id: 'tomF', label: L("낮은 탐"), pitch: 41, aliases: [43], color: '#c25a2b', key: 'L', slot: 2, head: 'o' },
  { id: 'kick', label: L("킥"), pitch: 36, aliases: [35], color: '#4f8cff', key: 'B', slot: 1, head: 'o' },
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
// 조 이름의 으뜸음 (한국어는 다라마바사가나, 영어는 C D E…; ‘라’가 계이름 라(A)로 번역되면 안 되므로 L()을 쓰지 않는다)
const MAJOR_KO = isEn ? ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] : ['다', '내림라', '라', '내림마', '마', '바', '올림바', '사', '내림가', '가', '내림나', '나']
const MINOR_KO = isEn ? ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'] : ['다', '올림다', '라', '올림라', '마', '바', '올림바', '사', '올림사', '가', '내림나', '나']

export const KEY_CHOICES: { value: string; label: string }[] = [
  { value: 'none', label: L("조표 없음 (다장조)") },
  ...MAJOR_KO.map((n, pc) => ({ value: `${pc}:major`, label: L("{0}장조 ({1} Major)", n, NOTE_NAMES_EN[pc]) })),
  ...MINOR_KO.map((n, pc) => ({ value: `${pc}:minor`, label: L("{0}단조 ({1} minor)", n, NOTE_NAMES_EN[pc]) })),
]

export function keyOf(root: number, type: ScaleType | 'none'): KeySig {
  const minor = isMinorType(type)
  const tonic = type === 'none' ? 0 : root
  // 조표는 ‘같은 음을 쓰는 장조’를 따른다 (예: 레 도리안 = 다장조 조표, 라 단조 = 다장조 조표)
  const fifths = MAJOR_FIFTHS[(tonic + (type === 'none' ? 0 : SCALES[type].toMajor)) % 12]
  const acc = Array(7).fill(0)
  if (fifths > 0) SHARP_DEGS.slice(0, fifths).forEach((d) => (acc[d] = 1))
  if (fifths < 0) FLAT_DEGS.slice(0, -fifths).forEach((d) => (acc[d] = -1))
  const modeName: Partial<Record<ScaleType, string>> = { lydian: L("리디안"), mixolydian: L("믹솔리디안"), dorian: L("도리안"), phrygian: L("프리지안") }
  const name = type === 'none' ? L("다장조")
    : modeName[type] ? `${(minor ? MINOR_KO : MAJOR_KO)[tonic]} ${modeName[type]}`
    : `${(minor ? MINOR_KO : MAJOR_KO)[tonic]}${isEn ? ' ' : ''}${minor ? L("단조") : L("장조")}`
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
