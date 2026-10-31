import { useRef } from 'react'
import { PPQ, type Settings, type Song } from '../types'
import { KINDS, rangesOf } from '../sections'

interface Props {
  song: Song
  settings: Settings
  pxPerTick: number
  keyW: number
  height: number
  onSeek: (tick: number) => void
  onLoop: (start: number, end: number) => void
}

/** 마디 눈금자: 클릭=그 위치로 이동, 드래그=반복 구간 */
export function Ruler({ song, settings, pxPerTick, keyW, height, onSeek, onLoop }: Props) {
  const barTicks = song.beatsPerBar * PPQ
  const gridW = song.bars * barTicks * pxPerTick
  const drag = useRef<{ x0: number; t0: number; moved: boolean } | null>(null)
  const tickAt = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(gridW / pxPerTick, (e.clientX - r.left) / pxPerTick))
  }
  const loopOn = settings.loop && settings.loopEnd > settings.loopStart
  return (
    <div className="ruler-row" style={{ height }}>
      <div className="corner" style={{ width: keyW }} />
      <div
        className="ruler"
        style={{ width: gridW }}
        title="클릭: 그 위치로 이동 / 드래그: 반복 구간 정하기"
        onPointerDown={(e) => {
          drag.current = { x0: e.clientX, t0: tickAt(e), moved: false }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || (!d.moved && Math.abs(e.clientX - d.x0) < 5)) return
          d.moved = true
          const t = tickAt(e)
          const a = Math.round(Math.min(d.t0, t) / PPQ) * PPQ
          const b = Math.round(Math.max(d.t0, t) / PPQ) * PPQ
          if (b > a) onLoop(a, b)
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (d && !d.moved) onSeek(Math.round(tickAt(e) / settings.snap) * settings.snap)
        }}
      >
        {Array.from({ length: song.bars }, (_, b) => (
          <div key={b} className="bar-num" style={{ left: b * barTicks * pxPerTick }}>
            {b + 1}
          </div>
        ))}
        {(() => {
          const rg = rangesOf(song)
          return song.sections.map((s) => {
            const r = rg.get(s.id)!
            return (
              <div
                key={s.id}
                className="sec-band"
                style={{ left: r.start * pxPerTick, width: (r.end - r.start) * pxPerTick - 1, background: KINDS[s.kind].color }}
                title={`${s.name} (${s.bars}마디)`}
              >
                {s.name}
              </div>
            )
          })
        })()}
        {settings.loopEnd > settings.loopStart && (
          <div
            className={`loop-range ${loopOn ? 'on' : ''}`}
            style={{
              left: settings.loopStart * pxPerTick,
              width: (settings.loopEnd - settings.loopStart) * pxPerTick,
            }}
          />
        )}
      </div>
    </div>
  )
}
