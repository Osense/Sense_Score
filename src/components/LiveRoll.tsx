import { useEffect, useRef } from 'react'
import { inScale } from '../music'
import { KINDS, rangesOf } from '../sections'
import { PPQ, type KeyHighlights, type Note, type ScaleType, type Song } from '../types'
import { layoutKeys } from './HKeyboard'

interface Props {
  song: Song
  trackId: string
  base: number
  whiteCount: number
  root: number
  scale: ScaleType | 'none'
  display: KeyHighlights
  getTick: () => number
  /** 지금 녹음 중인 음표(누르고 있는 것 포함) */
  getLive: () => Note[]
}

const PAST = 1 // 지나간 쪽으로 보여 줄 마디 수
const FUTURE = 2 // 다가올 쪽 마디 수

/**
 * 떨어지는 음표 화면: 가로 건반과 같은 x 위치에 음표가 있고, 시간은 위에서 아래로 흘러 건반 쪽으로 내려온다.
 * 이미 쓴 멜로디(안내), 다른 트랙(흐리게), 지금 녹음 중인 음표(빨강)를 보여 준다.
 */
export function LiveRoll(p: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const latest = useRef(p)
  useEffect(() => {
    latest.current = p
  })

  useEffect(() => {
    let raf = 0
    const css = (name: string, fb: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb
    const draw = () => {
      const { song, trackId, base, whiteCount, root, scale, display, getTick, getLive } = latest.current
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

        const barTicks = song.beatsPerBar * PPQ
        const now = getTick()
        const lineY = (H * FUTURE) / (FUTURE + PAST) // 지금 이 줄이 건반에 닿는 자리
        const pxPerTick = lineY / (FUTURE * barTicks)
        const yOf = (t: number) => lineY - (t - now) * pxPerTick
        const { whites, blacks } = layoutKeys(base, whiteCount)
        const keyX = new Map<number, { x: number; w: number; black: boolean }>()
        for (const k of [...whites, ...blacks]) keyX.set(k.pitch, { x: k.x * W, w: k.w * W, black: k.black })

        // 바탕과 건반 줄
        g.fillStyle = css('--row-white', '#fbfbfd')
        g.fillRect(0, 0, W, H)
        g.fillStyle = css('--row-black', '#eceef5')
        for (const k of blacks) g.fillRect(k.x * W, 0, k.w * W, H)
        // Match the keyboard's optional, muted guides; leave other lanes neutral.
        if (scale !== 'none') {
          for (const k of [...whites, ...blacks]) {
            const inSc = inScale(k.pitch, root, scale)
            const isRoot = (((k.pitch - root) % 12) + 12) % 12 === 0
            if (display.showKeyRoot && isRoot) g.fillStyle = css('--key-root-row', 'rgba(150,131,102,0.12)')
            else if (display.showKeyScale && inSc) g.fillStyle = css('--key-scale-row', 'rgba(111,132,153,0.07)')
            else continue
            g.fillRect(k.x * W, 0, k.w * W, H)
          }
        }
        g.strokeStyle = css('--beat-line', '#d3d7e2')
        g.lineWidth = 1
        for (const k of whites) {
          g.beginPath()
          g.moveTo(Math.round(k.x * W) + 0.5, 0)
          g.lineTo(Math.round(k.x * W) + 0.5, H)
          g.stroke()
        }
        // 마디/박 선
        const first = Math.floor((now - PAST * barTicks) / PPQ)
        const last = Math.ceil((now + FUTURE * barTicks) / PPQ)
        g.font = '11px system-ui, sans-serif'
        for (let b = first; b <= last; b++) {
          const t = b * PPQ
          const y = yOf(t)
          const isBar = ((b % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar === 0
          g.strokeStyle = isBar ? css('--bar-line', '#aab0c0') : css('--sub-line', 'rgba(0,0,0,0.06)')
          g.beginPath()
          g.moveTo(0, y)
          g.lineTo(W, y)
          g.stroke()
          if (isBar && t >= 0) {
            g.fillStyle = css('--muted', '#6b7280')
            g.fillText(`${t / barTicks + 1}마디`, 6, y - 3)
          }
        }

        // 지금 있는 파트 이름
        const rg = rangesOf(song)
        const cur = song.sections.find((s) => now >= rg.get(s.id)!.start && now < rg.get(s.id)!.end)
        if (cur) {
          g.fillStyle = KINDS[cur.kind].color
          g.fillRect(0, 0, W, 22)
          g.fillStyle = '#fff'
          g.font = '600 12px system-ui, sans-serif'
          g.fillText(`${cur.name}`, 8, 15)
        }

        // 음표 그리기
        const drawNote = (n: Note, color: string, alpha: number) => {
          const k = keyX.get(n.pitch)
          if (!k) return
          const y1 = yOf(n.start)
          const y0 = yOf(n.start + n.dur)
          if (y1 < 0 || y0 > H) return
          g.globalAlpha = alpha
          g.fillStyle = color
          const w = k.black ? k.w : k.w - 2
          const x = k.black ? k.x : k.x + 1
          const h = Math.max(4, y1 - y0)
          g.beginPath()
          g.roundRect(x, y0, w, h, 4)
          g.fill()
          g.globalAlpha = 1
        }
        for (const t of song.tracks) {
          if (t.drum || t.id === trackId) continue
          for (const n of t.notes) drawNote(n, t.color, 0.22)
        }
        const mine = song.tracks.find((t) => t.id === trackId)
        for (const n of mine?.notes ?? []) drawNote(n, mine!.color, 0.9)
        for (const n of getLive()) drawNote(n, '#ef4444', 0.95)

        // 지금 줄
        g.strokeStyle = '#ef4444'
        g.lineWidth = 2
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
    <div className="liveroll" ref={wrap}>
      <canvas ref={cv} />
    </div>
  )
}
