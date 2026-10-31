import { inScale } from './music'
import { uid, type Note, type ScaleType } from './types'

/* ======================================================================
   음표 편집 기능 모음 (우클릭 / 길게 누르기 메뉴, 단축키에서 같이 쓴다)
   ====================================================================== */

/* ---------- 클립보드 (복사/잘라내기/붙여넣기) ---------- */
export interface ClipNote { trackId: string; drum: boolean; pitch: number; rel: number; dur: number; vel: number }
export interface Clip { notes: ClipNote[] }

let clip: Clip | null = null
export const getClip = () => clip
export const hasClip = () => !!clip && clip.notes.length > 0

export function copyToClip(items: { note: Note; trackId: string; drum: boolean }[]): number {
  if (!items.length) return 0
  const start = Math.min(...items.map((i) => i.note.start))
  clip = { notes: items.map(({ note, trackId, drum }) => ({ trackId, drum, pitch: note.pitch, rel: note.start - start, dur: note.dur, vel: note.vel })) }
  return items.length
}

/** 붙여넣을 음표를 만든다. 원래 트랙이 있으면 그 트랙에, 없으면 지금 쓰는 트랙에(종류가 같을 때만) 넣는다. */
export function planPaste(at: number, tracks: { id: string; drum: boolean }[], activeId: string): { trackId: string; note: Note }[] {
  if (!clip) return []
  const active = tracks.find((t) => t.id === activeId)
  const out: { trackId: string; note: Note }[] = []
  for (const c of clip.notes) {
    const target = tracks.find((t) => t.id === c.trackId) ?? (active && active.drum === c.drum ? active : undefined)
    if (!target || target.drum !== c.drum) continue
    out.push({ trackId: target.id, note: { id: uid(), pitch: c.pitch, start: Math.max(0, at + c.rel), dur: c.dur, vel: c.vel } })
  }
  return out
}

/* ---------- 트랙 안에서 선택한 음표를 고치는 기능들 ---------- */
export interface OpCtx {
  snap: number
  root: number
  scale: ScaleType | 'none'
  low: number
  high: number
  drum: boolean
}

export type TrackOpId =
  | 'double' | 'half' | 'split' | 'merge' | 'legato'
  | 'octUp' | 'octDown' | 'semiUp' | 'semiDown' | 'toScale'
  | 'quantize' | 'louder' | 'softer' | 'humanize'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** 가장 가까운 음계 안의 음 (같은 거리면 낮은 음) */
export function nearestInScale(pitch: number, root: number, scale: ScaleType | 'none', low: number, high: number): number {
  for (let d = 0; d <= 6; d++)
    for (const p of [pitch - d, pitch + d])
      if (p >= low && p <= high && inScale(p, root, scale)) return p
  return pitch
}

/** 선택한 음표(sel)에만 기능을 적용한 새 음표 목록 */
export function trackOp(id: TrackOpId, notes: Note[], sel: Set<string>, c: OpCtx): Note[] {
  const isSel = (n: Note) => sel.has(n.id)
  const shift = (d: number) =>
    c.drum ? notes : notes.map((n) => (isSel(n) ? { ...n, pitch: clamp(n.pitch + d, c.low, c.high) } : n))
  switch (id) {
    case 'double': return notes.map((n) => (isSel(n) ? { ...n, dur: n.dur * 2 } : n))
    case 'half': return notes.map((n) => (isSel(n) ? { ...n, dur: Math.max(c.snap, Math.round(n.dur / 2 / c.snap) * c.snap || c.snap) } : n))
    case 'split': {
      const out: Note[] = []
      for (const n of notes) {
        if (!isSel(n) || n.dur < c.snap * 2) { out.push(n); continue }
        const first = Math.max(c.snap, Math.floor(n.dur / 2 / c.snap) * c.snap)
        out.push({ ...n, dur: first }, { ...n, id: uid(), start: n.start + first, dur: n.dur - first })
      }
      return out
    }
    case 'merge': {
      // 같은 음높이이고 서로 맞닿았거나 겹치는 선택 음표를 하나로
      const keep = notes.filter((n) => !isSel(n))
      const byPitch = new Map<number, Note[]>()
      for (const n of notes.filter(isSel)) byPitch.set(n.pitch, [...(byPitch.get(n.pitch) ?? []), n])
      const merged: Note[] = []
      for (const list of byPitch.values()) {
        list.sort((a, b) => a.start - b.start)
        let cur = { ...list[0] }
        for (const n of list.slice(1)) {
          if (n.start <= cur.start + cur.dur) cur = { ...cur, dur: Math.max(cur.dur, n.start + n.dur - cur.start), vel: Math.max(cur.vel, n.vel) }
          else { merged.push(cur); cur = { ...n } }
        }
        merged.push(cur)
      }
      return [...keep, ...merged]
    }
    case 'legato': {
      // 다음 음이 시작할 때까지 길게 이어 붙인다
      const starts = [...new Set(notes.map((n) => n.start))].sort((a, b) => a - b)
      return notes.map((n) => {
        if (!isSel(n)) return n
        const next = starts.find((t) => t > n.start)
        return next === undefined ? n : { ...n, dur: next - n.start }
      })
    }
    case 'octUp': return shift(12)
    case 'octDown': return shift(-12)
    case 'semiUp': return shift(1)
    case 'semiDown': return shift(-1)
    case 'toScale':
      return c.drum || c.scale === 'none' ? notes : notes.map((n) => (isSel(n) ? { ...n, pitch: nearestInScale(n.pitch, c.root, c.scale, c.low, c.high) } : n))
    case 'quantize':
      return notes.map((n) => (isSel(n) ? { ...n, start: Math.max(0, Math.round(n.start / c.snap) * c.snap), dur: Math.max(c.snap, Math.round(n.dur / c.snap) * c.snap) } : n))
    case 'louder': return notes.map((n) => (isSel(n) ? { ...n, vel: clamp(n.vel + 16, 1, 127) } : n))
    case 'softer': return notes.map((n) => (isSel(n) ? { ...n, vel: clamp(n.vel - 16, 1, 127) } : n))
    case 'humanize': return notes.map((n) => (isSel(n) ? { ...n, vel: clamp(n.vel + Math.round((Math.random() - 0.5) * 24), 1, 127) } : n))
  }
}

