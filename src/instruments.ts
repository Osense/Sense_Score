import { pitchLabel } from './music'

export interface Instrument {
  /** General MIDI 번호(0부터) */
  program: number
  name: string
  icon: string
  /** 이 악기가 낼 수 있는 가장 낮은/높은 음 (MIDI 번호) */
  low: number
  high: number
  hint: string
}

/** 소리가 서로 크게 다른 대표 악기만 남겼다. 음역은 실제 악기가 낼 수 있는 범위를 따른다. */
export const INSTRUMENTS: Instrument[] = [
  { program: 0, name: '피아노', icon: '🎹', low: 21, high: 108, hint: '가장 넓은 음역을 가진 악기' },
  { program: 4, name: '전자 피아노', icon: '🎹', low: 28, high: 100, hint: '말랑하고 따뜻한 건반' },
  { program: 19, name: '오르간', icon: '⛪', low: 36, high: 96, hint: '길게 끄는 풍성한 소리' },
  { program: 24, name: '기타', icon: '🎸', low: 40, high: 88, hint: '튕겨서 소리 내는 현악기' },
  { program: 33, name: '베이스', icon: '🪕', low: 28, high: 67, hint: '낮은 음으로 바닥을 받쳐요' },
  { program: 40, name: '바이올린', icon: '🎻', low: 55, high: 100, hint: '노래하는 듯한 높은 현악기' },
  { program: 48, name: '현악 합주', icon: '🎻', low: 36, high: 96, hint: '여러 현악기가 함께 내는 소리' },
  { program: 56, name: '트럼펫', icon: '🎺', low: 55, high: 84, hint: '밝고 힘찬 금관악기' },
  { program: 73, name: '플루트', icon: '🪈', low: 60, high: 96, hint: '맑고 가벼운 관악기' },
  { program: 80, name: '신스', icon: '🎛️', low: 24, high: 108, hint: '전자음 소리' },
]

/** 목록에 없는 악기(불러온 MIDI 등)는 넓게 허용한다 */
const OTHER = { low: 12, high: 108 }

export const instrumentOf = (program: number) => INSTRUMENTS.find((i) => i.program === program)
export const rangeOf = (program: number): { low: number; high: number } => instrumentOf(program) ?? OTHER
export const rangeLabel = (r: { low: number; high: number }) => `${pitchLabel(r.low)} ~ ${pitchLabel(r.high)}`

/** 음 하나를 옥타브 단위로 옮겨 음역 안에 넣는다 (음역이 한 옥타브보다 좁으면 가장자리로 맞춤) */
export function fitPitch(pitch: number, low: number, high: number): number {
  let p = pitch
  while (p < low && p + 12 <= high) p += 12
  while (p > high && p - 12 >= low) p -= 12
  return Math.min(high, Math.max(low, p))
}

/** 화음처럼 함께 움직여야 하는 음들을 같은 옥타브만큼 옮겨 음역 안에 넣는다 */
export function fitGroup(pitches: number[], low: number, high: number): number[] {
  let d = 0
  const lo = () => Math.min(...pitches) + d
  const hi = () => Math.max(...pitches) + d
  while (lo() < low && hi() + 12 <= high) d += 12
  while (hi() > high && lo() - 12 >= low) d -= 12
  return pitches.map((p) => Math.min(high, Math.max(low, p + d)))
}
