import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PPQ, uid, type Note, type Settings, type Song, type Tool, type Track } from '../types'
import { DRUM_PARTS, drumPartFor, inScale, isBlack, NOTE_NAMES_KO, pitchLabel } from '../music'
import { Ruler } from './Ruler'
import { ContextMenu } from './ContextMenu'
import { copyToClip, hasClip, menuGroups, planPaste, trackOp, type ActionId } from '../editActions'
import { useLongPress } from '../useLongPress'
import { rangeOf } from '../instruments'
import { useChordPcs } from '../useChordPcs'

const RULER_H = 36
const EDGE = 8
const EDGE_TOUCH = 18 // 손가락/펜은 끝 손잡이를 더 넓게

interface Props {
  song: Song
  track: Track
  settings: Settings
  zoom: number
  follow: boolean
  playing: boolean
  tool: Tool
  getTick: () => number
  onNotes: (fn: (notes: Note[]) => Note[], record: boolean) => void
  onCheckpoint: () => void
  onUndo: () => void
  onPreview: (pitch: number) => void
  onSeek: (tick: number) => void
  onLoop: (start: number, end: number) => void
}

type Drag =
  | { kind: 'move' | 'resize'; x: number; y: number; origin: Map<string, Note>; anchor: string; moved: boolean; pitch: number; tap?: string }
  | { kind: 'erase'; lx: number; ly: number; erased: boolean }
  | { kind: 'pan'; x: number; y: number; sl: number; st: number }
  | { kind: 'box'; x0: number; y0: number }

