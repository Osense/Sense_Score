import { isEn, L } from '../i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import type { Workspace } from './WorkspaceTabs'
import { guessGrid, PatternEditor, PatternView, type Lane, type PatValue, type PlayMark } from './PatternView'
import { NOTE_NAMES_EN, NOTE_NAMES_KO, SCALES } from '../music'
import type { Answers } from '../template'
import { autoName, KINDS, planOf, stepBars, STRUCTURES, TYPICAL_BARS, type PlanItem } from '../sections'
import {
  autoPlans, bassPatOf, chordOf, chordSegments, compPatOf, DEFAULT_PLAN, drumPatOf, findRoleTrack, isMinorScale, neighborCtx, progressionsFor, rankProgressions, sampleBar,
  type BassNote, type BassStyle, type ChordRhythm, type ChordSpeed, type DrumPat, type DrumStyle, type PartPlan, type PatNote,
} from '../scaffold'
import { PPQ, type ScaleType, type SectionKind, type Settings, type Song } from '../types'

/* ======================================================================
   시작 인터뷰: 네 마당(준비 → 곡의 모양 → 반주 → 멜로디)을 한 화면에 한 질문씩 묻는다.
   카드를 누르면 바로 소리가 나서(다른 소리는 멈추고) 귀로 고를 수 있다.
   반주는 곡의 앞 파트부터 차례로: 파트 소개 + 화음 진행 → 화음 박자 → 화음 리듬꼴 → 드럼 → 베이스.
   같은 종류의 파트(벌스 2, 코러스 2…)는 처음 정한 것을 그대로 다시 쓴다.
   ====================================================================== */

type Chapter = 'ready' | 'shape' | 'band' | 'melody'
type Sub = 'chord' | 'speed' | 'comp' | 'drum' | 'bass'
interface Step { id: string; chapter: Chapter; kind?: SectionKind; sub?: Sub }

const CHAPTERS: { id: Chapter; no: string; label: string; sub: string }[] = [
  { id: 'ready', no: '01', label: L("곡 준비"), sub: L("이름·분위기·빠르기·악기") },
  { id: 'shape', no: '02', label: L("곡의 모양"), sub: L("어떤 순서로 흘러갈까") },
  { id: 'band', no: '03', label: L("반주 만들기"), sub: L("파트마다 화음·리듬·베이스") },
  { id: 'melody', no: '04', label: L("멜로디"), sub: L("내 노래 얹기") },
]

const SUB_LABEL: Record<Sub, string> = { chord: L("화음 진행"), speed: L("화음 박자"), comp: L("화음 리듬꼴"), drum: L("드럼"), bass: L("베이스") }

const TEMPOS = [
  { bpm: 72, label: L("느긋하게"), pic: L("거북이 걸음"), hint: L("자장가, 잔잔한 발라드"), term: L("Adagio 아다지오") },
  { bpm: 100, label: L("보통으로"), pic: L("산책하는 걸음"), hint: L("가장 무난한 빠르기"), term: L("Andante 안단테") },
  { bpm: 128, label: L("신나게"), pic: L("뛰어가는 걸음"), hint: L("댄스곡, 신나는 동요"), term: L("Allegro 알레그로") },
  { bpm: 160, label: L("아주 빠르게"), pic: L("로켓처럼 슝"), hint: L("게임 음악, 록"), term: L("Vivace 비바체") },
]
const tempoTerm = (bpm: number) => (bpm < 86 ? L("Adagio 아다지오") : bpm < 114 ? L("Andante 안단테") : bpm < 144 ? L("Allegro 알레그로") : L("Vivace 비바체"))

const METERS = [
  { beats: 4, label: L("하나 둘 셋 넷"), hint: L("가장 흔한 박자예요"), term: L("4/4 박자"), accents: [1, 0, 0.5, 0] },
  { beats: 3, label: L("하나 둘 셋"), hint: L("왈츠처럼 빙글빙글"), term: L("3/4 박자"), accents: [1, 0, 0] },
  { beats: 2, label: L("하나 둘"), hint: L("행진곡처럼 씩씩하게"), term: L("2/4 박자"), accents: [1, 0] },
  { beats: 5, label: L("하나 둘 셋 넷 다섯"), hint: L("독특한 박자에 도전!"), term: L("5/4 박자"), accents: [1, 0, 0, 0.5, 0] },
]

const MOODS: { type: ScaleType; label: string; hint: string; en: string; term: string; say: string }[] = [
  { type: 'major', label: L("밝고 신나게"), hint: L("맑은 날 같은 소리"), en: 'major', term: L("장음계"), say: L("major(메이저)는 ‘밝고 신나는 느낌’이라는 뜻이에요. 우리말로는 장조, 장음계라고 해요.") },
  { type: 'minor', label: L("차분하고 슬프게"), hint: L("비 오는 날 같은 소리"), en: 'minor', term: L("단음계"), say: L("minor(마이너)는 ‘차분하고 슬픈 느낌’이라는 뜻이에요. 우리말로는 단조, 단음계라고 해요.") },
  { type: 'pentatonic', label: L("아무렇게나 쳐도 예쁘게"), hint: L("틀리기 어려운 다섯 음"), en: 'major pentatonic', term: L("5음계"), say: L("pentatonic(펜타토닉)은 ‘다섯 음’이라는 뜻이에요. 부딪히는 음을 뺀 다섯 음만 써서 아무렇게나 쳐도 잘 어울려요.") },
  { type: 'blues', label: L("멋지고 끈적하게"), hint: L("블루스 느낌"), en: 'blues', term: L("블루스 음계"), say: L("blues(블루스)는 미국 흑인 음악에서 온 음계예요. 살짝 꺾이는 ‘블루 노트’가 들어 있어서 멋을 부린 느낌이 나요.") },
]
/** 자주 쓰는 조(살짝만 표시한다. 고르는 것은 자유) */
const COMMON_ROOTS: Record<ScaleType, number[]> = { major: [0, 7, 2, 5], minor: [9, 4, 2], pentatonic: [0, 7, 2], minorPent: [9, 4], blues: [9, 4, 7] }

const PARTS_WANT: { key: 'melody' | 'chords' | 'bass' | 'drums'; icon: IconName; label: string; hint: string }[] = [
  { key: 'melody', icon: 'melody', label: L("멜로디"), hint: L("내가 만드는 주인공 가락") },
  { key: 'chords', icon: 'keys', label: L("화음 반주"), hint: L("피아노·기타처럼 받쳐 줘요") },
  { key: 'bass', icon: 'sound', label: L("베이스"), hint: L("낮은 음으로 바닥을 깔아요") },
  { key: 'drums', icon: 'drum', label: L("드럼"), hint: L("쿵짝쿵짝 리듬을 만들어요") },
]

const TITLE_IDEAS = [L("나의 첫 곡"), L("봄날의 산책"), L("별이 빛나는 밤"), L("우리 동네 행진곡"), L("비 오는 날"), L("여름 방학"), L("꿈속의 놀이터"), L("달리는 자전거"), L("고양이의 낮잠"), L("바닷가 모래성")]

const SHAPES: Record<string, { label: string; say: string }> = {
  ab: { label: L("짧은 노래"), say: L("두 가락을 하나씩 들려줘요") },
  aba: { label: L("돌아오는 노래"), say: L("처음 가락으로 돌아와서 끝나요") },
  aaba: { label: L("되풀이하는 노래"), say: L("처음 가락을 두 번 들려줘서 기억에 남아요") },
  pop: { label: L("가요처럼"), say: L("이야기(벌스)와 후렴(코러스)을 번갈아요") },
  full: { label: L("길고 멋지게"), say: L("프리코러스와 브릿지까지 다 들어가요") },
  free: { label: L("빈 곳에서 내 마음대로"), say: L("파트를 하나씩 직접 쌓아요") },
}

/** 파트마다: 어떤 곳인지, 보통 어떻게 만드는지 */
const PART_GUIDE: Record<SectionKind, { what: string; how: string }> = {
  intro: { what: L("곡의 문을 여는 부분이에요."), how: L("보통 4마디예요. 조용히 시작하거나 후렴의 화음을 살짝 미리 들려줘요. 드럼과 베이스는 빼거나 가볍게 해서 ‘이제 시작한다’는 느낌을 줘요. 딸림화음(Ⅴ)으로 끝나면 다음 파트가 기다려져요.") },
  verse: { what: L("이야기를 풀어 가는 부분이에요. 노래의 1절, 2절이에요."), how: L("보통 8마디예요. 으뜸화음으로 시작해서 곡의 ‘집’을 먼저 들려주고, 후렴보다 조금 차분하게 해야 후렴이 더 신나게 들려요.") },
  prechorus: { what: L("후렴으로 올라가기 전의 징검다리예요."), how: L("보통 4마디예요. 긴장을 조금씩 쌓다가 딸림화음(Ⅴ)으로 끝나면 ‘곧 후렴이 온다!’는 기대가 생겨요. 드럼을 조금 잘게 치면 좋아요.") },
  chorus: { what: L("가장 신나고 기억에 남는 후렴이에요."), how: L("보통 8마디예요. 벌스와 다른 화음으로 시작해서 분위기를 확 바꾸고, 화음·드럼·베이스를 가장 꽉 채워요. 크래시 심벌로 ‘쾅’ 하고 열기도 해요.") },
  bridge: { what: L("분위기를 확 바꾸는 부분이에요."), how: L("보통 8마디예요. 지금까지 안 쓴 화음과 리듬으로 새로운 느낌을 주면, 마지막 후렴이 더 반갑게 들려요.") },
  interlude: { what: L("노래 사이에 악기만 연주하는 간주예요."), how: L("보통 4마디예요. 멜로디가 쉬는 동안 악기들이 숨을 고르는 곳이에요.") },
  outro: { what: L("곡을 마무리하는 부분이에요."), how: L("보통 4마디예요. 으뜸화음(Ⅰ)으로 돌아와 끝나야 ‘끝났다’는 느낌이 나요. 화음을 길게 울리고 드럼을 줄이면 차분하게 끝나요.") },
  a: { what: L("곡의 얼굴이 되는 첫 가락(주제)이에요."), how: L("보통 8마디예요. 으뜸화음으로 시작해서 곡의 조를 먼저 들려줘요.") },
  b: { what: L("A와 다른 분위기로 이야기를 이어 가는 가락이에요."), how: L("보통 8마디예요. A와 다른 화음으로 시작하고 리듬도 바꿔 보면 차이(대비)가 또렷해져요.") },
  free: { what: L("정해진 역할이 없는 파트예요."), how: L("마음 가는 대로 정해요.") },
}

