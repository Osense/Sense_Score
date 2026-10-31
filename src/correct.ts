import { nearestInScale } from './editActions'
import { PPQ, type Note, type ScaleType } from './types'

/** 연주 보정 설정: 서툴게 친 타이밍·음·길이·세기를 다듬는다 */
export interface Correction {
  /** 박자 칸(tick). 0이면 타이밍은 그대로 */
  grid: number
  /** 칸에 얼마나 딱 맞출지 0(안 맞춤)~1(완전히) */
  strength: number
  /** 음 길이도 칸에 맞춘다 */
  lenGrid: boolean
  /** 음계 밖의 음을 가장 가까운 음계 안의 음으로 */
  toScale: boolean
  /** 세기를 고르게 0~1 */
  smooth: number
  /** 실수로 스친 아주 짧은 음 지우기 */
  clean: boolean
  /** 소리 지연 보정(ms). 양수면 음표를 뒤로, 음수면 앞으로 옮긴다 */
  offsetMs: number
}

export interface CorrectEnv {
  bpm: number
  speed: number
  scaleRoot: number
  scaleType: ScaleType | 'none'
  low: number
  high: number
}

export const PRESETS: { id: string; name: string; desc: string; c: Correction }[] = [
  { id: 'raw', name: '원본 그대로', desc: '친 그대로 기록해요', c: { grid: 0, strength: 0, lenGrid: false, toScale: false, smooth: 0, clean: false, offsetMs: 0 } },
  { id: 'light', name: '살짝 보정', desc: '타이밍을 60%만 맞추고 실수 음만 지워요', c: { grid: PPQ / 4, strength: 0.6, lenGrid: false, toScale: false, smooth: 0.3, clean: true, offsetMs: 0 } },
  { id: 'clean', name: '깔끔하게 (추천)', desc: '16분음표 칸에 맞추고 음계 밖 음도 바로잡아요', c: { grid: PPQ / 4, strength: 1, lenGrid: true, toScale: true, smooth: 0.5, clean: true, offsetMs: 0 } },
  { id: 'strict', name: '완벽 정렬', desc: '8분음표 칸에 딱 맞춰서 기계처럼 정확하게', c: { grid: PPQ / 2, strength: 1, lenGrid: true, toScale: true, smooth: 0.7, clean: true, offsetMs: 0 } },
]

export const DEFAULT_CORRECTION = PRESETS[2].c

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** 녹음한 음표들을 보정한다 (id는 그대로 유지) */
export function correctTake(raw: Note[], c: Correction, env: CorrectEnv): Note[] {
  const ticksPerMs = (env.bpm * env.speed * PPQ) / 60 / 1000
  let notes = raw.map((n) => ({ ...n }))

  // 1) 소리 지연 보정
  if (c.offsetMs) notes = notes.map((n) => ({ ...n, start: Math.max(0, n.start + c.offsetMs * ticksPerMs) }))

  // 2) 실수로 스친 아주 짧은 음 지우기
  if (c.clean) notes = notes.filter((n) => n.dur >= 40)

  // 3) 음계 안으로
  if (c.toScale && env.scaleType !== 'none')
    notes = notes.map((n) => ({ ...n, pitch: nearestInScale(n.pitch, env.scaleRoot, env.scaleType, env.low, env.high) }))

  // 4) 타이밍 맞추기 (강도만큼)
  if (c.grid && c.strength > 0)
    notes = notes.map((n) => {
      const target = Math.round(n.start / c.grid) * c.grid
      return { ...n, start: Math.max(0, n.start + (target - n.start) * c.strength) }
    })

  // 5) 길이 맞추기
  if (c.lenGrid && c.grid) notes = notes.map((n) => ({ ...n, dur: Math.max(c.grid, Math.round(n.dur / c.grid) * c.grid) }))

  // 6) 같은 음이 겹치면 앞 음을 뒤 음 시작에서 끊고, 완전히 같은 자리는 하나로
  notes.sort((a, b) => a.pitch - b.pitch || a.start - b.start)
  const merged: Note[] = []
  for (const n of notes) {
    const prev = merged[merged.length - 1]
    if (prev && prev.pitch === n.pitch) {
      if (Math.abs(prev.start - n.start) < 1) {
        prev.dur = Math.max(prev.dur, n.dur)
        prev.vel = Math.max(prev.vel, n.vel)
        continue
      }
      if (prev.start + prev.dur > n.start) prev.dur = Math.max(30, n.start - prev.start)
    }
    merged.push(n)
  }
  notes = merged.sort((a, b) => a.start - b.start || a.pitch - b.pitch)

  // 7) 세기 고르게: 평균 쪽으로 모은다
  if (c.smooth > 0 && notes.length > 1) {
    const mean = notes.reduce((s, n) => s + n.vel, 0) / notes.length
    notes = notes.map((n) => ({ ...n, vel: clamp(Math.round(mean + (n.vel - mean) * (1 - c.smooth)), 1, 127) }))
  }
  return notes.map((n) => ({ ...n, start: Math.round(n.start), dur: Math.round(n.dur) }))
}