/** 건반 편집 화면. 드럼 트랙이면 건반 대신 드럼 파트가 세로축이 된다. */
export function PianoRoll(p: Props) {
  const { song, track, settings, zoom, tool } = p
  const drum = track.drum
  const chordPcs = useChordPcs(song, p.getTick, !drum && settings.showKeyChord)
  const rowH = drum ? 34 : 16
  const keyW = drum ? 104 : 64
  const ppb = 56 * zoom
  const pxPerTick = ppb / PPQ
  const gridW = song.bars * song.beatsPerBar * ppb

  // 악기가 낼 수 있는 음역만 건반으로 보여 준다. (음역 밖에 이미 있는 음표가 있으면 흐리게 함께 보여 준다)
  const inst = rangeOf(track.program)
  const { top, bottom } = useMemo(() => {
    let hi = inst.high
    let lo = inst.low
    for (const n of track.notes) {
      hi = Math.max(hi, n.pitch)
      lo = Math.min(lo, n.pitch)
    }
    return { top: hi, bottom: lo }
  }, [inst.high, inst.low, track.notes])
  const playable = (pitch: number) => drum || (pitch >= inst.low && pitch <= inst.high)

  // 세로 레인: 위(높은 소리) → 아래(낮은 소리)
  const lanes = useMemo<number[]>(
    () => (drum ? DRUM_PARTS.map((d) => d.pitch) : Array.from({ length: top - bottom + 1 }, (_, i) => top - i)),
    [drum, top, bottom],
  )
  const laneOf = useCallback(
    (pitch: number) => (drum ? DRUM_PARTS.indexOf(drumPartFor(pitch)) : top - pitch),
    [drum, top],
  )
  /** 이동할 때 음역 안의 줄로만 가도록 */
  const clampLane = (i: number) =>
    drum ? Math.min(lanes.length - 1, Math.max(0, i)) : Math.min(top - inst.low, Math.max(top - inst.high, i))
  const gridH = lanes.length * rowH

  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const lp = useLongPress()
  const fresh = useRef<string | null>(null) // 방금 연필로 찍은 음표 (길게 누르기였다면 되돌린다)
  const [menu, setMenu] = useState<{ x: number; y: number; tick: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [flash, setFlash] = useState<number | null>(null)
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  const latest = useRef(p)
  useEffect(() => {
    latest.current = p
  })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (drum) {
      el.scrollTop = 0
      return
    }
    const ns = track.notes
    const mid = ns.length ? Math.round(ns.reduce((s, n) => s + n.pitch, 0) / ns.length) : Math.round((inst.low + inst.high) / 2)
    el.scrollTop = (top - mid) * rowH - el.clientHeight / 2 + RULER_H
  }, [track.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 재생헤드 + 따라가기
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const { getTick, follow, playing } = latest.current
      const x = getTick() * pxPerTick
      const scroller = scrollRef.current
      if (headRef.current) {
        headRef.current.style.transform = `translateX(${x}px)`
        if (playing && follow && scroller) {
          const left = scroller.scrollLeft
          if (x < left || x > left + scroller.clientWidth - keyW - 40) scroller.scrollLeft = Math.max(0, x - 40)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [pxPerTick, keyW])

  // 드럼 키보드(Q W E…)를 눌렀을 때 파트가 반짝이도록
  useEffect(() => {
    const onHit = (e: Event) => {
      const pitch = (e as CustomEvent<number>).detail
      setFlash(pitch)
      setTimeout(() => setFlash((f) => (f === pitch ? null : f)), 140)
    }
    window.addEventListener('drum-hit', onHit)
    return () => window.removeEventListener('drum-hit', onHit)
  }, [])

  // 파트를 고르면 그 위치로 화면을 옮긴다
  useEffect(() => {
    const onFocus = (e: Event) => {
      const tick = (e as CustomEvent<number>).detail
      if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, tick * pxPerTick - 20)
    }
    window.addEventListener('focus-tick', onFocus)
    return () => window.removeEventListener('focus-tick', onFocus)
  }, [pxPerTick])

  const toPos = (e: { clientX: number; clientY: number }) => {
    const r = gridRef.current!.getBoundingClientRect()
    const lane = Math.min(lanes.length - 1, Math.max(0, Math.floor((e.clientY - r.top) / rowH)))
    return { tick: (e.clientX - r.left) / pxPerTick, pitch: lanes[lane] }
  }
  const local = (e: { clientX: number; clientY: number }) => {
    const r = gridRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const snapTick = (t: number) => Math.max(0, Math.floor(t / settings.snap) * settings.snap)
  const noteRect = (n: Note) => {
    const left = n.start * pxPerTick
    return { left, right: left + Math.max(6, n.dur * pxPerTick), top: laneOf(n.pitch) * rowH, bottom: (laneOf(n.pitch) + 1) * rowH }
  }

  /** 이전 위치에서 지금 위치까지 지나간 음표를 지운다 (빨리 긋는 경우도 빠짐없이) */
  const eraseTo = (d: Extract<Drag, { kind: 'erase' }>, x: number, y: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x - d.lx, y - d.ly) / 4))
    const ids = new Set<string>()
    for (let i = 0; i <= steps; i++) {
      const px = d.lx + ((x - d.lx) * i) / steps
      const py = d.ly + ((y - d.ly) * i) / steps
      for (const n of latest.current.track.notes) {
        const r = noteRect(n)
        if (px >= r.left && px <= r.right && py >= r.top && py < r.bottom) ids.add(n.id)
      }
    }
    d.lx = x
    d.ly = y
    if (!ids.size) return
    if (!d.erased) { p.onCheckpoint(); d.erased = true }
    p.onNotes((ns) => ns.filter((n) => !ids.has(n.id)), false)
    setSelected((s) => new Set([...s].filter((id) => !ids.has(id))))
  }

  const startErase = (e: React.PointerEvent) => {
    const { x, y } = local(e)
    const d: Drag = { kind: 'erase', lx: x, ly: y, erased: false }
    dragRef.current = d
    eraseTo(d, x, y)
    gridRef.current!.setPointerCapture(e.pointerId)
  }

  /* ---------- 격자 ---------- */
  const onGridDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    scrollRef.current?.focus()
    if (tool === 'eraser') return startErase(e)
    lp.start(e, () => fireMenu(e.clientX, e.clientY))
    if (tool === 'hand') {
      const el = scrollRef.current!
      dragRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
      return gridRef.current!.setPointerCapture(e.pointerId)
    }
    if (tool === 'select') {
      const { x, y } = local(e)
      dragRef.current = { kind: 'box', x0: x, y0: y }
      setBox({ x0: x, y0: y, x1: x, y1: y })
      setSelected(new Set())
      return gridRef.current!.setPointerCapture(e.pointerId)
    }
    // 연필: 음표 찍기 (끌면 길이 조절)
    const pos = toPos(e)
    if (!playable(pos.pitch)) return // 이 악기가 낼 수 없는 음
    const id = uid()
    const note: Note = { id, pitch: pos.pitch, start: snapTick(pos.tick), dur: settings.snap, vel: 90 }
    p.onCheckpoint()
    p.onNotes((ns) => [...ns, note], false)
    p.onPreview(note.pitch)
    setSelected(new Set([id]))
    fresh.current = id
    dragRef.current = { kind: 'resize', x: e.clientX, y: e.clientY, origin: new Map([[id, note]]), anchor: id, moved: true, pitch: note.pitch }
    gridRef.current!.setPointerCapture(e.pointerId)
  }

  const onNoteDown = (e: React.PointerEvent, n: Note) => {
    if (e.button !== 0) return
    e.stopPropagation()
    scrollRef.current?.focus()
    if (tool === 'eraser') return startErase(e)
    lp.start(e, () => fireMenu(e.clientX, e.clientY, n.id))
    if (tool === 'select') {
      if (!selected.has(n.id)) {
        setSelected((s) => new Set(s).add(n.id))
        return
      }
      // 이미 선택된 음표를 끌면 선택한 음표 전체가 함께 움직인다 (위아래로 끌면 전조)
      const origin = new Map<string, Note>()
      for (const x of track.notes) if (selected.has(x.id)) origin.set(x.id, x)
      dragRef.current = { kind: 'move', x: e.clientX, y: e.clientY, origin, anchor: n.id, moved: false, pitch: n.pitch, tap: n.id }
      p.onPreview(n.pitch)
      return gridRef.current!.setPointerCapture(e.pointerId)
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const edge = e.pointerType === 'mouse' ? EDGE : EDGE_TOUCH
    const onEdge = e.clientX > rect.right - edge
    let sel = selected
    if (tool === 'pen') sel = new Set([n.id])
    else if (e.shiftKey) {
      sel = new Set(selected)
      if (!sel.delete(n.id)) sel.add(n.id)
    } else if (!selected.has(n.id)) {
      sel = new Set([n.id])
    }
    setSelected(sel)
    if (!sel.has(n.id)) return
    const origin = new Map<string, Note>()
    for (const x of track.notes) if (sel.has(x.id)) origin.set(x.id, x)
    // 연필: 음표 어디를 끌어도 길이 조절 / 손바닥: 몸통은 이동, 오른쪽 끝은 길이 조절
    const kind = tool === 'pen' || onEdge ? 'resize' : 'move'
    dragRef.current = { kind, x: e.clientX, y: e.clientY, origin, anchor: n.id, moved: false, pitch: n.pitch }
    p.onPreview(n.pitch)
    gridRef.current!.setPointerCapture(e.pointerId)
  }

  const onGridMove = (e: React.PointerEvent) => {
    lp.moved(e)
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'pan') {
      const el = scrollRef.current!
      el.scrollLeft = d.sl - (e.clientX - d.x)
      el.scrollTop = d.st - (e.clientY - d.y)
      return
    }
    if (d.kind === 'erase') {
      const { x, y } = local(e)
      return eraseTo(d, x, y)
    }
    if (d.kind === 'box') {
      const { x, y } = local(e)
      return setBox({ x0: d.x0, y0: d.y0, x1: x, y1: y })
    }
    const { snap } = latest.current.settings
    const dTick = Math.round((e.clientX - d.x) / pxPerTick / snap) * snap
    if (d.kind === 'resize') {
      const base = d.origin.get(d.anchor)!
      const delta = Math.max(snap - base.dur, dTick)
      if (!d.moved && delta === 0) return
      if (!d.moved) { p.onCheckpoint(); d.moved = true }
      p.onNotes((ns) => ns.map((n) => {
        const o = d.origin.get(n.id)
        return o ? { ...n, dur: Math.max(snap, o.dur + delta) } : n
      }), false)
      return
    }
    const dRow = Math.round((e.clientY - d.y) / rowH)
    let minStart = Infinity, minL = Infinity, maxL = -Infinity
    for (const o of d.origin.values()) {
      minStart = Math.min(minStart, o.start)
      minL = Math.min(minL, laneOf(o.pitch))
      maxL = Math.max(maxL, laneOf(o.pitch))
    }
    const tk = Math.max(-minStart, dTick)
    const dl = Math.min(lanes.length - 1 - maxL, Math.max(-minL, dRow))
    if (!d.moved && tk === 0 && dl === 0) return
    if (!d.moved) { p.onCheckpoint(); d.moved = true }
    p.onNotes((ns) => ns.map((n) => {
      const o = d.origin.get(n.id)
      return o ? { ...n, start: o.start + tk, pitch: lanes[clampLane(laneOf(o.pitch) + dl)] } : n
    }), false)
    const anchorPitch = lanes[clampLane(laneOf(d.origin.get(d.anchor)!.pitch) + dl)]
    if (anchorPitch !== d.pitch) {
      d.pitch = anchorPitch
      p.onPreview(anchorPitch)
    }
  }

  const onGridUp = () => {
    lp.cancel()
    fresh.current = null
    const d = dragRef.current
    dragRef.current = null
    // 선택된 음표를 움직임 없이 톡 누르면 선택 해제
    if ((d?.kind === 'move' || d?.kind === 'resize') && d.tap && !d.moved) {
      const id = d.tap
      setSelected((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
    if (d?.kind === 'box' && box) {
      const [xa, xb] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)]
      const [ya, yb] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)]
      setSelected(new Set(track.notes.filter((n) => {
        const r = noteRect(n)
        return r.right >= xa && r.left <= xb && r.bottom >= ya && r.top <= yb
      }).map((n) => n.id)))
    }
    setBox(null)
  }

  const del = (ids: Set<string>) => {
    if (ids.size === 0) return
    p.onCheckpoint()
    p.onNotes((ns) => ns.filter((n) => !ids.has(n.id)), false)
    setSelected(new Set())
  }

  /** 전조: 선택한 음표(없으면 이 트랙 전체)를 반음 단위로 올리거나 내린다 */
  const transpose = (semi: number) => {
    if (drum) return
    const target = selected.size ? track.notes.filter((n) => selected.has(n.id)) : track.notes
    if (!target.length) return
    const lo = Math.min(...target.map((n) => n.pitch))
    const hi = Math.max(...target.map((n) => n.pitch))
    const d = Math.max(inst.low - lo, Math.min(inst.high - hi, semi))
    if (d === 0) return
    const ids = new Set(target.map((n) => n.id))
    p.onCheckpoint()
    p.onNotes((ns) => ns.map((n) => (ids.has(n.id) ? { ...n, pitch: n.pitch + d } : n)), false)
    p.onPreview(target[0].pitch + d)
  }

  /* ---------- 우클릭 / 길게 누르기 메뉴와 편집 동작 ---------- */
  const tickAtClient = (cx: number) => snapTick((cx - gridRef.current!.getBoundingClientRect().left) / pxPerTick)
  const fireMenu = (cx: number, cy: number, id?: string) => {
    if (fresh.current) {
      p.onUndo() // 길게 누르려던 것이었으니 방금 찍힌 음표는 없던 일로
      fresh.current = null
      setSelected(new Set())
    }
    dragRef.current = null
    setBox(null)
    if (id) setSelected((s) => (s.has(id) ? s : new Set([id])))
    setMenu({ x: cx, y: cy, tick: tickAtClient(cx) })
  }

  const pasteAt = (tick: number) => {
    const items = planPaste(tick, [{ id: track.id, drum }], track.id)
    if (!items.length) return
    p.onCheckpoint()
    p.onNotes((ns) => [...ns, ...items.map((i) => i.note)], false)
    setSelected(new Set(items.map((i) => i.note.id)))
    p.onPreview(items[0].note.pitch)
  }

  const runAction = (id: ActionId) => {
    const mine = track.notes.filter((n) => selected.has(n.id))
    switch (id) {
      case 'copy':
      case 'cut':
        copyToClip(mine.map((note) => ({ note, trackId: track.id, drum })))
        if (id === 'cut') del(selected)
        return
      case 'paste': return pasteAt(menu ? menu.tick : snapTick(p.getTick()))
      case 'dup': return duplicate()
      case 'del': return del(selected)
      case 'selSame': {
        const pitches = new Set(mine.map((n) => n.pitch))
        return setSelected(new Set(track.notes.filter((n) => pitches.has(n.pitch)).map((n) => n.id)))
      }
      case 'selTrack':
      case 'selAll': return setSelected(new Set(track.notes.map((n) => n.id)))
      case 'selNone': return setSelected(new Set())
      default:
        p.onCheckpoint()
        p.onNotes((ns) => trackOp(id, ns, selected, { snap: settings.snap, root: settings.scaleRoot, scale: settings.scaleType, low: inst.low, high: inst.high, drum }), false)
    }
  }

  /** 선택한 음표를 바로 뒤에 복제 */
  const duplicate = () => {
    const src = track.notes.filter((n) => selected.has(n.id))
    if (!src.length) return
    const start = Math.min(...src.map((n) => n.start))
    const end = Math.max(...src.map((n) => n.start + n.dur))
    const span = Math.ceil((end - start) / settings.snap) * settings.snap
    const copies = src.map((n) => ({ ...n, id: uid(), start: n.start + span }))
    p.onCheckpoint()
    p.onNotes((ns) => [...ns, ...copies], false)
    setSelected(new Set(copies.map((n) => n.id)))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      del(selected)
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSelected(new Set(track.notes.map((n) => n.id)))
    } else if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'v', 'd'].includes(e.key.toLowerCase())) {
      e.preventDefault()
      runAction(({ c: 'copy', x: 'cut', v: 'paste', d: 'dup' } as const)[e.key.toLowerCase() as 'c' | 'x' | 'v' | 'd'])
    } else if (e.key.startsWith('Arrow') && selected.size) {
      e.preventDefault()
      const up = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0
      const dt = e.key === 'ArrowRight' ? settings.snap : e.key === 'ArrowLeft' ? -settings.snap : 0
      p.onCheckpoint()
      p.onNotes((ns) => ns.map((n) => {
        if (!selected.has(n.id)) return n
        const pitch = drum
          ? lanes[Math.min(lanes.length - 1, Math.max(0, laneOf(n.pitch) - up))]
          : Math.min(inst.high, Math.max(inst.low, n.pitch + up * (e.shiftKey ? 12 : 1)))
        return { ...n, pitch, start: Math.max(0, n.start + dt) }
      }), false)
    } else if (e.key === 'Escape') {
      setSelected(new Set())
    }
  }

  /* ---------- 배경/건반 ---------- */
  const sc = settings.scaleType
  const rowEls = useMemo(
    () =>
      lanes.map((pitch, i) => {
        let cls = 'row'
        let style: React.CSSProperties = { top: i * rowH, height: rowH }
        if (drum) {
          style = { ...style, background: i % 2 ? 'var(--row-black)' : 'transparent' }
          cls += ' drum'
        } else {
          if (isBlack(pitch)) cls += ' black'
          if (!playable(pitch)) cls += ' off-range'
          if (settings.showKeyScale && sc !== 'none' && inScale(pitch, settings.scaleRoot, sc)) cls += ' in-scale'
          if (settings.showKeyRoot && sc !== 'none' && (pitch - settings.scaleRoot) % 12 === 0) cls += ' root'
          if (settings.showKeyChord && chordPcs.has(pitch % 12)) cls += ' chord'
        }
        return <div key={pitch} className={cls} style={style} />
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lanes, rowH, drum, sc, settings.scaleRoot, settings.showKeyScale, settings.showKeyRoot, settings.showKeyChord, chordPcs, inst.low, inst.high],
  )

  const bgStyle: React.CSSProperties = {
    width: gridW,
    height: gridH,
    backgroundImage: [
      `repeating-linear-gradient(to right, var(--bar-line) 0 1px, transparent 1px ${ppb * song.beatsPerBar}px)`,
      `repeating-linear-gradient(to right, var(--beat-line) 0 1px, transparent 1px ${ppb}px)`,
      `repeating-linear-gradient(to right, var(--sub-line) 0 1px, transparent 1px ${settings.snap * pxPerTick || ppb}px)`,
    ].join(','),
  }

  const keys = lanes.map((pitch) => {
    if (drum) {
      const part = drumPartFor(pitch)
      return (
        <div
          key={pitch}
          className={`pad ${flash === pitch ? 'hit' : ''}`}
          style={{ height: rowH, ['--pad' as string]: part.color }}
          onPointerDown={() => { p.onPreview(pitch); setFlash(pitch); setTimeout(() => setFlash(null), 140) }}
          title={`${part.label} (키보드 ${part.key})`}
        >
          <b>{part.label}</b>
          <kbd>{part.key}</kbd>
        </div>
      )
    }
    const inSc = sc !== 'none' && inScale(pitch, settings.scaleRoot, sc)
    return (
      <div
        key={pitch}
        className={`key ${isBlack(pitch) ? 'black' : 'white'} ${settings.showKeyScale && inSc ? 'in-scale' : ''} ${settings.showKeyRoot && sc !== 'none' && (pitch - settings.scaleRoot) % 12 === 0 ? 'root' : ''} ${settings.showKeyChord && chordPcs.has(pitch % 12) ? 'chord' : ''} ${playable(pitch) ? '' : 'off'}`}
        style={{ height: rowH }}
        onPointerDown={() => playable(pitch) && p.onPreview(pitch)}
        title={pitchLabel(pitch)}
      >
        {(pitch % 12 === 0 || (inSc && pitch % 12 === settings.scaleRoot)) && <span>{pitchLabel(pitch)}</span>}
      </div>
    )
  })

  const noteStyle = (n: Note, c: string, ghost: boolean): React.CSSProperties => {
    const i = laneOf(n.pitch)
    const part = drum ? drumPartFor(n.pitch) : null
    return {
      left: n.start * pxPerTick,
      top: i * rowH + (ghost ? 2 : 1) + (drum ? 3 : 0),
      width: Math.max(ghost ? 3 : 4, n.dur * pxPerTick - 1),
      height: rowH - (ghost ? 4 : 2) - (drum ? 6 : 0),
      background: part && !ghost ? part.color : c,
    }
  }

  const ghost = drum ? [] : song.tracks.filter((t) => t.id !== track.id && !t.drum)
  const selNotes = track.notes.filter((n) => selected.has(n.id))
  const loopOn = settings.loop && settings.loopEnd > settings.loopStart

  return (
    <div className={`roll-wrap tool-${tool}`}>
      <div className="roll" ref={scrollRef} tabIndex={0} onKeyDown={onKeyDown}>
        <Ruler song={song} settings={settings} pxPerTick={pxPerTick} keyW={keyW} height={RULER_H} onSeek={p.onSeek} onLoop={p.onLoop} />
        <div className="roll-body">
          <div className="keys" style={{ width: keyW }}>{keys}</div>
          <div
            className="grid"
            ref={gridRef}
            style={bgStyle}
            onPointerDown={onGridDown}
            onPointerMove={onGridMove}
            onPointerUp={onGridUp}
            onPointerCancel={onGridUp}
            onContextMenu={(e) => { e.preventDefault(); fireMenu(e.clientX, e.clientY) }}
          >
            {rowEls}
            {loopOn && (
              <div className="loop-shade" style={{ left: settings.loopStart * pxPerTick, width: (settings.loopEnd - settings.loopStart) * pxPerTick }} />
            )}
            {ghost.map((t) =>
              t.notes.filter((n) => laneOf(n.pitch) >= 0 && laneOf(n.pitch) < lanes.length).map((n) => <div key={n.id} className="note ghost" style={noteStyle(n, t.color, true)} />),
            )}
            {track.notes.map((n) => {
              const part = drum ? drumPartFor(n.pitch) : null
              return (
                <div
                  key={n.id}
                  className={`note ${drum ? 'drumnote' : ''} ${selected.has(n.id) ? 'sel' : ''}`}
                  style={{ ...noteStyle(n, track.color, false), opacity: 0.5 + (n.vel / 127) * 0.5 }}
                  onPointerDown={(e) => onNoteDown(e, n)}
                  onDoubleClick={() => del(new Set([n.id]))}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); fireMenu(e.clientX, e.clientY, n.id) }}
                >
                  {part?.head === 'x' && <span className="sym">✕</span>}
                  <i className="handle" />
                </div>
              )
            })}
            {box && (
              <div
                className="marquee-box"
                style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
              />
            )}
            <div className="playhead" ref={headRef} style={{ height: gridH }} />
          </div>
        </div>
      </div>
      <div className="roll-status">
        {selNotes.length === 0 ? (
          <span className="hint">
            {HINT[tool]}
            {HINT_MENU}
            {drum && ' · 키보드 Q W E R T A S D F로 파트 소리 듣기'}
          </span>
        ) : (
          <>
            <b>{selNotes.length}개 선택</b>
            {selNotes.length === 1 && (
              <span>{drum ? drumPartFor(selNotes[0].pitch).label : `${pitchLabel(selNotes[0].pitch)} (${NOTE_NAMES_KO[selNotes[0].pitch % 12]})`}</span>
            )}
            <label>
              세기
              <input
                type="range" min={1} max={127} value={selNotes[0].vel}
                onPointerDown={() => p.onCheckpoint()}
                onChange={(e) => {
                  const v = +e.target.value
                  p.onNotes((ns) => ns.map((n) => (selected.has(n.id) ? { ...n, vel: v } : n)), false)
                }}
              />
            </label>
            <button onClick={duplicate}>⧉ 복제</button>
            <button onClick={() => del(selected)}>🗑 지우기</button>
          </>
        )}
        <button onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, tick: snapTick(p.getTick()) })} title="복사·붙여넣기·길이·음높이 등 편집 메뉴 (음표를 우클릭하거나 꾹 눌러도 열려요)">⋯ 편집 메뉴</button>
        {!drum && (
          <span className="transpose">
            <span className="lbl">전조 <small>({selNotes.length ? '선택한 음' : '이 트랙 전체'})</small></span>
            <button onClick={() => transpose(-12)} title="한 옥타브 내리기">⏬ 8도</button>
            <button onClick={() => transpose(-1)} title="반음 내리기">♭ 반음↓</button>
            <button onClick={() => transpose(1)} title="반음 올리기">♯ 반음↑</button>
            <button onClick={() => transpose(12)} title="한 옥타브 올리기">⏫ 8도</button>
          </span>
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          groups={menuGroups({ selected: selNotes.length, hasClip: hasClip(), drumOnly: drum, scaleOn: settings.scaleType !== 'none', onNote: false })}
          onRun={runAction}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

const HINT_MENU = ' · 우클릭/꾹 누르기: 편집 메뉴'
const HINT: Record<Tool, string> = {
  pen: '✏️ 빈 곳을 누르면 음표가 생겨요 (끌면 길이 조절) · 음표를 끌면 길이가 늘었다 줄었다 해요',
  eraser: '🧽 지우고 싶은 음표를 누르거나, 문지르듯 끌면 닿는 음표가 지워져요',
  hand: '✋ 음표를 끌면 이동 · 음표 오른쪽 끝을 끌면 길이 조절 · 빈 곳을 끌면 화면 이동',
  select: '⬚ 빈 곳에서 끌어 네모로 감싸면 여러 음표가 선택돼요 · 음표를 누르면 선택/해제',
}