/* 화음 리듬꼴 · 드럼 · 베이스: 음악 용어가 제목, 아이 말은 그 아래 */
interface Style<T extends string> { id: T; term: string; kid: string; desc: string }
const COMP_PICK: Style<ChordRhythm>[] = [
  { id: 'whole', term: L("롱 톤 (온음표 화음)"), kid: L("길게 울리기"), desc: L("화음 하나를 마디 내내 길게 울려요. 차분하고 멜로디가 돋보여요.") },
  { id: 'half', term: L("2분음표 화음"), kid: L("반으로 나눠 두 번"), desc: L("마디를 반으로 쪼개 화음을 두 번 쳐요. 넉넉하고 안정적이에요.") },
  { id: 'beats', term: L("4분음표 스트로크"), kid: L("박마다 톡톡"), desc: L("박마다 화음을 짧게 쳐요. 기타를 치는 것처럼 또렷해요.") },
  { id: 'eighths', term: L("8분음표 스트로크"), kid: L("잘게 쪼개 신나게"), desc: L("박을 반으로 쪼개 쿵짝쿵짝. 힘이 붙어요.") },
  { id: 'offbeat', term: L("업비트 (엇박)"), kid: L("뒷박에 통통"), desc: L("박과 박 사이에만 쳐서 통통 튀어요. 레게·스카의 리듬이에요.") },
  { id: 'arpeggio', term: L("아르페지오 (분산화음)"), kid: L("한 음씩 흘리기"), desc: L("화음의 음을 하나씩 차례로 쳐요. 피아노·기타 반주에 흔해요.") },
  { id: 'syncop', term: L("싱코페이션 (당김음)"), kid: L("살짝 당겨 치기"), desc: L("3+3+2로 묶어 센 박을 살짝 앞당겨요. 요즘 가요에 정말 많아요.") },
]
const DRUM_PICK: Style<DrumStyle>[] = [
  { id: 'basic8', term: L("8비트"), kid: L("쿵 짝 쿵 짝"), desc: L("킥은 1·3박, 스네어는 2·4박, 하이햇은 8분음표. 록과 가요의 가장 기본 박자예요.") },
  { id: 'basic4', term: L("4비트"), kid: L("느긋하게 걷는 리듬"), desc: L("하이햇을 박마다 한 번씩만 쳐서 여유로워요. 발라드에 어울려요.") },
  { id: 'floor4', term: L("포 온 더 플로어"), kid: L("쿵쿵쿵쿵 춤추는 리듬"), desc: L("킥이 모든 박에 쿵, 하이햇은 박 사이에 츠. 댄스 음악의 박자예요.") },
  { id: 'sixteen', term: L("16비트"), kid: L("촘촘하게 찰랑찰랑"), desc: L("하이햇을 16분음표로 잘게 쳐요. 펑키하고 촘촘해요.") },
  { id: 'syncop', term: L("싱코페이션"), kid: L("킥을 당겨 치기"), desc: L("센 박 대신 박 사이에 킥을 당겨 쳐서 리듬이 앞으로 쏠려요.") },
  { id: 'halftime', term: L("하프타임"), kid: L("묵직하게 천천히"), desc: L("스네어를 3박에만 쳐서 느려진 듯 묵직해요. 힙합에서 많이 써요.") },
  { id: 'shuffle', term: L("셔플"), kid: L("흔들흔들 통통"), desc: L("한 박을 ‘길-짧’으로 흔들어 쳐요. 블루스·재즈 느낌이에요.") },
  { id: 'polka', term: L("폴카"), kid: L("움-짝 움-짝 춤곡"), desc: L("킥은 박에, 스네어는 박 사이에. 경쾌한 춤곡 리듬이에요.") },
  { id: 'none', term: L("드럼 쉬기"), kid: L("이 파트는 드럼 없이"), desc: L("드럼을 빼면 조용해지고, 다음에 드럼이 들어올 때 더 신나요.") },
]
const BASS_PICK: Style<BassStyle>[] = [
  { id: 'roots', term: L("루트 베이스"), kid: L("드럼 킥과 함께 둥"), desc: L("화음의 맨 아래 음(근음, 루트)을 킥 드럼과 같은 자리에 쳐요. 드럼과 한 몸처럼 들려요.") },
  { id: 'roots-pass', term: L("경과음 베이스"), kid: L("가끔 통통 튀기"), desc: L("근음을 치다가 마디 끝에서 다음 화음으로 이어 주는 음(경과음)을 넣어요.") },
  { id: 'walking', term: L("워킹 베이스"), kid: L("걸어가듯 한 걸음씩"), desc: L("박마다 근음-3도-5도-이음음으로 걸어가요. 재즈의 대표 베이스예요.") },
  { id: 'finger', term: L("8비트 베이스"), kid: L("쉬지 않고 굴러가기"), desc: L("8분음표로 근음-5도-옥타브를 계속 굴려요. 풍성하고 흘러가요.") },
  { id: 'octave', term: L("옥타브 베이스"), kid: L("높게 낮게 들썩들썩"), desc: L("근음과 한 옥타브 위를 번갈아 쳐요. 디스코·댄스의 베이스예요.") },
  { id: 'whole', term: L("롱 톤 베이스"), kid: L("길게 받쳐 주기"), desc: L("근음을 마디 내내 길게. 바닥을 조용히 깔아 줘요.") },
  { id: 'none', term: L("베이스 쉬기"), kid: L("이 파트는 베이스 없이"), desc: L("베이스를 빼면 가벼워지고, 다시 들어올 때 꽉 찬 느낌이 나요.") },
]
const SPEEDS: { id: ChordSpeed; term: string; kid: string; desc: string }[] = [
  { id: 'slow', term: L("2마디에 한 번"), kid: L("천천히 바꾸기"), desc: L("화음에 오래 머물러서 여유롭고 넓게 들려요.") },
  { id: 'normal', term: L("1마디에 한 번"), kid: L("마디마다 바꾸기"), desc: L("가장 흔한 빠르기예요.") },
  { id: 'fast', term: L("반 마디에 한 번"), kid: L("빨리빨리 바꾸기"), desc: L("화음이 바쁘게 움직여서 신나고 촘촘해요.") },
]

/* ---------- 리듬 그림에 쓸 줄 ---------- */
const DRUM_ROWS: { label: string; color: string; match: (p: number) => boolean }[] = [
  { label: L("심벌"), color: '#e0a83a', match: (p) => p === 49 || p === 57 },
  { label: L("하이햇"), color: '#38bcd8', match: (p) => p === 42 || p === 46 || p === 44 || p === 51 },
  { label: L("스네어"), color: '#e05c8a', match: (p) => p === 38 || p === 37 || p === 40 },
  { label: L("탐"), color: '#9c7bb5', match: (p) => [41, 43, 45, 47, 48, 50].includes(p) },
  { label: L("킥"), color: '#7c5cf0', match: (p) => p === 35 || p === 36 },
]
function drumLanes(beats: number, style: DrumStyle, custom?: DrumPat): Lane[] {
  const hits = sampleBar(beats).drum(style, custom)
  return DRUM_ROWS.map((r) => ({ label: r.label, color: r.color, hits: hits.filter((h) => r.match(h.pitch)).map((h) => ({ t: h.t, d: Math.min(h.d, 180) })) }))
    .filter((l) => l.hits.length || l.label === L("킥") || l.label === L("스네어") || l.label === L("하이햇"))
}
function compLanes(beats: number, style: ChordRhythm, custom?: PatNote[]): Lane[] {
  const hits = sampleBar(beats).comp(style, custom)
  if (style === 'arpeggio') {
    // 아르페지오는 음 높이(아래·가운데·위)를 나눠서 보여 준다
    const pitches = [...new Set(hits.flatMap((h) => h.pitches))].sort((a, b) => a - b)
    return [{ label: L("화음"), color: '#7c5cf0', rows: [L("아래"), L("가운데"), L("위")], hits: hits.map((h) => ({ t: h.t, d: h.d, row: Math.min(2, pitches.indexOf(h.pitches[0])) })) }]
  }
  return [{ label: L("화음"), color: '#7c5cf0', hits: hits.map((h) => ({ t: h.t, d: h.d })) }]
}
function bassLanes(beats: number, style: BassStyle, drum: DrumStyle, custom?: BassNote[], customDrum?: DrumPat): Lane[] {
  const hits = sampleBar(beats).bass(style, drum, custom, customDrum)
  const row = (p: number) => (p - 36 >= 12 ? 2 : p - 36 > 0 ? 1 : 0)
  return [{ label: L("베이스"), color: '#2fa3c4', rows: [L("근음"), L("3·5도"), L("옥타브")], hits: hits.map((h) => ({ t: h.t, d: h.d, row: row(h.pitch) })) }]
}

