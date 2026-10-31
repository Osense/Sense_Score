import { useEffect, useMemo, useRef, useState } from 'react'
import { PPQ, uid, type Note, type ScaleType, type Settings, type Song, type Tool, type Track } from '../types'
import { DRUM_PARTS, drumPartFor, KEY_CHOICES, keyOf, KEYSIG_STEPS, pitchLabel, pitchOfStep, spell } from '../music'
import { Ruler } from './Ruler'
import { ContextMenu } from './ContextMenu'
import { copyToClip, hasClip, menuGroups, planPaste, trackOp, type ActionId } from '../editActions'
import { useLongPress } from '../useLongPress'
import { rangeOf } from '../instruments'
import { engrave, type Engraved, type Seg } from '../notation'
import { GLYPHS } from '../glyphs'

const STEP = 6 // 계이름 한 단계(선↔칸)의 높이
const TOP = 60
const BOT = 14
const PAD = 14
const RULER_H = 36
const CLEF_W = 44 // 음자리표 칸 폭 (여기에 조표·박자표 폭이 더해진다)
const SIG_W = 12 // 조표 기호 하나의 폭
const TIME_W = 30 // 박자표 폭
const DOTTED = new Set([1440, 720, 360, 180]) // 점음표 길이(tick)
const REST_KEY: Record<number, string> = { 1920: 'restWhole', 960: 'restHalf', 480: 'restQuarter', 240: 'rest8th', 120: 'rest16th', 60: 'rest32nd' }
const HEAD_X = 9 // 음표 머리 중심이 시작 tick에서 떨어진 거리
const TREBLE = [37, 39, 41, 43, 45]
const BASS = [25, 27, 29, 31, 33]

// 페이지 보기 (A4 비율)
const PAGE_W = 840
const PAGE_H = 1188
const PAGE_GAP = 28
const MARGIN = 44
const SYS_GAP = 30
const BLOCK_GAP = 10
const LABEL_H = 16
const MIN_PX = 15 // 가장 촘촘한 음 사이에 확보할 최소 간격(px)
const FIRST_TOP = 128
const NEXT_TOP = 64

type Accidental = 'key' | 'sharp' | 'flat' | 'natural'
const ACC_ALT = { sharp: 1, flat: -1, natural: 0 } as const

// 드럼 오선: 맨 아래 줄 slot 0, 한 slot = 반 칸
const D_STEP = 7
const D_PAD = 18
const D_H = 10 * D_STEP + D_PAD * 2
const DRUM_BY_SLOT = [...DRUM_PARTS].sort((a, b) => b.slot - a.slot)

const DURS = [
  { label: '온음표', ticks: PPQ * 4, icon: '𝅝' },
  { label: '2분음표', ticks: PPQ * 2, icon: '𝅗𝅥' },
  { label: '4분음표', ticks: PPQ, icon: '♩' },
  { label: '8분음표', ticks: PPQ / 2, icon: '♪' },
  { label: '16분음표', ticks: PPQ / 4, icon: '𝅘𝅥𝅯' },
]

interface Props {
  song: Song
  activeId: string
  settings: Settings
  zoom: number
  follow: boolean
  playing: boolean
  tool: Tool
  getTick: () => number
  onEdit: (fn: (tracks: Track[]) => Track[], record: boolean) => void
  onCheckpoint: () => void
  onUndo: () => void
  onPreview: (pitch: number, trackId?: string) => void
  onSelectTrack: (id: string) => void
  onSeek: (tick: number) => void
  onLoop: (start: number, end: number) => void
  onSettings: (patch: Partial<Settings>) => void
  onTitle: (title: string) => void
}

/** 한 트랙의 오선(대보표 또는 타악 오선) */
interface Block { track: Track; y: number; h: number; top: number; bot: number; ly: number }
/** 악보 한 줄(시스템): 같은 마디 구간에 속한 트랙 오선들 */
interface Sys { y: number; h: number; x0: number; ppt: number; bar0: number; bars: number; tick0: number; blocks: Block[]; page: number }
interface Glyph { n: Note; seg: Seg; track: Track; sys: Sys; block: Block; cx: number; cy: number; w: number }
type Orig = Note & { drum: boolean; low: number; high: number }

type Drag =
  | { kind: 'move'; tick: number; y: number; sys: Sys; origin: Map<string, Orig>; anchor: string; moved: boolean; pitch: number; dy: number; tap?: string }
  | { kind: 'resize'; tick: number; origin: Map<string, Orig>; anchor: string; moved: boolean; tap?: string }
  | { kind: 'erase'; lx: number; ly: number; erased: boolean }
  | { kind: 'pan'; x: number; y: number; sl: number; st: number }
  | { kind: 'box'; x0: number; y0: number }

