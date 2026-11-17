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

/** 직접 정하기: 8분음표 칸을 눌러 켜고 끈다 */
export interface GridRow { label: string; color: string; on: (step: number) => boolean; toggle: (step: number) => void }

export function StepGrid({ beats, rows }: { beats: number; rows: GridRow[] }) {
  const steps = beats * 2
  return (
    <div className="sg" style={{ ['--steps' as string]: steps }}>
      <div className="sg-row sg-head">
        <span className="sg-label" />
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className={i % 2 ? 'and' : 'beat'}>{i % 2 ? '&' : i / 2 + 1}</span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="sg-row">
          <span className="sg-label">{r.label}</span>
          {Array.from({ length: steps }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`sg-cell ${r.on(i) ? 'on' : ''} ${i % 2 ? 'and' : 'beat'}`}
              style={{ ['--c' as string]: r.color }}
              aria-pressed={r.on(i)}
              aria-label={`${r.label} ${Math.floor(i / 2) + 1}박${i % 2 ? ' 뒤' : ''}`}
              onClick={() => r.toggle(i)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
