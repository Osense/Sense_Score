import { useEffect, useRef } from 'react'
import { KINDS, rangesOf } from '../sections'
import { PPQ, type Note, type Song } from '../types'

/* ======================================================================
   드럼 녹음: 위에서 아래로 음표가 내려오는 리듬 게임식 레인 + 실제 드럼 세트 그림.
   레인 순서는 실제 드럼을 앞에서 본 왼쪽→오른쪽(드럼 게임과 같은 배치).
   키보드는 실제로 칠 때의 손발 자리: 왼손 F 스네어·R 크래시, 오른손 J 하이햇·O 라이드,
   가운데 G·H 탐, 오른쪽 L 플로어 탐, 발(엄지) 스페이스 킥.
   ====================================================================== */

export interface DrumLane {
  id: string
  label: string
  pitch: number
  /** 이 레인에 들어가는 다른 음높이(열린 하이햇 등) */
  also: number[]
  keys: { code: string; label: string; pitch?: number }[]
  color: string
  hand: '왼손' | '오른손' | '발'
}

export const DRUM_LANES: DrumLane[] = [
  { id: 'crash', label: '크래시', pitch: 49, also: [52, 55, 57], keys: [{ code: 'KeyR', label: 'R' }], color: '#e0a83a', hand: '왼손' },
  { id: 'hihat', label: '하이햇', pitch: 42, also: [44, 46], keys: [{ code: 'KeyJ', label: 'J' }, { code: 'KeyK', label: 'K', pitch: 46 }], color: '#38bcd8', hand: '오른손' },
  { id: 'snare', label: '스네어', pitch: 38, also: [37, 40], keys: [{ code: 'KeyF', label: 'F' }, { code: 'KeyD', label: 'D' }], color: '#e05c8a', hand: '왼손' },
  { id: 'kick', label: '킥', pitch: 36, also: [35], keys: [{ code: 'Space', label: 'Space' }, { code: 'KeyB', label: 'B' }], color: '#7c5cf0', hand: '발' },
  { id: 'tomH', label: '하이 탐', pitch: 50, also: [48], keys: [{ code: 'KeyG', label: 'G' }], color: '#f08c3a', hand: '왼손' },
  { id: 'tomM', label: '미드 탐', pitch: 47, also: [45], keys: [{ code: 'KeyH', label: 'H' }], color: '#d9703a', hand: '오른손' },
  { id: 'tomF', label: '플로어 탐', pitch: 43, also: [41], keys: [{ code: 'KeyL', label: 'L' }], color: '#b85a2b', hand: '오른손' },
  { id: 'ride', label: '라이드', pitch: 51, also: [53, 59], keys: [{ code: 'KeyO', label: 'O' }], color: '#2fa38a', hand: '오른손' },
]

export const laneOf = (pitch: number) => DRUM_LANES.findIndex((l) => l.pitch === pitch || l.also.includes(pitch))

const PAST = 1
const FUTURE = 2