interface Props {
  song: Song
  settings: Settings
  stepId: string
  onStep: (id: string) => void
  answers: Answers
  onAnswers: (a: Answers) => void
  onReady: (a: Answers) => boolean
  structureId: string | null
  onStructure: (id: string) => void
  onPlan: (plan: PlanItem[]) => void
  plans: Record<string, PartPlan>
  onPlans: (p: Record<string, PartPlan>) => void
  onAudition: (plan: PartPlan, bars: number, kind: SectionKind) => void
  onBuild: () => void
  built: boolean
  onPlayPart: (id: string) => void
  onPlayAll: () => void
  onStop: () => void
  playing: boolean
  onScaleDemo: (root: number, type: ScaleType) => void
  onBeatDemo: (bpm: number, beats: number) => void
  onGo: (ws: Workspace) => void
  hasSaved: boolean
  incoming: { title: string } | null
  onOpenIncoming: () => void
  onImport: () => void
  onBlank: () => void
}

/** 알아두면 좋아요: 늘 펼쳐 둔다 (하면서 자연스럽게 읽게) */
function Learn({ children, title = L("알아두면 좋아요") }: { children: ReactNode; title?: string }) {
  return (
    <aside className="iv-learn">
      <p className="iv-learn-t"><Icon name="help" size={16} />{title}</p>
      <div>{children}</div>
    </aside>
  )
}

function Card(p: { on: boolean; onClick: () => void; children: ReactNode; className?: string; badge?: string; disabled?: boolean }) {
  return (
    <button type="button" className={`iv-card ${p.on ? 'on' : ''} ${p.className ?? ''}`} aria-pressed={p.on} onClick={p.onClick} disabled={p.disabled}>
      {p.badge && <span className="iv-badge">{p.badge}</span>}
      {p.on && <span className="iv-check"><Icon name="check" size={16} /></span>}
      {p.children}
    </button>
  )
}

function Beats({ accents }: { accents: number[] }) {
  return (
    <span className="iv-beats" aria-hidden>
      {accents.map((x, i) => <i key={i} style={{ width: 12 + x * 14, height: 12 + x * 14 }} />)}
    </span>
  )
}

function Timeline({ parts }: { parts: [SectionKind, number, string?][] }) {
  if (!parts.length) return <span className="iv-mini empty" aria-hidden><i>＋</i></span>
  return (
    <span className="iv-mini" aria-hidden>
      {parts.map(([k, bars, name], i) => (
        <i key={i} style={{ flexGrow: bars, background: KINDS[k].color }}>{name ?? KINDS[k].label}</i>
      ))}
    </span>
  )
}

function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="iv-pop-back" onClick={onClose}>
      <div className="iv-pop" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="iv-pop-x" onClick={onClose} aria-label={L("닫기")}><Icon name="close" size={18} /></button>
        {children}
      </div>
    </div>
  )
}

