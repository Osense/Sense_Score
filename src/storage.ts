import { PPQ, uid, type Settings, type Song } from './types'
import { namesFor, normalizeSong } from './sections'
import { TRACK_COLORS } from './music'

const KEY = 'composing-sense:v1'
const SNAP16_FLAG = 'composing-sense:snap16'

export function newTrack(index: number, drum = false) {
  return {
    id: uid(),
    name: drum ? '드럼' : `트랙 ${index + 1}`,
    program: drum ? 0 : 0,
    drum,
    volume: 0.8,
    mute: false,
    solo: false,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    notes: [],
  }
}

export const defaultSong = (): Song => ({
  title: '내 첫 곡',
  bpm: 100,
  beatsPerBar: 4,
  bars: 8,
  sections: namesFor([['free', 8]]),
  tracks: [newTrack(0)],
})

export const defaultSettings = (song: Song): Settings => ({
  speed: 1,
  loop: false,
  loopStart: 0,
  loopEnd: song.bars * song.beatsPerBar * PPQ,
  metronome: false,
  countIn: false,
  scaleRoot: 0,
  scaleType: 'none',
  snap: PPQ / 4, // 16분음표
  trainer: { on: false, from: 60, to: 100, step: 5 },
  scoreView: 'scroll',
  scoreMulti: false,
  scoreBars: 0,
})

export function loadSaved(): { song: Song; settings: Settings } | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.song?.tracks?.length) return null
    const settings = { ...defaultSettings(data.song), ...data.settings }
    // 예전 기본값(8분음표)으로 저장된 설정은 한 번만 16분음표로 올려 준다
    if (!localStorage.getItem(SNAP16_FLAG)) {
      if (settings.snap > PPQ / 4) settings.snap = PPQ / 4
      localStorage.setItem(SNAP16_FLAG, '1')
    }
    return { song: normalizeSong(data.song), settings }
  } catch {
    return null
  }
}

export function save(song: Song, settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ song, settings }))
    return true
  } catch {
    return false
  }
}
