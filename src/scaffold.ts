import { L } from './i18n'
import { fitGroup, soundRangeOf as rangeOf } from './instruments'
import { isMinorType, NOTE_NAMES_EN, SCALES } from './music'
import { rangesOf } from './sections'
import { newTrack } from './storage'
import { PPQ, uid, type Note, type ScaleType, type TrackRole, type SectionKind, type Settings, type Song, type Track } from './types'

/* ======================================================================
   뼈대 세우기: 화음 진행 · 반주 리듬 · 드럼 · 베이스를 ‘메뉴판’에서 고르면 음표로 만들어 준다.
   멜로디는 직접 쓰는 것이므로 만들지 않는다.
   ====================================================================== */

export type ChordRhythm = 'none' | 'whole' | 'half' | 'beats' | 'eighths' | 'offbeat' | 'arpeggio' | 'syncop' | 'custom'
export type DrumStyle = 'none' | 'basic8' | 'basic4' | 'floor4' | 'sixteen' | 'syncop' | 'halftime' | 'shuffle' | 'polka' | 'custom'
export type BassStyle = 'none' | 'roots' | 'roots-pass' | 'walking' | 'finger' | 'octave' | 'whole' | 'custom'

/** 직접 정한 리듬: 한 마디를 8분음표 칸(박 수 × 2)으로 나눈 칸 번호들 */
/** 예전 ‘직접 정하기’의 8분음표 칸(옛 곡을 읽을 때만 쓴다) */
export const STEP = PPQ / 2
export interface CustomDrum { kick: number[]; snare: number[]; hat: number[]; crash?: number[] }
/** 직접 정한 리듬의 음 하나: 마디 안 위치와 길이(tick) */
export interface PatNote { t: number; d: number }
export interface BassNote extends PatNote { tone: 0 | 1 | 2 }
/** 펼친화음 음: 0 근음 · 1 3음 · 2 5음 · 3 위 근음 · 4 위 3음 */
export type ArpTone = 0 | 1 | 2 | 3 | 4
export interface ArpNote extends PatNote { tone: ArpTone }
export interface DrumPat { crash?: PatNote[]; open?: PatNote[]; hat: PatNote[]; snare: PatNote[]; tom?: PatNote[]; kick: PatNote[] }
export type DrumLaneKey = keyof DrumPat
/** 베이스 칸마다 어떤 음을 칠지: 0 = 근음(루트), 1 = 5도, 2 = 한 옥타브 위 근음, null = 쉼 */
export type BassTone = 0 | 1 | 2 | null
export type ChordSpeed = 'slow' | 'normal' | 'fast'

export interface PartPlan {
  prog: string
  speed: ChordSpeed
  seventh: boolean
  comp: ChordRhythm
  drum: DrumStyle
  /** 파트 마지막 마디에 작은 드럼 필인 */
  fill: boolean
  /** 파트 첫 박에 크래시 심벌 */
  crash: boolean
  bass: BassStyle
  /** 같은 종류의 파트(코러스 2, 3…)와 설정을 함께 바꿀지 (기본: 예) */
  linked?: boolean
  /** 인터뷰에서 학생이 직접 확인한 파트 (자동 추천이 다시 바꾸지 않는다) */
  picked?: boolean
  /** 옛 형식(8분음표 칸 번호). 새로 저장할 때는 compPat·drumPat·bassPat을 쓴다 */
  customComp?: number[]
  customDrum?: CustomDrum
  customBass?: BassTone[]
  compPat?: PatNote[]
  drumPat?: DrumPat
  bassPat?: BassNote[]
  /** 직접 정하기 칸 크기: 한 박을 몇 칸으로 (2=8분음표, 4=16분음표, 3=셋잇단음표) */
  grid?: number
  /** 직접 정한 화음 리듬을 한꺼번에(block) 칠지, 하나씩 펼쳐서(arp) 칠지 */
  compMode?: 'block' | 'arp'
  /** 펼친화음 직접 정하기 */
  arpPat?: ArpNote[]
}

/* ---------- 직접 정한 리듬 읽기 (옛 형식도 새 형식으로) ---------- */
export function compPatOf(p: PartPlan, bar: number): PatNote[] {
  if (p.compPat) return p.compPat
  const s = [...new Set(p.customComp ?? [])].sort((a, b) => a - b).filter((x) => x * STEP < bar)
  return s.map((st, i) => ({ t: st * STEP, d: ((s[i + 1] ?? bar / STEP) - st) * STEP }))
}
export function drumPatOf(p: PartPlan): DrumPat {
  if (p.drumPat) return p.drumPat
  const c = p.customDrum
  const m = (xs?: number[]) => (xs ?? []).map((st) => ({ t: st * STEP, d: STEP }))
  return { crash: m(c?.crash), hat: m(c?.hat), snare: m(c?.snare), kick: m(c?.kick) }
}
export function bassPatOf(p: PartPlan, bar: number): BassNote[] {
  if (p.bassPat) return p.bassPat
  const tones = p.customBass ?? []
  const on = tones.flatMap((x, k) => (x == null || k * STEP >= bar ? [] : [k]))
  return on.map((k, i) => ({ t: k * STEP, d: ((on[i + 1] ?? bar / STEP) - k) * STEP, tone: tones[k] as 0 | 1 | 2 }))
}

/**
 * 직접 정한 음들이 이 구간(화음 하나가 이어지는 길이) 안에서 어디에 오는지.
 * segOffset = 구간이 자기 마디 시작에서 얼마나 떨어져 있는지. 구간 앞에서 시작해 이어지는 음은 구간 첫머리에 다시 친다(cont).
 */
export function patInSeg<T extends PatNote>(notes: T[], barTicks: number, segOffset: number, len: number): { t: number; d: number; n: T; cont: boolean }[] {
  const out: { t: number; d: number; n: T; cont: boolean }[] = []
  const bars = Math.ceil((segOffset + len) / barTicks)
  for (let b = 0; b < bars; b++)
    for (const n of notes) {
      const t = b * barTicks + n.t - segOffset
      const end = t + n.d
      if (end <= 0 || t >= len) continue
      const st = Math.max(0, t)
      out.push({ t: st, d: Math.min(end, len) - st, n, cont: t < 0 })
    }
  return out.sort((a, b) => a.t - b.t)
}

/* ---------- 화음 진행 ---------- */
export interface Progression {
  id: string
  name: string
  /** 음계의 몇 번째 화음인지(0부터) */
  degrees: number[]
  mood: string
  theory: string
}

export const PROG_MAJOR: Progression[] = [
  { id: 'pop4', name: 'Ⅰ–Ⅴ–ⅵ–Ⅳ', degrees: [0, 4, 5, 3], mood: L("신나고 친숙한 팝"), theory: L("으뜸-딸림-병행단조-버금딸림. 수많은 히트곡에 쓰인 ‘팝의 공식’이에요.") },
  { id: 'oldies', name: 'Ⅰ–ⅵ–Ⅳ–Ⅴ', degrees: [0, 5, 3, 4], mood: L("따뜻한 옛 노래 느낌"), theory: L("1950년대 올디스에서 유행해서 ‘50s 진행’이라고도 불러요.") },
  { id: 'emo', name: 'ⅵ–Ⅳ–Ⅰ–Ⅴ', degrees: [5, 3, 0, 4], mood: L("애절하고 벅찬 감성"), theory: L("단조 화음(ⅵ)으로 시작해서 슬픈 듯 밝게 풀리는, 같은 화음을 다르게 돌린 진행이에요.") },
  { id: 'basic', name: 'Ⅰ–Ⅳ–Ⅴ–Ⅰ', degrees: [0, 3, 4, 0], mood: L("가장 기본적이고 안정적"), theory: L("3대 화음(Ⅰ Ⅳ Ⅴ)만 쓰는 기본 종지. 마지막에 으뜸화음으로 돌아와 끝난 느낌이 나요.") },
  { id: 'lift', name: 'Ⅳ–Ⅰ–Ⅴ–ⅵ', degrees: [3, 0, 4, 5], mood: L("시원하게 터지는 후렴"), theory: L("밝은 Ⅳ 화음으로 시작해 열린 느낌을 줘서 코러스에 잘 어울려요.") },
  { id: 'jazz', name: 'ⅱ–Ⅴ–Ⅰ–ⅵ', degrees: [1, 4, 0, 5], mood: L("세련된 재즈 느낌"), theory: L("ⅱ–Ⅴ–Ⅰ은 재즈의 기본 진행. 7화음을 켜면 더 재즈다워져요.") },
  { id: 'build', name: 'ⅵ–Ⅴ–Ⅳ–Ⅴ', degrees: [5, 4, 3, 4], mood: L("긴장이 쌓이는 진행"), theory: L("Ⅴ(딸림화음)로 끝나서 ‘다음에 뭔가 나온다’는 기대를 만들어 프리코러스에 좋아요.") },
  { id: 'canon', name: L("캐논 Ⅰ–Ⅴ–ⅵ–ⅲ–Ⅳ–Ⅰ–Ⅳ–Ⅴ"), degrees: [0, 4, 5, 2, 3, 0, 3, 4], mood: L("차분하게 흘러가는 8마디"), theory: L("파헬벨의 캐논에서 온 진행. 베이스가 계단처럼 내려와요.") },
  { id: 'royal', name: 'Ⅳ–Ⅴ–ⅲ–ⅵ', degrees: [3, 4, 2, 5], mood: L("벅차오르다 촉촉해지는 후렴"), theory: L("버금딸림(Ⅳ)에서 딸림(Ⅴ)으로 올라갔다가 단조 화음으로 내려앉아요. 일본·한국 가요 후렴에 정말 많아요.") },
  { id: 'soar', name: 'Ⅳ–Ⅴ–Ⅰ–ⅵ', degrees: [3, 4, 0, 5], mood: L("올라가서 활짝 터지는 후렴"), theory: L("Ⅳ→Ⅴ로 한 칸씩 올라가 3마디째에 으뜸화음(Ⅰ)이 쾅 하고 터져요. 후렴 한가운데에 ‘도착’이 있어서 시원해요.") },
  { id: 'climb', name: 'Ⅳ–Ⅴ–Ⅰ–Ⅰ', degrees: [3, 4, 0, 0], mood: L("계단을 올라 활짝 도착"), theory: L("Ⅳ→Ⅴ→Ⅰ로 한 칸씩 올라가 으뜸화음에 도착해요. 마무리나 후렴 끝에 시원해요.") },
]

