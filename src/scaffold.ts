import { fitGroup, rangeOf } from './instruments'
import { NOTE_NAMES_EN, SCALES } from './music'
import { rangesOf } from './sections'
import { newTrack } from './storage'
import { PPQ, uid, type Note, type SectionKind, type Settings, type Song, type Track } from './types'

/* ======================================================================
   뼈대 세우기: 화음 진행 · 반주 리듬 · 드럼 · 베이스를 ‘메뉴판’에서 고르면 음표로 만들어 준다.
   멜로디는 직접 쓰는 것이므로 만들지 않는다.
   ====================================================================== */

export type ChordRhythm = 'whole' | 'half' | 'beats' | 'eighths' | 'offbeat' | 'arpeggio' | 'syncop'
export type DrumStyle = 'none' | 'basic8' | 'basic4' | 'floor4' | 'sixteen' | 'syncop' | 'halftime' | 'shuffle' | 'polka'
export type BassStyle = 'none' | 'roots' | 'roots-pass' | 'walking' | 'finger' | 'octave' | 'whole'
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
  { id: 'pop4', name: 'Ⅰ–Ⅴ–ⅵ–Ⅳ', degrees: [0, 4, 5, 3], mood: '신나고 친숙한 팝', theory: '으뜸-딸림-병행단조-버금딸림. 수많은 히트곡에 쓰인 ‘팝의 공식’이에요.' },
  { id: 'oldies', name: 'Ⅰ–ⅵ–Ⅳ–Ⅴ', degrees: [0, 5, 3, 4], mood: '따뜻한 옛 노래 느낌', theory: '1950년대 올디스에서 유행해서 ‘50s 진행’이라고도 불러요.' },
  { id: 'emo', name: 'ⅵ–Ⅳ–Ⅰ–Ⅴ', degrees: [5, 3, 0, 4], mood: '애절하고 벅찬 감성', theory: '단조 화음(ⅵ)으로 시작해서 슬픈 듯 밝게 풀리는, 같은 화음을 다르게 돌린 진행이에요.' },
  { id: 'basic', name: 'Ⅰ–Ⅳ–Ⅴ–Ⅰ', degrees: [0, 3, 4, 0], mood: '가장 기본적이고 안정적', theory: '3대 화음(Ⅰ Ⅳ Ⅴ)만 쓰는 기본 종지. 마지막에 으뜸화음으로 돌아와 끝난 느낌이 나요.' },
  { id: 'lift', name: 'Ⅳ–Ⅰ–Ⅴ–ⅵ', degrees: [3, 0, 4, 5], mood: '시원하게 터지는 후렴', theory: '밝은 Ⅳ 화음으로 시작해 열린 느낌을 줘서 코러스에 잘 어울려요.' },
  { id: 'jazz', name: 'ⅱ–Ⅴ–Ⅰ–ⅵ', degrees: [1, 4, 0, 5], mood: '세련된 재즈 느낌', theory: 'ⅱ–Ⅴ–Ⅰ은 재즈의 기본 진행. 7화음을 켜면 더 재즈다워져요.' },
  { id: 'build', name: 'ⅵ–Ⅴ–Ⅳ–Ⅴ', degrees: [5, 4, 3, 4], mood: '긴장이 쌓이는 진행', theory: 'Ⅴ(딸림화음)로 끝나서 ‘다음에 뭔가 나온다’는 기대를 만들어 프리코러스에 좋아요.' },
  { id: 'canon', name: '캐논 Ⅰ–Ⅴ–ⅵ–ⅲ–Ⅳ–Ⅰ–Ⅳ–Ⅴ', degrees: [0, 4, 5, 2, 3, 0, 3, 4], mood: '차분하게 흘러가는 8마디', theory: '파헬벨의 캐논에서 온 진행. 베이스가 계단처럼 내려와요.' },
]