export function Interview(p: Props) {
  const { song, settings, answers: a } = p
  const set = (patch: Partial<Answers>) => p.onAnswers({ ...a, ...patch })
  const minor = isMinorScale(settings.scaleType)
  const root = settings.scaleType === 'none' ? 0 : settings.scaleRoot
  const beats = song.beatsPerBar
  const hasChords = !!findRoleTrack(song, 'chords')
  const hasBass = !!findRoleTrack(song, 'bass')
  const hasDrums = !!findRoleTrack(song, 'drums')
  const [scalePop, setScalePop] = useState(false)
  const [addPop, setAddPop] = useState(false)
  const [mark, setMark] = useState<{ id: string; m: PlayMark } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  /* ---------- 질문 목록 (곡 모양에 따라 달라진다) ---------- */
  const kindsInOrder: SectionKind[] = []
  for (const s of song.sections) if (!kindsInOrder.includes(s.kind)) kindsInOrder.push(s.kind)
  const planOfKind = (k: SectionKind) => {
    const s = song.sections.find((x) => x.kind === k)
    return s ? p.plans[s.id] : undefined
  }
  const steps: Step[] = [
    { id: 'title', chapter: 'ready' },
    { id: 'mood', chapter: 'ready' },
    { id: 'tempo', chapter: 'ready' },
    { id: 'meter', chapter: 'ready' },
    { id: 'parts', chapter: 'ready' },
    { id: 'shape', chapter: 'shape' },
    { id: 'order', chapter: 'shape' },
  ]
  if ((hasChords || hasBass || hasDrums) && song.sections.length) {
    for (const k of kindsInOrder) {
      const pl = planOfKind(k)
      if (hasChords || hasBass) {
        steps.push({ id: `chord:${k}`, chapter: 'band', kind: k, sub: 'chord' })
        steps.push({ id: `speed:${k}`, chapter: 'band', kind: k, sub: 'speed' })
      }
      if (hasChords && pl?.comp !== 'none') steps.push({ id: `comp:${k}`, chapter: 'band', kind: k, sub: 'comp' })
      if (hasDrums) steps.push({ id: `drum:${k}`, chapter: 'band', kind: k, sub: 'drum' })
      if (hasBass) steps.push({ id: `bass:${k}`, chapter: 'band', kind: k, sub: 'bass' })
    }
    steps.push({ id: 'built', chapter: 'band' })
  }
  steps.push({ id: 'melody', chapter: 'melody' })

  const welcome = p.stepId === 'welcome'
  let idx = steps.findIndex((s) => s.id === p.stepId)
  if (idx < 0 && !welcome) {
    // 사라진 질문(예: ‘화음 없이’를 골라 리듬꼴 질문이 빠짐)이면 같은 파트의 첫 질문으로
    const k = p.stepId.split(':')[1]
    const sameKind = steps.findIndex((s) => s.kind === k)
    idx = sameKind >= 0 ? sameKind : 0
  }
  const step = steps[Math.max(0, idx)]
  const chapterSteps = steps.filter((s) => s.chapter === step.chapter)
  const inChapter = chapterSteps.findIndex((s) => s.id === step.id)

  const pickedOnly = (plans: Record<string, PartPlan>) =>
    Object.fromEntries(song.sections.filter((s) => plans[s.id]?.picked).map((s) => [s.id, plans[s.id]]))

  /* 반주 마당에 들어오면 비어 있는 파트 계획을 채운다 */
  const needPlans = step.chapter === 'band' && song.sections.some((s) => !p.plans[s.id])
  useEffect(() => {
    if (needPlans) p.onPlans(autoPlans(song, settings, pickedOnly(p.plans)))
  })
  useEffect(() => {
    document.querySelector('.iv-scroll')?.scrollTo({ top: 0 })
    setEditing(null)
  }, [p.stepId])
  useEffect(() => { if (!p.playing) setMark(null) }, [p.playing])

  /** 이 종류의 파트(벌스 → 벌스 2 …)를 모두 바꾸고, 아직 고르지 않은 뒤 파트들은 다시 어울리게 추천한다 */
  const setKind = (k: SectionKind, patch: Partial<PartPlan>) => {
    const next = { ...p.plans }
    for (const s of song.sections) if (s.kind === k && next[s.id]) next[s.id] = { ...next[s.id], ...patch, picked: true }
    p.onPlans(autoPlans(song, settings, pickedOnly(next)))
  }

  const go = (to: number) => {
    p.onStop()
    const cur = steps[idx]
    if (cur?.id === 'mood' && to > idx) {
      // 고른 음계를 한 번 설명하고 넘어간다
      setScalePop(true)
      return
    }
    if (cur?.id === 'parts' && to > idx && !p.onReady(a)) return
    // 지나간 반주 질문은 학생이 확인한 것으로 친다
    if (cur?.kind && to > idx) setKind(cur.kind, {})
    const next = steps[to]
    if (next?.id === 'built' && to > idx) p.onBuild()
    p.onStep(to < 0 ? 'welcome' : next?.id ?? 'melody')
  }

  const firstSec = (k: SectionKind) => song.sections.find((s) => s.kind === k)
  const barSec = (beats * 60) / song.bpm
  /** 반주 고르기 미리 듣기 + 리듬 그림 위 재생선 */
  const listen = (cardId: string, k: SectionKind, patch: Partial<PartPlan>, maxBars = 4) => {
    const sec = firstSec(k)
    const base = sec && p.plans[sec.id]
    if (!sec || !base) return
    const bars = Math.min(sec.bars, maxBars)
    p.onAudition({ ...base, ...patch }, bars, k)
    setMark({ id: cardId, m: { key: Date.now(), barSec, count: bars } })
  }

  const nextDisabled =
    (step.id === 'parts' && !a.melody && !a.chords && !a.bass && !a.drums) ||
    (step.id === 'shape' && !p.structureId) ||
    (step.id === 'order' && song.sections.length === 0)

  const mood = MOODS.find((m) => m.type === a.scaleType) ?? MOODS[0]
  const scaleNotes = SCALES[a.scaleType].steps.map((st) => (a.root + st) % 12)

  /* ---------- 반주 질문 ---------- */
  const bandBody = (k: SectionKind, sub: Sub): ReactNode => {
    const sec = firstSec(k)
    const plan = sec && p.plans[sec.id]
    if (!sec || !plan) return <p className="iv-say">{L("준비하는 중…")}</p>
    const all = progressionsFor(minor)
    const prog = all.find((x) => x.id === plan.prog) ?? all[0]
    const twins = song.sections.filter((s) => s.kind === k).slice(1)
    const name = KINDS[k].label === 'A' || KINDS[k].label === 'B' ? L("{0} 가락", KINDS[k].label) : KINDS[k].label
    const reuse = twins.length > 0 && (
      <p className="iv-reuse"><Icon name="loop" size={15} />{L("여기서 정한 것은")} {twins.map((t) => t.name).join(', ')}{L("에도 똑같이 다시 써요.")}</p>
    )
    const typical = DEFAULT_PLAN[k]

    if (sub === 'chord') {
      const others = Object.fromEntries(Object.entries(p.plans).filter(([id]) => song.sections.find((s) => s.id === id)?.kind !== k))
      const i = song.sections.indexOf(sec)
      const ranks = rankProgressions(neighborCtx(song, others, i, minor, root))
      const list = ranks.slice(0, 3)
      if (!list.some((r) => r.prog.id === plan.prog)) {
        const cur = ranks.find((r) => r.prog.id === plan.prog)
        if (cur) list.push(cur)
      }
      const noChords = plan.comp === 'none'
      const pick = (id: string) => {
        const comp = noChords ? (typical.comp === 'none' ? 'beats' : typical.comp) : plan.comp
        setKind(k, { prog: id, comp })
        listen(`chord-${id}`, k, { prog: id, comp }, 8)
      }
      const isWarn = (x: string) => x.includes(L("바뀐 느낌이 약해요")) || x.includes(L("새롭게 들리지"))
      return (
        <>
          <div className="iv-part" style={{ ['--c' as string]: KINDS[k].color }}>
            <span className="iv-part-chip">{name}</span>
            <div>
              <b>{PART_GUIDE[k].what}</b>
              <p>{PART_GUIDE[k].how}</p>
            </div>
          </div>
          <Q n={<>「{name}{L("」에는 어떤 화음 진행이 어울릴까요?")}</>} say={L("앞에서 정한 파트와 어울리는지 따져서 골라 봤어요. 눌러서 들어 보세요.")} />
          <div className="iv-grid">
            {list.map((r, n) => {
              const why = r.reasons.find((x) => !isWarn(x))
              const warn = r.reasons.find(isWarn)
              return (
                <Card key={r.prog.id} on={!noChords && plan.prog === r.prog.id} badge={n === 0 ? L("잘 어울려요") : undefined} onClick={() => pick(r.prog.id)}>
                  <span className="iv-play"><Icon name="play" size={14} />{L("들어보기")}</span>
                  <span className="iv-chords big">{r.prog.degrees.slice(0, 4).map((d) => chordOf(root, minor, d, false).name).join(' → ')}</span>
                  <b>{r.prog.mood}</b>
                  {why && <small>{why}</small>}
                  {warn && <small className="iv-warn">{warn}</small>}
                  <span className="iv-term">{r.prog.name}</span>
                </Card>
              )
            })}
            {hasChords && (
              <Card on={noChords} onClick={() => { setKind(k, { comp: 'none' }); listen('chord-none', k, { comp: 'none' }, 4) }}>
                <span className="iv-play"><Icon name="play" size={14} />{L("들어보기")}</span>
                <b>{L("이 파트는 화음 없이")}</b>
                <small>{L("화음 반주를 쉬어요. 베이스와 드럼만 남아서 텅 빈 듯 긴장감이 생기고, 다음에 화음이 들어올 때 더 꽉 차게 들려요.")}</small>
                <span className="iv-term">{L("타셋 (Tacet, 쉬기)")}</span>
              </Card>
            )}
          </div>
          <details className="iv-more">
            <summary>{L("다른 화음 진행 더 보기")}</summary>
            <div className="iv-chips">
              {all.filter((x) => !list.some((r) => r.prog.id === x.id)).map((x) => (
                <button key={x.id} type="button" className={!noChords && plan.prog === x.id ? 'on' : ''} onClick={() => pick(x.id)}>
                  <b>{x.degrees.slice(0, 4).map((d) => chordOf(root, minor, d, false).name).join(' → ')}</b> {x.mood}
                </button>
              ))}
            </div>
          </details>
          {reuse}
          <Learn title={L("{0} 진행이란?", prog.name)}>
            {prog.theory} {L("로마 숫자(Ⅰ, Ⅳ, Ⅴ…)는 음계의 몇 번째 음 위에 쌓은 화음인지를 뜻해요. Ⅰ은 집(으뜸화음), Ⅴ는 집으로 돌아가고 싶게 만드는 화음(딸림화음)이에요.")}
          </Learn>
        </>
      )
    }

    if (sub === 'speed') {
      return (
        <>
          <Q n={<>「{name}{L("」에서 화음을 얼마나 자주 바꿀까요?")}</>} say={L("화음이 바뀌는 빠르기도 곡의 느낌을 바꿔요. 아래 칸에 화음이 어떻게 놓이는지 보면서 들어 보세요.")} />
          <div className="iv-grid">
            {SPEEDS.map((sp) => {
              const segs = chordSegments(4, prog, sp.id)
              const per = sp.id === 'fast' ? 2 : 1
              return (
                <Card key={sp.id} on={plan.speed === sp.id} badge={typical.speed === sp.id ? L("{0}는 보통 이렇게", KINDS[k].label) : undefined}
                  onClick={() => { setKind(k, { speed: sp.id }); listen(`speed-${sp.id}`, k, { speed: sp.id }, 4) }}>
                  <span className="iv-play"><Icon name="play" size={14} />{L("들어보기")}</span>
                  <b className="iv-termtitle">{sp.term}</b>
                  <span className="iv-kid">{sp.kid}</span>
                  <span className="iv-bars">
                    {Array.from({ length: 4 }, (_, bar) => (
                      <span key={bar} className="iv-bar">
                        {segs.slice(bar * per, bar * per + per).map((d, j) => {
                          const hold = sp.id === 'slow' && bar % 2 === 1
                          return <i key={j} className={hold ? 'hold' : ''}>{hold ? '' : chordOf(root, minor, d, false).name}</i>
                        })}
                      </span>
                    ))}
                  </span>
                  <small>{sp.desc}</small>
                </Card>
              )
            })}
          </div>
          {reuse}
          <Learn>{L("화음이 바뀌는 빠르기를")} <b>{L("화성 리듬")}</b>{L("(하모닉 리듬)이라고 해요. 가요는 보통 한 마디에 한 번 바꿔요. 화음에 오래 머물면 넓고 느긋하게, 자주 바꾸면 바쁘고 신나게 들려요. 칸 하나가 한 마디예요.")}</Learn>
        </>
      )
    }

    // 리듬꼴 · 드럼 · 베이스
    const cfg = {
      comp: {
        q: <>「{name}{L("」에서 화음은 어떤 리듬으로 칠까요?")}</>,
        items: COMP_PICK as Style<string>[],
        value: plan.comp as string,
        lanes: (id: string) => compLanes(beats, id as ChordRhythm, compPatOf(plan, beats * PPQ)),
        learn: <>{L("같은 화음도 치는 리듬(")}<b>{L("리듬꼴")}</b>{L(")에 따라 느낌이 완전히 달라져요. 그림의 막대 하나가 화음 한 번이고, 막대가 길수록 소리가 오래 울려요. 위 숫자 1 2 3 4는 박이에요.")}</>,
        patch: (id: string) => ({ comp: id as ChordRhythm }),
      },
      drum: {
        q: <>「{name}{L("」에서 드럼은 어떤 리듬으로 칠까요?")}</>,
        items: DRUM_PICK as Style<string>[],
        value: plan.drum as string,
        lanes: (id: string) => drumLanes(beats, id as DrumStyle, drumPatOf(plan)),
        learn: <>{L("드럼은")} <b>{L("킥")}</b>{L("(쿵, 발로 밟는 큰북),")} <b>{L("스네어")}</b>{L("(짝, 작은북),")} <b>{L("하이햇")}</b>{L("(츠, 두 장 겹친 심벌)으로 리듬을 만들어요. 그림에서 한 줄이 악기 하나예요. 실제 드럼 악보도 이렇게 악기마다 자리가 정해져 있어요.")}</>,
        patch: (id: string) => ({ drum: id as DrumStyle }),
      },
      bass: {
        q: <>「{name}{L("」에서 베이스는 어떻게 움직일까요?")}</>,
        items: BASS_PICK as Style<string>[],
        value: plan.bass as string,
        lanes: (id: string) => bassLanes(beats, id as BassStyle, plan.drum, bassPatOf(plan, beats * PPQ), drumPatOf(plan)),
        learn: <>{L("베이스는 보통 화음의 맨 아래 음인")} <b>{L("근음")}</b>{L("(루트)을 쳐요. 그림의 아래 줄이 근음, 가운데가 3도·5도, 위가 한 옥타브 위 근음이에요. 드럼의 킥과 같은 자리에서 치면 둘이 한 몸처럼 들려요.")}</>,
        patch: (id: string) => ({ bass: id as BassStyle }),
      },
    }[sub]
    const typicalId = typical[sub]
    const isCustom = cfg.value === 'custom'
    return (
      <>
        <Q n={cfg.q} say={L("그림은 한 마디의 리듬이에요. 눌러서 그림을 보면서 들어 보세요. 마음에 드는 게 없으면 ‘직접 정하기’로 만들어요.")} />
        <div className="iv-grid wide">
          {cfg.items.map((c) => (
            <Card key={c.id} on={cfg.value === c.id} badge={typicalId === c.id ? L("{0}는 보통 이렇게", KINDS[k].label) : undefined}
              onClick={() => { setKind(k, cfg.patch(c.id)); listen(`${sub}-${c.id}`, k, cfg.patch(c.id)) }}>
              {c.id !== 'none' && <span className="iv-play"><Icon name="play" size={14} />{L("들어보기")}</span>}
              <b className="iv-termtitle">{c.term}</b>
              <span className="iv-kid">{c.kid}</span>
              {c.id !== 'none' && <PatternView beats={beats} lanes={cfg.lanes(c.id)} compact play={mark?.id === `${sub}-${c.id}` ? mark.m : null} />}
              <small>{c.desc}</small>
            </Card>
          ))}
          <Card className="iv-custom" on={isCustom} onClick={() => {
            setKind(k, { ...fromPreset(sub, plan, beats), ...cfg.patch('custom') })
            setEditing(`${sub}:${k}`)
          }}>
            <span className="iv-icon small"><Icon name="write" size={20} /></span>
            <b className="iv-termtitle">{L("직접 정하기")}</b>
            <span className="iv-kid">{L("내가 만든 리듬")}</span>
            {isCustom && <PatternView beats={beats} lanes={cfg.lanes('custom')} compact play={mark?.id === `${sub}-custom` ? mark.m : null} />}
            <small>{L("칸을 눌러서 소리 낼 자리를 내가 정해요.")}</small>
          </Card>
        </div>
        {(isCustom || editing === `${sub}:${k}`) && (
          <div className="iv-editor">
            <div className="iv-editor-head">
              <b>{L("직접 정하기 · 한 마디")}</b>
              <span>{sub === 'drum' ? L("칸을 누르면 소리가 생기고, 누른 채로 옆으로 밀면 여러 칸을 한 번에 쳐요. 막대를 누르면 지워져요.") : L("빈 칸을 누르고 오른쪽으로 끌면 길게 울려요. 막대를 끌면 길이가 바뀌고, 그냥 누르면 지워져요.")} {L("숫자는 박, &는 박과 박 사이(뒷박)예요.")}</span>
              <button type="button" className="iv-secondary small" onClick={() => listen(`${sub}-custom`, k, {})}><Icon name="play" size={14} />{L("들어보기")}</button>
            </div>
            <CustomEditor sub={sub} beats={beats} plan={plan} onChange={(patch) => setKind(k, patch)} />
          </div>
        )}
        {reuse}
        <Learn>{cfg.learn}</Learn>
      </>
    )
  }

  /* ---------- 질문별 화면 ---------- */
  const body = (): ReactNode => {
    if (step.kind && step.sub) return bandBody(step.kind, step.sub)
    switch (step.id) {
      case 'title':
        return (
          <>
            <Q n={L("이 곡의 이름을 지어 볼까요?")} say={L("나중에 얼마든지 바꿀 수 있어요. 떠오르지 않으면 아래에서 골라도 돼요.")} />
            <input className="iv-title" value={a.title} onChange={(e) => set({ title: e.target.value })} placeholder={L("예) 나의 첫 곡")} maxLength={40} aria-label={L("곡 이름")} />
            <div className="iv-chips">
              {TITLE_IDEAS.slice(0, 6).map((t) => (
                <button key={t} type="button" className={a.title === t ? 'on' : ''} onClick={() => set({ title: t })}>{t}</button>
              ))}
              <button type="button" className="ghost" onClick={() => set({ title: TITLE_IDEAS[Math.floor(Math.random() * TITLE_IDEAS.length)] })}>{L("아무거나 골라 줘")}</button>
            </div>
          </>
        )
      case 'mood':
        return (
          <>
            <Q n={L("어떤 느낌의 곡이면 좋겠어요?")} say={L("카드를 누르면 그 느낌의 음들이 들려요. 귀로 듣고 골라 보세요.")} />
            <div className="iv-grid">
              {MOODS.map((m) => (
                <Card key={m.type} on={a.scaleType === m.type} onClick={() => { set({ scaleType: m.type }); p.onScaleDemo(a.root, m.type) }}>
                  <span className="iv-play"><Icon name="play" size={14} />{L("들어보기")}</span>
                  <b>{m.label}</b>
                  <small>{m.hint}</small>
                  <span className="iv-term">{m.term} · {m.en}</span>
                </Card>
              ))}
            </div>
            <div className="iv-open">
              <p className="iv-open-t">{L("음계를 시작하는 음(")}<b>{L("으뜸음")}</b>{L(")도 골라 보세요 · 지금")} <b>{NOTE_NAMES_KO[a.root]} ({NOTE_NAMES_EN[a.root]})</b></p>
              <div className="iv-keys">
                {NOTE_NAMES_KO.map((n, i) => (
                  <button key={n} type="button" className={`${a.root === i ? 'on' : ''} ${n.includes('#') ? 'sharp' : ''}`} onClick={() => { set({ root: i }); p.onScaleDemo(i, a.scaleType) }}>
                    {n}<small>{NOTE_NAMES_EN[i]}</small>
                    {COMMON_ROOTS[a.scaleType].includes(i) && <em title={L("이 느낌에서 자주 쓰는 음")}>{L("자주 써요")}</em>}
                  </button>
                ))}
              </div>
            </div>
            <Learn>{L("곡에 쓸 음을 모아 놓은 것을")} <b>{L("음계")}</b>{L("(스케일)라고 해요. 같은 도레미라도")} <b>{L("장음계")}</b>{L("는 밝게,")} <b>{L("단음계")}</b>{L("는 어둡게 들려요. 음계를 정하면 건반에서 어울리는 음이 색으로 표시돼서 멜로디를 쉽게 만들 수 있어요.")}</Learn>
          </>
        )
      case 'tempo':
        return (
          <>
            <Q n={L("얼마나 빠른 곡일까요?")} say={L("카드를 누르면 그 빠르기로 박 소리가 들려요. 아래 막대로 숫자를 직접 맞춰도 돼요.")} />
            <div className="iv-grid">
              {TEMPOS.map((t) => (
                <Card key={t.bpm} on={a.bpm === t.bpm} onClick={() => { set({ bpm: t.bpm }); p.onBeatDemo(t.bpm, a.beats) }}>
                  <span className="iv-big">{t.bpm}<small>BPM</small></span>
                  <b>{t.label}</b>
                  <small>{t.pic} · {t.hint}</small>
                  <span className="iv-term">{t.term}</span>
                </Card>
              ))}
            </div>
            <div className="iv-open">
              <p className="iv-open-t">{L("숫자로 직접 맞추기 ·")} <b>{a.bpm}</b> BPM · <span className="iv-term inline">{tempoTerm(a.bpm)}</span></p>
              <div className="iv-fine">
                <button type="button" className="iv-step" onClick={() => set({ bpm: Math.max(50, a.bpm - 1) })} aria-label={L("1 느리게")}><Icon name="minus" size={18} /></button>
                <input type="range" min={50} max={200} value={a.bpm} onChange={(e) => set({ bpm: +e.target.value })}
                  onPointerUp={() => p.onBeatDemo(a.bpm, a.beats)} aria-label={L("빠르기")} />
                <button type="button" className="iv-step" onClick={() => set({ bpm: Math.min(200, a.bpm + 1) })} aria-label={L("1 빠르게")}><Icon name="plus" size={18} /></button>
                <button type="button" className="iv-secondary small" onClick={() => p.onBeatDemo(a.bpm, a.beats)}><Icon name="play" size={14} />{L("들어보기")}</button>
              </div>
            </div>
            <Learn>{L("빠르기를")} <b>{L("템포")}</b>{L("라고 해요. 1분에 박을 몇 번 치는지(BPM, Beats Per Minute)로 나타내요. 심장은 1분에 70~100번쯤 뛰는데, 그 정도가 ‘보통 빠르기’예요. 악보에는 Andante(안단테, 걷는 빠르기)처럼 이탈리아 말로 적기도 해요.")}</Learn>
          </>
        )
      case 'meter':
        return (
          <>
            <Q n={L("박을 몇 개씩 묶어서 셀까요?")} say={L("큰 동그라미가 센 박이에요. 눌러서 들어 보세요.")} />
            <div className="iv-grid">
              {METERS.map((m) => (
                <Card key={m.beats} on={a.beats === m.beats} onClick={() => { set({ beats: m.beats }); p.onBeatDemo(a.bpm, m.beats) }}>
                  <Beats accents={m.accents} />
                  <b>{m.label}</b>
                  <small>{m.hint}</small>
                  <span className="iv-term">{m.term}</span>
                </Card>
              ))}
            </div>
            <Learn><b>{L("박자")}</b>{L("는 센 박과 여린 박이 되풀이되는 규칙이에요. 박을 묶은 한 덩어리를")} <b>{L("마디\u200b")}</b>{L("라고 하고, 마디의 첫 박이 가장 세요. 4/4 박자는 ‘4분음표를 한 박으로, 한 마디에 4박’이라는 뜻이에요.")}</Learn>
          </>
        )
      case 'parts':
        return (
          <>
            <Q n={L("어떤 악기들과 함께 연주할까요?")} say={L("누를 때마다 넣었다 뺐다 해요. 처음이면 넷 다 넣는 걸 추천해요.")} />
            <div className="iv-grid four">
              {PARTS_WANT.map((w) => (
                <Card key={w.key} on={a[w.key]} onClick={() => set({ [w.key]: !a[w.key] })}>
                  <span className="iv-icon"><Icon name={w.icon} size={28} /></span>
                  <b>{w.label}</b>
                  <small>{w.hint}</small>
                </Card>
              ))}
            </div>
            <Learn>{L("음악은 네 가지 역할이 겹쳐져요.")} <b>{L("멜로디")}</b>{L("가 노래를 하고,")} <b>{L("화음")}</b>{L("이 색을 입히고,")} <b>{L("베이스")}</b>{L("가 바닥을 받치고,")} <b>{L("드럼")}</b>{L("이 움직임을 만들어요. 밴드가 이 역할을 나눠 맡는 거예요.")}</Learn>
          </>
        )
      case 'shape':
        return (
          <>
            <Q n={L("곡이 어떤 순서로 흘러가면 좋을까요?")} say={L("노래도 이야기처럼 앞·가운데·끝이 있어요. 마음에 드는 모양을 골라요.")} />
            <div className="iv-grid wide">
              {STRUCTURES.map((s) => {
                const bars = s.parts.reduce((n, x) => n + x[1], 0)
                const sec = Math.round(((bars * song.beatsPerBar) / song.bpm) * 60)
                return (
                  <Card key={s.id} on={p.structureId === s.id} badge={s.id === 'aba' ? L("처음이면 추천") : undefined} onClick={() => p.onStructure(s.id)}>
                    <b>{SHAPES[s.id]?.label ?? s.label}</b>
                    <small>{SHAPES[s.id]?.say ?? s.desc}</small>
                    <Timeline parts={s.parts} />
                    <span className="iv-term">{s.label}{bars ? L(" · 약 {0}초", sec) : ''}</span>
                  </Card>
                )
              })}
            </div>
            {p.structureId && (
              <Learn title={L("{0} 알아보기", STRUCTURES.find((s) => s.id === p.structureId)?.term ?? '')}>
                <ul>{STRUCTURES.find((s) => s.id === p.structureId)?.learn.map((l) => <li key={l}>{l}</li>)}</ul>
              </Learn>
            )}
          </>
        )
      case 'order':
        return <Order song={song} onPlan={p.onPlan} onPlayPart={p.onPlayPart} onAdd={() => setAddPop(true)} />
      case 'built':
        return <Built song={song} plans={p.plans} minor={minor} root={root} playing={p.playing} built={p.built} onPlayAll={p.onPlayAll} onPlayPart={p.onPlayPart} />
      case 'melody':
        return (
          <>
            <Q n={L("이제 주인공, 멜로디를 얹어 볼까요?")} say={L("두 가지 방법이 있어요. 편한 쪽으로 시작하고, 언제든 바꿔도 돼요.")} />
            <div className="iv-grid two">
              <button type="button" className="iv-card iv-go" onClick={() => p.onGo('melody')}>
                <span className="iv-icon"><Icon name="keys" size={30} /></span>
                <b>{L("건반을 치며 녹음하기")}</b>
                <small>{L("반주를 들으면서 건반을 눌러요. 박자가 조금 틀려도 자동으로 맞춰 줘요.")}</small>
                <span className="iv-cta">{L("녹음하러 가기")} <Icon name="next" size={16} /></span>
              </button>
              <button type="button" className="iv-card iv-go" onClick={() => p.onGo('compose')}>
                <span className="iv-icon"><Icon name="write" size={30} /></span>
                <b>{L("한 음씩 찍어서 쓰기")}</b>
                <small>{L("연필로 건반 칸이나 악보에 음표를 하나씩 놓아요. 천천히 생각하며 만들 때 좋아요.")}</small>
                <span className="iv-cta">{L("직접 쓰러 가기")} <Icon name="next" size={16} /></span>
              </button>
            </div>
            <div className="iv-after">
              <span>{L("그다음에는")}</span>
              <button type="button" onClick={() => p.onGo('arrange')}><Icon name="arrange" size={16} />{L("구성 자세히 고치기")}</button>
              <button type="button" onClick={() => p.onGo('mix')}><Icon name="mix" size={16} />{L("악기 소리 맞추기")}</button>
              <button type="button" onClick={() => p.onGo('deliver')}><Icon name="done" size={16} />{L("듣고 평가받기")}</button>
            </div>
          </>
        )
      default:
        return null
    }
  }

  if (welcome)
    return (
      <div className="iv iv-scroll">
        <div className="iv-welcome">
          <p className="iv-eyebrow">{L("쎈스 컴포즈 · 작곡 놀이터")}</p>
          <h1>{L("질문에 답하다 보면")}<br /><span className="grad">{L("나만의 노래")}</span>{L("가 완성돼요")}</h1>
          <p className="iv-say">{L("한 번에 하나씩 물어볼게요. 카드를 누르면 바로 소리가 나니까 귀로 듣고 골라 보세요.")}</p>
          {p.incoming && (
            <button type="button" className="iv-incoming" onClick={p.onOpenIncoming}>
              <Icon name="link" size={18} />{L("친구가 보낸 곡 「")}{p.incoming.title || L("이름 없는 곡")}{L("」 열어 보기")}
            </button>
          )}
          <div className="iv-start">
            <button type="button" className="iv-primary big" onClick={() => p.onStep('title')}>{L("새 곡 만들기")} <Icon name="next" size={20} /></button>
            {p.hasSaved && <button type="button" className="iv-secondary big" onClick={() => p.onGo('compose')}><Icon name="play" size={16} />{L("하던 곡 이어서")}</button>}
          </div>
          <ol className="iv-map">
            {CHAPTERS.map((c) => (
              <li key={c.id}>
                <span>{c.no}</span>
                <b>{c.label}</b>
                <small>{c.sub}</small>
              </li>
            ))}
          </ol>
          <div className="iv-after">
            <span>{L("다른 방법")}</span>
            <button type="button" onClick={p.onImport}><Icon name="folder" size={16} />{L("MIDI 파일 불러오기")}</button>
            <button type="button" onClick={p.onBlank}><Icon name="write" size={16} />{L("빈 곡에 바로 쓰기")}</button>
          </div>
        </div>
      </div>
    )

  const total = steps.length
  const eyebrow = step.kind && step.sub
    ? L("{0} · {1} · 파트 {2}/{3}", KINDS[step.kind].label, SUB_LABEL[step.sub], kindsInOrder.indexOf(step.kind) + 1, kindsInOrder.length)
    : L("{0} · 질문 {1}/{2}", CHAPTERS.find((c) => c.id === step.chapter)?.label, inChapter + 1, chapterSteps.length)
  const nextStep = steps[idx + 1]
  const nextLabel = step.id === 'parts' ? L("곡 만들기")
    : nextStep?.id === 'built' ? L("반주 완성하기")
    : nextStep?.kind && nextStep.kind !== step.kind ? L("다음 파트: {0}", KINDS[nextStep.kind].label)
    : L("다음")
  return (
    <div className="iv">
      <header className="iv-head">
        <ol className="iv-chapters" aria-label={L("인터뷰 마당")}>
          {CHAPTERS.map((c) => {
            const ci = CHAPTERS.findIndex((x) => x.id === step.chapter)
            const me = CHAPTERS.findIndex((x) => x.id === c.id)
            const first = steps.findIndex((s) => s.chapter === c.id)
            const reachable = first >= 0 && me < ci
            return (
              <li key={c.id} className={me === ci ? 'on' : me < ci ? 'done' : ''}>
                <button type="button" disabled={!reachable} onClick={() => { p.onStop(); p.onStep(steps[first].id) }}>
                  <span>{me < ci ? <Icon name="check" size={14} /> : c.no}</span>
                  <b>{c.label}</b>
                </button>
              </li>
            )
          })}
        </ol>
        {step.chapter === 'band' && (
          <ol className="iv-partbar" aria-label={L("파트 순서")}>
            {kindsInOrder.map((k) => {
              const first = steps.findIndex((s) => s.kind === k)
              const cur = step.kind === k
              const doneK = step.id === 'built' || (step.kind ? kindsInOrder.indexOf(k) < kindsInOrder.indexOf(step.kind) : false)
              return (
                <li key={k}>
                  <button type="button" className={`${cur ? 'on' : ''} ${doneK ? 'done' : ''}`} style={{ ['--c' as string]: KINDS[k].color }}
                    disabled={first < 0 || (!doneK && !cur)} onClick={() => { p.onStop(); p.onStep(steps[first].id) }}>
                    {doneK && <Icon name="check" size={13} />}{KINDS[k].label}
                  </button>
                </li>
              )
            })}
          </ol>
        )}
        <div className="iv-progress" aria-hidden><i style={{ width: `${((idx + 1) / total) * 100}%` }} /></div>
      </header>
      <div className="iv-scroll">
        <section className="iv-body" key={step.id}>
          <p className="iv-eyebrow">{eyebrow}</p>
          {body()}
        </section>
      </div>
      <nav className="iv-nav">
        <button type="button" className="iv-secondary" onClick={() => go(idx - 1)}>
          <Icon name="left" size={18} />{L("이전")}
        </button>
        {p.playing && (
          <button type="button" className="iv-stop" onClick={p.onStop} aria-label={L("소리 멈추기")}><Icon name="stop" size={16} />{L("멈추기")}</button>
        )}
        {step.id === 'order' && song.sections.length === 0 && <span className="iv-navhint">{L("＋를 눌러 파트를 하나 이상 넣어 주세요")}</span>}
        {step.id !== 'melody' && (
          <button type="button" className="iv-primary" disabled={nextDisabled} onClick={() => go(idx + 1)}>
            {nextLabel}
            <Icon name="right" size={18} />
          </button>
        )}
      </nav>

      {scalePop && (
        <Modal label={L("고른 음계 알아보기")} onClose={() => setScalePop(false)}>
          <p className="iv-eyebrow">{L("방금 고른 것은")}</p>
          <h2 className="iv-pop-title">
            <span className="grad">{NOTE_NAMES_EN[a.root]} {mood.en}</span> {L("스케일")}
          </h2>
          <p className="iv-pop-sub">{NOTE_NAMES_KO[a.root]} {mood.term}</p>
          <ul className="iv-pop-list">
            <li><b>{NOTE_NAMES_EN[a.root]}</b>{isEn
              ? <span> is the note the scale starts from. This note is called the <b>tonic</b>. When a song ends on it, it feels like coming home.</span>
              : <span>{L("는 음계가 시작하는 기준 음이에요. 우리말로")} <b>{NOTE_NAMES_KO[a.root]}</b>{L(", 이 음을")} <b>{L("으뜸음")}</b>{L("이라고 해요. 곡이 이 음으로 끝나면 ‘집에 돌아왔다’는 편안한 느낌이 나요.")}</span>}</li>
            <li><b>{mood.en}</b><span>{mood.say}</span></li>
          </ul>
          <div className="iv-scale-notes" aria-label={L("음계의 음들")}>
            {scaleNotes.map((pc, i) => (
              <span key={i} className={i === 0 ? 'root' : ''}><b>{NOTE_NAMES_KO[pc]}</b>{!isEn && <small>{NOTE_NAMES_EN[pc]}</small>}</span>
            ))}
          </div>
          <div className="iv-pop-actions">
            <button type="button" className="iv-secondary" onClick={() => p.onScaleDemo(a.root, a.scaleType)}><Icon name="play" size={16} />{L("다시 들어보기")}</button>
            <button type="button" className="iv-primary" onClick={() => { setScalePop(false); p.onStop(); p.onStep('tempo') }}>{L("알겠어요, 다음으로")}<Icon name="right" size={18} /></button>
          </div>
        </Modal>
      )}
      {addPop && <AddPart song={song} onClose={() => setAddPop(false)} onAdd={(kind, bars) => {
        const pl = planOf(song.sections)
        pl.push({ src: null, kind, name: autoName(kind, song.sections), bars })
        p.onPlan(pl)
        setAddPop(false)
      }} />}
    </div>
  )
}