export const PROG_MINOR: Progression[] = [
  { id: 'epic', name: 'ⅰ–Ⅵ–Ⅲ–Ⅶ', degrees: [0, 5, 2, 6], mood: L("웅장하고 극적인 느낌"), theory: L("단조에서 가장 흔한 4화음. 영화·게임 음악에 많아요.") },
  { id: 'm-basic', name: 'ⅰ–ⅳ–ⅴ–ⅰ', degrees: [0, 3, 4, 0], mood: L("기본적이고 어두운 안정감"), theory: L("단조의 3대 화음. 마지막에 ⅰ로 돌아와요.") },
  { id: 'm-sad', name: 'ⅰ–Ⅶ–Ⅵ–Ⅶ', degrees: [0, 6, 5, 6], mood: L("출렁이며 가라앉는 느낌"), theory: L("으뜸음에서 한 계단씩 내려갔다 올라와요. 록과 팝에서 인기 있어요.") },
  { id: 'andalus', name: 'ⅰ–Ⅶ–Ⅵ–ⅴ', degrees: [0, 6, 5, 4], mood: L("스페인풍 하강 진행"), theory: L("음이 차례로 내려오는 ‘안달루시안’ 느낌의 진행이에요.") },
  { id: 'm-lift', name: 'Ⅵ–Ⅶ–ⅰ–ⅰ', degrees: [5, 6, 0, 0], mood: L("어둡다가 위로 올라서는 후렴"), theory: L("Ⅵ→Ⅶ→ⅰ로 계단처럼 올라가 으뜸으로 도착해요.") },
  { id: 'm-dark', name: 'ⅰ–ⅳ–Ⅶ–Ⅲ', degrees: [0, 3, 6, 2], mood: L("신비롭고 깊은 분위기"), theory: L("4도씩 움직이는 화음들이 이어져 깊이 있는 느낌을 줘요.") },
  { id: 'm-build', name: 'ⅳ–Ⅵ–Ⅶ–Ⅶ', degrees: [3, 5, 6, 6], mood: L("긴장을 키우는 진행"), theory: L("Ⅶ에서 멈춰서 으뜸(ⅰ)으로 돌아가고 싶게 만들어요.") },
  { id: 'm-pop', name: 'Ⅵ–Ⅲ–Ⅶ–ⅰ', degrees: [5, 2, 6, 0], mood: L("어둠 속에서 환하게 열리는 후렴"), theory: L("밝은 Ⅵ로 시작해서 마지막에야 ⅰ로 돌아와요. 단조 노래의 후렴에서 아주 흔해요.") },
  { id: 'm-major', name: 'Ⅲ–Ⅶ–Ⅵ–Ⅶ', degrees: [2, 6, 5, 6], mood: L("잠깐 장조처럼 밝아지는 진행"), theory: L("Ⅲ은 나란한조(같은 음을 쓰는 장조)의 으뜸화음이에요. 단조 곡 안에서 분위기가 확 밝아져요.") },
  { id: 'm-v', name: 'ⅰ–ⅳ–ⅴ–Ⅵ', degrees: [0, 3, 4, 5], mood: L("한 계단씩 차분히 올라가는 진행"), theory: L("ⅰ에서 ⅳ, ⅴ로 차례로 올라가다 Ⅵ에 걸쳐 다음으로 넘겨줘요.") },
]

export const progressionsFor = (minor: boolean) => (minor ? PROG_MINOR : PROG_MAJOR)

/** 이 음계에서 장조 계열인지 단조 계열인지 */
export const isMinorScale = (t: Settings['scaleType']) => isMinorType(t)

/* ---------- 화음 만들기 ---------- */
/** 화음을 쌓을 7음: true/false(예전 방식: 단음계/장음계) 또는 음계 종류(모드는 그 모드의 7음) */
export type Harmony = boolean | ScaleType
const stepsOf = (h: Harmony) => (typeof h === 'boolean' ? (h ? SCALES.minor.hept : SCALES.major.hept) : SCALES[h].hept)

export interface ChordInfo {
  degree: number
  rootPc: number
  pcs: number[]
  name: string
  thirdInt: number
  fifthInt: number
}

export function chordOf(root: number, minor: Harmony, degree: number, seventh: boolean): ChordInfo {
  let st = stepsOf(minor)
  if (typeof minor !== 'boolean' && st !== SCALES.major.hept && st !== SCALES.minor.hept) {
    // 모드·화성단음계: 그 음계 7음으로 쌓되, 감·증화음이 되는 자리는 기본 장·단음계 화음으로 (아이 곡에서 너무 거칠지 않게)
    const t = (st[(degree + 2) % 7] - st[degree] + 12) % 12, f = (st[(degree + 4) % 7] - st[degree] + 12) % 12
    if (f !== 7) st = isMinorType(minor) ? SCALES.minor.hept : SCALES.major.hept
    void t
  }
  const at = (k: number) => (st[(degree + k) % 7] - st[degree] + 12) % 12
  const rootPc = (root + st[degree]) % 12
  const third = at(2)
  const fifth = at(4)
  const sev = at(6)
  const pcs = [0, third, fifth, ...(seventh ? [sev] : [])].map((i) => (rootPc + i) % 12)
  let q = third === 3 ? (fifth === 6 ? 'dim' : 'm') : ''
  if (seventh) q = third === 3 ? (fifth === 6 ? 'm7♭5' : 'm7') : sev === 11 ? 'maj7' : '7'
  return { degree, rootPc, pcs, name: `${NOTE_NAMES_EN[rootPc]}${q}`, thirdInt: third, fifthInt: fifth }
}

/** 한 파트가 어떤 화음들로 이어지는지 (속도에 따라 한 마디에 하나, 둘, 또는 두 마디에 하나) */
export function chordSegments(bars: number, prog: Progression, speed: ChordSpeed): number[] {
  const out: number[] = []
  for (let b = 0; b < bars; b++) {
    if (speed === 'slow') out.push(prog.degrees[Math.floor(b / 2) % prog.degrees.length])
    else if (speed === 'normal') out.push(prog.degrees[b % prog.degrees.length])
    else out.push(prog.degrees[(2 * b) % prog.degrees.length], prog.degrees[(2 * b + 1) % prog.degrees.length])
  }
  return out
}

/* ---------- 다음 파트 화음 추천 ---------- */
export interface Suggestion { degree: number; reason: string }

