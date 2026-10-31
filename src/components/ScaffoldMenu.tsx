import { useEffect, useMemo } from 'react'
import { NOTE_NAMES_KO } from '../music'
import { KINDS, noteCounts } from '../sections'
import {
  autoPlans, BASS_STYLES, chordOf, COMP_STYLES, DRUM_STYLES, isMinorScale, neighborCtx, progressionsFor, rankProgressions,
  sampleBar, siblingsOf, type BassStyle, type ChordRhythm, type ChordSpeed, type DrumStyle, type PartPlan,
} from '../scaffold'
import type { SectionKind, Settings, Song } from '../types'

interface Props {
  song: Song
  settings: Settings
  plans: Record<string, PartPlan>
  onPlans: (p: Record<string, PartPlan>) => void
  selectedId: string | null
  onSelect: (id: string) => void
  /** 선택한 파트(들)에 뼈대를 만들어 넣는다. 듣기까지 하려면 listen */
  onApply: (ids: string[] | undefined, listen?: string) => void
  /** 고른 설정을 몇 마디만 바로 들려준다 (곡은 바꾸지 않음) */
  onAudition: (plan: PartPlan, bars: number, kind: SectionKind) => void
  onDone: () => void
}

interface Row { label: string; hits: { t: number; d: number }[]; color: string }

