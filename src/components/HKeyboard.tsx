import { useRef } from 'react'
import { inScale, isBlack, NOTE_NAMES_KO } from '../music'
import type { KeyHighlights, ScaleType } from '../types'

/** 흰 건반 pc 뒤에 검은 건반이 있는지 (도, 레, 파, 솔, 라 뒤) */
const BLACK_AFTER = new Set([0, 2, 5, 7, 9])
const BLACK_W = 0.6 // 흰 건반 폭에 대한 검은 건반 폭

export interface KeyBox { pitch: number; x: number; w: number; black: boolean }

/** 가로 건반의 배치: 보이는 건반 각각의 x(0~1)와 폭. 떨어지는 음표 화면도 같은 배치를 써서 건반과 정확히 맞춘다. */
export function layoutKeys(base: number, whiteCount: number): { whites: KeyBox[]; blacks: KeyBox[] } {
  const whites: KeyBox[] = []
  let p = base
  while (whites.length < whiteCount && p <= 127) {
    if (!isBlack(p)) whites.push({ pitch: p, x: whites.length / whiteCount, w: 1 / whiteCount, black: false })
    p++
  }
  const n = whites.length || 1
  const unit = 1 / n
  const blacks: KeyBox[] = []
  whites.forEach((k, i) => {
    if (i < whites.length - 1 && BLACK_AFTER.has(k.pitch % 12))
      blacks.push({ pitch: k.pitch + 1, x: (i + 1) * unit - (unit * BLACK_W) / 2, w: unit * BLACK_W, black: true })
  })
  return { whites, blacks }
}

interface Props {
  base: number
  whiteCount: number
  low: number
  high: number
  root: number
  scale: ScaleType | 'none'
  display: KeyHighlights
  /** 음계 안의 건반만 누를 수 있게 */
  lock: boolean
  down: Set<number>
  /** 지금 울리는 반주 화음의 음이름(0~11). 멜로디가 노리면 잘 어울리는 음 */
  chordPcs: Set<number>
  /** 컴퓨터 키보드 글자 표시 (pitch → 글자) */
  letters: Map<number, string>
  onDown: (pitch: number, vel: number) => void
  onUp: (pitch: number) => void
}

/** 가로로 놓인 피아노 건반. 손가락 여러 개·마우스로 누를 수 있고, 누른 높이(세로 위치)로 세기가 정해진다. */
export function HKeyboard(p: Props) {
  const held = useRef(new Map<number, number>()) // pointerId → 누르고 있는 음
  const { whites, blacks } = layoutKeys(p.base, p.whiteCount)

  const playable = (pitch: number) => pitch >= p.low && pitch <= p.high && (!p.lock || p.scale === 'none' || inScale(pitch, p.root, p.scale))

  const press = (e: React.PointerEvent, pitch: number) => {
    if (!playable(pitch) || held.current.has(e.pointerId)) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    const vel = Math.round(46 + Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 81)
    held.current.set(e.pointerId, pitch)
    p.onDown(pitch, vel)
  }
  const release = (e: React.PointerEvent) => {
    const pitch = held.current.get(e.pointerId)
    if (pitch === undefined) return
    held.current.delete(e.pointerId)
    p.onUp(pitch)
  }

  const props = (k: KeyBox) => {
    const inSc = p.scale !== 'none' && inScale(k.pitch, p.root, p.scale)
    const cls = [
      k.black ? 'hk-black' : 'hk-white',
      p.down.has(k.pitch) ? 'down' : '',
      p.display.showKeyScale && inSc ? 'in-scale' : '',
      p.display.showKeyRoot && p.scale !== 'none' && ((k.pitch - p.root) % 12 + 12) % 12 === 0 ? 'root' : '',
      p.display.showKeyChord && p.chordPcs.has(k.pitch % 12) ? 'chord' : '',
      playable(k.pitch) ? '' : 'off',
    ].join(' ')
    return {
      className: cls,
      style: { left: `${k.x * 100}%`, width: `${k.w * 100}%` },
      onPointerDown: (e: React.PointerEvent) => press(e, k.pitch),
      // 마우스로 누른 채 옆 건반으로 쓸어 넘기기(글리산도)
      onPointerEnter: (e: React.PointerEvent) => e.pointerType === 'mouse' && e.buttons === 1 && press(e, k.pitch),
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: (e: React.PointerEvent) => e.pointerType === 'mouse' && release(e),
      'data-pitch': k.pitch,
    }
  }

  return (
    <div className="hkeyboard" role="group" aria-label="건반">
      {whites.map((k) => (
        <div key={k.pitch} {...props(k)}>
          {p.letters.has(k.pitch) && <kbd>{p.letters.get(k.pitch)}</kbd>}
          <span className="hk-name">
            {k.pitch % 12 === 0 ? `${NOTE_NAMES_KO[0]}${Math.floor(k.pitch / 12) - 1}` : NOTE_NAMES_KO[k.pitch % 12]}
          </span>
        </div>
      ))}
      {blacks.map((k) => (
        <div key={k.pitch} {...props(k)}>
          {p.letters.has(k.pitch) && <kbd>{p.letters.get(k.pitch)}</kbd>}
        </div>
      ))}
    </div>
  )
}