/** 앞 파트의 마지막 화음에 이어서 쓰기 좋은 첫 화음들 */
export function suggestNext(last: number, minor: boolean): Suggestion[] {
  if (!minor)
    switch (last) {
      case 0: return [{ degree: 3, reason: L("Ⅰ→Ⅳ: 활짝 열리는 가장 흔한 움직임") }, { degree: 5, reason: L("Ⅰ→ⅵ: 부드럽게 감성으로") }, { degree: 4, reason: L("Ⅰ→Ⅴ: 힘 있게 앞으로") }]
      case 1: return [{ degree: 4, reason: L("ⅱ→Ⅴ: 재즈에서 가장 정통인 연결") }]
      case 2: return [{ degree: 5, reason: L("ⅲ→ⅵ: 5도씩 내려가는 자연스러운 연결") }, { degree: 3, reason: L("ⅲ→Ⅳ: 한 칸 올라가요") }]
      case 3: return [{ degree: 0, reason: L("Ⅳ→Ⅰ: ‘아멘’ 종지처럼 편안하게 풀려요") }, { degree: 4, reason: L("Ⅳ→Ⅴ: 한 칸씩 올라가며 긴장") }, { degree: 1, reason: L("Ⅳ→ⅱ: 재즈풍 연결") }]
      case 4: return [{ degree: 0, reason: L("Ⅴ→Ⅰ: 가장 강하게 해결되는 연결(딸림→으뜸)") }, { degree: 5, reason: L("Ⅴ→ⅵ: 예상을 비껴가는 ‘거짓 종지’") }]
      case 5: return [{ degree: 3, reason: L("ⅵ→Ⅳ: 함께 자주 다니는 짝") }, { degree: 1, reason: L("ⅵ→ⅱ: 5도 하강으로 부드럽게") }, { degree: 4, reason: L("ⅵ→Ⅴ: 긴장을 키워요") }]
      default: return [{ degree: 0, reason: L("ⅶ°→Ⅰ: 이끎음이 으뜸으로 해결") }]
    }
  switch (last) {
    case 0: return [{ degree: 3, reason: L("ⅰ→ⅳ: 어둡게 깊어져요") }, { degree: 5, reason: L("ⅰ→Ⅵ: 밝은 화음으로 살짝 열려요") }, { degree: 6, reason: L("ⅰ→Ⅶ: 한 계단 내려가요") }]
    case 1: return [{ degree: 4, reason: L("ⅱ°→ⅴ: 자연스러운 연결") }]
    case 2: return [{ degree: 5, reason: L("Ⅲ→Ⅵ: 5도 하강") }, { degree: 3, reason: L("Ⅲ→ⅳ: 어두워져요") }]
    case 3: return [{ degree: 0, reason: L("ⅳ→ⅰ: 편안하게 으뜸으로") }, { degree: 6, reason: L("ⅳ→Ⅶ: 힘 있게 올라가요") }, { degree: 4, reason: L("ⅳ→ⅴ: 긴장을 키워요") }]
    case 4: return [{ degree: 0, reason: L("ⅴ→ⅰ: 해결되어 돌아와요") }, { degree: 5, reason: L("ⅴ→Ⅵ: 예상 밖의 밝음") }]
    case 5: return [{ degree: 6, reason: L("Ⅵ→Ⅶ: 계단처럼 올라가요") }, { degree: 3, reason: L("Ⅵ→ⅳ: 함께 자주 다니는 짝") }]
    default: return [{ degree: 0, reason: L("Ⅶ→ⅰ: 강하게 으뜸으로 돌아와요") }, { degree: 2, reason: L("Ⅶ→Ⅲ: 밝게 열려요") }]
  }
}

/* ---------- 메뉴 항목(이름과 설명) ---------- */
export interface Choice<T extends string> { id: T; name: string; icon: string; desc: string }

export const COMP_STYLES: Choice<ChordRhythm>[] = [
  { id: 'whole', icon: '▬', name: L("꽉 채우기"), desc: L("한 화음을 마디 내내 길게 울려요. 멜로디가 돋보이고 차분해져요.") },
  { id: 'half', icon: '▬▬', name: L("2분음표로 나누기"), desc: L("마디를 반으로 쪼개 화음을 두 번 쳐요. 안정적이고 넉넉한 느낌.") },
  { id: 'beats', icon: '▮▮▮▮', name: L("박마다 끊기"), desc: L("매 박 화음을 짧게 쳐요. 기타 스트럼처럼 또렷해요.") },
  { id: 'eighths', icon: '▮▮▮▮▮▮▮▮', name: L("8분음표로 잘게"), desc: L("박을 반으로 쪼개 쿵짝쿵짝. 에너지가 올라가요.") },
  { id: 'offbeat', icon: '·▮·▮', name: L("엇박(뒷박) 스탭"), desc: L("박과 박 사이에만 화음을 쳐서 통통 튀어요. 레게·스카에서 쓰는 리듬이에요.") },
  { id: 'arpeggio', icon: '♪♪♪♪', name: L("분산화음(아르페지오)"), desc: L("화음의 음을 하나씩 차례로 연주해요. 피아노·기타 반주에 흔해요.") },
  { id: 'syncop', icon: '▮··▮··▮·', name: L("당김음 (3+3+2)"), desc: L("8분음표를 3+3+2로 묶어 센 박을 살짝 앞당겨요. 현대 팝의 단골 리듬이에요.") },
]

export const DRUM_STYLES: Choice<DrumStyle>[] = [
  { id: 'none', icon: '', name: L("드럼 쉬기"), desc: L("이 파트에서는 드럼을 빼요. 인트로·브릿지에서 분위기를 바꿀 때 좋아요.") },
  { id: 'basic8', icon: '', name: L("기본 8비트"), desc: L("킥은 1·3박, 스네어는 2·4박, 하이햇은 8분음표. 록과 팝의 가장 기본 박자예요.") },
  { id: 'basic4', icon: '', name: L("느긋한 4비트"), desc: L("하이햇을 4분음표로만 쳐서 여유롭게. 발라드에 어울려요.") },
  { id: 'floor4', icon: '', name: L("포온더플로어"), desc: L("킥이 매 박마다 쿵쿵쿵쿵, 하이햇은 박 사이에. 댄스·EDM의 박자예요.") },
  { id: 'sixteen', icon: '', name: L("16비트"), desc: L("하이햇을 16분음표로 잘게 쳐요. 펑키하고 촘촘한 R&B 느낌.") },
  { id: 'syncop', icon: '', name: L("싱코페이션(당김음)"), desc: L("센 박 대신 박 사이에 킥을 당겨 쳐서 리듬이 앞으로 쏠려요. 현대 팝·펑크의 핵심이에요.") },
  { id: 'halftime', icon: '', name: L("하프타임"), desc: L("스네어를 3박에만 쳐서 속도가 반으로 느려진 듯 묵직해요. 힙합·트랩에서 써요.") },
  { id: 'shuffle', icon: '', name: L("셔플"), desc: L("한 박을 3등분해 ‘길-짧’으로 흔들려요(삼연음). 블루스·재즈 느낌의 리듬이에요.") },
  { id: 'polka', icon: '', name: L("폴카 (움-짝)"), desc: L("킥은 박에, 스네어는 박 사이에 ‘움-짝 움-짝’. 경쾌한 춤곡 리듬이에요.") },
]

export const BASS_STYLES: Choice<BassStyle>[] = [
  { id: 'none', icon: '', name: L("베이스 쉬기"), desc: L("이 파트에서는 베이스를 빼요.") },
  { id: 'roots', icon: '', name: L("루트 위주 (킥에 맞춤)"), desc: L("화음의 으뜸음(루트)을 드럼 킥과 같은 자리에 놓아요. 드럼과 베이스가 한 몸처럼 들려요.") },
  { id: 'roots-pass', icon: '', name: L("루트 + 가끔 튀기"), desc: L("루트를 기본으로, 가끔 옥타브로 점프하고 마디 끝에서 다음 화음으로 이어 주는 음(경과음)을 넣어요.") },
  { id: 'walking', icon: '', name: L("워킹 베이스"), desc: L("4분음표로 루트-3도-5도-접근음을 걸어가듯 연주해요. 재즈의 대표 베이스 라인이에요.") },
  { id: 'finger', icon: '', name: L("핑거링 (8분 쪼개기)"), desc: L("마디를 8분음표로 쪼개 루트-5도-옥타브-5도를 계속 굴려요. 풍성하고 흐르는 느낌.") },
  { id: 'octave', icon: '', name: L("옥타브 펌핑"), desc: L("루트와 한 옥타브 위를 번갈아 8분음표로. 디스코·댄스의 들썩이는 베이스예요.") },
  { id: 'whole', icon: '▬', name: L("길게 받치기"), desc: L("루트를 마디 내내 길게. 패드처럼 바닥을 깔아 줘요.") },
]

export const DEFAULT_PLAN: Record<SectionKind, Omit<PartPlan, 'prog'>> = {
  intro: { speed: 'normal', seventh: false, comp: 'arpeggio', drum: 'none', fill: false, crash: false, bass: 'none' },
  verse: { speed: 'normal', seventh: false, comp: 'beats', drum: 'basic8', fill: true, crash: false, bass: 'roots' },
  prechorus: { speed: 'normal', seventh: false, comp: 'eighths', drum: 'basic8', fill: true, crash: false, bass: 'roots' },
  chorus: { speed: 'normal', seventh: false, comp: 'eighths', drum: 'basic8', fill: true, crash: true, bass: 'roots-pass' },
  bridge: { speed: 'normal', seventh: true, comp: 'whole', drum: 'halftime', fill: true, crash: false, bass: 'whole' },
  interlude: { speed: 'normal', seventh: false, comp: 'arpeggio', drum: 'basic4', fill: true, crash: false, bass: 'roots' },
  outro: { speed: 'normal', seventh: false, comp: 'whole', drum: 'none', fill: false, crash: false, bass: 'whole' },
  a: { speed: 'normal', seventh: false, comp: 'beats', drum: 'basic8', fill: true, crash: false, bass: 'roots' },
  b: { speed: 'normal', seventh: false, comp: 'arpeggio', drum: 'basic4', fill: true, crash: false, bass: 'roots-pass' },
  free: { speed: 'normal', seventh: false, comp: 'beats', drum: 'basic8', fill: true, crash: false, bass: 'roots' },
}