/** 레인 위로 음표가 내려와 아래 판정선(지금)에 닿는다 */
export function DrumRoll({ song, trackId, getTick, getLive, flash }: { song: Song; trackId: string; getTick: () => number; getLive: () => Note[]; flash: Set<number> }) {
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ song, trackId, getTick, getLive })
  useEffect(() => { latest.current = { song, trackId, getTick, getLive } })

  useEffect(() => {
    let raf = 0
    const css = (name: string, fb: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb
    const draw = () => {
      const { song, trackId, getTick, getLive } = latest.current
      const canvas = cv.current
      const box = wrap.current
      if (canvas && box) {
        const dpr = window.devicePixelRatio || 1
        const W = box.clientWidth
        const H = box.clientHeight
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
          canvas.width = Math.round(W * dpr)
          canvas.height = Math.round(H * dpr)
        }
        const g = canvas.getContext('2d')!
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, W, H)
        const n = DRUM_LANES.length
        const lw = W / n
        const barTicks = song.beatsPerBar * PPQ
        const now = getTick()
        const lineY = (H * FUTURE) / (FUTURE + PAST)
        const pxPerTick = lineY / (FUTURE * barTicks)
        const yOf = (t: number) => lineY - (t - now) * pxPerTick

        g.fillStyle = css('--row-white', '#fff')
        g.fillRect(0, 0, W, H)
        DRUM_LANES.forEach((l, i) => {
          g.globalAlpha = i % 2 ? 0.05 : 0.09
          g.fillStyle = l.color
          g.fillRect(i * lw, 0, lw, H)
          g.globalAlpha = 1
        })
        g.strokeStyle = css('--beat-line', '#ddd')
        for (let i = 1; i < n; i++) {
          g.beginPath()
          g.moveTo(Math.round(i * lw) + 0.5, 0)
          g.lineTo(Math.round(i * lw) + 0.5, H)
          g.stroke()
        }
        // 박·마디 선
        const first = Math.floor((now - PAST * barTicks) / PPQ)
        const last = Math.ceil((now + FUTURE * barTicks) / PPQ)
        g.font = '600 11px system-ui, sans-serif'
        for (let b = first; b <= last; b++) {
          const y = yOf(b * PPQ)
          const isBar = ((b % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar === 0
          g.strokeStyle = isBar ? css('--bar-line', '#aaa') : css('--sub-line', 'rgba(0,0,0,.06)')
          g.lineWidth = isBar ? 1.5 : 1
          g.beginPath()
          g.moveTo(0, y)
          g.lineTo(W, y)
          g.stroke()
          if (isBar && b >= 0) {
            g.fillStyle = css('--muted', '#777')
            g.fillText(`${b / song.beatsPerBar + 1}마디`, 6, y - 4)
          }
        }
        // 지금 파트
        const rg = rangesOf(song)
        const cur = song.sections.find((s) => now >= rg.get(s.id)!.start && now < rg.get(s.id)!.end)
        if (cur) {
          g.fillStyle = KINDS[cur.kind].color
          g.fillRect(0, 0, W, 22)
          g.fillStyle = '#fff'
          g.font = '700 12px system-ui, sans-serif'
          g.fillText(cur.name, 8, 15)
        }
        const gem = (pitch: number, start: number, color: string, alpha: number) => {
          const i = laneOf(pitch)
          if (i < 0) return
          const y = yOf(start)
          if (y < -12 || y > H + 12) return
          g.globalAlpha = alpha
          g.fillStyle = color
          g.beginPath()
          g.roundRect(i * lw + 5, y - 7, lw - 10, 14, 7)
          g.fill()
          g.globalAlpha = 1
        }
        const mine = song.tracks.find((t) => t.id === trackId)
        for (const n of mine?.notes ?? []) gem(n.pitch, n.start, DRUM_LANES[laneOf(n.pitch)]?.color ?? '#888', 0.9)
        for (const n of getLive()) gem(n.pitch, n.start, '#ff4d4d', 1)
        // 판정선
        g.strokeStyle = css('--accent', '#7c5cf0')
        g.lineWidth = 3
        g.beginPath()
        g.moveTo(0, lineY)
        g.lineTo(W, lineY)
        g.stroke()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="drumroll">
      <div className="dr-heads" style={{ gridTemplateColumns: `repeat(${DRUM_LANES.length}, minmax(0, 1fr))` }}>
        {DRUM_LANES.map((l, i) => (
          <span key={l.id} className={flash.has(i) ? 'hit' : ''} style={{ ['--c' as string]: l.color }}>
            <b>{l.label}</b>
            <kbd>{l.keys[0].label}</kbd>
          </span>
        ))}
      </div>
      <div className="liveroll dr-canvas" ref={wrap}>
        <canvas ref={cv} />
      </div>
    </div>
  )
}

/**
 * 드럼 세트 그림 (드러머 자리에서 본 모습). 북·심벌을 누르면 소리가 나고 녹음된다.
 * 하이햇은 왼쪽에 있지만 오른손으로 엇갈려 친다는 것도 함께 보여 준다.
 */
export function DrumKitView({ onHit, flash }: { onHit: (lane: number, pitch?: number) => void; flash: Set<number> }) {
  const pad = (i: number, shape: React.ReactNode, lx: number, ly: number) => {
    const l = DRUM_LANES[i]
    return (
      <g
        key={l.id}
        className={`dk-pad ${flash.has(i) ? 'hit' : ''}`}
        style={{ ['--c' as string]: l.color }}
        onPointerDown={(e) => { e.preventDefault(); onHit(i) }}
        role="button"
        aria-label={`${l.label} (${l.keys.map((k) => k.label).join(', ')})`}
      >
        {shape}
        <text x={lx} y={ly} className="dk-name">{l.label}</text>
        <g transform={`translate(${lx} ${ly + 22})`}>
          <rect x={-(l.keys[0].label.length * 6.5 + 12)} y={-14} width={l.keys[0].label.length * 13 + 24} height={26} rx={7} className="dk-key" />
          <text x={0} y={5} className="dk-keytext">{l.keys[0].label}</text>
        </g>
      </g>
    )
  }
  return (
    <svg className="drumkit" viewBox="0 0 760 300" role="group" aria-label="드럼 세트">
      {/* 크래시 · 하이햇 · 스네어 · 킥 · 탐 · 플로어 · 라이드 */}
      {pad(0, <ellipse cx={130} cy={62} rx={92} ry={32} className="dk-cym" />, 130, 58)}
      {pad(1, <><line x1={92} y1={204} x2={92} y2={296} className="dk-stand" /><ellipse cx={92} cy={180} rx={74} ry={26} className="dk-cym" /></>, 92, 176)}
      {pad(2, <ellipse cx={228} cy={205} rx={70} ry={30} className="dk-drum" />, 228, 200)}
      {pad(3, <><circle cx={385} cy={222} r={74} className="dk-drum kick" /></>, 385, 222)}
      {pad(4, <ellipse cx={318} cy={80} rx={60} ry={30} className="dk-drum" />, 318, 76)}
      {pad(5, <ellipse cx={452} cy={80} rx={60} ry={30} className="dk-drum" />, 452, 76)}
      {pad(6, <ellipse cx={556} cy={205} rx={80} ry={36} className="dk-drum" />, 556, 200)}
      {pad(7, <ellipse cx={650} cy={72} rx={98} ry={34} className="dk-cym" />, 650, 68)}
      <text x={92} y={146} className="dk-hand">오른손을 엇갈려 쳐요</text>
      <text x={228} y={256} className="dk-hand">왼손으로 쳐요</text>
      <text x={385} y={286} className="dk-hand">발로 밟아요</text>
    </svg>
  )
}
