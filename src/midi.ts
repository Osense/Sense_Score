import { Midi } from '@tonejs/midi'
import { Player } from './engine/player'
import { PPQ, uid, type Song, type Track } from './types'
import { TRACK_COLORS } from './music'
import { ceil4, normalizeSong } from './sections'

export function exportMidi(song: Song): Uint8Array<ArrayBuffer> {
  const midi = new Midi()
  midi.name = song.title
  midi.header.setTempo(song.bpm)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [song.beatsPerBar, 4] })
  song.tracks.forEach((t, i) => {
    const tr = midi.addTrack()
    tr.name = t.name
    tr.channel = Player.channelFor(song, i)
    tr.instrument.number = t.program
    for (const n of t.notes)
      tr.addNote({ midi: n.pitch, ticks: n.start, durationTicks: n.dur, velocity: n.vel / 127 })
  })
  return midi.toArray() as Uint8Array<ArrayBuffer>
}

export function importMidi(buf: ArrayBuffer, fileName: string): Song {
  const midi = new Midi(buf)
  const scale = PPQ / midi.header.ppq
  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? 120)
  const ts = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  // 박자는 분자를 박 수로 쓴다 (6/8 등은 8분음표 기준이 아니라 근사)
  const beatsPerBar = ts[1] === 8 ? Math.round(ts[0] / 2) || 3 : ts[0]
  let maxTick = 0
  const tracks: Track[] = []
  midi.tracks.forEach((t) => {
    if (t.notes.length === 0) return
    const notes = t.notes.map((n) => {
      const start = Math.round(n.ticks * scale)
      const dur = Math.max(1, Math.round(n.durationTicks * scale))
      maxTick = Math.max(maxTick, start + dur)
      return { id: uid(), pitch: n.midi, start, dur, vel: Math.max(1, Math.round(n.velocity * 127)) }
    })
    tracks.push({
      id: uid(),
      name: t.name || t.instrument.name || `트랙 ${tracks.length + 1}`,
      program: t.instrument.percussion ? 0 : t.instrument.number,
      drum: t.instrument.percussion,
      volume: 0.8,
      mute: false,
      solo: false,
      color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
      notes,
    })
  })
  const bars = ceil4(Math.ceil(maxTick / (beatsPerBar * PPQ)))
  return normalizeSong({
    title: midi.name || fileName.replace(/\.midi?$/i, ''),
    bpm,
    beatsPerBar,
    bars,
    sections: [],
    tracks: tracks.slice(0, 16),
  })
}