/** 종류에 어울리는 기본 진행 */
export function defaultProgFor(kind: SectionKind, minor: boolean): string {
  const list = progressionsFor(minor)
  const pick = (id: string) => list.find((p) => p.id === id)?.id ?? list[0].id
  if (minor) return pick(kind === 'prechorus' ? 'm-build' : kind === 'chorus' ? 'm-lift' : kind === 'bridge' ? 'm-dark' : kind === 'outro' ? 'm-basic' : 'epic')
  return pick(kind === 'prechorus' ? 'build' : kind === 'chorus' ? 'lift' : kind === 'bridge' ? 'emo' : kind === 'outro' ? 'basic' : kind === 'intro' ? 'pop4' : 'pop4')
}

export const defaultPlan = (kind: SectionKind, minor: boolean): PartPlan => ({ prog: defaultProgFor(kind, minor), ...DEFAULT_PLAN[kind] })

/* ======================================================================
   패턴: 한 마디(또는 반 마디)에 어떤 소리를 어느 자리에 놓을지
   ====================================================================== */
export interface Hit { t: number; d: number; vel: number; pitch: number }

const STRONG = (b: number) => (b >= 5 ? [0, 3] : b === 4 ? [0, 2] : [0])
const WEAK = (b: number) => (b >= 5 ? [1, 4] : b === 4 ? [1, 3] : b === 3 ? [1, 2] : [1])
const K = 36
const S = 38
const HC = 42
const HO = 46
const CR = 49

/** 드럼 한 마디 (ticks 기준, 마디 시작이 0). 박자 수가 달라도 자연스럽게 맞춘다. */
export function drumBar(style: DrumStyle, beats: number, custom?: DrumPat): Hit[] {
  if (style === 'custom') return customDrumBar(custom)
  const out: Hit[] = []
  const add = (t: number, pitch: number, vel: number, d = 120) => out.push({ t, d, vel, pitch })
  const eighths = (vel = 78) => { for (let i = 0; i < beats * 2; i++) add(i * 240, HC, i % 2 ? vel - 22 : vel) }
  switch (style) {
    case 'none': break
    case 'basic8':
      STRONG(beats).forEach((b) => add(b * PPQ, K, 105))
      WEAK(beats).forEach((b) => add(b * PPQ, S, 100))
      eighths()
      break
    case 'basic4':
      STRONG(beats).forEach((b) => add(b * PPQ, K, 95))
      WEAK(beats).forEach((b) => add(b * PPQ, S, 85))
      for (let b = 0; b < beats; b++) add(b * PPQ, HC, 80)
      break
    case 'floor4':
      for (let b = 0; b < beats; b++) { add(b * PPQ, K, 105); add(b * PPQ + 240, HO, 80, 200) }
      WEAK(beats).forEach((b) => add(b * PPQ, S, 85))
      break
    case 'sixteen':
      STRONG(beats).forEach((b) => add(b * PPQ, K, 105))
      add(PPQ + 120 * 3 - 0, K, 85) // 2박의 마지막 16분
      WEAK(beats).forEach((b) => add(b * PPQ, S, 100))
      for (let i = 0; i < beats * 4; i++) add(i * 120, HC, i % 4 === 0 ? 80 : i % 2 ? 45 : 62, 100)
      break
    case 'syncop':
      add(0, K, 108)
      if (beats >= 3) add(720, K, 98) // 2박의 ‘and’ (당김음)
      if (beats >= 4) add(1200, K, 98) // 3박의 ‘and’
      WEAK(beats).forEach((b) => add(b * PPQ, S, 100))
      eighths(74)
      break
    case 'halftime':
      add(0, K, 108)
      add(Math.floor(beats / 2) * PPQ, S, 105)
      eighths(70)
      break
    case 'shuffle':
      for (let b = 0; b < beats; b++) { add(b * PPQ, HC, 80, 150); add(b * PPQ + 320, HC, 62, 150) }
      STRONG(beats).forEach((b) => add(b * PPQ, K, 105))
      WEAK(beats).forEach((b) => add(b * PPQ, S, 100))
      break
    case 'polka':
      STRONG(beats).forEach((b) => add(b * PPQ, K, 105))
      for (let b = 0; b < beats; b++) add(b * PPQ + 240, S, 78)
      break
  }
  return out
}

/**
 * 필인: 파트가 넘어가기 직전 마지막 박(들)을 리듬에 맞는 채우기로 바꾼다.
 * 셔플·셋잇단 → 셋잇단 필, 하프타임 → 듬성듬성 묵직하게, 포온더플로어 → 킥은 그대로 두고 스네어 16분 롤(점점 세게),
 * 16비트 → 두 박 동안 16분 탐 내려오기, 4비트·폴카 → 8분음표 두 번, 나머지(8비트 등) → 마지막 박 16분 탐.
 */
export function withFill(hits: Hit[], beats: number, style: DrumStyle = 'basic8', grid?: number): Hit[] {
  const T1 = 50, T2 = 47, T3 = 45, FT = 41
  const add = (out: Hit[], t: number, pitch: number, vel: number, d = 110) => out.push({ t, d, vel, pitch })
  const triplet = style === 'shuffle' || (style === 'custom' && grid === 3)
  const kind = triplet ? 'triplet' : style === 'halftime' ? 'sparse' : style === 'floor4' ? 'roll' : style === 'sixteen' ? 'long16' : style === 'basic4' || style === 'polka' ? 'eighth' : 'tom16'
  const span = kind === 'long16' || kind === 'triplet' ? Math.min(2, beats) : 1
  const from = (beats - span) * PPQ
  // 포온더플로어는 박마다 치는 킥을 남긴다 (춤추는 발이 멈추지 않게)
  const out = hits.filter((h) => h.t < from || (kind === 'roll' && h.pitch === K))
  switch (kind) {
    case 'triplet': {
      const seq = [S, S, T1, T2, T3, FT]
      for (let i = 0; i < span * 3; i++) add(out, from + i * (PPQ / 3), seq[i + (span === 1 ? 3 : 0)], 88 + i * 3)
      add(out, from, K, 96)
      break
    }
    case 'sparse':
      add(out, from, S, 104, 200)
      add(out, from + PPQ / 2, FT, 100, 200)
      add(out, from + PPQ / 2, K, 92)
      break
    case 'roll':
      for (let i = 0; i < 4; i++) add(out, from + i * 120, S, 70 + i * 12, 100)
      break
    case 'long16': {
      const seq = [S, S, T1, T1, T2, T2, FT, FT]
      for (let i = 0; i < span * 4; i++) add(out, from + i * 120, seq[i + (span === 1 ? 4 : 0)], 84 + i * 3, 100)
      add(out, from, K, 98)
      break
    }
    case 'eighth':
      add(out, from, S, 96)
      add(out, from + PPQ / 2, T2, 100)
      add(out, from, K, 96)
      break
    default: {
      const toms = [T1, T1, T2, FT]
      toms.forEach((p, i) => add(out, from + i * 120, p, 92 + i * 4))
      add(out, from, K, 100)
    }
  }
  return out
}

/** 반주(화음) 한 구간. v는 아래→위로 정렬된 화음 구성음 */
export interface CompHit { t: number; d: number; vel: number; pitches: number[] }
export function compSeg(style: ChordRhythm, len: number, v: number[]): CompHit[] {
  const out: CompHit[] = []
  const chord = (t: number, d: number, vel: number) => out.push({ t, d: Math.max(60, Math.min(d, len - t)), vel, pitches: v })
  switch (style) {
    case 'none': case 'custom': break
    case 'whole': chord(0, len, 70); break
    case 'half': for (let t = 0; t < len; t += 960) chord(t, 960, t === 0 ? 76 : 66); break
    case 'beats': for (let t = 0; t < len; t += PPQ) chord(t, 420, t === 0 ? 82 : 66); break
    case 'eighths': for (let t = 0; t < len; t += 240) chord(t, 210, t % PPQ === 0 ? 76 : 56); break
    case 'offbeat': for (let t = 240; t < len; t += PPQ) chord(t, 180, 74); break
    case 'syncop': for (let t = 0; t < len; t += 720) chord(t, Math.min(720, len - t) - 30, t === 0 ? 82 : 70); break
    case 'arpeggio': {
      const order = v.length >= 4 ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 1]
      let i = 0
      for (let t = 0; t < len; t += 240, i++) out.push({ t, d: 230, vel: t % PPQ === 0 ? 74 : 58, pitches: [v[order[i % order.length] % v.length]] })
      break
    }
  }
  return out
}

export interface BassCtx {
  rootP: number
  thirdInt: number
  fifthInt: number
  nextRootP: number
  /** 이 구간 안에서 킥 드럼이 울리는 자리 (구간 시작이 0) */
  kicks: number[]
  barIndex: number
  /** 직접 정한 베이스: 칸별 음, 그리고 이 구간 안의 [위치, 칸 번호] */
  /** 직접 정한 베이스: 이 구간 안의 음들 */
  pat?: { t: number; d: number; n: BassNote; cont: boolean }[]
}