/* ---------- 메뉴 구성 ---------- */
export type ActionId =
  | TrackOpId
  | 'cut' | 'copy' | 'paste' | 'dup' | 'del'
  | 'selSame' | 'selTrack' | 'selAll' | 'selNone'

export interface MenuItem { id: ActionId; icon: string; label: string; hint?: string; disabled?: boolean; danger?: boolean }
export interface MenuGroup { title: string; items: MenuItem[] }

export function menuGroups(o: { selected: number; hasClip: boolean; drumOnly: boolean; scaleOn: boolean; onNote: boolean }): MenuGroup[] {
  const has = o.selected > 0
  const g: MenuGroup[] = [
    {
      title: has ? `선택한 음표 ${o.selected}개` : '여기에서',
      items: [
        { id: 'cut', icon: '✂️', label: '잘라내기', hint: 'Ctrl+X', disabled: !has },
        { id: 'copy', icon: '⧉', label: '복사', hint: 'Ctrl+C', disabled: !has },
        { id: 'paste', icon: '📋', label: '여기에 붙여넣기', hint: 'Ctrl+V', disabled: !o.hasClip },
        { id: 'dup', icon: '➕', label: '바로 뒤에 복제', hint: 'Ctrl+D', disabled: !has },
        { id: 'del', icon: '🗑', label: '지우기', hint: 'Delete', disabled: !has, danger: true },
      ],
    },
  ]
  if (has) {
    g.push({
      title: '길이',
      items: [
        { id: 'double', icon: '↔️', label: '2배로 늘리기' },
        { id: 'half', icon: '⇤⇥', label: '반으로 줄이기' },
        { id: 'split', icon: '✂', label: '둘로 쪼개기' },
        { id: 'merge', icon: '🔗', label: '이어진 음 합치기' },
        { id: 'legato', icon: '〰️', label: '다음 음까지 이어 붙이기' },
      ],
    })
    if (!o.drumOnly)
      g.push({
        title: '음 높이 (전조)',
        items: [
          { id: 'octUp', icon: '⏫', label: '한 옥타브 위로' },
          { id: 'octDown', icon: '⏬', label: '한 옥타브 아래로' },
          { id: 'semiUp', icon: '♯', label: '반음 위로' },
          { id: 'semiDown', icon: '♭', label: '반음 아래로' },
          { id: 'toScale', icon: '🎼', label: '음계에 맞추기', disabled: !o.scaleOn },
        ],
      })
    g.push({
      title: '정리',
      items: [
        { id: 'quantize', icon: '▦', label: '칸에 딱 맞추기' },
        { id: 'louder', icon: '🔊', label: '세게' },
        { id: 'softer', icon: '🔈', label: '약하게' },
        { id: 'humanize', icon: '🎲', label: '사람처럼 (세기 흔들기)' },
      ],
    })
  }
  g.push({
    title: '선택',
    items: [
      ...(has && !o.drumOnly ? [{ id: 'selSame' as const, icon: '🎯', label: '같은 음 모두 고르기' }] : []),
      { id: 'selTrack', icon: '🎹', label: '이 트랙 전체 고르기' },
      { id: 'selAll', icon: '▣', label: '보이는 음표 전부 고르기', hint: 'Ctrl+A' },
      { id: 'selNone', icon: '⛔', label: '선택 풀기', hint: 'Esc', disabled: !has },
    ],
  })
  return g
}