/** 한 마디 안에서 소리가 어디에 놓이는지 보여 주는 작은 그림 */
function Strip({ rows, len }: { rows: Row[]; len: number }) {
  return (
    <div className="strip-viz" style={{ ['--beats' as string]: len / 480 }} aria-hidden>
      {rows.map((r) => (
        <div key={r.label} className="strip-row">
          <span className="strip-label">{r.label}</span>
          <div className="strip-track">
            {r.hits.map((h, i) => (
              <i key={i} style={{ left: `${(h.t / len) * 100}%`, width: `${Math.max(2.2, (h.d / len) * 100)}%`, background: r.color }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const SPEEDS: { id: ChordSpeed; name: string; hint: string }[] = [
  { id: 'slow', name: '느리게', hint: '두 마디에 화음 하나' },
  { id: 'normal', name: '보통', hint: '한 마디에 화음 하나' },
  { id: 'fast', name: '빠르게', hint: '한 마디에 화음 둘' },
]

function Course({ no, title, sub, onPlay, children }: { no: number; title: string; sub: string; onPlay?: () => void; children: React.ReactNode }) {
  return (
    <section className="course">
      <header>
        <span className="course-no">{no}</span>
        <div>
          <h4>{title}</h4>
          <p>{sub}</p>
        </div>
        {onPlay && <button className="listen" onClick={onPlay} title="지금 고른 설정으로 반주를 들어 봐요">▶ 들어보기</button>}
      </header>
      {children}
    </section>
  )
}

export function ScaffoldMenu({ song, settings, plans, onPlans, selectedId, onSelect, onApply, onAudition, onDone }: Props) {
  const minor = isMinorScale(settings.scaleType)
  const root = settings.scaleType === 'none' ? 0 : settings.scaleRoot
  const beats = song.beatsPerBar
  const len = beats * 480
  const full = useMemo(() => autoPlans(song, settings, plans), [song, settings, plans])

  // 아직 정하지 않은 파트는 어울리는 기본값으로 채워 둔다 (앞 파트의 마지막 화음에 이어지도록)
  useEffect(() => {
    if (Object.keys(full).length !== Object.keys(plans).length || song.sections.some((s) => !plans[s.id])) onPlans(full)
  }, [full, plans, onPlans, song.sections])

  const idx = Math.max(0, song.sections.findIndex((s) => s.id === selectedId))
  const sec = song.sections[idx]
  const plan = full[sec.id]
  const prev = idx > 0 ? song.sections[idx - 1] : null
  const progs = progressionsFor(minor)
  const sample = sampleBar(beats)

  // 앞·뒤 파트와 이웃 파트의 진행을 보고 센스 있게 추천 (프리코러스·브릿지는 코러스로 이어지는지도 따진다)
  const ctx = neighborCtx(song, full, idx, minor, root)
  const ranks = rankProgressions(ctx)
  const recOf = (id: string) => {
    const i = ranks.findIndex((r) => r.prog.id === id)
    return i >= 0 && i < 2 && ranks[i].score >= 20 ? ranks[i] : null
  }
  const nm = (d: number) => chordOf(root, minor, d, plan.seventh).name

  // 같은 종류의 파트(코러스 2, 코러스 3 …)는 한 번 고르면 함께 바뀐다
  const sibs = siblingsOf(song, sec.id)
  const linked = plan.linked !== false
  const set = (patch: Partial<PartPlan>) => {
    const next = { ...full, [sec.id]: { ...plan, ...patch } }
    if (linked && patch.linked === undefined)
      for (const i of sibs) {
        const sid = song.sections[i].id
        if (full[sid] && full[sid].linked !== false) next[sid] = { ...full[sid], ...patch }
      }
    onPlans(next)
  }
  /** 고르면서 바로 들어 보게 한다: 화음 진행·속도는 4마디, 리듬은 2마디 */
  const pick = (patch: Partial<PartPlan>, bars: number) => {
    set(patch)
    onAudition({ ...plan, ...patch }, bars, sec.kind)
  }
  const toggleLink = (on: boolean) => {
    const next = { ...full, [sec.id]: { ...plan, linked: on } }
    if (on) for (const i of sibs) { const sid = song.sections[i].id; if (full[sid]?.linked !== false) next[sid] = { ...plan, linked: true } }
    onPlans(next)
  }
  const chordNames = (degs: number[]) => degs.map((d) => chordOf(root, minor, d, plan.seventh).name).join(' – ')

  const kicks = sample.drum(plan.drum).filter((h) => h.pitch === 36)

  const gotoNext = () => onSelect(song.sections[Math.min(song.sections.length - 1, idx + 1)].id)
  const gotoPrev = () => onSelect(song.sections[Math.max(0, idx - 1)].id)
  const copyPrev = () => {
    if (!prev) return
    const { prog, ...rest } = full[prev.id]
    void prog
    set(rest)
  }
  const applyAllSame = () => {
    const next = { ...full }
    for (const s of song.sections) next[s.id] = { ...plan, prog: s.id === sec.id ? plan.prog : full[s.id].prog }
    onPlans(next)
  }

  return (
    <div className="menuboard">
      <aside className="mb-parts" aria-label="파트 목록">
        <h4>파트를 하나씩 주문해요</h4>
        {song.sections.map((s, i) => {
          const done = noteCounts(song, s.id).some((n) => n > 0)
          return (
            <button key={s.id} className={`mb-part ${s.id === sec.id ? 'on' : ''}`} onClick={() => onSelect(s.id)}>
              <i style={{ background: KINDS[s.kind].color }}>{i + 1}</i>
              <span>
                <b>{s.name}</b>
                <small>{s.bars}마디 · {chordNames(progs.find((p) => p.id === full[s.id]?.prog)?.degrees.slice(0, 4) ?? [])}</small>
              </span>
              {siblingsOf(song, s.id).length > 0 && full[s.id]?.linked !== false && <em className="lnk" title="같은 종류 파트와 설정이 함께 바뀌어요">🔗</em>}
              {done && <em title="이미 음표가 있어요">✓</em>}
            </button>
          )
        })}
      </aside>

      <div className="mb-main">
        <header className="mb-head">
          <span className="mb-badge" style={{ background: KINDS[sec.kind].color }}>{idx + 1}</span>
          <div>
            <h3>{sec.name} <small>{sec.bars}마디 · {KINDS[sec.kind].label}</small></h3>
            <p>{KINDS[sec.kind].hint}</p>
          </div>
        </header>

        <Course no={1} onPlay={() => onAudition(plan, 4, sec.kind)} title="화음 진행" sub={`${NOTE_KEY(root)} ${minor ? '단조' : '장조'} 음계에 어울리는 진행이에요. 화음은 곡의 ‘색깔’을 정해요.`}>
          {(ctx.prevLast !== null || ctx.nextFirst !== null) && (
            <div className="mb-hint">
              {ctx.prevLast !== null && (
                <div>🔗 앞 파트 <b>{ctx.prevName}</b>는 <b>{nm(ctx.prevLast)}</b> 화음으로 끝나요.</div>
              )}
              {ctx.nextFirst !== null && (
                <div>
                  🎯 다음 파트 <b>{KINDS[ctx.nextKind!].label}</b>는 <b>{nm(ctx.nextFirst)}</b> 화음으로 시작해요
                  {(sec.kind === 'prechorus' || sec.kind === 'bridge' || sec.kind === 'intro') ? ' — 그쪽으로 자연스럽게 이어지는 진행을 추천해요.' : '.'}
                </div>
              )}
              <button className="sense" onClick={() => set({ prog: ranks[0].prog.id })}>✨ 센스 있게 추천받기</button>
            </div>
          )}
          <div className="choice-grid">
            {progs.map((p) => {
              const rec = recOf(p.id)
              return (
                <button key={p.id} className={`choice ${plan.prog === p.id ? 'on' : ''}`} onClick={() => pick({ prog: p.id }, 4)}>
                  {rec && <span className="rec" title={rec.reasons.join(' / ')}>⭐ 추천</span>}
                  <b className="roman">{p.name}</b>
                  <span className="chords">{chordNames(p.degrees)}</span>
                  <small>{p.mood}</small>
                  {plan.prog === p.id && <em>{p.theory}</em>}
                  {rec && rec.reasons.map((r) => <em key={r} className="why">✔ {r}</em>)}
                </button>
              )
            })}
          </div>
          {sibs.length > 0 && (
            <div className="mb-row">
              <label className="check-card link-card">
                <input type="checkbox" checked={linked} onChange={(e) => toggleLink(e.target.checked)} />
                🔗 같은 종류의 파트 ({sibs.map((i) => song.sections[i].name).join(', ')})도 함께 바꾸기
                <small>{linked ? '여기서 고른 것이 다른 파트에도 자동으로 적용돼요' : '이 파트만 따로 정해요'}</small>
              </label>
            </div>
          )}
          <div className="mb-row">
            <span className="mb-label">화음이 바뀌는 속도</span>
            <div className="seg">
              {SPEEDS.map((s) => (
                <button key={s.id} className={plan.speed === s.id ? 'on' : ''} onClick={() => pick({ speed: s.id }, 4)} title={s.hint}>
                  {s.name}<small>{s.hint}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="mb-row">
            <span className="mb-label">화음의 색</span>
            <div className="seg">
              <button className={!plan.seventh ? 'on' : ''} onClick={() => pick({ seventh: false }, 4)}>3화음<small>단순하고 또렷해요</small></button>
              <button className={plan.seventh ? 'on' : ''} onClick={() => pick({ seventh: true }, 4)}>7화음<small>세련되고 감성적이에요 (maj7, m7…)</small></button>
            </div>
          </div>
        </Course>

        <Course no={2} onPlay={() => onAudition(plan, 2, sec.kind)} title="반주 리듬" sub="박자를 잘게 쪼갤까요, 꽉 채울까요? 화음을 어떻게 연주할지 골라요.">
          <div className="choice-grid">
            {COMP_STYLES.map((c) => (
              <button key={c.id} className={`choice ${plan.comp === c.id ? 'on' : ''}`} onClick={() => pick({ comp: c.id as ChordRhythm }, 2)}>
                <b>{c.name}</b>
                <Strip len={len} rows={[{ label: '화음', hits: sample.comp(c.id), color: 'var(--accent)' }]} />
                <small>{c.desc}</small>
              </button>
            ))}
          </div>
        </Course>

        <Course no={3} onPlay={() => onAudition(plan, 2, sec.kind)} title="드럼" sub="곡의 심장 박동이에요. 기본 박자부터 당김음·셔플까지 골라 보세요.">
          <div className="choice-grid">
            {DRUM_STYLES.map((c) => (
              <button key={c.id} className={`choice ${plan.drum === c.id ? 'on' : ''}`} onClick={() => pick({ drum: c.id as DrumStyle }, 2)}>
                <b>{c.icon} {c.name}</b>
                {c.id !== 'none' && <Strip len={len} rows={[
                  { label: '하이햇', hits: sample.drum(c.id).filter((h) => h.pitch === 42 || h.pitch === 46), color: '#9acd32' },
                  { label: '스네어', hits: sample.drum(c.id).filter((h) => h.pitch === 38), color: '#ff5f9e' },
                  { label: '킥', hits: sample.drum(c.id).filter((h) => h.pitch === 36), color: '#4f8cff' },
                ]} />}
                <small>{c.desc}</small>
              </button>
            ))}
          </div>
          {plan.drum !== 'none' && (
            <div className="mb-row">
              <label className="check-card"><input type="checkbox" checked={plan.fill} onChange={(e) => pick({ fill: e.target.checked }, 2)} /> 파트 끝에 작은 연주(필인) 넣기 <small>다음 파트로 넘어가는 신호예요</small></label>
              <label className="check-card"><input type="checkbox" checked={plan.crash} onChange={(e) => pick({ crash: e.target.checked }, 2)} /> 첫 박에 심벌(크래시) 치기 <small>새 파트가 시작된다는 느낌을 줘요</small></label>
            </div>
          )}
          {beats !== 4 && plan.drum !== 'none' && <p className="note-text">{beats}박자에 맞게 자리를 자동으로 조정했어요.</p>}
        </Course>

        <Course no={4} onPlay={() => onAudition(plan, 2, sec.kind)} title="베이스" sub={plan.drum === 'none' ? '낮은 음으로 화음의 바닥을 받쳐요.' : '드럼의 킥 자리에 맞춰 루트(화음의 으뜸음)를 놓는 게 기본이에요.'}>
          <div className="choice-grid">
            {BASS_STYLES.map((c) => (
              <button key={c.id} className={`choice ${plan.bass === c.id ? 'on' : ''}`} onClick={() => pick({ bass: c.id as BassStyle }, 2)}>
                <b>{c.icon} {c.name}</b>
                {c.id !== 'none' && <Strip len={len} rows={[
                  { label: '베이스', hits: sample.bass(c.id, plan.drum), color: 'var(--accent)' },
                  { label: '킥', hits: kicks, color: '#4f8cff88' },
                ]} />}
                <small>{c.desc}</small>
              </button>
            ))}
          </div>
        </Course>
        <div className="mb-spacer" />
      </div>

      <footer className="mb-bar">
        <span className="mb-count">{idx + 1} / {song.sections.length} 파트</span>
        <button onClick={gotoPrev} disabled={idx === 0}>← 앞 파트</button>
        <button onClick={copyPrev} disabled={!prev} title="앞 파트의 반주·드럼·베이스 설정을 그대로 가져와요 (화음 진행은 유지)">앞 파트처럼</button>
        <button onClick={applyAllSame} title="이 파트의 반주·드럼·베이스 설정을 모든 파트에">모든 파트에 같게</button>
        <button onClick={() => onApply([sec.id], sec.id)}>▶ 이 파트 적용하고 듣기</button>
        <button onClick={gotoNext} disabled={idx === song.sections.length - 1}>다음 파트 →</button>
        <span className="grow" />
        <button className="primary big-btn" onClick={() => { onApply(undefined); onDone() }}>🧱 전체 뼈대 세우기</button>
      </footer>
    </div>
  )
}

const NOTE_KEY = (root: number) => NOTE_NAMES_KO[root]