export function StaffEditor(p: Props) {
  const { song, settings, zoom, tool } = p
  const active = song.tracks.find((t) => t.id === p.activeId) ?? song.tracks[0]
  const page = settings.scoreView === 'page'
  const multi = settings.scoreMulti
  const ppb = 56 * zoom
  const pxPerTick = ppb / PPQ
  const barTicks = song.beatsPerBar * PPQ
  const scale = page ? Math.max(0.5, Math.min(1.5, zoom / 1.5)) : 1

  const [dur, setDur] = useState(PPQ)
  const [dotted, setDotted] = useState(false)
  const [acc, setAcc] = useState<Accidental>('key') // 새로 찍는 음의 임시표
  const ks = useMemo(() => keyOf(settings.scaleRoot, settings.scaleType), [settings.scaleRoot, settings.scaleType])
  const nKeySig = Math.abs(ks.fifths)
  const headW = CLEF_W + 4 + nKeySig * SIG_W + (nKeySig ? 8 : 0) + TIME_W + 6
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const lp = useLongPress()
  const fresh = useRef<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; tick: number } | null>(null)

  const realDur = () => Math.round(dur * (dotted ? 1.5 : 1))
  const shown = useMemo(() => (multi ? song.tracks : [active]), [multi, song.tracks, active])

  /* ---------- 배치: 줄(시스템) × 트랙(블록) ---------- */
  const layout = useMemo(() => {
    const compact = page || multi
    const rangeOf = (t: Track, from: number, to: number) => {
      if (t.drum) return { top: 0, bot: 0, h: D_H }
      if (!compact) return { top: TOP, bot: BOT, h: (TOP - BOT) * STEP + PAD * 2 }
      let hi = 45, lo = 25
      for (const n of t.notes)
        if (n.start >= from && n.start < to) {
          const s = spell(n.pitch, ks).step
          hi = Math.max(hi, s)
          lo = Math.min(lo, s)
        }
      const top = Math.max(49, hi + 3)
      const bot = Math.min(21, lo - 3)
      return { top, bot, h: (top - bot) * STEP + PAD * 2 }
    }

    let perLine = song.bars
    let ppt = pxPerTick
    let x0 = 0
    if (page) {
      const contentW = PAGE_W - MARGIN * 2 - headW
      if (settings.scoreBars) perLine = settings.scoreBars
      else {
        // 기본은 4마디. 음이 너무 촘촘하면 2마디로 줄여서 읽기 쉽게 한다
        const onsets = [...new Set(shown.flatMap((t) => t.notes.map((n) => n.start)))].sort((a, b) => a - b)
        let gap = Infinity
        for (let i = 1; i < onsets.length; i++) gap = Math.min(gap, onsets[i] - onsets[i - 1])
        const need = gap === Infinity ? 0 : MIN_PX / gap
        perLine = contentW / (4 * barTicks) >= need ? 4 : 2
      }
      ppt = contentW / (perLine * barTicks)
      x0 = MARGIN + headW
    }

    const systems: Sys[] = []
    const nSys = page ? Math.ceil(song.bars / perLine) : 1
    let pageIdx = 0
    let y = page ? FIRST_TOP : 0
    for (let i = 0; i < nSys; i++) {
      const bar0 = i * perLine
      const real = Math.min(perLine, song.bars - bar0)
      const bars = page && real % 2 ? real + 1 : real // 페이지 보기는 항상 짝수 마디
      const tick0 = bar0 * barTicks
      const tick1 = (bar0 + bars) * barTicks
      let by = 0
      const blocks: Block[] = shown.map((t) => {
        const r = rangeOf(t, tick0, tick1)
        if (multi) by += LABEL_H
        const b: Block = { track: t, y: by, h: r.h, top: r.top, bot: r.bot, ly: by - 4 }
        by += r.h + BLOCK_GAP
        return b
      })
      const h = by - BLOCK_GAP
      if (page && y + h > PAGE_H - 56 && y > (pageIdx === 0 ? FIRST_TOP : NEXT_TOP)) {
        pageIdx++
        y = NEXT_TOP
      }
      const sy = pageIdx * (PAGE_H + PAGE_GAP) + y
      blocks.forEach((b) => { b.y += sy; b.ly += sy })
      systems.push({ y: sy, h, x0, ppt, bar0, bars, tick0, blocks, page: pageIdx })
      y += h + SYS_GAP
    }
    const pages = pageIdx + 1
    const svgW = page ? PAGE_W : song.bars * barTicks * ppt
    const svgH = page ? pages * PAGE_H + (pages - 1) * PAGE_GAP : systems[0].h
    return { systems, pages, svgW, svgH, perLine }
  }, [page, multi, shown, song.bars, barTicks, pxPerTick, headW, settings.scoreBars, ks])

  const { systems, svgW, svgH } = layout

  const yS = (step: number, b: Block) => b.y + PAD + (b.top - step) * STEP
  const yD = (slot: number, b: Block) => b.y + D_PAD + (10 - slot) * D_STEP

  // 임시표: 조표와 다른 음에만 붙이고, 같은 마디 안에서는 한 번 붙인 뒤 반복하지 않는다
  const accSyms = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of shown) {
      if (t.drum) continue
      let bar = -1
      let state = new Map<number, number>()
      for (const n of [...t.notes].sort((a, b) => a.start - b.start)) {
        const b = Math.floor(n.start / barTicks)
        if (b !== bar) { bar = b; state = new Map() }
        const sp = spell(n.pitch, ks)
        const cur = state.get(sp.step) ?? ks.acc[((sp.step % 7) + 7) % 7]
        if (sp.alt !== cur) {
          m.set(n.id, sp.alt > 0 ? 'sharp' : sp.alt < 0 ? 'flat' : 'natural')
          state.set(sp.step, sp.alt)
        }
      }
    }
    return m
  }, [shown, ks, barTicks])

  // 악보용으로 정리: 정식 음표값으로 쪼개고(붙임줄), 사이를 쉼표로 채운다
  const engraved = useMemo(() => {
    const m = new Map<string, Engraved>()
    for (const t of shown)
      m.set(
        t.id,
        engrave(t.notes, {
          barTicks,
          bars: song.bars,
          drum: t.drum,
          staffOf: t.drum ? () => 'perc' : (n) => (spell(n.pitch, ks).step >= 35 ? 'treble' : 'bass'),
        }),
      )
    return m
  }, [shown, barTicks, song.bars, ks])

  // 화면에 그려지는 음표와 그 위치 (눌렀을 때 어떤 음표인지 찾는 데도 쓴다)
  const glyphs = useMemo(() => {
    const out: Glyph[] = []
    for (const s of systems) {
      const right = s.x0 + s.bars * barTicks * s.ppt
      for (const b of s.blocks)
        for (const seg of engraved.get(b.track.id)?.segs ?? []) {
          if (seg.start < s.tick0 || seg.start >= s.tick0 + s.bars * barTicks) continue
          const n = seg.note
          const cx = s.x0 + (seg.start - s.tick0) * s.ppt + HEAD_X
          const cy = b.track.drum ? yD(drumPartFor(n.pitch).slot, b) : yS(spell(n.pitch, ks).step, b)
          out.push({ n, seg, track: b.track, sys: s, block: b, cx, cy, w: Math.max(16, Math.min((seg.end - seg.start) * s.ppt, right - cx + 9)) })
        }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systems, engraved, ks, barTicks])

  /* ---------- 좌표 변환 ---------- */
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }

  const locate = (x: number, y: number) => {
    const dist = (a: number, b: number) => (y < a ? a - y : y > b ? y - b : 0)
    let sys = systems[0]
    let best = Infinity
    for (const s of systems) {
      const d = dist(s.y, s.y + s.h)
      if (d < best) { best = d; sys = s }
    }
    let block = sys.blocks[0]
    best = Infinity
    for (const b of sys.blocks) {
      const d = dist(b.y, b.y + b.h)
      if (d < best) { best = d; block = b }
    }
    const end = sys.tick0 + sys.bars * barTicks
    const tick = Math.min(end, Math.max(sys.tick0, sys.tick0 + (x - sys.x0) / sys.ppt))
    return { sys, block, tick }
  }

  /** 눌린 자리의 음높이. 이 악기가 낼 수 없는 음이면 null */
  const pitchAt = (b: Block, y: number): number | null => {
    if (b.track.drum) {
      const slot = 10 - (y - b.y - D_PAD) / D_STEP
      return DRUM_BY_SLOT.reduce((a, c) => (Math.abs(c.slot - slot) < Math.abs(a.slot - slot) ? c : a)).pitch
    }
    const step = Math.min(b.top, Math.max(b.bot, b.top - Math.round((y - b.y - PAD) / STEP)))
    // 기본은 조표를 따르고, ♯/♭/♮를 고르면 그 음만 직접 올리거나 내린다
    const alt = acc === 'key' ? ks.acc[((step % 7) + 7) % 7] : ACC_ALT[acc]
    const pitch = Math.min(108, Math.max(12, pitchOfStep(step, alt)))
    const r = rangeOf(b.track.program)
    return pitch < r.low || pitch > r.high ? null : pitch
  }

  /* ---------- 편집 ---------- */
  const mapNotes = (f: (n: Note, t: Track) => Note | null, record: boolean) =>
    p.onEdit(
      (tracks) =>
        tracks.map((t) => {
          let changed = false
          const notes: Note[] = []
          for (const n of t.notes) {
            const r = f(n, t)
            if (r !== n) changed = true
            if (r) notes.push(r)
          }
          return changed ? { ...t, notes } : t
        }),
      record,
    )

  const addNote = (trackId: string, note: Note) =>
    p.onEdit((tracks) => tracks.map((t) => (t.id === trackId ? { ...t, notes: [...t.notes, note] } : t)), false)

  const del = (ids: Set<string>) => {
    if (!ids.size) return
    p.onCheckpoint()
    mapNotes((n) => (ids.has(n.id) ? null : n), false)
    setSelected(new Set())
  }

  /** 전조: 선택한 음표(없으면 이 트랙 전체)를 반음 단위로 올리거나 내린다 (드럼 제외) */
  const transpose = (semi: number) => {
    const ids = new Set<string>()
    if (selected.size) {
      for (const t of song.tracks) if (!t.drum) for (const n of t.notes) if (selected.has(n.id)) ids.add(n.id)
    } else if (!active.drum) {
      for (const n of active.notes) ids.add(n.id)
    }
    if (!ids.size) return
    const ps = song.tracks.flatMap((t) => (t.drum ? [] : t.notes.filter((n) => ids.has(n.id)).map((n) => n.pitch)))
    // 각 트랙 악기의 음역 안에서만 움직인다
    let lb = -Infinity
    let ub = Infinity
    for (const t of song.tracks) {
      if (t.drum) continue
      const tp = t.notes.filter((n) => ids.has(n.id)).map((n) => n.pitch)
      if (!tp.length) continue
      const r = rangeOf(t.program)
      lb = Math.max(lb, r.low - Math.min(...tp))
      ub = Math.min(ub, r.high - Math.max(...tp))
    }
    const d = lb > ub ? 0 : Math.max(lb, Math.min(ub, semi))
    if (d === 0) return
    p.onCheckpoint()
    mapNotes((n, t) => (!t.drum && ids.has(n.id) ? { ...n, pitch: n.pitch + d } : n), false)
    p.onPreview(ps[0] + d)
  }

  /** 선택한 음표를 바로 뒤에 복제 */
  const duplicate = () => {
    const all = song.tracks.flatMap((t) => t.notes.filter((n) => selected.has(n.id)))
    if (!all.length) return
    const start = Math.min(...all.map((n) => n.start))
    const end = Math.max(...all.map((n) => n.start + n.dur))
    const span = Math.ceil((end - start) / settings.snap) * settings.snap
    const ids: string[] = []
    p.onCheckpoint()
    p.onEdit(
      (tracks) =>
        tracks.map((t) => {
          const copies = t.notes.filter((n) => selected.has(n.id)).map((n) => ({ ...n, id: uid(), start: n.start + span }))
          copies.forEach((c) => ids.push(c.id))
          return copies.length ? { ...t, notes: [...t.notes, ...copies] } : t
        }),
      false,
    )
    setSelected(new Set(ids))
  }

  const originOf = (ids: Set<string>) => {
    const m = new Map<string, Orig>()
    for (const t of song.tracks) for (const n of t.notes) if (ids.has(n.id)) m.set(n.id, { ...n, drum: t.drum, ...rangeOf(t.program) })
    return m
  }

  const capture = (e: React.PointerEvent) => svgRef.current!.setPointerCapture(e.pointerId)

  /** 이전 위치에서 지금 위치까지 지나간 음표를 지운다 (빨리 긋는 경우도 빠짐없이) */
  const eraseTo = (d: Extract<Drag, { kind: 'erase' }>, x: number, y: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x - d.lx, y - d.ly) / 4))
    const ids = new Set<string>()
    for (let i = 0; i <= n; i++) {
      const px = d.lx + ((x - d.lx) * i) / n
      const py = d.ly + ((y - d.ly) * i) / n
      for (const g of glyphs) if (px >= g.cx - 9 && px <= g.cx - 9 + g.w + 2 && Math.abs(py - g.cy) <= 9) ids.add(g.n.id)
    }
    d.lx = x
    d.ly = y
    if (!ids.size) return
    if (!d.erased) { p.onCheckpoint(); d.erased = true }
    mapNotes((nn) => (ids.has(nn.id) ? null : nn), false)
    setSelected((s) => new Set([...s].filter((id) => !ids.has(id))))
  }

  const startErase = (e: React.PointerEvent) => {
    const { x, y } = local(e)
    const d: Drag = { kind: 'erase', lx: x, ly: y, erased: false }
    dragRef.current = d
    eraseTo(d, x, y)
    capture(e)
  }

  /* ---------- 우클릭 / 길게 누르기 메뉴와 편집 동작 ---------- */
  const tickAtClient = (cx: number, cy: number) => {
    const { x, y } = local({ clientX: cx, clientY: cy })
    return Math.floor(locate(x, y).tick / settings.snap) * settings.snap
  }
  const fireMenu = (cx: number, cy: number, id?: string) => {
    if (fresh.current) {
      p.onUndo() // 길게 누르려던 것이었으니 방금 찍힌 음표는 없던 일로
      fresh.current = null
      setSelected(new Set())
    }
    dragRef.current = null
    setBox(null)
    if (id) setSelected((s) => (s.has(id) ? s : new Set([id])))
    setMenu({ x: cx, y: cy, tick: tickAtClient(cx, cy) })
  }

  const pasteAt = (tick: number) => {
    const items = planPaste(tick, shown.map((t) => ({ id: t.id, drum: t.drum })), active.id)
    if (!items.length) return
    p.onCheckpoint()
    p.onEdit(
      (tracks) =>
        tracks.map((t) => {
          const mine = items.filter((i) => i.trackId === t.id)
          return mine.length ? { ...t, notes: [...t.notes, ...mine.map((i) => i.note)] } : t
        }),
      false,
    )
    setSelected(new Set(items.map((i) => i.note.id)))
    p.onPreview(items[0].note.pitch, items[0].trackId)
  }

  const runAction = (id: ActionId) => {
    switch (id) {
      case 'copy':
      case 'cut': {
        const items = song.tracks.flatMap((t) => t.notes.filter((n) => selected.has(n.id)).map((note) => ({ note, trackId: t.id, drum: t.drum })))
        copyToClip(items)
        if (id === 'cut') del(selected)
        return
      }
      case 'paste': return pasteAt(menu ? menu.tick : Math.floor(p.getTick() / settings.snap) * settings.snap)
      case 'dup': return duplicate()
      case 'del': return del(selected)
      case 'selSame': {
        const pitches = new Set(song.tracks.flatMap((t) => (t.drum ? [] : t.notes.filter((n) => selected.has(n.id)).map((n) => n.pitch))))
        return setSelected(new Set(shown.flatMap((t) => (t.drum ? [] : t.notes.filter((n) => pitches.has(n.pitch)).map((n) => n.id)))))
      }
      case 'selTrack': return setSelected(new Set(active.notes.map((n) => n.id)))
      case 'selAll': return setSelected(new Set(shown.flatMap((t) => t.notes.map((n) => n.id))))
      case 'selNone': return setSelected(new Set())
      default:
        p.onCheckpoint()
        p.onEdit(
          (tracks) =>
            tracks.map((t) => {
              if (!t.notes.some((n) => selected.has(n.id))) return t
              const r = rangeOf(t.program)
              return { ...t, notes: trackOp(id, t.notes, selected, { snap: settings.snap, root: settings.scaleRoot, scale: settings.scaleType, low: r.low, high: r.high, drum: t.drum }) }
            }),
          false,
        )
    }
  }

  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    scrollRef.current?.focus()
    if (tool === 'eraser') return startErase(e)
    lp.start(e, () => fireMenu(e.clientX, e.clientY))
    if (tool === 'hand') {
      const el = scrollRef.current!
      dragRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
      return capture(e)
    }
    const { x, y } = local(e)
    if (tool === 'select') {
      dragRef.current = { kind: 'box', x0: x, y0: y }
      setBox({ x0: x, y0: y, x1: x, y1: y })
      setSelected(new Set())
      return capture(e)
    }
    // 연필: 음표 찍기 (끌면 길이 조절)
    const { sys, block } = locate(x, y)
    const unit = Math.min(settings.snap, realDur())
    const raw = sys.tick0 + (x - sys.x0 - HEAD_X + 4) / sys.ppt
    const start = Math.max(sys.tick0, Math.floor(raw / unit) * unit)
    const pitch = pitchAt(block, y)
    if (pitch === null) return // 이 악기가 낼 수 없는 음
    const note: Note = { id: uid(), pitch, start, dur: realDur(), vel: 90 }
    if (block.track.id !== p.activeId) p.onSelectTrack(block.track.id)
    p.onCheckpoint()
    addNote(block.track.id, note)
    p.onPreview(pitch, block.track.id)
    setSelected(new Set([note.id]))
    fresh.current = note.id
    dragRef.current = { kind: 'resize', tick: locate(x, y).tick, origin: new Map([[note.id, { ...note, drum: block.track.drum, ...rangeOf(block.track.program) }]]), anchor: note.id, moved: true }
    capture(e)
  }

  const onNoteDown = (e: React.PointerEvent, g: Glyph, edge = false) => {
    if (e.button !== 0) return
    e.stopPropagation()
    scrollRef.current?.focus()
    if (tool === 'eraser') return startErase(e)
    lp.start(e, () => fireMenu(e.clientX, e.clientY, g.n.id))
    if (tool === 'select') {
      if (!selected.has(g.n.id)) {
        setSelected((s) => new Set(s).add(g.n.id))
        return
      }
      // 이미 선택된 음표를 끌면 선택한 음표 전체가 함께 움직인다 (위아래로 끌면 전조)
      const { x, y } = local(e)
      dragRef.current = { kind: 'move', tick: locate(x, y).tick, y, sys: g.sys, origin: originOf(selected), anchor: g.n.id, moved: false, pitch: g.n.pitch, dy: 0, tap: g.n.id }
      p.onPreview(g.n.pitch, g.track.id)
      return capture(e)
    }
    if (g.track.id !== p.activeId) p.onSelectTrack(g.track.id)
    let sel = selected
    if (tool === 'pen') sel = new Set([g.n.id])
    else if (e.shiftKey) {
      sel = new Set(selected)
      if (!sel.delete(g.n.id)) sel.add(g.n.id)
    } else if (!selected.has(g.n.id)) sel = new Set([g.n.id])
    setSelected(sel)
    if (!sel.has(g.n.id)) return
    const origin = originOf(sel)
    const { x, y } = local(e)
    const tick = locate(x, y).tick
    dragRef.current =
      tool === 'pen' || edge
        ? { kind: 'resize', tick, origin, anchor: g.n.id, moved: false } // 연필: 어디를 끌어도 길이 조절 / 손바닥: 끝 손잡이
        : { kind: 'move', tick, y, sys: g.sys, origin, anchor: g.n.id, moved: false, pitch: g.n.pitch, dy: 0 }
    p.onPreview(g.n.pitch, g.track.id)
    capture(e)
  }

  const onMove = (e: React.PointerEvent) => {
    lp.moved(e)
    const d = dragRef.current
    if (!d) return
    const { snap } = settings
    if (d.kind === 'pan') {
      const el = scrollRef.current!
      el.scrollLeft = d.sl - (e.clientX - d.x)
      el.scrollTop = d.st - (e.clientY - d.y)
      return
    }
    const { x, y } = local(e)
    if (d.kind === 'erase') return eraseTo(d, x, y)
    if (d.kind === 'box') return setBox({ x0: d.x0, y0: d.y0, x1: x, y1: y })
    const here = locate(x, y)
    if (d.kind === 'resize') {
      const base = d.origin.get(d.anchor)!
      const delta = Math.max(snap - base.dur, Math.round((here.tick - d.tick) / snap) * snap)
      if (!d.moved && delta === 0) return
      if (!d.moved) { p.onCheckpoint(); d.moved = true }
      mapNotes((n) => {
        const o = d.origin.get(n.id)
        return o ? { ...n, dur: Math.max(snap, o.dur + delta) } : n
      }, false)
      return
    }
    let dTick = Math.round((here.tick - d.tick) / snap) * snap
    dTick = Math.max(-Math.min(...[...d.origin.values()].map((o) => o.start)), dTick)
    const anchorDrum = d.origin.get(d.anchor)!.drum
    // 같은 줄 안에서만 위아래 이동을 따라간다 (다른 줄로 넘어가면 음높이는 유지)
    if (here.sys === d.sys) d.dy = anchorDrum ? Math.round((y - d.y) / (D_STEP * 2)) : -Math.round((y - d.y) / STEP)
    const dy = d.dy
    if (!d.moved && dTick === 0 && dy === 0) return
    if (!d.moved) { p.onCheckpoint(); d.moved = true }
    const shift = (o: Orig) => {
      if (o.drum) {
        const i = DRUM_BY_SLOT.indexOf(drumPartFor(o.pitch))
        return DRUM_BY_SLOT[Math.min(DRUM_BY_SLOT.length - 1, Math.max(0, i - dy))].pitch
      }
      // 위아래로 옮기면 조표를 따라가되, 원래 조표 밖의 임시표 차이는 유지한다
      const sp = spell(o.pitch, ks)
      const deg = (s: number) => ((s % 7) + 7) % 7
      const next = sp.step + dy
      return Math.min(o.high, Math.max(o.low, pitchOfStep(next, ks.acc[deg(next)] + (sp.alt - ks.acc[deg(sp.step)]))))
    }
    mapNotes((n) => {
      const o = d.origin.get(n.id)
      return o ? { ...n, start: o.start + dTick, pitch: shift(o) } : n
    }, false)
    const ap = shift(d.origin.get(d.anchor)!)
    if (ap !== d.pitch) { d.pitch = ap; p.onPreview(ap) }
  }

  const onUp = () => {
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
      setSelected(new Set(glyphs.filter((g) => g.cx + g.w - 9 >= xa && g.cx - 9 <= xb && g.cy + 8 >= ya && g.cy - 8 <= yb).map((g) => g.n.id)))
    }
    setBox(null)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(selected) }
    else if (e.key === 'Escape') setSelected(new Set())
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSelected(new Set(shown.flatMap((t) => t.notes.map((n) => n.id))))
    } else if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'v', 'd'].includes(e.key.toLowerCase())) {
      e.preventDefault()
      runAction(({ c: 'copy', x: 'cut', v: 'paste', d: 'dup' } as const)[e.key.toLowerCase() as 'c' | 'x' | 'v' | 'd'])
    }
  }

  const setSelDur = (d: number) => {
    if (!selected.size) return
    p.onCheckpoint()
    mapNotes((n) => (selected.has(n.id) ? { ...n, dur: d } : n), false)
  }
  const pickDur = (ticks: number) => {
    setDur(ticks)
    setSelDur(Math.round(ticks * (dotted ? 1.5 : 1)))
  }
  const toggleDot = () => {
    const next = !dotted
    setDotted(next)
    setSelDur(Math.round(dur * (next ? 1.5 : 1)))
  }

  /* ---------- 트랙/보기 전환 시 정리, 재생헤드 ---------- */
  useEffect(() => {
    setSelected(new Set())
    // 다중 악보에서는 다른 트랙의 음표를 눌러도 선택을 유지한다
  }, [multi ? 'multi' : p.activeId])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = 0
    el.scrollTop = page ? 0 : !multi && !active.drum ? PAD + (TOP - 48) * STEP - el.clientHeight / 2 + RULER_H + 60 : 0
  }, [page, multi, active.id, active.drum])

  // 파트를 고르면 그 위치로 화면을 옮긴다
  useEffect(() => {
    const onFocus = (e: Event) => {
      const tick = (e as CustomEvent<number>).detail
      const el = scrollRef.current
      if (!el) return
      if (page) {
        const s = systems.find((q) => tick >= q.tick0 && tick < q.tick0 + q.bars * barTicks)
        if (s) el.scrollTop = Math.max(0, s.y * scale - 20)
      } else {
        el.scrollLeft = Math.max(0, tick * pxPerTick - 20)
      }
    }
    window.addEventListener('focus-tick', onFocus)
    return () => window.removeEventListener('focus-tick', onFocus)
  }, [page, systems, scale, barTicks, pxPerTick])

  const latest = useRef({ p, systems, scale, page })
  useEffect(() => {
    latest.current = { p, systems, scale, page }
  })
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const { p, systems, scale, page } = latest.current
      const tick = p.getTick()
      const head = headRef.current
      const scroller = scrollRef.current
      if (head) {
        const s = systems.find((q) => tick >= q.tick0 && tick < q.tick0 + q.bars * barTicks) ?? systems[systems.length - 1]
        const x = (s.x0 + (tick - s.tick0) * s.ppt) * scale
        const y = s.y * scale
        head.style.transform = `translate(${x}px, ${y}px)`
        head.style.height = `${s.h * scale}px`
        if (p.playing && p.follow && scroller) {
          if (page) {
            if (y < scroller.scrollTop || y + s.h * scale > scroller.scrollTop + scroller.clientHeight)
              scroller.scrollTop = Math.max(0, y - 60)
          } else if (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - 160) {
            scroller.scrollLeft = Math.max(0, x - 40)
          }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [barTicks])

  /* ---------- 그리기 ---------- */
  const ledger = (cx: number, y: number, key: string) => (
    <line key={key} x1={cx - 9} x2={cx + 9} y1={y} y2={y} className="ledger" />
  )

  /** 쉼표·붙임줄처럼 음표 그리기에 쓰는 기호 도형(음악 전용 글꼴에서 뽑은 것) */
  const glyphPath = (name: string, x: number, y: number, key?: string | number, cls = 'glyph') => {
    const gl = GLYPHS[name]
    return <path key={key} className={cls} d={gl.d} transform={`translate(${x} ${y})`} />
  }

  const stemUp = (g: Glyph) => {
    if (g.track.drum) return true
    const stp = spell(g.n.pitch, ks).step
    return stp < (stp >= 35 ? 41 : 29)
  }

  const noteGlyph = (g: Glyph) => {
    const { n, cx, cy, block, seg } = g
    const drum = g.track.drum
    const sel = selected.has(n.id)
    const part = drum ? drumPartFor(n.pitch) : null
    const color = sel ? 'var(--accent)' : multi ? g.track.color : 'var(--note-ink)'
    const len = seg.end - seg.start
    const isDotted = DOTTED.has(len)
    const base = isDotted ? (len * 2) / 3 : len
    const open = len >= 960
    const stemless = len >= 1920
    const stp = drum ? 0 : spell(n.pitch, ks).step
    const up = stemUp(g)
    const sx = up ? cx + 5 : cx - 5
    const sy2 = up ? cy - 26 : cy + 26
    const flags = base <= 60 ? 3 : base <= 120 ? 2 : base <= 240 ? 1 : 0
    const ledgers: React.ReactNode[] = []
    if (drum) {
      if (part!.slot >= 10) ledgers.push(ledger(cx, yD(10, block), 'l'))
    } else {
      for (let k = 47; k <= stp; k += 2) ledgers.push(ledger(cx, yS(k, block), `a${k}`))
      for (let k = 23; k >= stp; k -= 2) ledgers.push(ledger(cx, yS(k, block), `b${k}`))
      if (stp === 35) ledgers.push(ledger(cx, yS(35, block), 'c'))
    }
    let head: React.ReactNode
    if (part?.head === 'x') {
      head = <path d={`M${cx - 4.5} ${cy - 4.5}L${cx + 4.5} ${cy + 4.5}M${cx + 4.5} ${cy - 4.5}L${cx - 4.5} ${cy + 4.5}`} stroke={color} strokeWidth={2} />
    } else if (part?.head === 'tri') {
      head = <polygon points={`${cx - 5},${cy + 4} ${cx + 5},${cy + 4} ${cx},${cy - 5}`} fill={color} />
    } else {
      head = (
        <ellipse cx={cx} cy={cy} rx={6} ry={4.4} transform={`rotate(-20 ${cx} ${cy})`}
          fill={open ? 'var(--bg-staff)' : color} stroke={color} strokeWidth={1.6} />
      )
    }
    const accName = !seg.tieIn ? accSyms.get(n.id) : undefined
    const endX = cx - 9 + g.w
    return (
      <g
        key={`${n.id}:${seg.start}`}
        className="staff-note"
        onPointerDown={(e) => onNoteDown(e, g)}
        onDoubleClick={() => tool !== 'eraser' && del(new Set([n.id]))}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); fireMenu(e.clientX, e.clientY, n.id) }}
      >
        {/* 길이 표시용 흐린 막대와 넉넉한 터치 영역 */}
        <rect x={cx - 9} y={cy - 10} width={g.w + 2} height={20} fill="transparent" />
        <rect x={cx + 7} y={cy - 1} width={Math.max(0, g.w - 16)} height={2} fill={g.track.color} opacity={0.35} />
        {ledgers}
        {accName && <path className="glyph" d={GLYPHS[accName].d} transform={`translate(${cx - 9 - GLYPHS[accName].x2} ${cy})`} fill={color} />}
        {head}
        {!stemless && <line x1={sx} x2={sx} y1={cy} y2={sy2} stroke={color} strokeWidth={1.4} />}
        {!stemless && Array.from({ length: flags }, (_, i) => (
          <path key={i} d={up ? `M${sx} ${sy2 + i * 6}q6 6 4 13` : `M${sx} ${sy2 - i * 6}q-6 -6 -4 -13`} fill="none" stroke={color} strokeWidth={1.6} />
        ))}
        {isDotted && <circle cx={cx + 11} cy={cy - (!drum && stp % 2 !== 0 ? STEP : 1.5)} r={1.8} fill={color} />}
        {sel && <rect x={cx - 11} y={cy - 12} width={g.w + 4} height={24} rx={6} className="sel-box" />}
        {tool === 'hand' && !seg.tieOut && (
          <g onPointerDown={(e) => onNoteDown(e, g, true)} className="len-handle">
            <rect x={endX - 3} y={cy - 11} width={14} height={22} rx={6} />
            <path d={`M${endX + 1} ${cy - 4}v8M${endX + 6} ${cy - 4}v8`} />
          </g>
        )}
      </g>
    )
  }

  /** 쉼표: 오선에서 아무 소리도 나지 않는 곳을 정식 쉼표로 채운다 */
  const restEls = systems.flatMap((s) =>
    s.blocks.flatMap((b) => {
      const eng = engraved.get(b.track.id)
      if (!eng) return []
      return eng.rests
        .filter((r) => r.start >= s.tick0 && r.start < s.tick0 + s.bars * barTicks)
        .map((r) => {
          const key = r.bar ? 'restWhole' : REST_KEY[r.dur]
          const gl = GLYPHS[key]
          const mid = r.staff === 'perc' ? yD(4, b) : r.staff === 'treble' ? yS(41, b) : yS(29, b) // 가운데 줄
          const hang = r.staff === 'perc' ? yD(6, b) : r.staff === 'treble' ? yS(43, b) : yS(31, b) // 아래에서 넷째 줄
          const left = s.x0 + (r.start - s.tick0) * s.ppt
          const cx = r.bar ? left + (barTicks * s.ppt) / 2 : left + HEAD_X
          return (
            <path
              key={`r${b.y}-${r.staff}-${r.start}`}
              className="glyph rest-glyph"
              d={gl.d}
              transform={`translate(${cx - (gl.x1 + gl.x2) / 2} ${key === 'restWhole' ? hang : mid})`}
            />
          )
        })
    }),
  )

  /** 붙임줄: 마디나 박을 넘어 이어지는 음을 잇는 곡선 */
  const tieEls = (() => {
    const byNote = new Map<string, Glyph[]>()
    for (const g of glyphs) {
      const list = byNote.get(g.n.id)
      if (list) list.push(g)
      else byNote.set(g.n.id, [g])
    }
    const out: React.ReactNode[] = []
    for (const list of byNote.values()) {
      list.sort((a, b) => a.seg.start - b.seg.start)
      list.forEach((g, i) => {
        const nx = list[i + 1]
        if (!g.seg.tieOut || !nx) return
        const up = stemUp(g)
        const x1 = g.cx + 5
        const sysRight = g.sys.x0 + g.sys.bars * barTicks * g.sys.ppt
        const x2 = nx.sys === g.sys && nx.block === g.block ? nx.cx - 5 : sysRight - 2
        const y = g.cy + (up ? 7 : -7)
        const bulge = up ? 7 : -7
        out.push(<path key={`t${g.n.id}-${g.seg.start}`} className="tie" d={`M${x1} ${y} Q${(x1 + x2) / 2} ${y + bulge} ${x2} ${y}`} />)
      })
    }
    return out
  })()

  /** 음자리표 + 조표 (+ 박자표). 모두 오선의 줄과 칸에 정확히 맞춰 그린다. */
  const header = (b: Block, x0: number, showTime: boolean) => {
    const timeCx = x0 + CLEF_W + 4 + nKeySig * SIG_W + (nKeySig ? 8 : 0) + TIME_W / 2
    // 박자표 숫자: 윗줄 숫자는 오선 위쪽 절반(넷째 줄)에, 아랫줄 숫자는 아래쪽 절반(둘째 줄)에 세로 중앙을 맞춘다
    const digit = (num: number, y: number, key: string) => {
      const gl = GLYPHS[`time${num}`]
      return <path key={key} className="glyph" d={gl.d} transform={`translate(${timeCx - (gl.x1 + gl.x2) / 2} ${y})`} />
    }
    if (b.track.drum) {
      return (
        <g key={`h${b.y}`}>
          {glyphPath('percClef', x0 + 10, yD(4, b))}
          {showTime && (
            <>
              {digit(song.beatsPerBar, yD(6, b), 'n')}
              {digit(4, yD(2, b), 'd')}
            </>
          )}
        </g>
      )
    }
    return (
      <g key={`h${b.y}`}>
        {glyphPath('gClef', x0 + 6, yS(39, b))}
        {glyphPath('fClef', x0 + 6, yS(31, b))}
        {(['treble', 'bass'] as const).flatMap((clef) =>
          KEYSIG_STEPS[clef][ks.fifths > 0 ? 'sharp' : 'flat'].slice(0, nKeySig).map((s, i) =>
            glyphPath(ks.fifths > 0 ? 'sharp' : 'flat', x0 + CLEF_W + 4 + i * SIG_W, yS(s, b), `${clef}${i}`),
          ),
        )}
        {showTime && (
          <>
            {digit(song.beatsPerBar, yS(43, b), 'tn')}
            {digit(4, yS(39, b), 'td')}
            {digit(song.beatsPerBar, yS(31, b), 'bn')}
            {digit(4, yS(27, b), 'bd')}
          </>
        )}
      </g>
    )
  }

  const trackLabel = (b: Block, x: number) =>
    multi && (
      <text key={`l${b.y}`} x={x} y={b.ly + 1} className={`track-label ${b.track.id === active.id ? 'on' : ''}`} fill={b.track.color}>
        ● {b.track.name}
      </text>
    )

  const staffLines = (b: Block, x1: number, x2: number) =>
    (b.track.drum ? [0, 2, 4, 6, 8].map((s) => yD(s, b)) : [...TREBLE, ...BASS].map((s) => yS(s, b))).map((y, i) => (
      <line key={`${b.y}-${i}`} x1={x1} x2={x2} y1={y} y2={y} className="staff-line" />
    ))

  const loopOn = settings.loop && settings.loopEnd > settings.loopStart
  const sel1 = glyphs.find((g) => selected.has(g.n.id))
  const nSel = new Set(glyphs.filter((g) => selected.has(g.n.id)).map((g) => g.n.id)).size
  const keyName = settings.scaleType === 'none' ? '다장조' : ks.name

  const systemEls = systems.map((s, si) => {
    const w = s.bars * barTicks * s.ppt
    const first = s.blocks[0]
    return (
      <g key={si}>
        {loopOn && s.tick0 < settings.loopEnd && s.tick0 + s.bars * barTicks > settings.loopStart && (
          <rect
            x={s.x0 + (Math.max(s.tick0, settings.loopStart) - s.tick0) * s.ppt} y={s.y}
            width={(Math.min(s.tick0 + s.bars * barTicks, settings.loopEnd) - Math.max(s.tick0, settings.loopStart)) * s.ppt}
            height={s.h} fill="var(--accent-bg)"
          />
        )}
        {page && s.blocks.map((b) => header(b, MARGIN, si === 0))}
        {s.blocks.map((b) => (
          <g key={b.y}>
            {multi && b.track.id === active.id && (
              <rect x={s.x0 - 4} y={b.y - 2} width={w + 8} height={b.h + 4} rx={6} className="active-band" />
            )}
            {!b.track.drum &&
              (() => {
                // 악기가 낼 수 없는 높이는 흐리게 막아 둔다
                const r = rangeOf(b.track.program)
                const yHi = yS(spell(r.high, ks).step, b) - STEP
                const yLo = yS(spell(r.low, ks).step, b) + STEP
                return (
                  <>
                    {yHi > b.y && <rect className="off-range-svg" x={s.x0} y={b.y} width={w} height={yHi - b.y} />}
                    {yLo < b.y + b.h && <rect className="off-range-svg" x={s.x0} y={yLo} width={w} height={b.y + b.h - yLo} />}
                  </>
                )
              })()}
            {staffLines(b, page ? MARGIN : s.x0, s.x0 + w)}
            {Array.from({ length: s.bars * song.beatsPerBar + 1 }, (_, i) => {
              const x = s.x0 + i * PPQ * s.ppt
              const isBar = i % song.beatsPerBar === 0
              const yA = b.track.drum ? yD(8, b) : yS(45, b)
              const yB = b.track.drum ? yD(0, b) : yS(25, b)
              return <line key={i} x1={x} x2={x} y1={isBar ? yA : b.y} y2={isBar ? yB : b.y + b.h} className={isBar ? 'bar-line' : 'beat-guide'} />
            })}
            {page && trackLabel(b, MARGIN)}
          </g>
        ))}
        {/* 마디 번호 (누르면 그 마디로 이동) */}
        {Array.from({ length: s.bars }, (_, i) => (
          <text
            key={i} x={s.x0 + i * barTicks * s.ppt + 4} y={first.y + (first.track.drum ? 10 : PAD) - 4}
            className="bar-no" onPointerDown={(e) => { e.stopPropagation(); p.onSeek((s.bar0 + i) * barTicks) }}
          >
            {s.bar0 + i + 1}
          </text>
        ))}
        {si === 0 && <text x={s.x0 + 22} y={first.y + (first.track.drum ? 10 : PAD) - 4} className="tempo-mark">♩ = {song.bpm}</text>}
      </g>
    )
  })

  return (
    <div className={`roll-wrap tool-${tool}`}>
      <div className="staff-tools">
        <span className="lbl">보기</span>
        <button className={`toggle ${!page ? 'on' : ''}`} onClick={() => p.onSettings({ scoreView: 'scroll' })} title="가로로 길게 이어진 악보">📜 스크롤</button>
        <button className={`toggle ${page ? 'on' : ''}`} onClick={() => p.onSettings({ scoreView: 'page' })} title="종이 악보처럼 여러 줄로 나눠 보기">📄 페이지</button>
        <button className={`toggle ${multi ? 'on' : ''}`} onClick={() => p.onSettings({ scoreMulti: !multi })} title="모든 트랙을 한꺼번에 위아래로 겹쳐 보기">🎼 다중 악보</button>
        {page && (
          <label className="inline" title="한 줄에 들어가는 마디 수. 자동은 4마디이고, 음이 촘촘하면 2마디로 줄어요">
            한 줄
            <select value={settings.scoreBars} onChange={(e) => p.onSettings({ scoreBars: +e.target.value as Settings['scoreBars'] })}>
              <option value={0}>자동 (기본 4마디)</option>
              <option value={2}>2마디</option>
              <option value={4}>4마디</option>
              <option value={8}>8마디</option>
            </select>
            {settings.scoreBars === 0 && <small className="muted">지금 {layout.perLine}마디</small>}
          </label>
        )}
        <span className="sep" />
        <span className="lbl">음표 길이</span>
        {DURS.map((d) => (
          <button key={d.ticks} className={`toggle ${dur === d.ticks ? 'on' : ''}`} title={d.label} onClick={() => pickDur(d.ticks)}>
            <span className="glyph">{d.icon}</span> {d.label.replace('음표', '')}
          </button>
        ))}
        <button className={`toggle ${dotted ? 'on' : ''}`} title="점음표 (1.5배 길게)" onClick={toggleDot}>점</button>
        <span className="sep" />
        <span className="lbl">임시표</span>
        {([['key', '조표대로'], ['sharp', '♯'], ['flat', '♭'], ['natural', '♮']] as const).map(([v, t]) => (
          <button
            key={v}
            className={`toggle ${acc === v ? 'on' : ''}`}
            onClick={() => setAcc(v)}
            title={v === 'key' ? '조표에 맞는 음이 찍혀요' : '새로 찍는 음을 이 기호로 직접 올리거나 내려요'}
          >
            {t}
          </button>
        ))}
        <span className="sep" />
        <span className="info-chip" title="박자는 위쪽 '박자'에서 바꿔요">{song.beatsPerBar}/4 박자</span>
        <span className="info-chip" title="템포는 위쪽 '템포'에서 바꿔요">♩ = {song.bpm}</span>
        <label className="inline" title="조성을 고르면 조표가 붙고, 음 이름과 임시표가 그에 맞게 바뀌어요">
          조성
          <select
            value={settings.scaleType === 'none' ? 'none' : `${settings.scaleRoot}:${ks.minor ? 'minor' : 'major'}`}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'none') return p.onSettings({ scaleType: 'none' })
              const [root, type] = v.split(':')
              p.onSettings({ scaleRoot: +root, scaleType: type as ScaleType })
            }}
          >
            {KEY_CHOICES.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={`roll ${page ? 'page-mode' : ''}`} ref={scrollRef} tabIndex={0} onKeyDown={onKeyDown}>
        {!page && (
          <Ruler song={song} settings={settings} pxPerTick={pxPerTick} keyW={headW} height={RULER_H} onSeek={p.onSeek} onLoop={p.onLoop} />
        )}
        <div className="roll-body">
          {!page && (
            <div className="keys clef-col" style={{ width: headW, height: svgH }}>
              <svg width={headW} height={svgH}>
                {systems[0].blocks.map((b) => staffLines(b, 0, headW))}
                {systems[0].blocks.map((b) => header(b, 0, true))}
                {systems[0].blocks.map((b) => trackLabel(b, 4))}
              </svg>
            </div>
          )}
          <div className="grid staff-grid" style={{ width: svgW * scale, height: svgH * scale }}>
            <svg
              ref={svgRef}
              width={svgW * scale}
              height={svgH * scale}
              viewBox={`0 0 ${svgW} ${svgH}`}
              onPointerDown={onBgDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onContextMenu={(e) => { e.preventDefault(); fireMenu(e.clientX, e.clientY) }}
            >
              {page ? (
                Array.from({ length: layout.pages }, (_, i) => {
                  const top = i * (PAGE_H + PAGE_GAP)
                  return (
                    <g key={i}>
                      <rect x={0} y={top} width={PAGE_W} height={PAGE_H} className="paper" />
                      {i === 0 ? (
                        <text x={PAGE_W / 2} y={top + 92} textAnchor="middle" className="page-sub">
                          ♩ = {song.bpm} · {song.beatsPerBar}/4 박자 · {keyName}
                        </text>
                      ) : (
                        <text x={MARGIN} y={top + 36} className="page-run">{song.title}</text>
                      )}
                      <text x={PAGE_W / 2} y={top + PAGE_H - 24} textAnchor="middle" className="page-run">{i + 1}</text>
                    </g>
                  )
                })
              ) : (
                <rect width={svgW} height={svgH} fill="var(--bg-staff)" />
              )}
              {systemEls}
              {restEls}
              {tieEls}
              {glyphs.map(noteGlyph)}
              {box && (
                <rect
                  className="marquee"
                  x={Math.min(box.x0, box.x1)} y={Math.min(box.y0, box.y1)}
                  width={Math.abs(box.x1 - box.x0)} height={Math.abs(box.y1 - box.y0)}
                />
              )}
            </svg>
            {page && (
              <input
                className="page-title"
                value={song.title}
                placeholder="악보 제목"
                onChange={(e) => p.onTitle(e.target.value)}
                onFocus={p.onCheckpoint}
                style={{ left: 80 * scale, width: (PAGE_W - 160) * scale, top: 34 * scale, height: 44 * scale, fontSize: 30 * scale }}
                aria-label="악보 제목"
              />
            )}
            <div className="playhead" ref={headRef} />
          </div>
        </div>
      </div>

      <div className="roll-status">
        {nSel === 0 ? (
          <span className="hint">{TOOL_HINT[tool]} · 우클릭/꾹 누르기: 편집 메뉴</span>
        ) : (
          <>
            <b>{nSel}개 선택</b>
            {nSel === 1 && sel1 && <span>{sel1.track.drum ? drumPartFor(sel1.n.pitch).label : pitchLabel(sel1.n.pitch)}</span>}
            <button onClick={duplicate}>⧉ 복제</button>
            <button onClick={() => del(selected)}>🗑 지우기</button>
          </>
        )}
        <button onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, tick: Math.floor(p.getTick() / settings.snap) * settings.snap })} title="복사·붙여넣기·길이·음높이 등 편집 메뉴 (음표를 우클릭하거나 꾹 눌러도 열려요)">⋯ 편집 메뉴</button>
        <span className="transpose">
          <span className="lbl">전조 <small>({nSel ? '선택한 음' : '이 트랙 전체'})</small></span>
          <button onClick={() => transpose(-12)} title="한 옥타브 내리기">⏬ 8도</button>
          <button onClick={() => transpose(-1)} title="반음 내리기">♭ 반음↓</button>
          <button onClick={() => transpose(1)} title="반음 올리기">♯ 반음↑</button>
          <button onClick={() => transpose(12)} title="한 옥타브 올리기">⏫ 8도</button>
        </span>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          groups={menuGroups({
            selected: nSel,
            hasClip: hasClip(),
            drumOnly: nSel > 0 ? song.tracks.every((t) => t.drum || !t.notes.some((n) => selected.has(n.id))) : active.drum,
            scaleOn: settings.scaleType !== 'none',
            onNote: false,
          })}
          onRun={runAction}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

const TOOL_HINT: Record<Tool, string> = {
  pen: '✏️ 오선 위를 누르면 위에서 고른 길이의 음표가 찍혀요 · 음표를 끌면 길이가 늘었다 줄었다 해요',
  eraser: '🧽 지우고 싶은 음표를 누르거나, 문지르듯 끌면 닿는 음표가 지워져요',
  hand: '✋ 음표를 끌면 이동 · 음표 끝의 손잡이를 끌면 길이 조절 · 빈 곳을 끌면 화면 이동',
  select: '⬚ 빈 곳에서 끌어 네모로 감싸면 여러 음표가 선택돼요 · 음표를 누르면 선택/해제',
}
