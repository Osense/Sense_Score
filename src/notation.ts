import { PPQ, type Note } from './types'

export type StaffKind = 'treble' | 'bass' | 'perc'

/** 악보에 실제로 찍히는 음표 하나(정식 음표값). 긴 음이나 마디를 넘는 음은 여러 개로 나뉘어 붙임줄로 이어진다. */
export interface Seg {
  note: Note
  start: number
  end: number
  staff: StaffKind
  tieIn: boolean
  tieOut: boolean
}

export interface Rest {
  start: number
  /** 쉼표 길이 (정식 값). 한 마디 전체 쉼표면 마디 길이 */
  dur: number
  staff: StaffKind
  /** 한 마디 전체를 쉬는 온쉼표 */
  bar: boolean
}

export interface Engraved {
  segs: Seg[]
  rests: Rest[]
}

/** 정식 음표값(tick): 온, 점2분, 2분, 점4분, 4분, 점8분, 8분, 점16분, 16분, 32분 */
const STD = [1920, 1440, 960, 720, 480, 360, 240, 180, 120, 60]
const DOTTED = new Set([1440, 720, 360, 180])
const REST_STD = [1920, 960, 480, 240, 120, 60]

/**
 * [start,end) 를 정식 음표값으로 쪼갠다.
 * - 마디선을 넘지 않는다.
 * - 박(4분음표) 중간에서 시작하면 다음 박을 넘지 않는다. (보기 쉬운 표기)
 * - 점음표는 박에서 시작할 때만 쓴다.
 */
export function splitNote(start: number, end: number, barTicks: number): [number, number][] {
  const out: [number, number][] = []
  let p = start
  while (p < end) {
    const bar0 = Math.floor(p / barTicks) * barTicks
    const stop = Math.min(end, bar0 + barTicks)
    const pr = p - bar0
    const onBeat = pr % PPQ === 0
    const beatEnd = p - (pr % PPQ) + PPQ
    const half = barTicks % (2 * PPQ) === 0 ? barTicks / 2 : 0
    let len = 0
    for (const L of STD) {
      if (L > stop - p) continue
      const dotted = DOTTED.has(L)
      if (pr % (dotted ? (L * 2) / 3 : L) !== 0) continue
      if (dotted && !onBeat) continue
      if (!onBeat && p + L > beatEnd) continue
      // 한 박보다 긴 음은 마디 가운데(4/4의 셋째 박)를 넘지 않게 나눈다. 마디 처음에서 시작하는 음은 예외
      if (pr !== 0 && L > PPQ && half > 0 && pr < half && pr + L > half) continue
      len = L
      break
    }
    if (!len) len = Math.min(60, stop - p)
    out.push([p, p + len])
    p += len
  }
  return out
}

/** 쉬는 구간 [g0,g1) 를 쉼표로 채운다 (같은 마디 안). 점쉼표는 쓰지 않는다. */
export function restPieces(g0: number, g1: number, barTicks: number): { start: number; dur: number; bar: boolean }[] {
  if (g0 % barTicks === 0 && g1 - g0 === barTicks) return [{ start: g0, dur: barTicks, bar: true }]
  const out: { start: number; dur: number; bar: boolean }[] = []
  let p = g0
  while (p < g1) {
    const pr = p % barTicks
    let len = 60
    for (const L of REST_STD) {
      if (L <= g1 - p && pr % L === 0) {
        len = L
        break
      }
    }
    out.push({ start: p, dur: len, bar: false })
    p += len
  }
  return out
}

interface Options {
  barTicks: number
  bars: number
  drum: boolean
  staffOf: (n: Note) => StaffKind
}

/** 한 트랙의 음표들을 악보용으로 정리한다: 음표값 맞추기 + 마디/박 기준 쪼개기 + 붙임줄 + 쉼표 채우기 */
export function engrave(notes: Note[], o: Options): Engraved {
  if (!notes.length) return { segs: [], rests: [] }

  // 기본은 16분음표 칸. 16분 칸에서 많이 벗어난 시작이 있으면 32분 칸으로 본다.
  const onGrid = notes.every((n) => Math.abs(n.start - Math.round(n.start / 120) * 120) <= 30)
  const q = onGrid ? 120 : 60
  const qs = (n: Note) => Math.max(0, Math.round(n.start / q) * q)

  // 드럼은 소리 길이가 아니라 ‘다음 소리까지’(최대 한 박)를 음표값으로 쓴다
  const onsets = o.drum ? [...new Set(notes.map(qs))].sort((a, b) => a - b) : []
  const written = (n: Note) => {
    const s = qs(n)
    if (o.drum) {
      const next = onsets.find((t) => t > s)
      return Math.max(q, Math.min(PPQ, next === undefined ? PPQ : next - s))
    }
    return Math.max(q, Math.round((n.start + n.dur) / q) * q - s)
  }

  const segs: Seg[] = []
  for (const n of notes) {
    const s = qs(n)
    const parts = splitNote(s, s + written(n), o.barTicks)
    parts.forEach(([a, b], i) =>
      segs.push({ note: n, start: a, end: b, staff: o.staffOf(n), tieIn: i > 0, tieOut: i < parts.length - 1 }),
    )
  }
  segs.sort((a, b) => a.start - b.start)

  // 쉼표: 오선(높은음/낮은음)별로, 그 오선에서 아무 소리도 나지 않는 구간
  const count = new Map<StaffKind, number>()
  for (const s of segs) count.set(s.staff, (count.get(s.staff) ?? 0) + 1)
  const primary = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]

  const rests: Rest[] = []
  for (const staff of count.keys()) {
    const mine = segs.filter((s) => s.staff === staff)
    // 많이 쓰는 오선은 곡 처음부터 끝까지, 가끔 쓰는 오선은 처음 음~마지막 음 마디 사이만 쉼표를 채운다
    const first = Math.floor(mine[0].start / o.barTicks)
    const last = Math.floor((mine[mine.length - 1].end - 1) / o.barTicks)
    const from = staff === primary ? 0 : first
    const to = staff === primary ? o.bars - 1 : last
    for (let bar = from; bar <= to; bar++) {
      const b0 = bar * o.barTicks
      const b1 = b0 + o.barTicks
      let cursor = b0
      for (const s of mine) {
        if (s.end <= b0 || s.start >= b1) continue
        if (s.start > cursor) for (const r of restPieces(cursor, s.start, o.barTicks)) rests.push({ ...r, staff })
        cursor = Math.max(cursor, Math.min(s.end, b1))
      }
      if (cursor < b1) for (const r of restPieces(cursor, b1, o.barTicks)) rests.push({ ...r, staff })
    }
  }
  return { segs, rests }
}
