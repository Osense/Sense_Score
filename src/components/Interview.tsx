import { useEffect, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import type { Workspace } from './WorkspaceTabs'
import { NOTE_NAMES_EN, NOTE_NAMES_KO } from '../music'
import type { Answers } from '../template'
import { autoName, KINDS, planOf, stepBars, STRUCTURES, type PlanItem } from '../sections'
import {
  autoPlans, BASS_STYLES, chordOf, COMP_STYLES, DRUM_STYLES, findRoleTrack, isMinorScale, neighborCtx, progressionsFor, rankProgressions,
  type BassStyle, type ChordRhythm, type DrumStyle, type PartPlan,
} from '../scaffold'
import type { ScaleType, SectionKind, Settings, Song } from '../types'

/* ======================================================================
   시작 인터뷰: 네 마당(준비 → 곡의 모양 → 반주 → 멜로디)을 한 화면에 한 질문씩 묻는다.
   카드를 누르면 바로 소리가 나서, 글을 다 읽지 않아도 귀로 고를 수 있다. 태블릿 손가락 크기 기준.
   ====================================================================== */

type Chapter = 'ready' | 'shape' | 'band' | 'melody'
interface Step { id: string; chapter: Chapter; kind?: SectionKind }

const CHAPTERS: { id: Chapter; no: string; label: string; sub: string }[] = [
  { id: 'ready', no: '01', label: '곡 준비', sub: '이름·분위기·빠르기·악기' },
  { id: 'shape', no: '02', label: '곡의 모양', sub: '어떤 순서로 흘러갈까' },
  { id: 'band', no: '03', label: '반주 만들기', sub: '화음·드럼·베이스 고르기' },
  { id: 'melody', no: '04', label: '멜로디', sub: '내 노래 얹기' },
]

/** 앞뒤를 이어 주는 파트. 화음은 기둥 파트(벌스·코러스·A·B)를 보고 자동으로 맞춘다 */
const CONNECT = new Set<SectionKind>(['intro', 'prechorus', 'bridge', 'outro', 'interlude'])

const TEMPOS = [
  { bpm: 72, label: '느긋하게', pic: '거북이 걸음', hint: '자장가, 잔잔한 발라드', term: 'Adagio 아다지오' },
  { bpm: 100, label: '보통으로', pic: '산책하는 걸음', hint: '가장 무난한 빠르기', term: 'Andante 안단테' },
  { bpm: 128, label: '신나게', pic: '뛰어가는 걸음', hint: '댄스곡, 신나는 동요', term: 'Allegro 알레그로' },
  { bpm: 160, label: '아주 빠르게', pic: '로켓처럼 슝', hint: '게임 음악, 록', term: 'Vivace 비바체' },
]

const METERS = [
  { beats: 4, label: '하나 둘 셋 넷', hint: '가장 흔한 박자예요', term: '4/4 박자', accents: [1, 0, 0.5, 0] },
  { beats: 3, label: '하나 둘 셋', hint: '왈츠처럼 빙글빙글', term: '3/4 박자', accents: [1, 0, 0] },
  { beats: 2, label: '하나 둘', hint: '행진곡처럼 씩씩하게', term: '2/4 박자', accents: [1, 0] },
  { beats: 5, label: '하나 둘 셋 넷 다섯', hint: '독특한 박자에 도전!', term: '5/4 박자', accents: [1, 0, 0, 0.5, 0] },
]

const MOODS: { type: ScaleType; label: string; hint: string; term: string }[] = [
  { type: 'major', label: '밝고 신나게', hint: '맑은 날 같은 소리', term: '장음계' },
  { type: 'minor', label: '차분하고 슬프게', hint: '비 오는 날 같은 소리', term: '단음계' },
  { type: 'pentatonic', label: '아무렇게나 쳐도 예쁘게', hint: '틀리기 어려운 다섯 음', term: '5음계' },
  { type: 'blues', label: '멋지고 끈적하게', hint: '블루스 느낌', term: '블루스 음계' },
]

const PARTS_WANT: { key: 'melody' | 'chords' | 'bass' | 'drums'; icon: IconName; label: string; hint: string }[] = [
  { key: 'melody', icon: 'melody', label: '멜로디', hint: '내가 만드는 주인공 가락' },
  { key: 'chords', icon: 'keys', label: '화음 반주', hint: '피아노·기타처럼 받쳐 줘요' },
  { key: 'bass', icon: 'sound', label: '베이스', hint: '낮은 음으로 바닥을 깔아요' },
  { key: 'drums', icon: 'drum', label: '드럼', hint: '쿵짝쿵짝 리듬을 만들어요' },
]

const TITLE_IDEAS = ['나의 첫 곡', '봄날의 산책', '별이 빛나는 밤', '우리 동네 행진곡', '비 오는 날', '여름 방학', '꿈속의 놀이터', '달리는 자전거', '고양이의 낮잠', '바닷가 모래성']

/** 곡의 틀을 아이 말로 */
const SHAPES: Record<string, { label: string; say: string }> = {
  ab: { label: '짧은 노래', say: '두 가락을 하나씩 들려줘요' },
  aba: { label: '돌아오는 노래', say: '처음 가락으로 돌아와서 끝나요' },
  aaba: { label: '되풀이하는 노래', say: '처음 가락을 두 번 들려줘서 기억에 남아요' },
  pop: { label: '가요처럼', say: '이야기(벌스)와 후렴(코러스)을 번갈아요' },
  full: { label: '길고 멋지게', say: '프리코러스와 브릿지까지 다 들어가요' },
  free: { label: '틀 없이 자유롭게', say: '8마디 한 덩어리로 시작해요' },
}

const COMP_PICK: { id: ChordRhythm; label: string }[] = [
  { id: 'whole', label: '길게 울리기' },
  { id: 'beats', label: '박마다 톡톡' },
  { id: 'arpeggio', label: '한 음씩 흘리기' },
  { id: 'eighths', label: '잘게 쪼개 신나게' },
  { id: 'offbeat', label: '뒷박에 통통' },
]
const DRUM_PICK: { id: DrumStyle; label: string }[] = [
  { id: 'basic8', label: '쿵 짝 쿵 짝' },
  { id: 'basic4', label: '느긋하게 걷는 리듬' },
  { id: 'floor4', label: '쿵쿵쿵쿵 춤추는 리듬' },
  { id: 'shuffle', label: '흔들흔들 셔플' },
  { id: 'halftime', label: '묵직하게 천천히' },
  { id: 'none', label: '드럼 없이' },
]
const BASS_PICK: { id: BassStyle; label: string }[] = [
  { id: 'roots', label: '드럼과 함께 둥' },
  { id: 'roots-pass', label: '가끔 통통 튀기' },
  { id: 'walking', label: '걸어가는 베이스' },
  { id: 'octave', label: '높게 낮게 들썩들썩' },
  { id: 'whole', label: '길게 받쳐 주기' },
  { id: 'none', label: '베이스 없이' },
]

interface Props {
  song: Song
  settings: Settings
  stepId: string
  onStep: (id: string) => void
  answers: Answers
  onAnswers: (a: Answers) => void
  /** 1마당이 끝나면 대답으로 곡을 만든다 (이미 만들었으면 바뀐 것만 고친다) */
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
  // 첫 화면
  hasSaved: boolean
  incoming: { title: string } | null
  onOpenIncoming: () => void
  onImport: () => void
  onBlank: () => void
}

function Learn({ children, title = '알아두면 좋아요' }: { children: ReactNode; title?: string }) {
  return (
    <details className="iv-learn">
      <summary><Icon name="help" size={16} />{title}</summary>
      <div>{children}</div>
    </details>
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

/** 리듬 미리보기용 점 (센 박은 크게) */
function Beats({ accents }: { accents: number[] }) {
  return (
    <span className="iv-beats" aria-hidden>
      {accents.map((x, i) => <i key={i} style={{ width: 12 + x * 14, height: 12 + x * 14 }} />)}
    </span>
  )
}

function Timeline({ parts }: { parts: [SectionKind, number, string?][] }) {
  return (
    <span className="iv-mini" aria-hidden>
      {parts.map(([k, bars, name], i) => (
        <i key={i} style={{ flexGrow: bars, background: KINDS[k].color }}>{name ?? KINDS[k].label}</i>
      ))}
    </span>
  )
}

export function Interview(p: Props) {
  const { song, settings, answers: a } = p
  const set = (patch: Partial<Answers>) => p.onAnswers({ ...a, ...patch })
  const minor = isMinorScale(settings.scaleType)
  const root = settings.scaleType === 'none' ? 0 : settings.scaleRoot
  const hasChords = !!findRoleTrack(song, 'chords')
  const hasBass = !!findRoleTrack(song, 'bass')
  const hasDrums = !!findRoleTrack(song, 'drums')

  /* ---------- 질문 목록 (곡 모양에 따라 달라진다) ---------- */
  const pillarKinds: SectionKind[] = []
  for (const s of song.sections) if (!CONNECT.has(s.kind) && !pillarKinds.includes(s.kind)) pillarKinds.push(s.kind)
  const steps: Step[] = [
    { id: 'title', chapter: 'ready' },
    { id: 'mood', chapter: 'ready' },
    { id: 'tempo', chapter: 'ready' },
    { id: 'meter', chapter: 'ready' },
    { id: 'parts', chapter: 'ready' },
    { id: 'shape', chapter: 'shape' },
    { id: 'order', chapter: 'shape' },
  ]
  if (hasChords || hasBass) for (const k of pillarKinds) steps.push({ id: `chords-${k}`, chapter: 'band', kind: k })
  if (hasChords) steps.push({ id: 'comp', chapter: 'band' })
  if (hasDrums) steps.push({ id: 'drum', chapter: 'band' })
  if (hasBass) steps.push({ id: 'bass', chapter: 'band' })
  if (hasChords || hasBass || hasDrums) steps.push({ id: 'built', chapter: 'band' })
  steps.push({ id: 'melody', chapter: 'melody' })

  const welcome = p.stepId === 'welcome'
  let idx = steps.findIndex((s) => s.id === p.stepId)
  if (idx < 0 && !welcome) idx = 0
  const step = steps[Math.max(0, idx)]
  const chapterSteps = steps.filter((s) => s.chapter === step.chapter)
  const inChapter = chapterSteps.findIndex((s) => s.id === step.id)

  /* 반주 마당에 들어오면 비어 있는 파트 계획을 채운다 */
  const needPlans = step.chapter === 'band' && song.sections.some((s) => !p.plans[s.id])
  useEffect(() => {
    if (needPlans) p.onPlans(autoPlans(song, settings, p.plans))
  })

  // 질문이 바뀌면 화면 맨 위로
  useEffect(() => {
    document.querySelector('.iv-scroll')?.scrollTo({ top: 0 })
  }, [p.stepId])

  const go = (to: number) => {
    p.onStop()
    const cur = steps[idx]
    // 1마당 → 2마당으로 넘어갈 때 곡을 만든다
    if (cur?.id === 'parts' && to > idx && !p.onReady(a)) return
    const next = steps[to]
    if (next?.id === 'built' && to > idx) p.onBuild()
    p.onStep(to < 0 ? 'welcome' : next?.id ?? 'melody')
  }

  /* ---------- 반주: 기둥 파트 고르기 → 연결 파트는 다시 자동으로 ---------- */
  const pillarOnly = (plans: Record<string, PartPlan>) =>
    Object.fromEntries(song.sections.filter((s) => !CONNECT.has(s.kind) && plans[s.id]).map((s) => [s.id, plans[s.id]]))
  const setForKinds = (pred: (k: SectionKind) => boolean, patch: Partial<PartPlan>, refill: boolean) => {
    const next = { ...p.plans }
    for (const s of song.sections) if (pred(s.kind) && next[s.id]) next[s.id] = { ...next[s.id], ...patch }
    p.onPlans(refill ? autoPlans(song, settings, pillarOnly(next)) : next)
  }
  const firstOf = (k: SectionKind) => song.sections.findIndex((s) => s.kind === k)
  const firstPillar = song.sections.find((s) => !CONNECT.has(s.kind)) ?? song.sections[0]
  const auditionPillar = (patch: Partial<PartPlan>) => {
    const base = p.plans[firstPillar.id]
    if (base) p.onAudition({ ...base, ...patch }, Math.min(firstPillar.bars, 4), firstPillar.kind)
  }

  const nextDisabled =
    (step.id === 'parts' && !a.melody && !a.chords && !a.bass && !a.drums) ||
    (step.id === 'shape' && !p.structureId)

  /* ---------- 질문별 화면 ---------- */
  const body = (): ReactNode => {
    switch (step.id) {
      case 'title':
        return (
          <>
            <Q n="이 곡의 이름을 지어 볼까요?" say="나중에 얼마든지 바꿀 수 있어요. 떠오르지 않으면 아래에서 골라도 돼요." />
            <input className="iv-title" value={a.title} onChange={(e) => set({ title: e.target.value })} placeholder="예) 나의 첫 곡" maxLength={40} aria-label="곡 이름" />
            <div className="iv-chips">
              {TITLE_IDEAS.slice(0, 6).map((t) => (
                <button key={t} type="button" className={a.title === t ? 'on' : ''} onClick={() => set({ title: t })}>{t}</button>
              ))}
              <button type="button" className="ghost" onClick={() => set({ title: TITLE_IDEAS[Math.floor(Math.random() * TITLE_IDEAS.length)] })}>아무거나 골라 줘</button>
            </div>
          </>
        )
      case 'mood':
        return (
          <>
            <Q n="어떤 느낌의 곡이면 좋겠어요?" say="카드를 누르면 그 느낌의 음들이 들려요. 귀로 듣고 골라 보세요." />
            <div className="iv-grid">
              {MOODS.map((m) => (
                <Card key={m.type} on={a.scaleType === m.type} onClick={() => { set({ scaleType: m.type }); p.onScaleDemo(a.root, m.type) }}>
                  <span className="iv-play"><Icon name="play" size={14} />들어보기</span>
                  <b>{m.label}</b>
                  <small>{m.hint}</small>
                  <span className="iv-term">{m.term}</span>
                </Card>
              ))}
            </div>
            <details className="iv-more">
              <summary>시작하는 음(으뜸음) 바꾸기 · 지금 <b>{NOTE_NAMES_KO[a.root]}</b></summary>
              <div className="iv-keys">
                {NOTE_NAMES_KO.map((n, i) => (
                  <button key={n} type="button" className={`${a.root === i ? 'on' : ''} ${n.includes('#') ? 'sharp' : ''}`} onClick={() => { set({ root: i }); p.onScaleDemo(i, a.scaleType) }}>
                    {n}<small>{NOTE_NAMES_EN[i]}</small>
                  </button>
                ))}
              </div>
            </details>
            <Learn>곡에 쓸 음을 모아 놓은 것을 <b>음계</b>라고 해요. 같은 도레미라도 <b>장음계</b>는 밝게, <b>단음계</b>는 어둡게 들려요. 음계를 정하면 건반에서 어울리는 음이 색으로 표시돼서 멜로디를 쉽게 만들 수 있어요.</Learn>
          </>
        )
      case 'tempo':
        return (
          <>
            <Q n="얼마나 빠른 곡일까요?" say="카드를 누르면 그 빠르기로 박 소리가 들려요." />
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
            <details className="iv-more">
              <summary>숫자로 직접 맞추기 · 지금 <b>{a.bpm}</b> BPM</summary>
              <div className="iv-fine">
                <input type="range" min={50} max={200} value={a.bpm} onChange={(e) => set({ bpm: +e.target.value })} aria-label="빠르기" />
                <button type="button" onClick={() => p.onBeatDemo(a.bpm, a.beats)}><Icon name="play" size={14} />들어보기</button>
              </div>
            </details>
            <Learn>빠르기를 <b>템포</b>라고 해요. 1분에 박을 몇 번 치는지(BPM)로 나타내요. 악보에는 이탈리아 말로 적기도 해요.</Learn>
          </>
        )
      case 'meter':
        return (
          <>
            <Q n="박을 몇 개씩 묶어서 셀까요?" say="큰 동그라미가 센 박이에요. 눌러서 들어 보세요." />
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
            <Learn><b>박자</b>는 센 박과 여린 박이 되풀이되는 규칙이에요. 박을 묶은 한 덩어리를 <b>마디</b>라고 하고, 마디의 첫 박이 가장 세요.</Learn>
          </>
        )
      case 'parts':
        return (
          <>
            <Q n="어떤 악기들과 함께 연주할까요?" say="누를 때마다 넣었다 뺐다 해요. 처음이면 넷 다 넣는 걸 추천해요." />
            <div className="iv-grid four">
              {PARTS_WANT.map((w) => (
                <Card key={w.key} on={a[w.key]} onClick={() => set({ [w.key]: !a[w.key] })}>
                  <span className="iv-icon"><Icon name={w.icon} size={28} /></span>
                  <b>{w.label}</b>
                  <small>{w.hint}</small>
                </Card>
              ))}
            </div>
            <Learn>음악은 네 가지 역할이 겹쳐져요. <b>멜로디</b>가 노래를 하고, <b>화음</b>이 색을 입히고, <b>베이스</b>가 바닥을 받치고, <b>드럼</b>이 움직임을 만들어요. 밴드가 이 역할을 나눠 맡는 거예요.</Learn>
          </>
        )
      case 'shape':
        return (
          <>
            <Q n="곡이 어떤 순서로 흘러가면 좋을까요?" say="노래도 이야기처럼 앞·가운데·끝이 있어요. 마음에 드는 모양을 골라요." />
            <div className="iv-grid wide">
              {STRUCTURES.map((s) => {
                const bars = s.parts.reduce((n, x) => n + x[1], 0)
                const sec = Math.round(((bars * song.beatsPerBar) / song.bpm) * 60)
                return (
                  <Card key={s.id} on={p.structureId === s.id} badge={s.id === 'aba' ? '처음이면 추천' : undefined} onClick={() => p.onStructure(s.id)}>
                    <b>{SHAPES[s.id]?.label ?? s.label}</b>
                    <small>{SHAPES[s.id]?.say ?? s.desc}</small>
                    <Timeline parts={s.parts} />
                    <span className="iv-term">{s.label} · 약 {sec}초</span>
                  </Card>
                )
              })}
            </div>
            {p.structureId && (
              <Learn title={`${STRUCTURES.find((s) => s.id === p.structureId)?.term ?? ''} 알아보기`}>
                <ul>{STRUCTURES.find((s) => s.id === p.structureId)?.learn.map((l) => <li key={l}>{l}</li>)}</ul>
              </Learn>
            )}
          </>
        )
      case 'order':
        return <Order song={song} onPlan={p.onPlan} onPlayPart={p.onPlayPart} />
      case 'comp':
        return (
          <StylePick
            q="화음은 어떻게 쳐 줄까요?"
            say="같은 화음도 치는 방법에 따라 느낌이 달라져요. 눌러서 들어 보세요."
            items={COMP_PICK.map((c) => ({ ...c, desc: COMP_STYLES.find((x) => x.id === c.id)?.desc ?? '', term: COMP_STYLES.find((x) => x.id === c.id)?.name ?? '' }))}
            value={p.plans[firstPillar.id]?.comp}
            onPick={(id) => { setForKinds((k) => !CONNECT.has(k), { comp: id }, false); auditionPillar({ comp: id }) }}
            learn={<>화음을 한꺼번에 길게 울리면 차분하고, 잘게 쪼개 치면 신나요. 음을 하나씩 차례로 치는 것을 <b>아르페지오(분산화음)</b>라고 해요.</>}
          />
        )
      case 'drum':
        return (
          <StylePick
            q="드럼은 어떤 리듬으로 칠까요?"
            say="곡의 걸음걸이를 정해요. 눌러서 들어 보세요."
            items={DRUM_PICK.map((c) => ({ ...c, desc: DRUM_STYLES.find((x) => x.id === c.id)?.desc ?? '', term: DRUM_STYLES.find((x) => x.id === c.id)?.name ?? '' }))}
            value={p.plans[firstPillar.id]?.drum}
            onPick={(id) => { setForKinds((k) => id === 'none' || !CONNECT.has(k), { drum: id }, false); auditionPillar({ drum: id }) }}
            learn={<>드럼은 <b>킥</b>(쿵), <b>스네어</b>(짝), <b>하이햇</b>(츠)으로 리듬을 만들어요. 인트로와 마무리는 드럼을 빼거나 줄여서 자연스럽게 시작하고 끝나게 해 줄게요.</>}
          />
        )
      case 'bass':
        return (
          <StylePick
            q="베이스는 어떻게 움직일까요?"
            say="낮은 음이 곡의 바닥을 받쳐 줘요. 눌러서 들어 보세요."
            items={BASS_PICK.map((c) => ({ ...c, desc: BASS_STYLES.find((x) => x.id === c.id)?.desc ?? '', term: BASS_STYLES.find((x) => x.id === c.id)?.name ?? '' }))}
            value={p.plans[firstPillar.id]?.bass}
            onPick={(id) => { setForKinds((k) => id === 'none' || !CONNECT.has(k), { bass: id }, false); auditionPillar({ bass: id }) }}
            learn={<>베이스는 보통 화음의 맨 아래 음(<b>근음, 루트</b>)을 연주해요. 드럼의 킥과 같은 자리에서 치면 둘이 한 몸처럼 들려요.</>}
          />
        )
      case 'built':
        return <Built song={song} playing={p.playing} built={p.built} onPlayAll={p.onPlayAll} onPlayPart={p.onPlayPart} />
      case 'melody':
        return (
          <>
            <Q n="이제 주인공, 멜로디를 얹어 볼까요?" say="두 가지 방법이 있어요. 편한 쪽으로 시작하고, 언제든 바꿔도 돼요." />
            <div className="iv-grid two">
              <button type="button" className="iv-card iv-go" onClick={() => p.onGo('melody')}>
                <span className="iv-icon"><Icon name="keys" size={30} /></span>
                <b>건반을 치며 녹음하기</b>
                <small>반주를 들으면서 건반을 눌러요. 박자가 조금 틀려도 자동으로 맞춰 줘요.</small>
                <span className="iv-cta">녹음하러 가기 <Icon name="next" size={16} /></span>
              </button>
              <button type="button" className="iv-card iv-go" onClick={() => p.onGo('compose')}>
                <span className="iv-icon"><Icon name="write" size={30} /></span>
                <b>한 음씩 찍어서 쓰기</b>
                <small>연필로 건반 칸이나 악보에 음표를 하나씩 놓아요. 천천히 생각하며 만들 때 좋아요.</small>
                <span className="iv-cta">직접 쓰러 가기 <Icon name="next" size={16} /></span>
              </button>
            </div>
            <div className="iv-after">
              <span>그다음에는</span>
              <button type="button" onClick={() => p.onGo('arrange')}><Icon name="arrange" size={16} />구성 자세히 고치기</button>
              <button type="button" onClick={() => p.onGo('mix')}><Icon name="mix" size={16} />악기 소리 맞추기</button>
              <button type="button" onClick={() => p.onGo('deliver')}><Icon name="done" size={16} />듣고 평가받기</button>
            </div>
          </>
        )
      default:
        if (step.kind) {
          const k = step.kind
          const i = firstOf(k)
          const sec = song.sections[i]
          const plan = sec && p.plans[sec.id]
          if (!sec || !plan) return <p className="iv-say">준비하는 중…</p>
          const others = Object.fromEntries(Object.entries(p.plans).filter(([id]) => song.sections.find((s) => s.id === id)?.kind !== k))
          const ranks = rankProgressions(neighborCtx(song, others, i, minor, root))
          const list = ranks.slice(0, 3)
          if (!list.some((r) => r.prog.id === plan.prog)) {
            const cur = ranks.find((r) => r.prog.id === plan.prog)
            if (cur) list.push(cur)
          }
          // 세 카드에 똑같이 붙는 이유는 빼고, 카드마다 다른 이유만 보여 준다
          const shared = list.length > 1 ? list[0].reasons.filter((x) => list.every((r) => r.reasons.includes(x))) : []
          const why = (r: (typeof list)[number]) => r.reasons.find((x) => !shared.includes(x))
          const count = song.sections.filter((s) => s.kind === k).length
          const all = progressionsFor(minor)
          return (
            <>
              <Q
                n={<>「{KINDS[k].label === 'A' || KINDS[k].label === 'B' ? `${KINDS[k].label} 가락` : KINDS[k].label}」에는 어떤 화음이 어울릴까요?</>}
                say={`${KINDS[k].hint}.${count > 1 ? ` 곡에 ${count}번 나와요.` : ''} 눌러서 들어 보세요.`}
              />
              <div className="iv-grid">
                {list.map((r, n) => (
                  <Card key={r.prog.id} on={plan.prog === r.prog.id} badge={n === 0 ? '잘 어울려요' : undefined}
                    onClick={() => { setForKinds((x) => x === k, { prog: r.prog.id }, true); p.onAudition({ ...plan, prog: r.prog.id }, sec.bars, k) }}>
                    <span className="iv-play"><Icon name="play" size={14} />들어보기</span>
                    <b>{r.prog.mood}</b>
                    <span className="iv-chords">{r.prog.degrees.slice(0, 4).map((d) => chordOf(root, minor, d, false).name).join(' · ')}</span>
                    {why(r) && <small>{why(r)}</small>}
                  </Card>
                ))}
              </div>
              <details className="iv-more">
                <summary>다른 화음 진행 더 보기</summary>
                <div className="iv-chips">
                  {all.filter((x) => !list.some((r) => r.prog.id === x.id)).map((x) => (
                    <button key={x.id} type="button" className={plan.prog === x.id ? 'on' : ''}
                      onClick={() => { setForKinds((y) => y === k, { prog: x.id }, true); p.onAudition({ ...plan, prog: x.id }, sec.bars, k) }}>
                      {x.mood}
                    </button>
                  ))}
                </div>
              </details>
              <Learn title={`${all.find((x) => x.id === plan.prog)?.name ?? ''} 진행`}>
                {shared.length > 0 && <>{shared[0]}. </>}{all.find((x) => x.id === plan.prog)?.theory} 인트로·브릿지 같은 이어 주는 파트의 화음은 앞뒤를 보고 자동으로 맞춰 줄게요.
              </Learn>
            </>
          )
        }
        return null
    }
  }

  if (welcome)
    return (
      <div className="iv iv-scroll">
        <div className="iv-welcome">
          <p className="iv-eyebrow">SENSE SCORE · 작곡 놀이터</p>
          <h1>질문에 답하다 보면<br /><span className="grad">나만의 노래</span>가 완성돼요</h1>
          <p className="iv-say">한 번에 하나씩 물어볼게요. 카드를 누르면 바로 소리가 나니까 귀로 듣고 골라 보세요.</p>
          {p.incoming && (
            <button type="button" className="iv-incoming" onClick={p.onOpenIncoming}>
              <Icon name="link" size={18} />친구가 보낸 곡 「{p.incoming.title || '이름 없는 곡'}」 열어 보기
            </button>
          )}
          <div className="iv-start">
            <button type="button" className="iv-primary big" onClick={() => p.onStep('title')}>새 곡 만들기 <Icon name="next" size={20} /></button>
            {p.hasSaved && <button type="button" className="iv-secondary big" onClick={() => p.onGo('compose')}><Icon name="play" size={16} />하던 곡 이어서</button>}
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
            <span>다른 방법</span>
            <button type="button" onClick={p.onImport}><Icon name="folder" size={16} />MIDI 파일 불러오기</button>
            <button type="button" onClick={p.onBlank}><Icon name="write" size={16} />빈 곡에 바로 쓰기</button>
          </div>
        </div>
      </div>
    )

  const total = steps.length
  return (
    <div className="iv">
      <header className="iv-head">
        <ol className="iv-chapters" aria-label="인터뷰 마당">
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
        <div className="iv-progress" aria-hidden><i style={{ width: `${((idx + 1) / total) * 100}%` }} /></div>
      </header>
      <div className="iv-scroll">
        <section className="iv-body" key={step.id}>
          <p className="iv-eyebrow">{CHAPTERS.find((c) => c.id === step.chapter)?.label} · 질문 {inChapter + 1}/{chapterSteps.length}</p>
          {body()}
        </section>
      </div>
      <nav className="iv-nav">
        <button type="button" className="iv-secondary" onClick={() => go(idx - 1)}>
          <Icon name="left" size={18} />이전
        </button>
        {p.playing && (
          <button type="button" className="iv-stop" onClick={p.onStop} aria-label="소리 멈추기"><Icon name="stop" size={16} />멈추기</button>
        )}
        {step.id !== 'melody' && (
          <button type="button" className="iv-primary" disabled={nextDisabled} onClick={() => go(idx + 1)}>
            {step.id === 'parts' ? '곡 만들기' : steps[idx + 1]?.id === 'built' ? '반주 완성하기' : '다음'}
            <Icon name="right" size={18} />
          </button>
        )}
      </nav>
    </div>
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

function StylePick<T extends string>(p: {
  q: string
  say: string
  items: { id: T; label: string; desc: string; term: string }[]
  value: T | undefined
  onPick: (id: T) => void
  learn: ReactNode
}) {
  return (
    <>
      <Q n={p.q} say={p.say} />
      <div className="iv-grid">
        {p.items.map((c) => (
          <Card key={c.id} on={p.value === c.id} onClick={() => p.onPick(c.id)}>
            {c.id !== 'none' && <span className="iv-play"><Icon name="play" size={14} />들어보기</span>}
            <b>{c.label}</b>
            <small>{c.desc}</small>
            {c.id !== 'none' && <span className="iv-term">{c.term}</span>}
          </Card>
        ))}
      </div>
      <Learn>{p.learn}</Learn>
    </>
  )
}

/** 2마당 두 번째 질문: 파트 순서 확인·바꾸기 (화살표 버튼으로, 끌기 없이) */
function Order({ song, onPlan, onPlayPart }: { song: Song; onPlan: (plan: PlanItem[]) => void; onPlayPart: (id: string) => void }) {
  const [adding, setAdding] = useState(false)
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
    if (song.sections.length <= 1) return
    const pl = plan()
    pl.splice(i, 1)
    onPlan(pl)
  }
  const resize = (i: number, d: 1 | -1) => {
    const pl = plan()
    pl[i] = { ...pl[i], bars: stepBars(pl[i].bars, d) }
    onPlan(pl)
  }
  const add = (kind: SectionKind) => {
    const pl = plan()
    pl.push({ src: null, kind, name: autoName(kind, song.sections), bars: 4 })
    onPlan(pl)
    setAdding(false)
  }
  const sec = Math.round(((song.bars * song.beatsPerBar) / song.bpm) * 60)
  const addable: SectionKind[] = song.sections.some((s) => s.kind === 'a' || s.kind === 'b')
    ? ['a', 'b', 'intro', 'interlude', 'outro']
    : ['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'interlude', 'outro']
  return (
    <>
      <Q n="이 순서 그대로 좋을까요?" say={`지금 ${song.sections.length}개 파트, 모두 ${song.bars}마디(약 ${sec}초)예요. 블록을 누르면 그 부분만 들려줘요.`} />
      <ol className="iv-order">
        {song.sections.map((s, i) => (
          <li key={s.id} style={{ ['--c' as string]: KINDS[s.kind].color }}>
            <button type="button" className="iv-block" onClick={() => onPlayPart(s.id)} title={`${s.name} 들어보기`}>
              <span className="iv-no">{i + 1}</span>
              <b>{s.name}</b>
              <small>{s.bars}마디</small>
            </button>
            <div className="iv-block-tools">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="앞으로"><Icon name="left" size={18} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === song.sections.length - 1} aria-label="뒤로"><Icon name="right" size={18} /></button>
              <button type="button" onClick={() => resize(i, -1)} disabled={s.bars <= 4} aria-label="4마디 줄이기"><Icon name="minus" size={16} /></button>
              <button type="button" onClick={() => resize(i, 1)} aria-label="4마디 늘리기"><Icon name="plus" size={16} /></button>
              <button type="button" onClick={() => remove(i)} disabled={song.sections.length <= 1} aria-label="빼기"><Icon name="close" size={16} /></button>
            </div>
          </li>
        ))}
        <li className="iv-add">
          {adding ? (
            <div className="iv-add-list">
              {addable.map((k) => (
                <button key={k} type="button" style={{ ['--c' as string]: KINDS[k].color }} onClick={() => add(k)}>
                  <b>{KINDS[k].label}</b><small>{KINDS[k].hint}</small>
                </button>
              ))}
              <button type="button" className="ghost" onClick={() => setAdding(false)}>닫기</button>
            </div>
          ) : (
            <button type="button" className="iv-block add" onClick={() => setAdding(true)}>
              <Icon name="plus" size={22} /><b>파트 더하기</b>
            </button>
          )}
        </li>
      </ol>
      <Learn>곡을 이루는 덩어리를 <b>파트</b>라고 해요. 같은 파트가 다시 나오면 귀에 익어서 기억에 남고, 다른 파트가 나오면 새로운 느낌이 들어요. 화살표로 순서를 바꾸고, ＋/－로 4마디씩 길이를 바꿀 수 있어요.</Learn>
    </>
  )
}

function Built({ song, playing, built, onPlayAll, onPlayPart }: { song: Song; playing: boolean; built: boolean; onPlayAll: () => void; onPlayPart: (id: string) => void }) {
  return (
    <>
      <Q n={built ? '반주가 완성됐어요! 들어 볼까요?' : '반주를 만드는 중이에요'} say="마음에 들지 않으면 이전으로 돌아가 다시 골라도 돼요. 아직 멜로디는 비어 있어요." />
      <button type="button" className="iv-primary big iv-listen" onClick={onPlayAll}>
        <Icon name={playing ? 'stop' : 'play'} size={20} />{playing ? '멈추기' : '처음부터 끝까지 듣기'}
      </button>
      <div className="iv-strip">
        {song.sections.map((s) => (
          <button key={s.id} type="button" style={{ flexGrow: s.bars, ['--c' as string]: KINDS[s.kind].color }} onClick={() => onPlayPart(s.id)} title={`${s.name}만 듣기`}>
            {s.name}
          </button>
        ))}
      </div>
      <p className="iv-say small">파트 블록을 누르면 그 부분만 되풀이해서 들려줘요.</p>
    </>
  )
}
