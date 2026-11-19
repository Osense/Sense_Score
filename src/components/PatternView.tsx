import { L } from '../i18n'
import { useRef } from 'react'
import { PPQ } from '../types'
import { STEP } from '../scaffold'

/* ======================================================================
   리듬 그림(정간보처럼): 한 마디를 칸으로 나누고, 소리가 나는 자리와 길이를 막대로 보여 준다.
   들려줄 때는 재생선이 같은 빠르기로 지나가서 ‘보면서 듣기’가 된다.
   ====================================================================== */

export interface LaneHit { t: number; d: number; row?: number }
export interface Lane { label: string; color: string; hits: LaneHit[]; rows?: string[] }
export interface PlayMark { key: number; barSec: number; count: number }

export function PatternView({ beats, lanes, play, compact }: { beats: number; lanes: Lane[]; play?: PlayMark | null; compact?: boolean }) {
  const bar = beats * PPQ
  return (
    <div className={`pv ${compact ? 'compact' : ''}`} aria-hidden>
      <div className="pv-beats" style={{ gridTemplateColumns: `var(--pv-label) repeat(${beats}, minmax(0, 1fr))` }}>
        <span />
        {Array.from({ length: beats }, (_, i) => <span key={i}>{i + 1}</span>)}
      </div>
      {lanes.map((l) => {
        const rows = l.rows?.length ?? 1
        return (
          <div key={l.label} className="pv-lane">
            <span className="pv-label">{l.label}</span>
            <div className="pv-track" style={{ ['--rows' as string]: rows, ['--beats' as string]: beats }}>
              {l.rows && l.rows.length > 1 && l.rows.map((r, i) => <i key={r} className="pv-rowline" style={{ top: `${(i / rows) * 100}%`, height: `${100 / rows}%` }} />)}
              {l.hits.map((h, i) => (
                <b
                  key={i}
                  className="pv-hit"
                  style={{
                    left: `${(h.t / bar) * 100}%`,
                    width: `max(6px, calc(${(Math.max(STEP * 0.4, h.d) / bar) * 100}% - 2px))`,
                    top: `${(((rows - 1 - (h.row ?? 0)) / rows) * 100)}%`,
                    height: `${100 / rows}%`,
                    background: l.color,
                  }}
                />
              ))}
            </div>
          </div>
        )
      })}
      {play && <i key={play.key} className="pv-head" style={{ animationDuration: `${play.barSec}s`, animationIterationCount: play.count }} />}
    </div>
  )
}

/* ======================================================================
   직접 정하기 편집기: 칸 크기(8분·16분·셋잇단)를 고르고,
   빈 칸을 누르면 음이 생기고 오른쪽으로 끌면 길어진다. 막대를 누르면 지워지고, 막대를 끌면 길이가 바뀐다.
   드럼은 누른 채로 옆으로 밀면 지나간 칸마다 친다.
   ====================================================================== */
export interface PatNoteLike { t: number; d: number }
export interface EditLane { key: string; label: string; color: string }
export type PatValue = Record<string, PatNoteLike[]>

export const GRIDS: { div: number; term: string; kid: string }[] = [
  { div: 2, term: L("8분음표"), kid: L("반 박씩") },
  { div: 4, term: L("16분음표"), kid: L("반의반 박씩") },
  { div: 3, term: L("셋잇단음표"), kid: L("한 박을 셋으로") },
]

/** 음들이 어떤 칸 크기에 맞는지 (처음 열 때 칸 크기 고르기) */
export function guessGrid(notes: PatNoteLike[]): number {
  const fit = (div: number) => notes.every((n) => (n.t * div) % PPQ === 0)
  return fit(2) ? 2 : fit(4) ? 4 : fit(3) ? 3 : 4
}

/** 겹치지 않게 정리: keep 음과 겹치는 다른 음은 앞쪽이면 잘라 내고, 시작이 겹치면 지운다 */
function carve(notes: PatNoteLike[], keep: PatNoteLike): PatNoteLike[] {
  const end = keep.t + keep.d
  const out: PatNoteLike[] = []
  for (const n of notes) {
    if (n === keep) continue
    if (n.t >= keep.t && n.t < end) continue
    if (n.t < keep.t && n.t + n.d > keep.t) out.push({ ...n, d: keep.t - n.t })
    else out.push(n)
  }
  return out
}

interface Drag { lane: string; note: PatNoteLike; startCell: number; moved: boolean; created: boolean; painted: Set<number> }

