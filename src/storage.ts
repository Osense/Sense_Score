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
      try { localStorage.setItem(SNAP16_FLAG, '1') } catch { /* Read-only storage can still restore a song. */ }
    }
    return { song: normalizeSong(data.song), settings }
  } catch {
    return null
  }
}

/** Validate backups before replacing the current project. No network is involved. */
export function parseProject(raw: string): { song: Song; settings: Settings } {
  const data = JSON.parse(raw)
  const s = data?.song
  const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  const integer = (v: unknown, min: number, max: number) => num(v, min, max) && Number.isInteger(v)
  const kinds = ['a', 'b', 'intro', 'verse', 'prechorus', 'chorus', 'bridge', 'interlude', 'outro', 'free']
  if (data?.format !== 'sense-score' || data.version !== 1 || !s || typeof s.title !== 'string' ||
    !num(s.bpm, 20, 400) || !integer(s.beatsPerBar, 1, 16) || !integer(s.bars, 1, 256) ||
    !Array.isArray(s.sections) || !s.sections.length || !Array.isArray(s.tracks) || !s.tracks.length) throw new Error('Invalid project')
  const ids = new Set<string>()
  const validId = (id: unknown) => {
    if (typeof id !== 'string' || !id || ids.has(id)) return false
    ids.add(id)
    return true
  }
  for (const sec of s.sections) {
    if (!sec || !validId(sec.id) || typeof sec.name !== 'string' || !kinds.includes(sec.kind) || !integer(sec.bars, 1, 256)) throw new Error('Invalid section')
  }
  if (s.sections.reduce((n: number, sec: { bars: number }) => n + sec.bars, 0) !== s.bars) throw new Error('Invalid length')
  for (const track of s.tracks) {
    if (!track || !validId(track.id) || typeof track.name !== 'string' || !integer(track.program, 0, 127) ||
      typeof track.drum !== 'boolean' || typeof track.mute !== 'boolean' || typeof track.solo !== 'boolean' ||
      !num(track.volume, 0, 1) || typeof track.color !== 'string' || !Array.isArray(track.notes)) throw new Error('Invalid track')
    for (const note of track.notes) {
      if (!note || !validId(note.id) || !integer(note.pitch, 0, 127) || !num(note.start, 0, s.bars * s.beatsPerBar * PPQ) ||
        !num(note.dur, 1, s.bars * s.beatsPerBar * PPQ) || !num(note.vel, 1, 127)) throw new Error('Invalid note')
    }
  }
  const st = { ...defaultSettings(s), ...data.settings }
  if (!num(st.speed, 0.25, 2) || !num(st.snap, 1, PPQ * 4) || !integer(st.scaleRoot, 0, 11) ||
    !['none', 'major', 'minor', 'pentatonic', 'minorPent', 'blues'].includes(st.scaleType) ||
    !['scroll', 'page'].includes(st.scoreView) || ![0, 2, 4, 8].includes(st.scoreBars) ||
    !num(st.loopStart, 0, 256 * 16 * PPQ) || !num(st.loopEnd, 0, 256 * 16 * PPQ) ||
    !['loop', 'metronome', 'countIn', 'scoreMulti'].every((k) => typeof st[k] === 'boolean') ||
    !st.trainer || typeof st.trainer.on !== 'boolean' || !num(st.trainer.from, 20, 400) ||
    !num(st.trainer.to, 20, 400) || !num(st.trainer.step, 1, 100)) throw new Error('Invalid settings')
  return { song: normalizeSong(s), settings: st }
}

export function save(song: Song, settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ song, settings }))
    return true
  } catch {
    return false
  }
}
