import { L } from './i18n'
import { namesFor } from './sections'
import { defaultSettings, newTrack } from './storage'
import type { ScaleType, Settings, Song, Track } from './types'

/** 시작 인터뷰 1마당에서 묻는 것들. 곡의 모양(파트)과 반주는 2·3마당에서 정한다. */
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
  /** 오버드라이브 일렉 기타(파워 코드·팜 뮤트) */
  guitar?: boolean
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
  guitar: false,
})

/** 대답에 맞춰 빈 곡(트랙과 8마디 한 덩어리 파트)을 만든다 */
export function buildTemplate(a: Answers): { song: Song; settings: Settings } {
  const want: { key: 'melody' | 'chords' | 'bass' | 'drums' | 'guitar'; name: string; program: number; vol: number }[] = [
    { key: 'melody', name: L("멜로디"), program: 0, vol: 0.85 },
    { key: 'chords', name: L("코드 반주"), program: 48, vol: 0.5 },
    { key: 'bass', name: L("베이스"), program: 33, vol: 0.65 },
    { key: 'guitar', name: L("일렉 기타"), program: 29, vol: 0.5 },
    { key: 'drums', name: L("드럼"), program: 0, vol: 0.7 },
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
  const sections = namesFor([['free', 8, L("전체")]])
  const song: Song = { title: a.title.trim() || L("새 곡"), bpm: a.bpm, beatsPerBar: a.beats, bars: 8, sections, tracks }
  const settings: Settings = { ...defaultSettings(song), scaleRoot: a.root, scaleType: a.scaleType }
  return { song, settings }
}