export function bassSeg(style: BassStyle, len: number, c: BassCtx): { t: number; d: number; vel: number; pitch: number }[] {
  const out: { t: number; d: number; vel: number; pitch: number }[] = []
  const add = (t: number, d: number, pitch: number, vel = 88) => t < len && out.push({ t, d: Math.max(60, Math.min(d, len - t)), vel, pitch })
  const approach = c.nextRootP > c.rootP ? c.nextRootP - 1 : c.nextRootP < c.rootP ? c.nextRootP + 1 : c.rootP + c.fifthInt
  const rootsOnKicks = () => {
    const ts = [...new Set([0, ...(c.kicks.length ? c.kicks : len >= 1920 ? [960] : [])])].sort((a, b) => a - b)
    ts.forEach((t, i) => add(t, (ts[i + 1] ?? len) - t - 30, c.rootP, i === 0 ? 96 : 84))
  }
  switch (style) {
    case 'none': break
    case 'roots': rootsOnKicks(); break
    case 'roots-pass':
      rootsOnKicks()
      if (c.barIndex % 2 === 1) {
        if (len >= 1920) add(len - 720, 200, c.rootP + 12, 80) // 3박 ‘and’에서 옥타브 점프
        add(len - 240, 220, approach, 82) // 마디 끝에서 다음 화음으로 이어 주는 음
      }
      break
    case 'walking': {
      const seq = [c.rootP, c.rootP + c.thirdInt, c.rootP + c.fifthInt, approach]
      const n = Math.round(len / PPQ)
      for (let i = 0; i < n; i++) add(i * PPQ, 440, i === n - 1 && n > 1 ? approach : seq[i % 3], i === 0 ? 92 : 80)
      break
    }
    case 'finger': {
      const seq = [c.rootP, c.rootP + c.fifthInt, c.rootP + 12, c.rootP + c.fifthInt]
      for (let t = 0, i = 0; t < len; t += 240, i++) add(t, 220, seq[i % 4], t % PPQ === 0 ? 86 : 68)
      break
    }
    case 'octave':
      for (let t = 0, i = 0; t < len; t += 240, i++) add(t, 200, i % 2 ? c.rootP + 12 : c.rootP, i % 2 ? 66 : 88)
      break
    case 'whole': add(0, len - 20, c.rootP, 80); break
    case 'custom':
      for (const h of c.pat ?? []) {
        const pitch = h.n.tone === 0 ? c.rootP : h.n.tone === 1 ? c.rootP + c.fifthInt : c.rootP + 12
        add(h.t, h.d - 20, pitch, h.cont ? 72 : h.n.t % PPQ === 0 ? 90 : 78)
      }
      break
  }
  return out
}

/** 직접 정한 드럼 한 마디. 박 위치에 따라 세기를 다르게(센 박 > 뒷박 > 16분·셋잇단) */
export function customDrumBar(c: DrumPat | undefined): Hit[] {
  if (!c) return []
  const out: Hit[] = []
  const lv = (t: number, a: number, b: number, d: number) => (t % PPQ === 0 ? a : t % (PPQ / 2) === 0 ? b : d)
  for (const n of c.hat) out.push({ t: n.t, d: 110, vel: lv(n.t, 82, 66, 54), pitch: HC })
  for (const n of c.open ?? []) out.push({ t: n.t, d: Math.max(200, n.d), vel: lv(n.t, 84, 74, 64), pitch: HO })
  for (const n of c.snare) out.push({ t: n.t, d: 110, vel: lv(n.t, 102, 92, 68), pitch: S })
  for (const n of c.tom ?? []) out.push({ t: n.t, d: 160, vel: lv(n.t, 96, 88, 78), pitch: 45 })
  for (const n of c.kick) out.push({ t: n.t, d: 110, vel: lv(n.t, 106, 98, 90), pitch: K })
  for (const n of c.crash ?? []) out.push({ t: n.t, d: 900, vel: 100, pitch: CR })
  return out
}

/** 화면의 리듬 그림용: 4/4(또는 현재 박자) 한 마디의 대표 패턴 */
export function sampleBar(beats: number) {
  const len = beats * PPQ
  const v = [60, 64, 67]
  return {
    comp: (s: ChordRhythm, custom?: PatNote[]): CompHit[] => {
      if (s !== 'custom') return compSeg(s, len, v)
      return [...(custom ?? [])].sort((a, b) => a.t - b.t).map((n) => ({ t: n.t, d: Math.max(60, n.d - 20), vel: 76, pitches: v }))
    },
    drum: (s: DrumStyle, custom?: DrumPat) => drumBar(s, beats, custom),
    bass: (s: BassStyle, drum: DrumStyle, custom?: BassNote[], customDrum?: DrumPat) =>
      bassSeg(s, len, {
        rootP: 36, thirdInt: 4, fifthInt: 7, nextRootP: 41, kicks: drumBar(drum, beats, customDrum).filter((h) => h.pitch === K).map((h) => h.t), barIndex: 1,
        pat: s === 'custom' ? patInSeg(custom ?? [], len, 0, len) : undefined,
      }),
  }
}

/* ======================================================================
   곡에 적용하기
   ====================================================================== */
const ROLE_NAMES: Record<'chords' | 'bass' | 'drums', string> = { chords: L("코드 반주"), bass: L("베이스"), drums: L("드럼") }

export function findRoleTrack(song: Song, role: TrackRole): Track | undefined {
  const byRole = song.tracks.find((t) => t.role === role)
  if (role === 'guitar') return byRole
  if (byRole) return byRole
  if (role === 'drums') return song.tracks.find((t) => t.drum)
  const key = role === 'chords' ? [L("코드"), L("반주")] : role === 'bass' ? [L("베이스")] : [L("멜로디")]
  return song.tracks.find((t) => !t.drum && key.some((k) => t.name.includes(k)))
}

