import { useState } from 'react'
import { autoName, KIND_ORDER, KINDS, noteCounts, planOf, rangesOf, STRUCTURES, stepBars, type PlanItem } from '../sections'
import type { PartPlan } from '../scaffold'
import { useReorder } from '../useReorder'
import type { Section, SectionKind, Settings, Song } from '../types'
import { ScaffoldMenu } from './ScaffoldMenu'

export type ScaffoldPhase = 'ask' | 'menu' | 'skip' | 'done'

interface Props {
  song: Song
  settings: Settings
  selectedId: string | null
  onSelect: (id: string) => void
  onPlan: (plan: PlanItem[]) => void
  onMeta: (sections: Section[]) => void
  onCompose: (id: string) => void
  onMelody: (id: string) => void
  onPreview: (id: string) => void
  onApplyStructure: (structureId: string) => void
  phase: ScaffoldPhase
  onPhase: (p: ScaffoldPhase) => void
  plans: Record<string, PartPlan>
  onPlans: (p: Record<string, PartPlan>) => void
  onScaffold: (ids: string[] | undefined, listen?: string) => void
  onAudition: (plan: PartPlan, bars: number, kind: SectionKind) => void
}

/** 구성: 곡의 틀을 고르고 파트를 끌어서 배열한 뒤, 메뉴판에서 반주·드럼·베이스 뼈대를 주문하는 화면 */
export function ArrangePage(p: Props) {
  const { song } = p
  const ranges = rangesOf(song)
  const secs = Math.round(((song.bars * song.beatsPerBar) / song.bpm) * 60)
  const blank = song.sections.length === 1 && song.sections[0].kind === 'free' && song.tracks.every((t) => t.notes.length === 0)
  const [galleryOpen, setGalleryOpen] = useState<boolean | null>(null)
  const [pickId, setPickId] = useState<string>('aba')
  const open = galleryOpen ?? blank
  const pick = STRUCTURES.find((s) => s.id === pickId)!

  const move = (from: number, to: number) => {
    const plan = planOf(song.sections)
    const [it] = plan.splice(from, 1)
    plan.splice(to, 0, it)
    p.onPlan(plan)
  }
  const dragH = useReorder('x', move)
  const dragV = useReorder('y', move)

  const step = (i: number, d: number) => {
    if (i + d >= 0 && i + d < song.sections.length) move(i, i + d)
  }
  const duplicate = (i: number) => {
    const plan = planOf(song.sections)
    const s = song.sections[i]
    plan.splice(i + 1, 0, { src: s.id, kind: s.kind, name: autoName(s.kind, song.sections), bars: s.bars })
    p.onPlan(plan)
  }
  const remove = (i: number) => {
    if (song.sections.length <= 1) return
    const s = song.sections[i]
    if (noteCounts(song, s.id).some((n) => n > 0) && !confirm(`"${s.name}" 파트와 그 안의 음표를 지울까요? (되돌리기로 복구할 수 있어요)`)) return
    p.onPlan(planOf(song.sections).filter((_, k) => k !== i))
  }
  const resize = (i: number, d: number) => {
    const plan = planOf(song.sections)
    const bars = stepBars(plan[i].bars, d > 0 ? 1 : -1) // 4마디씩
    if (bars === plan[i].bars) return
    plan[i] = { ...plan[i], bars }
    p.onPlan(plan)
  }
  const add = (kind: SectionKind) => {
    const plan = planOf(song.sections)
    plan.push({ src: null, kind, name: autoName(kind, song.sections), bars: 4 })
    p.onPlan(plan)
  }
  const meta = (i: number, patch: Partial<Section>) => p.onMeta(song.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)))

  const dragStyle = (d: typeof dragH.drag, i: number): React.CSSProperties | undefined =>
    d && d.from === i ? { transform: `translate(${d.dx}px, ${d.dy}px)`, zIndex: 5, opacity: 0.85, boxShadow: 'var(--shadow)' } : undefined

  return (
    <div className="page arrange">
      <header className="page-head">
        <div>
          <h2>🧩 구성 — 곡의 틀 짜기</h2>
          <p>
            곡의 <b>틀(형식)</b>을 고르고, 파트를 <b>끌어서</b> 순서를 바꿔요. 파트를 옮기거나 복제하면 <b>그 안의 음표도 같이</b> 움직여요.
          </p>
        </div>
        <div className="head-stats">
          <span><b>{song.sections.length}</b>개 파트</span>
          <span><b>{song.bars}</b>마디</span>
          <span>약 <b>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</b></span>
        </div>
      </header>

      {/* ---------- 1. 곡의 틀 고르기 ---------- */}
      <section className={`gallery ${open ? 'open' : ''}`}>
        <div className="gallery-head">
          <h3>① 곡의 틀(형식) 고르기</h3>
          <button onClick={() => setGalleryOpen(!open)}>{open ? '접기 ▲' : blank ? '펼치기 ▼' : '다른 형식으로 바꾸기 ▼'}</button>
        </div>
        {blank && <p className="gallery-hint">👋 먼저 어떤 틀로 곡을 만들지 골라 보세요. 마음에 드는 게 없으면 아래에서 파트를 직접 하나씩 붙여도 돼요.</p>}
        {open && (
          <>
            <div className="struct-list">
              {STRUCTURES.filter((s) => s.id !== 'free').map((s) => (
                <button key={s.id} className={`struct ${pickId === s.id ? 'on' : ''}`} onClick={() => setPickId(s.id)}>
                  <span className="struct-head">
                    <b>{s.label}</b>
                    <span className="term">{s.term}</span>
                  </span>
                  <small>{s.desc} · 총 {s.parts.reduce((n, [, b]) => n + b, 0)}마디</small>
                  <div className="mini-timeline">
                    {s.parts.map(([k, b, name], i) => (
                      <span key={i} style={{ flex: b, background: KINDS[k].color }}>{name ?? KINDS[k].label}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
            <aside className="learn">
              <b>💡 {pick.label}는 이런 틀이에요</b>
              <ul>{pick.learn.map((l) => <li key={l}>{l}</li>)}</ul>
              <button className="primary" onClick={() => { p.onApplyStructure(pickId); setGalleryOpen(false) }}>이 틀로 시작하기</button>
            </aside>
          </>
        )}
      </section>

      {/* ---------- 2. 파트 배열 ---------- */}
      <h3 className="sec-title">② 파트 배열하기 <small>블록을 끌어서 순서를 바꿔요</small></h3>
      <div className="big-timeline" role="list">
        {song.sections.map((s, i) => {
          const c = noteCounts(song, s.id).reduce((a, b) => a + b, 0)
          const d = dragH.drag
          return (
            <button
              key={s.id}
              ref={dragH.ref(i)}
              role="listitem"
              className={`tl-block draggable ${p.selectedId === s.id ? 'on' : ''} ${d && d.over === i && d.from !== i ? 'drop' : ''}`}
              style={{ flex: s.bars, background: KINDS[s.kind].color, ...dragStyle(d, i) }}
              onClick={() => !dragH.wasDrag() && p.onSelect(s.id)}
              onDoubleClick={() => p.onCompose(s.id)}
              title={`${s.name} · ${s.bars}마디 (끌어서 순서 바꾸기 / 더블클릭: 직접 쓰러 가기)`}
              {...dragH.handle(i)}
            >
              <b>{s.name}</b>
              <small>{s.bars}마디{c === 0 ? ' · 비어 있음' : ''}</small>
              <i>{i + 1}</i>
            </button>
          )
        })}
      </div>

      <div className="part-list">
        {song.sections.map((s, i) => {
          const r = ranges.get(s.id)!
          const counts = noteCounts(song, s.id)
          const total = counts.reduce((a, b) => a + b, 0)
          const d = dragV.drag
          return (
            <div
              key={s.id}
              ref={dragV.ref(i)}
              className={`part-row ${p.selectedId === s.id ? 'on' : ''} ${d && d.over === i && d.from !== i ? 'drop' : ''}`}
              style={dragStyle(d, i)}
              onClick={() => p.onSelect(s.id)}
            >
              <span className="part-color grip" style={{ background: KINDS[s.kind].color }} title="끌어서 순서 바꾸기" {...dragV.handle(i)}>
                <span>⠿</span>
                <b>{i + 1}</b>
              </span>
              <div className="part-main">
                <div className="part-line">
                  <input className="part-name" value={s.name} onChange={(e) => meta(i, { name: e.target.value })} aria-label="파트 이름" />
                  <select value={s.kind} onChange={(e) => meta(i, { kind: e.target.value as SectionKind })} aria-label="파트 종류">
                    {KIND_ORDER.map((k) => (
                      <option key={k} value={k}>{KINDS[k].label}</option>
                    ))}
                  </select>
                  <span className="stepper" title="이 파트의 마디 수 (파트는 4마디 단위로 늘고 줄어요)">
                    <button onClick={(e) => { e.stopPropagation(); resize(i, -1) }} disabled={s.bars <= 4}>－4</button>
                    <b>{s.bars}마디</b>
                    <button onClick={(e) => { e.stopPropagation(); resize(i, 1) }}>＋4</button>
                  </span>
                </div>
                <small className="part-info">
                  {r.bar0 + 1}~{r.bar0 + s.bars}마디 · {total ? `음표 ${total}개` : '아직 비어 있어요'} · {KINDS[s.kind].hint}
                </small>
              </div>
              <div className="part-actions" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => p.onPreview(s.id)} title="이 파트만 반복해서 듣기">▶ 듣기</button>
                <button className="primary" onClick={() => p.onMelody(s.id)} title="이 파트의 멜로디를 건반으로 연주해서 녹음하러 가기">🎤 멜로디</button>
                <button onClick={() => p.onCompose(s.id)} title="이 파트를 건반·악보에 직접 쓰러 가기">✏️ 직접 쓰기</button>
                <button onClick={() => step(i, -1)} disabled={i === 0} title="위로">▲</button>
                <button onClick={() => step(i, 1)} disabled={i === song.sections.length - 1} title="아래로">▼</button>
                <button onClick={() => duplicate(i)} title="복제 (음표도 같이 복사돼요)">⧉</button>
                <button onClick={() => remove(i)} disabled={song.sections.length <= 1} title="지우기">🗑</button>
              </div>
            </div>
          )
        })}
      </div>

      <section className="add-parts">
        <h3>＋ 파트 직접 붙이기 <small>내 마음대로 틀을 만들어요</small></h3>
        <div className="add-grid">
          {KIND_ORDER.filter((k) => k !== 'free').map((k) => (
            <button key={k} onClick={() => add(k)} style={{ borderColor: KINDS[k].color }}>
              <i style={{ background: KINDS[k].color }} />
              <b>{KINDS[k].label}</b>
              <small>{KINDS[k].hint}</small>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- 3. 뼈대 세우기 (메뉴판) ---------- */}
      <section className="scaffold">
        <h3 className="sec-title">③ 뼈대 세우기 <small>화음 · 반주 · 드럼 · 베이스 (멜로디는 직접 쓰는 거예요!)</small></h3>

        {(p.phase === 'ask' || p.phase === 'skip') && (
          <div className="ask-card">
            <div className="ask-icon">🍽</div>
            <div className="ask-body">
              <h4>이 구성대로 뼈대를 세워 드릴까요?</h4>
              <p>
                화음 진행, 반주 리듬, 드럼 박자, 베이스를 <b>메뉴판</b>에서 골라 주문하면 음표를 알아서 놓아 줘요. 직접 찍지 않아도 돼요.
                {p.phase === 'skip' && ' (지금은 빈 칸으로 두기로 했어요. 마음이 바뀌면 언제든 주문하세요!)'}
              </p>
              <div className="wiz-actions">
                <button className="primary big-btn" onClick={() => { p.onSelect(p.selectedId ?? song.sections[0].id); p.onPhase('menu') }}>🍽 네, 메뉴판에서 골라서 세울게요</button>
                <button className="big-btn" onClick={() => p.onPhase('skip')}>아니요, 빈 칸으로 둘게요</button>
              </div>
            </div>
          </div>
        )}

        {p.phase === 'menu' && (
          <ScaffoldMenu
            song={song}
            settings={p.settings}
            plans={p.plans}
            onPlans={p.onPlans}
            selectedId={p.selectedId}
            onSelect={p.onSelect}
            onApply={p.onScaffold}
            onAudition={p.onAudition}
            onDone={() => p.onPhase('done')}
          />
        )}

        {p.phase === 'done' && (
          <div className="ask-card done">
            <div className="ask-icon">✅</div>
            <div className="ask-body">
              <h4>뼈대가 세워졌어요!</h4>
              <p>이제 <b>멜로디 쓰기</b>에서 건반을 연주해 멜로디를 녹음하고, 더 세부적으로 고치고 싶은 곳은 <b>직접 쓰기</b>에서 음표를 하나하나 수정해요.</p>
              <div className="wiz-actions">
                <button className="primary big-btn" onClick={() => p.onMelody(p.selectedId ?? song.sections[0].id)}>🎤 멜로디 쓰러 가기</button>
                <button className="big-btn" onClick={() => p.onCompose(p.selectedId ?? song.sections[0].id)}>✏️ 직접 쓰기로 가기</button>
                <button className="big-btn" onClick={() => p.onPhase('menu')}>🍽 메뉴판 다시 열기</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