export const PROG_MINOR: Progression[] = [
  { id: 'epic', name: 'ⅰ–Ⅵ–Ⅲ–Ⅶ', degrees: [0, 5, 2, 6], mood: '웅장하고 극적인 느낌', theory: '단조에서 가장 흔한 4화음. 영화·게임 음악에 많아요.' },
  { id: 'm-basic', name: 'ⅰ–ⅳ–ⅴ–ⅰ', degrees: [0, 3, 4, 0], mood: '기본적이고 어두운 안정감', theory: '단조의 3대 화음. 마지막에 ⅰ로 돌아와요.' },
  { id: 'm-sad', name: 'ⅰ–Ⅶ–Ⅵ–Ⅶ', degrees: [0, 6, 5, 6], mood: '출렁이며 가라앉는 느낌', theory: '으뜸음에서 한 계단씩 내려갔다 올라와요. 록과 팝에서 인기 있어요.' },
  { id: 'andalus', name: 'ⅰ–Ⅶ–Ⅵ–ⅴ', degrees: [0, 6, 5, 4], mood: '스페인풍 하강 진행', theory: '음이 차례로 내려오는 ‘안달루시안’ 느낌의 진행이에요.' },
  { id: 'm-lift', name: 'Ⅵ–Ⅶ–ⅰ–ⅰ', degrees: [5, 6, 0, 0], mood: '어둡다가 위로 올라서는 후렴', theory: 'Ⅵ→Ⅶ→ⅰ로 계단처럼 올라가 으뜸으로 도착해요.' },
  { id: 'm-dark', name: 'ⅰ–ⅳ–Ⅶ–Ⅲ', degrees: [0, 3, 6, 2], mood: '신비롭고 깊은 분위기', theory: '4도씩 움직이는 화음들이 이어져 깊이 있는 느낌을 줘요.' },
  { id: 'm-build', name: 'ⅳ–Ⅵ–Ⅶ–Ⅶ', degrees: [3, 5, 6, 6], mood: '긴장을 키우는 진행', theory: 'Ⅶ에서 멈춰서 으뜸(ⅰ)으로 돌아가고 싶게 만들어요.' },
]

export const progressionsFor = (minor: boolean) => (minor ? PROG_MINOR : PROG_MAJOR)

/** 이 음계에서 장조 계열인지 단조 계열인지 */
export const isMinorScale = (t: Settings['scaleType']) => t === 'minor' || t === 'minorPent' || t === 'blues'

/* ---------- 화음 만들기 ---------- */
const stepsOf = (minor: boolean) => (minor ? SCALES.minor.steps : SCALES.major.steps)

export interface ChordInfo {
  degree: number
  rootPc: number
  pcs: number[]
  name: string
  thirdInt: number
  fifthInt: number
}

export function chordOf(root: number, minor: boolean, degree: number, seventh: boolean): ChordInfo {
  const st = stepsOf(minor)
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
      case 0: return [{ degree: 3, reason: 'Ⅰ→Ⅳ: 활짝 열리는 가장 흔한 움직임' }, { degree: 5, reason: 'Ⅰ→ⅵ: 부드럽게 감성으로' }, { degree: 4, reason: 'Ⅰ→Ⅴ: 힘 있게 앞으로' }]
      case 1: return [{ degree: 4, reason: 'ⅱ→Ⅴ: 재즈에서 가장 정통인 연결' }]
      case 2: return [{ degree: 5, reason: 'ⅲ→ⅵ: 5도씩 내려가는 자연스러운 연결' }, { degree: 3, reason: 'ⅲ→Ⅳ: 한 칸 올라가요' }]
      case 3: return [{ degree: 0, reason: 'Ⅳ→Ⅰ: ‘아멘’ 종지처럼 편안하게 풀려요' }, { degree: 4, reason: 'Ⅳ→Ⅴ: 한 칸씩 올라가며 긴장' }, { degree: 1, reason: 'Ⅳ→ⅱ: 재즈풍 연결' }]
      case 4: return [{ degree: 0, reason: 'Ⅴ→Ⅰ: 가장 강하게 해결되는 연결(딸림→으뜸)' }, { degree: 5, reason: 'Ⅴ→ⅵ: 예상을 비껴가는 ‘거짓 종지’' }]
      case 5: return [{ degree: 3, reason: 'ⅵ→Ⅳ: 함께 자주 다니는 짝' }, { degree: 1, reason: 'ⅵ→ⅱ: 5도 하강으로 부드럽게' }, { degree: 4, reason: 'ⅵ→Ⅴ: 긴장을 키워요' }]
      default: return [{ degree: 0, reason: 'ⅶ°→Ⅰ: 이끎음이 으뜸으로 해결' }]
    }
  switch (last) {
    case 0: return [{ degree: 3, reason: 'ⅰ→ⅳ: 어둡게 깊어져요' }, { degree: 5, reason: 'ⅰ→Ⅵ: 밝은 화음으로 살짝 열려요' }, { degree: 6, reason: 'ⅰ→Ⅶ: 한 계단 내려가요' }]
    case 1: return [{ degree: 4, reason: 'ⅱ°→ⅴ: 자연스러운 연결' }]
    case 2: return [{ degree: 5, reason: 'Ⅲ→Ⅵ: 5도 하강' }, { degree: 3, reason: 'Ⅲ→ⅳ: 어두워져요' }]
    case 3: return [{ degree: 0, reason: 'ⅳ→ⅰ: 편안하게 으뜸으로' }, { degree: 6, reason: 'ⅳ→Ⅶ: 힘 있게 올라가요' }, { degree: 4, reason: 'ⅳ→ⅴ: 긴장을 키워요' }]
    case 4: return [{ degree: 0, reason: 'ⅴ→ⅰ: 해결되어 돌아와요' }, { degree: 5, reason: 'ⅴ→Ⅵ: 예상 밖의 밝음' }]
    case 5: return [{ degree: 6, reason: 'Ⅵ→Ⅶ: 계단처럼 올라가요' }, { degree: 3, reason: 'Ⅵ→ⅳ: 함께 자주 다니는 짝' }]
    default: return [{ degree: 0, reason: 'Ⅶ→ⅰ: 강하게 으뜸으로 돌아와요' }, { degree: 2, reason: 'Ⅶ→Ⅲ: 밝게 열려요' }]
  }
}