/** 파트별 선택(plans)을 곡의 코드·베이스·드럼 트랙에 음표로 만든다. only가 있으면 그 파트만 다시 만든다. */
export function generate(song: Song, settings: Settings, plans: Record<string, PartPlan>, only?: string[]): Song {
  const minor = isMinorScale(settings.scaleType)
  const root = settings.scaleType === 'none' ? 0 : settings.scaleRoot
  const harm: Harmony = settings.scaleType === 'none' ? minor : settings.scaleType
  const beats = song.beatsPerBar
  const barTicks = beats * PPQ
  const ranges = rangesOf(song)

  // 필요한 트랙이 없으면 만든다
  const tracks = song.tracks.map((t) => ({ ...t }))
  const need = (role: 'chords' | 'bass' | 'drums'): Track => {
    const found = findRoleTrack({ ...song, tracks }, role)
    if (found) {
      if (!found.role) found.role = role
      return found
    }
    const t: Track = { ...newTrack(tracks.length, role === 'drums'), name: ROLE_NAMES[role], role, program: role === 'chords' ? 48 : role === 'bass' ? 33 : 0, volume: role === 'chords' ? 0.5 : role === 'bass' ? 0.65 : 0.7 }
    tracks.push(t)
    return t
  }
  const chordsT = need('chords')
  const bassT = need('bass')
  const drumsT = need('drums')
  // 기타는 학생이 넣었을 때만 (자동으로 만들지 않는다)
  const guitarT = findRoleTrack({ ...song, tracks }, 'guitar')

  const targets = new Set(only ?? song.sections.map((s) => s.id))
  // 다시 만드는 파트 구간의 기존 코드·베이스·드럼 음표는 지운다
  for (const t of [chordsT, bassT, drumsT, ...(guitarT ? [guitarT] : [])]) {
    t.notes = t.notes.filter((n) => !song.sections.some((s) => targets.has(s.id) && n.start >= ranges.get(s.id)!.start && n.start < ranges.get(s.id)!.end))
  }

  // 구간(화음 하나가 이어지는 길이) 목록을 먼저 만들어 ‘다음 화음’을 알 수 있게 한다
  interface Seg { part: number; bar: number; t0: number; len: number; degree: number; sub: number }
  const segs: Seg[] = []
  song.sections.forEach((sec, pi) => {
    const plan = plans[sec.id]
    if (!plan) return
    const prog = progressionsFor(minor).find((p) => p.id === plan.prog) ?? progressionsFor(minor)[0]
    const degs = chordSegments(sec.bars, prog, plan.speed)
    const per = plan.speed === 'fast' ? 2 : 1
    const nextSec = song.sections[pi + 1]
    const turn = turnaroundOf(sec.kind, nextSec?.kind, degs[degs.length - 1], minor)
    degs.forEach((degree, i) => {
      const bar = Math.floor(i / per)
      const sub = i % per
      const t0 = ranges.get(sec.id)!.start + bar * barTicks + (sub * barTicks) / per
      if (turn !== null && i === degs.length - 1 && per === 1) {
        // 마지막 마디: 앞 반은 원래 화음, 뒤 반은 딸림화음
        segs.push({ part: pi, bar, t0, len: barTicks / 2, degree, sub: 0 })
        segs.push({ part: pi, bar, t0: t0 + barTicks / 2, len: barTicks / 2, degree: turn, sub: 1 })
      } else segs.push({ part: pi, bar, t0, len: barTicks / per, degree: turn !== null && i === degs.length - 1 ? turn : degree, sub })
    })
  })

  const cr = rangeOf(chordsT.program)
  const br = rangeOf(bassT.program)
  let prevCenter = 58
  const note = (pitch: number, start: number, dur: number, vel: number): Note => ({ id: uid(), pitch, start, dur, vel })

  segs.forEach((sg, i) => {
    const sec = song.sections[sg.part]
    if (!targets.has(sec.id)) return
    const plan = plans[sec.id]
    const chord = chordOf(root, harm, sg.degree, plan.seventh)
    const next = segs[i + 1]
    const nextChord = next ? chordOf(root, harm, next.degree, plans[song.sections[next.part].id].seventh) : chord

    // 화음: 앞 화음과 가까운 음으로 이어서 소리가 매끄럽게
    const v = fitGroup(
      chord.pcs.map((pc) => {
        let p = pc + 12 * Math.round((prevCenter - pc) / 12)
        if (p < 40) p += 12
        return p
      }).sort((a, b) => a - b),
      cr.low,
      cr.high,
    )
    prevCenter = v.reduce((a, b) => a + b, 0) / v.length
    // 코러스·B는 맨 아래 음을 한 옥타브 위에 겹쳐서 소리를 넓고 밝게(같은 화음이어도 ‘커졌다’는 느낌)
    const voice = (sec.kind === 'chorus' || sec.kind === 'b') && v[0] + 12 <= cr.high && !v.includes(v[0] + 12) ? [...v, v[0] + 12] : v
    const off = (sg.t0 - ranges.get(sec.id)!.start) % barTicks
    if (plan.comp === 'custom' && plan.compMode === 'arp') {
      // 펼친화음: 근음·3음·5음·위 근음·위 3음 가운데 고른 음을 차례로
      const rp = voice.find((x) => x % 12 === chord.rootPc) ?? voice[0]
      const lo = rp - 12 >= cr.low && rp > 64 ? rp - 12 : rp
      const tones = [lo, lo + chord.thirdInt, lo + chord.fifthInt, lo + 12, lo + 12 + chord.thirdInt]
      for (const h of patInSeg(plan.arpPat ?? [], barTicks, off, sg.len))
        chordsT.notes.push(note(tones[h.n.tone], sg.t0 + h.t, Math.max(60, h.d - 10), h.cont ? 62 : h.n.t % PPQ === 0 ? 82 : 70))
    } else if (plan.comp === 'custom') {
      for (const h of patInSeg(compPatOf(plan, barTicks), barTicks, off, sg.len))
        for (const p of voice) chordsT.notes.push(note(p, sg.t0 + h.t, Math.max(60, h.d - 20), h.cont ? 66 : h.n.t % PPQ === 0 ? 80 : 68))
    } else
      for (const h of compSeg(plan.comp, sg.len, voice))
        for (const p of h.pitches) chordsT.notes.push(note(p, sg.t0 + h.t, h.d, h.vel))

    // 베이스
    const rootP = Math.min(br.high, Math.max(br.low, 36 + ((chord.rootPc - 36) % 12 + 12) % 12))
    const nextRootP = Math.min(br.high, Math.max(br.low, 36 + ((nextChord.rootPc - 36) % 12 + 12) % 12))
    const barStart = sg.t0 - ((sg.t0 - ranges.get(sec.id)!.start) % barTicks)
    const kicks = drumBar(plan.drum, beats, drumPatOf(plan)).filter((h) => h.pitch === K).map((h) => h.t - (sg.t0 - barStart)).filter((t) => t >= 0 && t < sg.len)
    const pat = plan.bass === 'custom' ? patInSeg(bassPatOf(plan, barTicks), barTicks, off, sg.len) : undefined
    const bassHits = bassSeg(plan.bass, sg.len, { rootP, thirdInt: chord.thirdInt, fifthInt: chord.fifthInt, nextRootP, kicks, barIndex: sg.bar, pat })
    // 베이스 필: 다음 파트로 넘어가기 직전 반 박에 다음 근음 바로 아래(또는 위) 반음으로 ‘쓱’ 다가간다
    const partEnd = !next || next.part !== sg.part
    if (plan.fill && plan.bass !== 'none' && partEnd && next && plans[song.sections[next.part].id]?.bass !== 'none' && sg.len >= PPQ) {
      const at = sg.len - PPQ / 2
      const kept = bassHits.filter((h) => h.t < at).map((h) => (h.t + h.d > at ? { ...h, d: at - h.t } : h))
      const ap = nextRootP - 1 >= br.low ? nextRootP - 1 : nextRootP + 1
      for (const h of [...kept, { t: at, d: PPQ / 2 - 20, vel: 92, pitch: ap }]) bassT.notes.push(note(h.pitch, sg.t0 + h.t, h.d, h.vel))
    } else
      for (const h of bassHits) bassT.notes.push(note(h.pitch, sg.t0 + h.t, h.d, h.vel))

    // 일렉 기타: 파워 코드(근음+5도(+옥타브)). 벌스 쪽은 팜 뮤트 8분음표, 코러스 쪽은 시원하게 울리는 오픈 파워 코드
    if (guitarT && plan.comp !== 'none') {
      const gr = rangeOf(guitarT.program)
      let gRoot = 40 + ((chord.rootPc - 40) % 12 + 12) % 12 // 낮은 미(E2)부터 한 옥타브 안
      if (gRoot < gr.low) gRoot += 12
      for (const h of guitarSeg(sec.kind, sg.len, beats, off, gRoot, sg.sub === 0 && sg.bar === 0, i === segs.length - 1 || segs[i + 1].part !== sg.part))
        for (const p of h.pitches) guitarT.notes.push(note(p, sg.t0 + h.t, h.d, h.vel))
    }
  })

  // 드럼은 마디 단위
  song.sections.forEach((sec) => {
    if (!targets.has(sec.id)) return
    const plan = plans[sec.id]
    if (!plan || plan.drum === 'none') return
    const r = ranges.get(sec.id)!
    const si = song.sections.indexOf(sec)
    const hasNext = si < song.sections.length - 1
    const prev = si > 0 ? plans[song.sections[si - 1].id] : undefined
    // 앞 파트가 필인으로 넘어왔으면 첫 박에 크래시로 받아 준다
    const crash = plan.crash || (!!prev && prev.fill && prev.drum !== 'none')
    for (let bar = 0; bar < sec.bars; bar++) {
      let hits = drumBar(plan.drum, beats, drumPatOf(plan))
      // 필인은 다음 파트로 넘어갈 때만 (곡의 맨 끝에는 넣지 않는다)
      if (plan.fill && hasNext && bar === sec.bars - 1 && beats >= 2) hits = withFill(hits, beats, plan.drum, plan.grid)
      if (crash && bar === 0 && !hits.some((h) => h.t === 0 && h.pitch === CR)) hits = [...hits, { t: 0, d: 960, vel: 104, pitch: CR }]
      for (const h of hits) drumsT.notes.push(note(h.pitch, r.start + bar * barTicks + h.t, h.d, h.vel))
    }
  })

  for (const t of [chordsT, bassT, drumsT, ...(guitarT ? [guitarT] : [])]) t.notes.sort((a, b) => a.start - b.start)
  return { ...song, tracks }
}

/** 기타 한 구간: 파트 종류에 따라 팜 뮤트(짧게 끊는 8분음표) 또는 오픈 파워 코드 */
export function guitarSeg(kind: SectionKind, len: number, beats: number, off: number, root: number, first: boolean, last: number | boolean): { t: number; d: number; vel: number; pitches: number[] }[] {
  const out: { t: number; d: number; vel: number; pitches: number[] }[] = []
  const five = [root, root + 7]
  const full = [root, root + 7, root + 12]
  const open = kind === 'chorus' || kind === 'b' || kind === 'bridge'
  const ring = kind === 'intro' || kind === 'outro'
  const barT = beats * PPQ
  if (ring) {
    // 인트로·아웃트로: 화음마다 한 번 길게 울리고, 첫 박 뒤 8분음표 두 번으로 살짝 밀어 준다
    out.push({ t: 0, d: Math.min(len, barT) - 30, vel: first ? 100 : 90, pitches: full })
    if (len > barT) out.push({ t: barT, d: len - barT - 30, vel: 84, pitches: full })
    return out
  }
  if (open) {
    // 코러스: 1박(길게) · 2박 반(당김) · 4박 반 짧게 — 마디마다
    for (let b0 = 0; b0 < len; b0 += barT) {
      const step = [{ t: 0, d: PPQ * 1.5 }, { t: PPQ * 1.5, d: PPQ * (beats - 1.5) }]
      for (const s of step) {
        const t = b0 + s.t
        if (t >= len) break
        out.push({ t, d: Math.min(s.d, len - t) - 30, vel: s.t === 0 ? 104 : 92, pitches: full })
      }
    }
    return out
  }
  // 벌스·프리코러스·간주 등: 팜 뮤트 8분음표(근음+5도, 짧고 세게, 박 머리에 강세)
  const eighth = PPQ / 2
  for (let t = 0; t < len; t += eighth) {
    const abs = off + t
    const onBeat = abs % PPQ === 0
    const down = abs % barT === 0
    // 프리코러스는 마지막 마디에서 점점 세게 (코러스로 올라가는 느낌)
    const build = kind === 'prechorus' && last && t >= len - barT ? 10 : 0
    out.push({ t, d: Math.round(eighth * 0.42), vel: (down ? 96 : onBeat ? 86 : 74) + build, pitches: five })
  }
  return out
}