/** ‘직접 정하기’를 처음 열 때: 지금 고른 리듬(길이까지)을 그대로 옮겨서 출발점으로 쓴다 */
function fromPreset(sub: Sub, plan: PartPlan, beats: number): Partial<PartPlan> {
  const sb = sampleBar(beats)
  const bar = beats * PPQ
  const fresh = (x: PatNote[]) => x.filter((n) => n.t >= 0 && n.t < bar).map((n) => ({ t: n.t, d: Math.max(30, Math.min(n.d, bar - n.t)) }))
  if (sub === 'comp' && !plan.compPat && !plan.customComp) {
    const src = plan.comp === 'custom' || plan.comp === 'none' ? 'beats' : plan.comp
    const hits = sb.comp(src)
    const ts = [...new Set(hits.map((h) => h.t))].sort((x, y) => x - y)
    return { compPat: fresh(ts.map((t) => ({ t, d: Math.max(...hits.filter((h) => h.t === t).map((h) => h.d)) + 20 }))) }
  }
  if (sub === 'drum' && !plan.drumPat && !plan.customDrum) {
    const src = plan.drum === 'custom' || plan.drum === 'none' ? 'basic8' : plan.drum
    const h = sb.drum(src)
    const pick = (f: (p: number) => boolean) => fresh(h.filter((x) => f(x.pitch)).map((x) => ({ t: x.t, d: 120 })))
    return {
      drumPat: {
        crash: pick((p) => p === 49 || p === 57), open: pick((p) => p === 46), hat: pick((p) => p === 42 || p === 44 || p === 51),
        snare: pick((p) => p === 38 || p === 37 || p === 40), tom: pick((p) => [41, 43, 45, 47, 48, 50].includes(p)), kick: pick((p) => p === 36 || p === 35),
      },
    }
  }
  if (sub === 'bass' && !plan.bassPat && !plan.customBass) {
    const src = plan.bass === 'custom' || plan.bass === 'none' ? 'roots' : plan.bass
    const hits = sb.bass(src, plan.drum === 'custom' ? 'basic8' : plan.drum)
    return { bassPat: hits.filter((x) => x.t < bar).map((x) => ({ t: x.t, d: Math.min(x.d + 20, bar - x.t), tone: (x.pitch - 36 >= 12 ? 2 : x.pitch - 36 > 0 ? 1 : 0) as 0 | 1 | 2 })) }
  }
  return {}
}

