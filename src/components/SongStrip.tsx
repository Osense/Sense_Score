import { useEffect, useRef } from 'react'
import { KINDS, rangesOf } from '../sections'
import { PPQ, type Song } from '../types'

interface Props {
  song: Song
  getTick: () => number
  /** 재생선을 끌거나 눌러서 옮긴 위치 */
  onSeek: (tick: number) => void
  /** 파트 이름을 누르면 (예: 그 파트만 반복) */
  onPart?: (id: string) => void
  /** 지금 골라 둔 파트(반복 구간) */
  activePart?: string | null
  label?: string
}

/**
 * 곡 전체를 한 줄로: 파트 블록 + 지금 위치(재생선).
 * 재생선은 손가락·마우스로 끌어서 옮길 수 있고, 줄의 빈 곳을 눌러도 그 자리로 간다.
 */
export function SongStrip({ song, getTick, onSeek, onPart, activePart, label }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const time = useRef<HTMLSpanElement>(null)
  const drag = useRef<number | null>(null)
  const total = Math.max(1, song.bars * song.beatsPerBar * PPQ)
  const latest = useRef({ total, song, getTick })
  useEffect(() => { latest.current = { total, song, getTick } })

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const { total, song, getTick } = latest.current
      if (drag.current === null) {
        const t = Math.max(0, Math.min(total, getTick()))
        if (head.current) head.current.style.left = `${(t / total) * 100}%`
        if (time.current) {
          const barTicks = song.beatsPerBar * PPQ
          time.current.textContent = `${Math.floor(t / barTicks) + 1}마디`
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const tickAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const barTicks = song.beatsPerBar * PPQ
    // 박 단위로 맞춘다 (손가락으로 끌 때 딱딱 붙게)
    return Math.min(total - barTicks / song.beatsPerBar, Math.round((x * total) / PPQ) * PPQ) || 0
  }
  const move = (clientX: number) => {
    const t = tickAt(clientX)
    drag.current = t
    if (head.current) head.current.style.left = `${(t / total) * 100}%`
    if (time.current) time.current.textContent = `${Math.floor(t / (song.beatsPerBar * PPQ)) + 1}마디`
  }
  const startX = useRef(0)
  const moved = useRef(false)
  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    track.current!.setPointerCapture(e.pointerId)
    startX.current = e.clientX
    moved.current = false
    // 재생선을 잡았으면 바로 끌기 시작
    if ((e.target as HTMLElement).closest('.ss-head')) {
      moved.current = true
      move(e.clientX)
    }
  }
  const pmove = (e: React.PointerEvent) => {
    if (!track.current?.hasPointerCapture(e.pointerId)) return
    if (!moved.current && Math.abs(e.clientX - startX.current) < 6) return
    moved.current = true
    move(e.clientX)
  }
  const up = (e: React.PointerEvent) => {
    if (!track.current?.hasPointerCapture(e.pointerId)) return
    track.current.releasePointerCapture(e.pointerId)
    if (moved.current && drag.current !== null) {
      onSeek(drag.current)
      drag.current = null
      return
    }
    // 끌지 않고 눌렀으면: 파트를 고르거나(onPart) 그 자리로 이동
    const t = tickAt(e.clientX)
    const part = song.sections.find((sec) => {
      const r = rangesOf(song).get(sec.id)!
      return t >= r.start && t < r.end
    })
    if (part && onPart) onPart(part.id)
    else onSeek(t)
  }

  const rg = rangesOf(song)
  return (
    <div className="ss" role="group" aria-label={label ?? '곡 위치'}>
      {label && <span className="ss-label">{label}</span>}
      <div
        className="ss-track"
        ref={track}
        onPointerDown={down}
        onPointerMove={pmove}
        onPointerUp={up}
        onPointerCancel={() => { drag.current = null }}
      >
        {song.sections.length ? song.sections.map((s) => {
          const r = rg.get(s.id)!
          return (
            <span
              key={s.id}
              className={`ss-part ${activePart === s.id ? 'on' : ''}`}
              style={{ left: `${(r.start / total) * 100}%`, width: `${((r.end - r.start) / total) * 100}%`, ['--c' as string]: KINDS[s.kind].color }}
            >
              {s.name}
            </span>
          )
        }) : <span className="ss-empty">파트가 없어요</span>}
        <div className="ss-head" ref={head} aria-hidden>
          <i />
          <span ref={time} />
        </div>
      </div>
    </div>
  )
}