/**
 * 턴어라운드: 벌스·A·프리코러스가 코러스·B 바로 앞에서 딸림화음이 아닌 화음으로 끝나면,
 * 마지막 마디의 뒤쪽 반을 딸림화음(Ⅴ, 단조는 Ⅶ)으로 바꿔 ‘이제 터진다!’는 긴장을 만들어 넘겨 준다.
 */
export function turnaroundOf(kind: SectionKind, nextKind: SectionKind | null | undefined, last: number, minor: boolean): number | null {
  if (!(kind === 'verse' || kind === 'a' || kind === 'prechorus' || kind === 'free')) return null
  if (!(nextKind === 'chorus' || nextKind === 'b')) return null
  const domDeg = minor ? 6 : 4
  if (last === domDeg || (minor && last === 4)) return null
  return domDeg
}

/** 파트의 마지막 화음(다음 파트 추천용). nextKind를 주면 턴어라운드까지 따진다 */
export function lastChordOf(bars: number, plan: PartPlan, minor: boolean, kind?: SectionKind, nextKind?: SectionKind | null): number {
  const prog = progressionsFor(minor).find((p) => p.id === plan.prog) ?? progressionsFor(minor)[0]
  const d = chordSegments(bars, prog, plan.speed)
  const last = d[d.length - 1]
  return (kind && turnaroundOf(kind, nextKind, last, minor)) ?? last
}

/* ======================================================================
   센스 있는 추천: 앞 파트와 이어지는지, 다음 파트로 잘 풀리는지, 다른 파트와 대비가 되는지를 점수로 따진다
   ====================================================================== */
export interface Rank { prog: Progression; score: number; reasons: string[] }

export interface RankCtx {
  kind: SectionKind
  minor: boolean
  /** 음계 종류(모드면 화음 이름이 그 모드 기준) */
  mode?: ScaleType
  root: number
  bars: number
  prevLast: number | null
  prevName?: string
  nextFirst: number | null
  nextKind: SectionKind | null
  /** 이 파트보다 앞에 나온, 종류가 다른 기둥 파트들(벌스·코러스·A·B…)의 선택. 대비를 따질 때 쓴다 */
  peers: { name: string; kind: SectionKind; prog: string; first: number }[]
  /** 이 파트의 화음 속도(마지막 화음을 정확히 알려고) */
  speed?: ChordSpeed
  /** 앞 파트의 끝이 턴어라운드(마지막 반 마디를 딸림화음으로)로 바뀌었는지 */
  prevTurn?: boolean
}

/** 진행 b가 진행 a의 고리를 시작만 바꾼 것인지 (C G Am F ↔ F C G Am). 같은 고리라 결국 같은 진행으로 들린다 */
function isRotation(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let k = 1; k < a.length; k++) if (a.every((_, i) => a[(i + k) % a.length] === b[i])) return true
  return false
}

const BUILD = new Set(['build', 'm-build', 'm-v'])
const CONTRAST = new Set(['emo', 'jazz', 'm-dark', 'm-sad', 'andalus', 'm-major', 'royal'])
const HOME = new Set(['basic', 'm-basic', 'climb'])
const LIFT = new Set(['lift', 'royal', 'soar', 'm-lift', 'm-pop', 'm-major'])
const PILLAR = new Set<SectionKind>(['a', 'b', 'verse', 'chorus', 'free'])

/**
 * 화음 진행 추천 점수. 음악에서 흔히 쓰는 원리를 점수로 옮겼다.
 * 1) 앞 파트의 마지막 화음에서 자연스럽게 이어지는가 (5도 진행·딸림→으뜸 등)
 * 2) 대비: 코러스·B는 앞의 벌스·A와 다른 진행, 무엇보다 다른 화음으로 시작해야 ‘바뀌었다’는 느낌이 난다
 *    (같은 화음으로 시작하면 크게 깎는다. 단조의 후렴은 밝은 Ⅲ·Ⅵ, 장조의 후렴은 Ⅳ·Ⅵ로 여는 경우가 많다)
 * 3) 역할: 벌스·A는 으뜸화음으로 ‘집’을 먼저 들려주고, 연결 파트는 딸림화음으로 끝나 다음을 기다리게,
 *    아웃트로는 으뜸화음으로 끝나게
 */
