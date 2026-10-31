import { uid, type Note } from './types'

/**
 * 건반을 치는 대로 음표를 기록한다.
 * clock()은 ‘지금이 곡의 몇 tick인지’를 돌려주는 함수 (재생 위치 기준).
 */
export class Recorder {
  active = false
  startTick = 0
  private clock: () => number
  private open = new Map<number, { start: number; vel: number }>()
  private done: Note[] = []

  constructor(clock: () => number) {
    this.clock = clock
  }

  begin(startTick: number) {
    this.active = true
    this.startTick = startTick
    this.open.clear()
    this.done = []
  }

  noteOn(pitch: number, vel: number) {
    if (!this.active) return
    const t = this.clock()
    if (t < this.startTick - 1) return // 먼저 세기(카운트 인) 동안은 기록하지 않는다
    this.open.set(pitch, { start: Math.max(this.startTick, t), vel })
  }

  noteOff(pitch: number) {
    const o = this.open.get(pitch)
    if (!o) return
    this.open.delete(pitch)
    this.close(pitch, o, this.clock())
  }

  private close(pitch: number, o: { start: number; vel: number }, end: number) {
    // 반복 구간이 한 바퀴 돌아서 끝 시각이 시작보다 앞서면 짧은 음으로 둔다
    const len = end >= o.start ? end - o.start : 120
    this.done.push({ id: uid(), pitch, start: Math.round(o.start), dur: Math.max(30, Math.round(len)), vel: o.vel })
  }

  /** 녹음을 끝낸다. 아직 누르고 있는 음은 지금 시각에서 끊는다. */
  finish(): Note[] {
    if (!this.active) return []
    const t = this.clock()
    for (const [p, o] of this.open) this.close(p, o, t)
    this.open.clear()
    this.active = false
    return this.done
  }

  /** 화면에 실시간으로 보여 줄 음표 (누르고 있는 음 포함) */
  snapshot(): Note[] {
    if (!this.active) return []
    const t = this.clock()
    const live = [...this.open].map(([pitch, o]) => ({ id: `live${pitch}`, pitch, start: o.start, dur: Math.max(30, t - o.start), vel: o.vel }))
    return [...this.done, ...live]
  }
}

/** 박자에 맞추기: 시작과 길이를 grid 칸에 맞춘다 (grid=0이면 그대로) */
export function quantizeNotes(notes: Note[], grid: number): Note[] {
  if (!grid) return notes
  return notes.map((n) => ({
    ...n,
    start: Math.max(0, Math.round(n.start / grid) * grid),
    dur: Math.max(grid, Math.round(n.dur / grid) * grid),
  }))
}