/* ---------- 메뉴 항목(이름과 설명) ---------- */
export interface Choice<T extends string> { id: T; name: string; icon: string; desc: string }

export const COMP_STYLES: Choice<ChordRhythm>[] = [
  { id: 'whole', icon: '▬', name: '꽉 채우기', desc: '한 화음을 마디 내내 길게 울려요. 멜로디가 돋보이고 차분해져요.' },
  { id: 'half', icon: '▬▬', name: '2분음표로 나누기', desc: '마디를 반으로 쪼개 화음을 두 번 쳐요. 안정적이고 넉넉한 느낌.' },
  { id: 'beats', icon: '▮▮▮▮', name: '박마다 끊기', desc: '매 박 화음을 짧게 쳐요. 기타 스트럼처럼 또렷해요.' },
  { id: 'eighths', icon: '▮▮▮▮▮▮▮▮', name: '8분음표로 잘게', desc: '박을 반으로 쪼개 쿵짝쿵짝. 에너지가 올라가요.' },
  { id: 'offbeat', icon: '·▮·▮', name: '엇박(뒷박) 스탭', desc: '박과 박 사이에만 화음을 쳐서 통통 튀어요. 레게·스카에서 쓰는 리듬이에요.' },
  { id: 'arpeggio', icon: '♪♪♪♪', name: '분산화음(아르페지오)', desc: '화음의 음을 하나씩 차례로 연주해요. 피아노·기타 반주에 흔해요.' },
  { id: 'syncop', icon: '▮··▮··▮·', name: '당김음 (3+3+2)', desc: '8분음표를 3+3+2로 묶어 센 박을 살짝 앞당겨요. 현대 팝의 단골 리듬이에요.' },
]

export const DRUM_STYLES: Choice<DrumStyle>[] = [
  { id: 'none', icon: '🚫', name: '드럼 쉬기', desc: '이 파트에서는 드럼을 빼요. 인트로·브릿지에서 분위기를 바꿀 때 좋아요.' },
  { id: 'basic8', icon: '🥁', name: '기본 8비트', desc: '킥은 1·3박, 스네어는 2·4박, 하이햇은 8분음표. 록과 팝의 가장 기본 박자예요.' },
  { id: 'basic4', icon: '🕐', name: '느긋한 4비트', desc: '하이햇을 4분음표로만 쳐서 여유롭게. 발라드에 어울려요.' },
  { id: 'floor4', icon: '💃', name: '포온더플로어', desc: '킥이 매 박마다 쿵쿵쿵쿵, 하이햇은 박 사이에. 댄스·EDM의 박자예요.' },
  { id: 'sixteen', icon: '⚡', name: '16비트', desc: '하이햇을 16분음표로 잘게 쳐요. 펑키하고 촘촘한 R&B 느낌.' },
  { id: 'syncop', icon: '🎯', name: '싱코페이션(당김음)', desc: '센 박 대신 박 사이에 킥을 당겨 쳐서 리듬이 앞으로 쏠려요. 현대 팝·펑크의 핵심이에요.' },
  { id: 'halftime', icon: '🐘', name: '하프타임', desc: '스네어를 3박에만 쳐서 속도가 반으로 느려진 듯 묵직해요. 힙합·트랩에서 써요.' },
  { id: 'shuffle', icon: '🎷', name: '셔플', desc: '한 박을 3등분해 ‘길-짧’으로 흔들려요(삼연음). 블루스·재즈 느낌의 리듬이에요.' },
  { id: 'polka', icon: '🎪', name: '폴카 (움-짝)', desc: '킥은 박에, 스네어는 박 사이에 ‘움-짝 움-짝’. 경쾌한 춤곡 리듬이에요.' },
]

