export const PPQ = 480

export interface Note {
  id: string
  pitch: number // MIDI 0-127
  start: number // tick
  dur: number // tick
  vel: number // 1-127
}

/** 피치 벤드(음 끌어올리기·내리기) 한 점. 다음 점까지 이 값이 유지된다 */
export interface Bend {
  tick: number
  /** -1(아래 끝) ~ 0(원래 음) ~ 1(위 끝). 실제 반음 수 = value × Track.bendRange */
  value: number
}

export interface Track {
  id: string
  name: string
  program: number // GM 0-127
  drum: boolean
  volume: number // 0-1
  mute: boolean
  solo: boolean
  color: string
  /** 뼈대 세우기(코드·베이스·드럼)가 어느 트랙에 음표를 넣을지 */
  role?: 'melody' | 'chords' | 'bass' | 'drums'
  notes: Note[]
  /** 불러온 MIDI의 피치 벤드 (기타 초킹 등). 없으면 벤드 없음 */
  bends?: Bend[]
  /** 벤드 끝 값이 몇 반음인지 (MIDI 기본 2) */
  bendRange?: number
}

/** tick 위치에서 걸려 있는 벤드 값 */
export function bendAt(t: Track, tick: number): number {
  let v = 0
  for (const b of t.bends ?? []) {
    if (b.tick > tick) break
    v = b.value
  }
  return v
}

export type SectionKind = 'a' | 'b' | 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'interlude' | 'outro' | 'free'

/** 곡의 한 부분(파트). 마디 수로 길이를 정하고, 위에서 아래로 이어 붙인 것이 곡 전체다. */
export interface Section {
  id: string
  kind: SectionKind
  name: string
  bars: number
}

export interface Song {
  title: string
  bpm: number
  beatsPerBar: number
  bars: number
  sections: Section[]
  tracks: Track[]
}

export interface Settings {
  speed: number // 상대 템포 0.25-2
  loop: boolean
  loopStart: number // tick
  loopEnd: number // tick
  metronome: boolean
  countIn: boolean
  scaleRoot: number // 0-11
  scaleType: ScaleType | 'none'
  showKeyRoot: boolean
  showKeyScale: boolean
  showKeyChord: boolean
  snap: number // tick
  trainer: { on: boolean; from: number; to: number; step: number }
  scoreView: 'scroll' | 'page' // 악보 보기: 가로 스크롤 / 페이지
  scoreMulti: boolean // 모든 트랙을 한 악보에 겹쳐 보기
  scoreBars: 0 | 2 | 4 | 8 // 페이지 보기에서 한 줄 마디 수 (0=자동, 기본 4)
}

export type KeyHighlights = Pick<Settings, 'showKeyRoot' | 'showKeyScale' | 'showKeyChord'>

export type Tool = 'pen' | 'eraser' | 'hand' | 'select'

export type ScaleType = 'major' | 'minor' | 'pentatonic' | 'minorPent' | 'blues'

let seq = 0
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`