export function PatternEditor({ beats, grid, onGrid, lanes, value, onChange, sustain, exclusive }: {
  beats: number
  grid: number
  onGrid: (div: number) => void
  lanes: EditLane[]
  value: PatValue
  onChange: (v: PatValue) => void
  /** 길이가 있는 소리(화음·베이스). 아니면 드럼처럼 한 번 치는 소리 */
  sustain: boolean
  /** 여러 줄 가운데 한 번에 한 줄만 소리 (베이스: 근음·5도·옥타브 중 하나) */
  exclusive?: boolean
}) {
  const bar = beats * PPQ
  const cell = PPQ / grid
  const cells = beats * grid
  const drag = useRef<Drag | null>(null)
  const live = useRef(value)
  live.current = value

  const cellAt = (e: React.PointerEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(cells - 1, Math.floor(((e.clientX - r.left) / r.width) * cells)))
  }
  const hitAt = (lane: string, tick: number) => (live.current[lane] ?? []).find((n) => tick >= n.t && tick < n.t + Math.max(n.d, cell))
  /** note를 lane에 넣고, 겹치는 음 정리(exclusive면 모든 줄에서) */
  const put = (v: PatValue, lane: string, note: PatNoteLike, old?: PatNoteLike): PatValue => {
    const next: PatValue = {}
    for (const l of lanes) {
      let ns = (v[l.key] ?? []).filter((n) => n !== old)
      if (l.key === lane || (exclusive && sustain)) ns = carve(ns, note)
      if (!sustain && l.key === lane) ns = ns.filter((n) => n.t !== note.t)
      next[l.key] = l.key === lane ? [...ns, note].sort((a, b) => a.t - b.t) : ns
    }
    return next
  }

  const down = (lane: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const c = cellAt(e, el)
    const hit = hitAt(lane, c * cell)
    if (hit) {
      drag.current = { lane, note: hit, startCell: c, moved: false, created: false, painted: new Set([c]) }
      return
    }
    const note = { t: c * cell, d: cell }
    onChange(put(live.current, lane, note))
    drag.current = { lane, note, startCell: c, moved: false, created: true, painted: new Set([c]) }
  }
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current
    if (!g) return
    const c = cellAt(e, e.currentTarget)
    if (c === g.startCell && !g.moved) return
    g.moved = true
    if (!sustain) {
      // 드럼: 지나간 칸마다 친다
      if (g.painted.has(c) || hitAt(g.lane, c * cell)) return
      g.painted.add(c)
      onChange(put(live.current, g.lane, { t: c * cell, d: cell }))
      return
    }
    // 길이 바꾸기: 끝을 손가락이 있는 칸의 끝까지
    const end = Math.min(bar, Math.max(g.note.t + cell, (c + 1) * cell))
    if (end - g.note.t === g.note.d) return
    const note = { t: g.note.t, d: end - g.note.t }
    onChange(put(live.current, g.lane, note, g.note))
    g.note = note
  }
  const up = () => {
    const g = drag.current
    drag.current = null
    if (!g || g.moved || g.created) return
    // 그냥 누른 막대는 지운다
    const next = { ...live.current, [g.lane]: (live.current[g.lane] ?? []).filter((n) => n !== g.note) }
    onChange(next)
  }

  const head = Array.from({ length: cells }, (_, i) => {
    const sub = i % grid
    return sub === 0 ? String(i / grid + 1) : grid === 2 || (grid === 4 && sub === 2) ? '&' : '·'
  })
  return (
    <div className="pe" style={{ ['--cells' as string]: cells, ['--grid' as string]: grid }}>
      <div className="pe-grids" role="radiogroup" aria-label={L("칸 크기")}>
        <span>{L("칸 크기")}</span>
        {GRIDS.map((g) => (
          <button key={g.div} type="button" role="radio" aria-checked={grid === g.div} className={grid === g.div ? 'on' : ''} onClick={() => onGrid(g.div)}>
            <b>{g.term}</b><small>{g.kid}</small>
          </button>
        ))}
      </div>
      <div className="pe-row pe-head">
        <span className="pe-label" />
        <div className="pe-cells">
          {head.map((h, i) => <span key={i} className={i % grid === 0 ? 'beat' : 'sub'}>{h}</span>)}
        </div>
      </div>
      {lanes.map((l) => (
        <div key={l.key} className="pe-row">
          <span className="pe-label">{l.label}</span>
          <div className="pe-track" style={{ ['--c' as string]: l.color }} onPointerDown={down(l.key)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            role="group" aria-label={L("{0} 줄", l.label)}>
            {Array.from({ length: cells }, (_, i) => <i key={i} className={`pe-cell ${i % grid === 0 ? 'beat' : ''}`} style={{ left: `${(i / cells) * 100}%` }} />)}
            {(value[l.key] ?? []).map((n, i) => (
              <b key={`${n.t}-${i}`} className={`pe-note ${sustain ? 'long' : ''}`}
                style={{ left: `${(n.t / bar) * 100}%`, width: `calc(${((sustain ? Math.max(n.d, cell / 2) : cell) / bar) * 100}% - 3px)` }}>
                {sustain && n.d > cell && <em />}
              </b>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