export const BASS_STYLES: Choice<BassStyle>[] = [
  { id: 'none', icon: '🚫', name: '베이스 쉬기', desc: '이 파트에서는 베이스를 빼요.' },
  { id: 'roots', icon: '🎯', name: '루트 위주 (킥에 맞춤)', desc: '화음의 으뜸음(루트)을 드럼 킥과 같은 자리에 놓아요. 드럼과 베이스가 한 몸처럼 들려요.' },
  { id: 'roots-pass', icon: '✨', name: '루트 + 가끔 튀기', desc: '루트를 기본으로, 가끔 옥타브로 점프하고 마디 끝에서 다음 화음으로 이어 주는 음(경과음)을 넣어요.' },
  { id: 'walking', icon: '🚶', name: '워킹 베이스', desc: '4분음표로 루트-3도-5도-접근음을 걸어가듯 연주해요. 재즈의 대표 베이스 라인이에요.' },
  { id: 'finger', icon: '🖐', name: '핑거링 (8분 쪼개기)', desc: '마디를 8분음표로 쪼개 루트-5도-옥타브-5도를 계속 굴려요. 풍성하고 흐르는 느낌.' },
  { id: 'octave', icon: '🪩', name: '옥타브 펌핑', desc: '루트와 한 옥타브 위를 번갈아 8분음표로. 디스코·댄스의 들썩이는 베이스예요.' },
  { id: 'whole', icon: '▬', name: '길게 받치기', desc: '루트를 마디 내내 길게. 패드처럼 바닥을 깔아 줘요.' },
]