export function rankProgressions(c: RankCtx): Rank[] {
  const nm = (d: number) => chordOf(c.root, c.mode ?? c.minor, d, false).name
  const kindLabel = (k: SectionKind) => KIND_LABEL[k]
  const list = progressionsFor(c.minor)
  // 대비를 따질 상대: 코러스는 벌스·A·자유, B는 A, 벌스는 앞의 코러스, 프리코러스·브릿지는 앞의 모든 기둥 파트
  const rivals = c.peers.filter((p) => {
    if (c.kind === 'chorus') return p.kind === 'verse' || p.kind === 'a' || p.kind === 'free' || p.kind === 'b'
    if (c.kind === 'b') return p.kind === 'a' || p.kind === 'verse'
    if (c.kind === 'verse') return p.kind === 'chorus'
    if (c.kind === 'a') return p.kind === 'b'
    if (c.kind === 'prechorus' || c.kind === 'bridge') return PILLAR.has(p.kind)
    return false
  })
  const out: Rank[] = list.map((prog) => {
    let score = 0
    const reasons: string[] = []
    let opened = false // 앞 파트에서 ‘확 열리며’ 시작한다는 이유를 이미 말했는지
    const first = prog.degrees[0]
    const segs = chordSegments(c.bars, prog, c.speed ?? 'normal')
    const last = segs[segs.length - 1]
    const dom = (d: number) => (c.minor ? d === 4 || d === 6 : d === 4)

    // 1) 앞 파트에서 이어지기
    if (c.prevLast !== null) {
      const i = suggestNext(c.prevLast, c.minor).findIndex((s) => s.degree === first)
      if (i >= 0) {
        score += 26 - i * 7
        reasons.push(L("앞 파트{0}가 {1}로 끝나서 {2}로 자연스럽게 이어져요", c.prevName ? `(${c.prevName})` : '', nm(c.prevLast), nm(first)))
      }
    }
    if (c.prevLast !== null && c.prevLast === first && c.kind !== 'outro') {
      score -= c.kind === 'chorus' || c.kind === 'b' ? 24 : 16
      reasons.push(L("앞 파트의 마지막 화음({0})이 그대로 이어져서 파트가 바뀐 게 잘 안 느껴져요", nm(first)))
    }
    if ((c.kind === 'chorus' || c.kind === 'b') && c.prevLast !== null && dom(c.prevLast)) {
      if (c.prevTurn) reasons.push(L("{0} 마지막 반 마디를 {1}(딸림화음)로 바꿔서 코러스로 힘 있게 넘겨 줘요", c.prevName ?? L("앞 파트"), nm(c.prevLast)))
      if (first === 0) { score += 20; reasons.push(L("앞 파트가 {0}(딸림화음)로 긴장을 쌓고, 코러스 첫 박에 {1}(으뜸화음)이 터져요", nm(c.prevLast), nm(0))) }
      else if (c.minor ? first === 5 || first === 2 : first === 3) { score += 12; reasons.push(L("{0}에서 {1}로 확 열리며 후렴이 시작돼요", nm(c.prevLast), nm(first))); opened = true }
    }
    // 다음 파트로 잘 풀리기 (뒤 파트는 아직 바뀔 수 있어서 가볍게)
    if (c.nextFirst !== null) {
      const i = suggestNext(last, c.minor).findIndex((s) => s.degree === c.nextFirst)
      if (i >= 0) score += 10 - i * 3
    }
    // 2) 대비
    for (const r of rivals) {
      const rp = list.find((x) => x.id === r.prog)
      if (r.prog === prog.id) {
        score -= 46
        reasons.push(L("{0}와 똑같은 진행이라 {1}가 새롭게 들리지 않아요", r.name, kindLabel(c.kind)))
      } else if (rp && isRotation(rp.degrees, prog.degrees) && c.kind !== 'prechorus') {
        score -= 34
        reasons.push(L("{0}와 같은 화음 고리를 시작만 바꾼 거라, 들으면 결국 같은 진행처럼 이어져요", r.name))
      } else if (r.first === first) {
        score -= c.kind === 'prechorus' ? 8 : 24
        reasons.push(L("{0}와 같은 {1}로 시작해서 바뀐 느낌이 약해요", r.name, nm(first)))
      } else if (c.kind === 'chorus' || c.kind === 'b') {
        score += 16
        reasons.push(L("{0}({1})와 다른 {2}로 시작해서 ‘{3}가 왔다!’는 느낌이 나요", r.name, nm(r.first), nm(first), kindLabel(c.kind)))
      }
    }
    if ((c.kind === 'chorus' || c.kind === 'b' || c.kind === 'bridge') && rivals.length) {
      const used = new Set(rivals.flatMap((r) => list.find((x) => x.id === r.prog)?.degrees ?? []))
      const fresh = [...new Set(prog.degrees)].filter((d) => !used.has(d))
      if (fresh.length) { score += 8 + 4 * Math.min(2, fresh.length - 1); reasons.push(L("{0}에 없던 {1} 화음이 나와 색깔이 바뀌어요", rivals[0].name, fresh.map(nm).join('·'))) }
      // 후렴 안에서 딸림→으뜸으로 ‘도착’하는 순간이 있으면 시원하다
      const ds = prog.degrees
      if (c.kind !== 'bridge' && ds.some((d, i) => i > 0 && d === 0 && dom(ds[i - 1]))) { score += 8; reasons.push(L("진행 안에서 딸림화음에서 으뜸화음으로 ‘쾅’ 도착해요")) }
    }
    if (c.kind === 'chorus' || c.kind === 'b') {
      const bright = c.minor ? first === 2 || first === 5 : first === 3 || first === 5
      if (bright) { score += 10; if (!opened) reasons.push(c.minor ? L("밝은 {0}로 열려서 후렴이 환해져요", nm(first)) : L("{0}로 열어서 분위기가 확 바뀌어요", nm(first))) }
      // 긴장만 쌓고 풀리지 않는 진행·재즈 진행은 후렴의 ‘터지는’ 역할에 덜 어울린다
      if (BUILD.has(prog.id)) { score -= 16; reasons.push(L("긴장을 쌓는 진행이라 후렴보다는 프리코러스에 더 어울려요")) }
      if (prog.id === 'jazz') score -= 8
      if (LIFT.has(prog.id)) { score += 10; reasons.push(L("후렴에 많이 쓰는, 시원하게 열리는 진행이에요")) }
    }
    // 3) 역할
    if ((c.kind === 'verse' || c.kind === 'a' || c.kind === 'free') && first === 0) {
      score += 14
      reasons.push(L("으뜸화음({0})으로 시작해서 곡의 ‘집’을 먼저 들려줘요", nm(0)))
    }
    const dominant = dom(last)
    if ((c.kind === 'verse' || c.kind === 'a') && (c.nextKind === 'chorus' || c.nextKind === 'b')) {
      if (dominant) { score += 14; reasons.push(L("{0}(딸림화음)로 끝나서 {1}가 터지기 직전처럼 기다려져요", nm(last), kindLabel(c.nextKind))) }
      else if (last === 0) score -= 8 // 벌스가 으뜸으로 닫히면 코러스가 덜 터진다
    }
    if (dominant && (c.kind === 'prechorus' || c.kind === 'bridge' || c.kind === 'intro' || c.kind === 'interlude')) {
      score += 22
      reasons.push(L("{0}(딸림화음)로 끝나 긴장이 쌓이고 다음 파트가 기다려져요", nm(last)))
    }
    if (c.kind === 'prechorus' && BUILD.has(prog.id)) { score += 22; reasons.push(L("후렴 앞에서 긴장을 쌓는 진행이에요")) }
    if (c.kind === 'bridge' && CONTRAST.has(prog.id)) { score += 18; reasons.push(L("브릿지답게 분위기를 확 바꿔 줘요")) }
    if (c.kind === 'outro' && HOME.has(prog.id)) { score += 26; reasons.push(L("으뜸화음으로 돌아와 곡이 끝난 느낌이 나요")) }
    if (c.kind === 'outro' && last === 0) score += 10
    if (c.kind === 'intro' && first === 0) { score += 8; reasons.push(L("{0}로 시작해서 곡의 조를 미리 알려 줘요", nm(0))) }
    if (prog.degrees.length > 4 && c.bars < 8) score -= 12 // 8개짜리 진행은 짧은 파트에서 끝까지 못 간다
    return { prog, score, reasons }
  })
  return out.sort((a, b) => b.score - a.score)
}

const KIND_LABEL: Record<SectionKind, string> = {
  a: L("A 파트"), b: L("B 파트"), intro: L("인트로"), verse: L("벌스"), prechorus: L("프리코러스"), chorus: L("코러스"), bridge: L("브릿지"),
  interlude: L("간주"), outro: L("아웃트로"), free: L("파트"),
}

/** 연결 역할의 파트: 이웃 파트를 보고 정한다 */
export const CONNECT = new Set<SectionKind>(['intro', 'prechorus', 'bridge', 'outro', 'interlude'])

/** 이 파트(index)의 이웃 파트 정보 */
export function neighborCtx(song: Song, plans: Record<string, PartPlan>, index: number, minor: boolean, root: number, mode?: ScaleType): RankCtx {
  const secs = song.sections
  const sec = secs[index]
  const has = (i: number) => !!plans[secs[i].id]
  let p = index - 1
  while (p >= 0 && !has(p)) p--
  let n = index + 1
  while (n < secs.length && (!has(n) || secs[n].kind === sec.kind)) n++
  const progOf = (pl: PartPlan) => progressionsFor(minor).find((x) => x.id === pl.prog) ?? progressionsFor(minor)[0]
  // 앞에 나온 다른 종류의 기둥 파트 (종류마다 가장 가까운 것 하나)
  const peers: RankCtx['peers'] = []
  for (let i = index - 1; i >= 0; i--) {
    const s = secs[i]
    if (s.kind === sec.kind || !has(i) || !PILLAR.has(s.kind) || peers.some((x) => x.kind === s.kind)) continue
    const pl = plans[s.id]
    if (pl.comp === 'none' && pl.bass === 'none') continue
    peers.push({ name: s.name, kind: s.kind, prog: pl.prog, first: progOf(pl).degrees[0] })
  }
  return {
    kind: sec.kind,
    minor,
    mode,
    root,
    bars: sec.bars,
    prevTurn: p >= 0 && lastChordOf(secs[p].bars, plans[secs[p].id], minor) !== lastChordOf(secs[p].bars, plans[secs[p].id], minor, secs[p].kind, p + 1 < secs.length ? secs[p + 1].kind : null),
    prevLast: p >= 0 ? lastChordOf(secs[p].bars, plans[secs[p].id], minor, secs[p].kind, p + 1 < secs.length ? secs[p + 1].kind : null) : null,
    prevName: p >= 0 ? secs[p].name : undefined,
    nextFirst: n < secs.length ? progOf(plans[secs[n].id]).degrees[0] : null,
    nextKind: (() => { let m = index + 1; while (m < secs.length && secs[m].kind === sec.kind) m++; return m < secs.length ? secs[m].kind : null })(),
    peers,
    speed: plans[sec.id]?.speed ?? DEFAULT_PLAN[sec.kind].speed,
  }
}

/**
 * 파트마다 선택이 없으면 채운다.
 * 1) 같은 종류가 이미 정해져 있으면 그대로 따라간다 (코러스 2, 코러스 3 … 는 자동으로 같게)
 * 2) 곡의 앞에서부터 차례로 정한다. 앞 파트에서 자연스럽게 이어지고, 앞의 기둥 파트와는 대비되게(rankProgressions)
 */
export function autoPlans(song: Song, settings: Settings, existing: Record<string, PartPlan>): Record<string, PartPlan> {
  const minor = isMinorScale(settings.scaleType)
  const root = settings.scaleType === 'none' ? 0 : settings.scaleRoot
  const out: Record<string, PartPlan> = { ...existing }
  const secs = song.sections

  const twinOf = (i: number) => {
    for (let k = 0; k < secs.length; k++) if (k !== i && secs[k].kind === secs[i].kind && out[secs[k].id] && (k < i || existing[secs[k].id])) return out[secs[k].id]
    return null
  }
  const fill = (i: number) => {
    const sec = secs[i]
    if (out[sec.id]) return
    const twin = twinOf(i)
    if (twin) { out[sec.id] = { ...twin, linked: true }; return }
    const base = defaultPlan(sec.kind, minor)
    const best = rankProgressions(neighborCtx(song, out, i, minor, root, settings.scaleType === 'none' ? undefined : settings.scaleType))[0]
    out[sec.id] = { ...base, prog: best && best.score > 0 ? best.prog.id : base.prog, linked: true }
  }
  // 앞에서부터 차례로: 앞 파트를 보고 이어지게, 앞의 기둥 파트와는 대비되게
  secs.forEach((_, i) => fill(i))
  return out
}

/** 같은 종류의 다른 파트 번호들 */
export function siblingsOf(song: Song, id: string): number[] {
  const kind = song.sections.find((s) => s.id === id)?.kind
  return song.sections.flatMap((s, i) => (s.id !== id && s.kind === kind ? [i] : []))
}