function CustomEditor({ sub, beats, plan, onChange }: { sub: Sub; beats: number; plan: PartPlan; onChange: (patch: Partial<PartPlan>) => void }) {
  const bar = beats * PPQ
  const comp = compPatOf(plan, bar)
  const drum = drumPatOf(plan)
  const bass = bassPatOf(plan, bar)
  const all = sub === 'comp' ? comp : sub === 'drum' ? Object.values(drum).flat() : bass
  const grid = plan.grid ?? guessGrid(all)
  const onGrid = (div: number) => onChange({ grid: div })
  if (sub === 'comp')
    return (
      <>
        <PatternEditor beats={beats} grid={grid} onGrid={onGrid} sustain lanes={[{ key: 'c', label: L("화음"), color: '#7c5cf0' }]}
          value={{ c: comp }} onChange={(v) => onChange({ comp: 'custom', compPat: v.c, grid })} />
        <PatternView beats={beats} lanes={compLanes(beats, 'custom', comp)} />
      </>
    )
  if (sub === 'drum') {
    const lanes = [
      { key: 'crash', label: L("심벌"), color: '#e0a83a' }, { key: 'open', label: L("열린 햇"), color: '#2b9bb8' }, { key: 'hat', label: L("하이햇"), color: '#38bcd8' },
      { key: 'snare', label: L("스네어"), color: '#e05c8a' }, { key: 'tom', label: L("탐"), color: '#9c7bb5' }, { key: 'kick', label: L("킥"), color: '#7c5cf0' },
    ]
    return <PatternEditor beats={beats} grid={grid} onGrid={onGrid} sustain={false} lanes={lanes} value={drum as unknown as PatValue}
      onChange={(v) => onChange({ drum: 'custom', drumPat: { crash: v.crash ?? [], open: v.open ?? [], hat: v.hat ?? [], snare: v.snare ?? [], tom: v.tom ?? [], kick: v.kick ?? [] }, grid })} />
  }
  const value: PatValue = { '2': [], '1': [], '0': [] }
  for (const n of bass) value[String(n.tone)].push(n)
  return (
    <>
      <PatternEditor beats={beats} grid={grid} onGrid={onGrid} sustain exclusive
        lanes={[{ key: '2', label: L("옥타브"), color: '#2fa3c4' }, { key: '1', label: L("5도"), color: '#2fa3c4' }, { key: '0', label: L("근음"), color: '#2fa3c4' }]}
        value={value}
        onChange={(v) => onChange({ bass: 'custom', grid, bassPat: (['0', '1', '2'] as const).flatMap((k) => (v[k] ?? []).map((n) => ({ t: n.t, d: n.d, tone: +k as 0 | 1 | 2 }))).sort((a, b) => a.t - b.t) })} />
      <PatternView beats={beats} lanes={bassLanes(beats, 'custom', plan.drum, bass, drum)} />
    </>
  )
}