export const DEFAULT_PLAN: Record<SectionKind, Omit<PartPlan, 'prog'>> = {
  intro: { speed: 'normal', seventh: false, comp: 'arpeggio', drum: 'none', fill: false, crash: false, bass: 'none' },
  verse: { speed: 'normal', seventh: false, comp: 'beats', drum: 'basic8', fill: false, crash: false, bass: 'roots' },
  prechorus: { speed: 'normal', seventh: false, comp: 'eighths', drum: 'basic8', fill: true, crash: false, bass: 'roots' },
  chorus: { speed: 'normal', seventh: false, comp: 'eighths', drum: 'basic8', fill: false, crash: true, bass: 'roots-pass' },
  bridge: { speed: 'normal', seventh: true, comp: 'whole', drum: 'halftime', fill: true, crash: false, bass: 'whole' },
  interlude: { speed: 'normal', seventh: false, comp: 'arpeggio', drum: 'basic4', fill: false, crash: false, bass: 'roots' },
  outro: { speed: 'slow', seventh: false, comp: 'whole', drum: 'none', fill: false, crash: false, bass: 'whole' },
  a: { speed: 'normal', seventh: false, comp: 'beats', drum: 'basic8', fill: false, crash: false, bass: 'roots' },
  b: { speed: 'normal', seventh: false, comp: 'arpeggio', drum: 'basic4', fill: false, crash: false, bass: 'roots-pass' },
  free: { speed: 'normal', seventh: false, comp: 'beats', drum: 'basic8', fill: false, crash: false, bass: 'roots' },
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
export function drumBar(style: DrumStyle, beats: number): Hit[] {
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

/** 필인: 마지막 박을 톰 16분음표로 바꾼다 */
export function withFill(hits: Hit[], beats: number): Hit[] {
  const from = (beats - 1) * PPQ
  const kept = hits.filter((h) => h.t < from)
  const toms = [50, 50, 47, 41]
  return [...kept, ...toms.map((p, i) => ({ t: from + i * 120, d: 110, vel: 92 + i * 4, pitch: p })), { t: from, d: 110, vel: 100, pitch: K }]
}

/** 반주(화음) 한 구간. v는 아래→위로 정렬된 화음 구성음 */
export interface CompHit { t: number; d: number; vel: number; pitches: number[] }
export function compSeg(style: ChordRhythm, len: number, v: number[]): CompHit[] {
  const out: CompHit[] = []
  const chord = (t: number, d: number, vel: number) => out.push({ t, d: Math.max(60, Math.min(d, len - t)), vel, pitches: v })
  switch (style) {
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
  }
  return out
}

/** 화면의 리듬 그림용: 4/4(또는 현재 박자) 한 마디의 대표 패턴 */
export function sampleBar(beats: number) {
  const len = beats * PPQ
  const v = [60, 64, 67]
  return {
    comp: (s: ChordRhythm) => compSeg(s, len, v),
    drum: (s: DrumStyle) => drumBar(s, beats),
    bass: (s: BassStyle, drum: DrumStyle) =>
      bassSeg(s, len, { rootP: 36, thirdInt: 4, fifthInt: 7, nextRootP: 41, kicks: drumBar(drum, beats).filter((h) => h.pitch === K).map((h) => h.t), barIndex: 1 }),
  }
}

/* ======================================================================
   곡에 적용하기
   ====================================================================== */
const ROLE_NAMES: Record<'chords' | 'bass' | 'drums', string> = { chords: '코드 반주', bass: '베이스', drums: '드럼' }

export function findRoleTrack(song: Song, role: 'melody' | 'chords' | 'bass' | 'drums'): Track | undefined {
  const byRole = song.tracks.find((t) => t.role === role)
  if (byRole) return byRole
  if (role === 'drums') return song.tracks.find((t) => t.drum)
  const key = role === 'chords' ? ['코드', '반주'] : role === 'bass' ? ['베이스'] : ['멜로디']
  return song.tracks.find((t) => !t.drum && key.some((k) => t.name.includes(k)))
}

/** 파트별 선택(plans)을 곡의 코드·베이스·드럼 트랙에 음표로 만든다. only가 있으면 그 파트만 다시 만든다. */
export function generate(song: Song, settings: Settings, plans: Record<string, PartPlan>, only?: string[]): Song {
  const minor = isMinorScale(settings.scaleType)
  const root = settings.scaleType === 'none' ? 0 : settings.scaleRoot
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

  const targets = new Set(only ?? song.sections.map((s) => s.id))
  // 다시 만드는 파트 구간의 기존 코드·베이스·드럼 음표는 지운다
  for (const t of [chordsT, bassT, drumsT]) {
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
    degs.forEach((degree, i) => {
      const bar = Math.floor(i / per)
      const sub = i % per
      segs.push({ part: pi, bar, t0: ranges.get(sec.id)!.start + bar * barTicks + (sub * barTicks) / per, len: barTicks / per, degree, sub })
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
    const chord = chordOf(root, minor, sg.degree, plan.seventh)
    const next = segs[i + 1]
    const nextChord = next ? chordOf(root, minor, next.degree, plans[song.sections[next.part].id].seventh) : chord

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
    for (const h of compSeg(plan.comp, sg.len, v))
      for (const p of h.pitches) chordsT.notes.push(note(p, sg.t0 + h.t, h.d, h.vel))

    // 베이스
    const rootP = Math.min(br.high, Math.max(br.low, 36 + ((chord.rootPc - 36) % 12 + 12) % 12))
    const nextRootP = Math.min(br.high, Math.max(br.low, 36 + ((nextChord.rootPc - 36) % 12 + 12) % 12))
    const barStart = sg.t0 - (sg.sub * barTicks) / (plan.speed === 'fast' ? 2 : 1)
    const kicks = drumBar(plan.drum, beats).filter((h) => h.pitch === K).map((h) => h.t - (sg.t0 - barStart)).filter((t) => t >= 0 && t < sg.len)
    for (const h of bassSeg(plan.bass, sg.len, { rootP, thirdInt: chord.thirdInt, fifthInt: chord.fifthInt, nextRootP, kicks, barIndex: sg.bar }))
      bassT.notes.push(note(h.pitch, sg.t0 + h.t, h.d, h.vel))
  })

  // 드럼은 마디 단위
  song.sections.forEach((sec) => {
    if (!targets.has(sec.id)) return
    const plan = plans[sec.id]
    if (!plan || plan.drum === 'none') return
    const r = ranges.get(sec.id)!
    for (let bar = 0; bar < sec.bars; bar++) {
      let hits = drumBar(plan.drum, beats)
      if (plan.fill && bar === sec.bars - 1 && beats >= 2) hits = withFill(hits, beats)
      if (plan.crash && bar === 0) hits = [...hits, { t: 0, d: 960, vel: 104, pitch: CR }]
      for (const h of hits) drumsT.notes.push(note(h.pitch, r.start + bar * barTicks + h.t, h.d, h.vel))
    }
  })

  for (const t of [chordsT, bassT, drumsT]) t.notes.sort((a, b) => a.start - b.start)
  return { ...song, tracks }
}

/** 파트의 마지막 화음(다음 파트 추천용) */
export function lastChordOf(bars: number, plan: PartPlan, minor: boolean): number {
  const prog = progressionsFor(minor).find((p) => p.id === plan.prog) ?? progressionsFor(minor)[0]
  const d = chordSegments(bars, prog, plan.speed)
  return d[d.length - 1]
}

/* ======================================================================
   센스 있는 추천: 앞 파트와 이어지는지, 다음 파트로 잘 풀리는지, 다른 파트와 대비가 되는지를 점수로 따진다
   ====================================================================== */
export interface Rank { prog: Progression; score: number; reasons: string[] }

export interface RankCtx {
  kind: SectionKind
  minor: boolean
  root: number
  bars: number
  prevLast: number | null
  prevName?: string
  nextFirst: number | null
  nextKind: SectionKind | null
  /** 비슷하면 변화가 적어서 피하고 싶은 진행들(이웃 벌스·코러스의 진행) */
  avoid: string[]
}

const BUILD = new Set(['build', 'm-build'])
const CONTRAST = new Set(['emo', 'jazz', 'm-dark', 'm-sad', 'andalus'])
const HOME = new Set(['basic', 'm-basic'])

export function rankProgressions(c: RankCtx): Rank[] {
  const nm = (d: number) => chordOf(c.root, c.minor, d, false).name
  const kindLabel = (k: SectionKind) => KIND_LABEL[k]
  const list = progressionsFor(c.minor)
  const out: Rank[] = list.map((prog) => {
    let score = 0
    const reasons: string[] = []
    const first = prog.degrees[0]
    const last = prog.degrees[(c.bars - 1 + prog.degrees.length * 8) % prog.degrees.length]

    // 앞 파트의 마지막 화음에서 자연스럽게 이어지는가
    if (c.prevLast !== null) {
      const i = suggestNext(c.prevLast, c.minor).findIndex((s) => s.degree === first)
      if (i >= 0) {
        score += 34 - i * 8
        reasons.push(`앞 파트${c.prevName ? `(${c.prevName})` : ''}가 ${nm(c.prevLast)}로 끝나서 ${nm(first)}로 자연스럽게 이어져요`)
      }
    }
    // 다음 파트의 첫 화음으로 잘 풀리는가
    if (c.nextFirst !== null) {
      const i = suggestNext(last, c.minor).findIndex((s) => s.degree === c.nextFirst)
      if (i >= 0) {
        score += 34 - i * 8
        reasons.push(`${nm(last)}로 끝나서 다음 ${c.nextKind ? kindLabel(c.nextKind) : '파트'}의 ${nm(c.nextFirst)}로 잘 풀려요`)
      }
    }
    // 연결 파트는 딸림화음으로 끝나면 ‘다음에 뭔가 나온다’는 기대가 생긴다
    const dominant = c.minor ? last === 4 || last === 6 : last === 4
    if (dominant && (c.kind === 'prechorus' || c.kind === 'bridge' || c.kind === 'intro' || c.kind === 'interlude')) {
      score += 22
      reasons.push(`${nm(last)}(딸림화음)로 끝나 긴장이 쌓이고 다음 파트가 기다려져요`)
    }
    // 종류별 성격
    if (c.kind === 'prechorus' && BUILD.has(prog.id)) { score += 24; reasons.push('프리코러스용 긴장을 쌓는 진행이에요') }
    if (c.kind === 'bridge' && CONTRAST.has(prog.id)) { score += 18; reasons.push('브릿지답게 분위기를 확 바꿔 줘요') }
    if (c.kind === 'outro' && HOME.has(prog.id)) { score += 26; reasons.push('으뜸화음으로 돌아와 곡이 끝난 느낌이 나요') }
    if (c.kind === 'outro' && (last === 0)) { score += 10 }
    if (c.kind === 'chorus' && (prog.id === 'lift' || prog.id === 'm-lift')) { score += 12; reasons.push('시원하게 열리는 후렴용 진행이에요') }
    if ((c.kind === 'verse' || c.kind === 'a') && (prog.id === 'pop4' || prog.id === 'epic')) { score += 10 }
    if (c.kind === 'intro' && (prog.id === 'pop4' || prog.id === 'epic')) { score += 10 }
    // 이웃 파트와 같은 진행이면 변화가 적다 (브릿지는 특히)
    if (c.avoid.includes(prog.id)) {
      const pen = c.kind === 'bridge' ? 32 : c.kind === 'prechorus' ? 12 : 0
      if (pen) { score -= pen; reasons.push('이웃 파트와 같은 진행이라 변화가 적어요') }
    }
    return { prog, score, reasons }
  })
  return out.sort((a, b) => b.score - a.score)
}

const KIND_LABEL: Record<SectionKind, string> = {
  a: 'A 파트', b: 'B 파트', intro: '인트로', verse: '벌스', prechorus: '프리코러스', chorus: '코러스', bridge: '브릿지',
  interlude: '간주', outro: '아웃트로', free: '파트',
}

/** 연결 역할의 파트: 이웃 파트를 보고 정한다 */
const CONNECT = new Set<SectionKind>(['intro', 'prechorus', 'bridge', 'outro', 'interlude'])

/** 이 파트(index)의 이웃 파트 정보 */
export function neighborCtx(song: Song, plans: Record<string, PartPlan>, index: number, minor: boolean, root: number): RankCtx {
  const secs = song.sections
  const sec = secs[index]
  const has = (i: number) => !!plans[secs[i].id]
  let p = index - 1
  while (p >= 0 && !has(p)) p--
  let n = index + 1
  while (n < secs.length && !has(n)) n++
  const progOf = (pl: PartPlan) => progressionsFor(minor).find((x) => x.id === pl.prog) ?? progressionsFor(minor)[0]
  const avoid = secs
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i !== index && has(i) && (s.kind === 'verse' || s.kind === 'chorus' || s.kind === 'a' || s.kind === 'b'))
    .filter(({ i }) => Math.abs(i - index) <= 2 || secs[i].kind === 'verse' || secs[i].kind === 'chorus')
    .map(({ s }) => plans[s.id].prog)
  return {
    kind: sec.kind,
    minor,
    root,
    bars: sec.bars,
    prevLast: p >= 0 ? lastChordOf(secs[p].bars, plans[secs[p].id], minor) : null,
    prevName: p >= 0 ? secs[p].name : undefined,
    nextFirst: n < secs.length ? progOf(plans[secs[n].id]).degrees[0] : null,
    nextKind: n < secs.length ? secs[n].kind : null,
    avoid,
  }
}

/**
 * 파트마다 선택이 없으면 채운다.
 * 1) 같은 종류가 이미 정해져 있으면 그대로 따라간다 (코러스 2, 코러스 3 … 는 자동으로 같게)
 * 2) 벌스·코러스 같은 기둥 파트를 먼저 정하고
 * 3) 인트로·프리코러스·브릿지·아웃트로 같은 연결 파트는 앞뒤 파트를 보고 센스 있게 고른다
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
    const best = rankProgressions(neighborCtx(song, out, i, minor, root))[0]
    out[sec.id] = { ...base, prog: best && best.score > 0 ? best.prog.id : base.prog, linked: true }
  }
  secs.forEach((s, i) => { if (!CONNECT.has(s.kind)) fill(i) })
  secs.forEach((s, i) => { if (CONNECT.has(s.kind)) fill(i) })
  return out
}

/** 같은 종류의 다른 파트 번호들 */
export function siblingsOf(song: Song, id: string): number[] {
  const kind = song.sections.find((s) => s.id === id)?.kind
  return song.sections.flatMap((s, i) => (s.id !== id && s.kind === kind ? [i] : []))
}
