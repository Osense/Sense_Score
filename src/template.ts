import { namesFor } from './sections'
import { defaultSettings, newTrack } from './storage'
import type { ScaleType, Settings, Song, Track } from './types'

/** 시작 마법사에서 묻는 것들. 곡의 구성(파트)과 코드·드럼·베이스 뼈대는 ‘구성’ 탭에서 정한다. */
export interface Answers {
  title: string
  bpm: number
  beats: number
  scaleType: ScaleType
  root: number
  melody: boolean
  chords: boolean
  bass: boolean
  drums: boolean
}

export const defaultAnswers = (): Answers => ({
  title: '',
  bpm: 100,
  beats: 4,
  scaleType: 'major',
  root: 0,
  melody: true,
  chords: true,
  bass: true,
  drums: true,
})

/** 대답에 맞춰 빈 곡(트랙과 8마디 한 덩어리 파트)을 만든다 */
export function buildTemplate(a: Answers): { song: Song; settings: Settings } {
  const want: { key: 'melody' | 'chords' | 'bass' | 'drums'; name: string; program: number; vol: number }[] = [
    { key: 'melody', name: '멜로디', program: 0, vol: 0.85 },
    { key: 'chords', name: '코드 반주', program: 48, vol: 0.5 },
    { key: 'bass', name: '베이스', program: 33, vol: 0.65 },
    { key: 'drums', name: '드럼', program: 0, vol: 0.7 },
  ]
  const picked = want.filter((w) => a[w.key])
  if (!picked.length) picked.push(want[0])

  const tracks: Track[] = picked.map((w, i) => ({
    ...newTrack(i, w.key === 'drums'),
    name: w.name,
    program: w.program,
    volume: w.vol,
    role: w.key,
  }))
  const sections = namesFor([['free', 8, '전체']])
  const song: Song = { title: a.title.trim() || '새 곡', bpm: a.bpm, beatsPerBar: a.beats, bars: 8, sections, tracks }
  const settings: Settings = { ...defaultSettings(song), scaleRoot: a.root, scaleType: a.scaleType }
  return { song, settings }
}