function Q({ n, say }: { n: ReactNode; say: string }) {
  return (
    <>
      <h2 className="iv-q">{n}</h2>
      <p className="iv-say">{say}</p>
    </>
  )
}

/** 2마당 두 번째 질문: 파트 순서 확인·바꾸기 (화살표 버튼으로, 끌기 없이). 모두 비워도 된다 */
function Order({ song, onPlan, onPlayPart, onAdd }: { song: Song; onPlan: (plan: PlanItem[]) => void; onPlayPart: (id: string) => void; onAdd: () => void }) {
  const plan = () => planOf(song.sections)
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= song.sections.length) return
    const pl = plan()
    const [it] = pl.splice(i, 1)
    pl.splice(j, 0, it)
    onPlan(pl)
  }
  const remove = (i: number) => {
    const pl = plan()
    pl.splice(i, 1)
    onPlan(pl)
  }
  const resize = (i: number, d: 1 | -1) => {
    const pl = plan()
    pl[i] = { ...pl[i], bars: stepBars(pl[i].bars, d) }
    onPlan(pl)
  }
  const bars = song.sections.reduce((n, s) => n + s.bars, 0)
  const sec = Math.round(((bars * song.beatsPerBar) / song.bpm) * 60)
  return (
    <>
      <Q n={song.sections.length ? L("이 순서 그대로 좋을까요?") : L("파트를 하나씩 쌓아 볼까요?")}
        say={song.sections.length ? L("지금 {0}개 파트, 모두 {1}마디(약 {2}초)예요. 블록을 누르면 그 부분만 들려줘요.", song.sections.length, bars, sec) : L("아직 비어 있어요. ＋를 눌러 첫 파트를 골라 보세요. 보통 인트로나 벌스로 시작해요.")} />
      <ol className="iv-order">
        {song.sections.map((s, i) => (
          <li key={s.id} style={{ ['--c' as string]: KINDS[s.kind].color }}>
            <button type="button" className="iv-block" onClick={() => onPlayPart(s.id)} title={L("{0} 들어보기", s.name)}>
              <span className="iv-no">{i + 1}</span>
              <b>{s.name}</b>
              <small>{s.bars}{L("마디")}{s.bars !== TYPICAL_BARS[s.kind] ? L(" · 보통 {0}마디", TYPICAL_BARS[s.kind]) : ''}</small>
            </button>
            <div className="iv-block-tools">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={L("앞으로")}><Icon name="left" size={18} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === song.sections.length - 1} aria-label={L("뒤로")}><Icon name="right" size={18} /></button>
              <button type="button" onClick={() => resize(i, -1)} disabled={s.bars <= 4} aria-label={L("4마디 줄이기")}><Icon name="minus" size={16} /></button>
              <button type="button" onClick={() => resize(i, 1)} aria-label={L("4마디 늘리기")}><Icon name="plus" size={16} /></button>
              <button type="button" onClick={() => remove(i)} aria-label={L("빼기")}><Icon name="close" size={16} /></button>
            </div>
          </li>
        ))}
        <li className="iv-add">
          <button type="button" className="iv-block add" onClick={onAdd}>
            <Icon name="plus" size={26} /><b>{L("파트 더하기")}</b>
          </button>
        </li>
      </ol>
      <Learn>{L("곡을 이루는 덩어리를")} <b>{L("파트")}</b>{L("라고 해요. 벌스·코러스 같은 노래의 중심 파트는 보통")} <b>{L("8마디")}</b>{L(", 인트로·아웃트로는")} <b>{L("4마디")}</b>{L("예요. 같은 파트가 다시 나오면 귀에 익어서 기억에 남고, 다른 파트가 나오면 새로운 느낌이 들어요.")}</Learn>
    </>
  )
}

const ADD_GROUPS: { label: string; kinds: SectionKind[] }[] = [
  { label: L("노래 파트"), kinds: ['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'interlude', 'outro'] },
  { label: L("가락 파트 (A·B 형식)"), kinds: ['a', 'b'] },
]

/** 지금까지의 흐름을 보고 다음에 보통 오는 파트 */
function nextUsual(song: Song): SectionKind {
  const last = song.sections[song.sections.length - 1]?.kind
  const count = (k: SectionKind) => song.sections.filter((s) => s.kind === k).length
  switch (last) {
    case undefined: return 'intro'
    case 'intro': return 'verse'
    case 'verse': return count('verse') >= 2 && !count('prechorus') ? 'prechorus' : 'chorus'
    case 'prechorus': return 'chorus'
    case 'chorus': return count('chorus') >= 2 ? (count('bridge') ? 'outro' : 'bridge') : 'verse'
    case 'bridge': return 'chorus'
    case 'interlude': return 'verse'
    case 'a': return count('a') >= 2 ? 'b' : 'a'
    case 'b': return 'a'
    default: return 'outro'
  }
}

function AddPart({ song, onClose, onAdd }: { song: Song; onClose: () => void; onAdd: (k: SectionKind, bars: number) => void }) {
  const suggest = nextUsual(song)
  const [kind, setKind] = useState<SectionKind>(suggest)
  const [bars, setBars] = useState(TYPICAL_BARS[suggest])
  const choose = (k: SectionKind) => { setKind(k); setBars(TYPICAL_BARS[k]) }
  return (
    <Modal label={L("파트 더하기")} onClose={onClose}>
      <p className="iv-eyebrow">{L("파트 더하기")}</p>
      <h2 className="iv-pop-title">{L("어떤 파트를 넣을까요?")}</h2>
      {ADD_GROUPS.map((g) => (
        <div key={g.label} className="iv-add-group">
          <p className="iv-open-t">{g.label}</p>
          <div className="iv-add-grid">
            {g.kinds.map((k) => (
              <button key={k} type="button" className={kind === k ? 'on' : ''} style={{ ['--c' as string]: KINDS[k].color }} onClick={() => choose(k)}>
                {k === suggest && <em>{L("다음은 보통 이것")}</em>}
                <b>{KINDS[k].label}</b>
                <small>{KINDS[k].hint}</small>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="iv-add-len">
        <p className="iv-open-t">{L("길이는 몇 마디로 할까요?")} <span>{KINDS[kind].label}{L("는 보통")} <b>{TYPICAL_BARS[kind]}{L("마디")}</b>{L("예요")}</span></p>
        <div className="iv-seg">
          {[4, 8, 16].map((n) => (
            <button key={n} type="button" className={bars === n ? 'on' : ''} onClick={() => setBars(n)}>
              {n}{L("마디")}{n === TYPICAL_BARS[kind] && <small>{L("보통")}</small>}
            </button>
          ))}
        </div>
      </div>
      <div className="iv-pop-actions">
        <button type="button" className="iv-secondary" onClick={onClose}>{L("닫기")}</button>
        <button type="button" className="iv-primary" onClick={() => onAdd(kind, bars)}>{KINDS[kind].label} {bars}{L("마디 넣기")}<Icon name="plus" size={18} /></button>
      </div>
    </Modal>
  )
}

function Built({ song, plans, minor, root, playing, built, onPlayAll, onPlayPart }: {
  song: Song; plans: Record<string, PartPlan>; minor: boolean; root: number; playing: boolean; built: boolean; onPlayAll: () => void; onPlayPart: (id: string) => void
}) {
  const seen = new Map<SectionKind, string>()
  const term = <T extends string>(list: Style<T>[], id: T) => (id === 'custom' ? L("직접 만든 리듬") : list.find((x) => x.id === id)?.term ?? '')
  return (
    <>
      <Q n={built ? L("{0}개 파트의 반주가 모두 준비됐어요! 들어 볼까요?", song.sections.length) : L("반주를 만드는 중이에요")} say={L("파트 블록을 누르면 그 부분만 되풀이해서 들려줘요. 마음에 들지 않으면 위쪽 파트 이름을 눌러 다시 고를 수 있어요.")} />
      <button type="button" className="iv-primary big iv-listen" onClick={onPlayAll}>
        <Icon name={playing ? 'stop' : 'play'} size={20} />{playing ? L("멈추기") : L("처음부터 끝까지 듣기")}
      </button>
      <div className="iv-strip">
        {song.sections.map((s) => (
          <button key={s.id} type="button" style={{ flexGrow: s.bars, ['--c' as string]: KINDS[s.kind].color }} onClick={() => onPlayPart(s.id)} title={L("{0}만 듣기", s.name)}>
            {s.name}
          </button>
        ))}
      </div>
      <ul className="iv-summary">
        {song.sections.map((s) => {
          const pl = plans[s.id]
          if (!pl) return null
          const prog = progressionsFor(minor).find((x) => x.id === pl.prog) ?? progressionsFor(minor)[0]
          const same = seen.get(s.kind)
          if (!same) seen.set(s.kind, s.name)
          return (
            <li key={s.id} style={{ ['--c' as string]: KINDS[s.kind].color }}>
              <b>{s.name}</b>
              {same ? <span className="iv-same">{same}{L("와 같아요 (다시 쓰기)")}</span> : (
                <span>
                  {pl.comp === 'none' ? L("화음 쉬기") : prog.degrees.slice(0, 4).map((d) => chordOf(root, minor, d, false).name).join(' → ')}
                  {pl.comp !== 'none' && <> · {term(COMP_PICK, pl.comp)}</>} · {term(DRUM_PICK, pl.drum)} · {term(BASS_PICK, pl.bass)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="iv-say small">{L("곡 전체 길이는")} {song.bars}{L("마디, 약")} {Math.round(((song.bars * song.beatsPerBar) / song.bpm) * 60)}{L("초예요. 아직 멜로디는 비어 있어요. 다음에서 멜로디를 얹어요.")}</p>
    </>
  )
}
