import { Midi } from '@tonejs/midi'
import { Player } from './engine/player'
import { PPQ, uid, type Bend, type Note, type Song, type Track } from './types'
import { TRACK_COLORS } from './music'
import { ceil4, normalizeSong } from './sections'

/* ---------- 글자 인코딩 ----------
 * MIDI 파일의 곡 이름·트랙 이름은 인코딩 정보 없이 바이트만 들어 있다.
 * 파서(@tonejs/midi)는 바이트 하나를 글자 하나로 읽으므로, 한글은 UTF-8 또는 CP949(EUC-KR)로 다시 읽어야 한다.
 */
const HANGUL_OR_CJK = /[\u3131-\u318e\uac00-\ud7a3\u3040-\u30ff\u4e00-\u9fff]/

export function decodeMidiText(raw: string | undefined): string {
  if (!raw) return ''
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0) & 0xff)
  const clean = (t: string) => t.replace(/\0/g, '').trim()
  if (bytes.every((b) => b < 0x80)) return clean(raw)
  try {
    return clean(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch { /* UTF-8이 아님 */ }
  for (const enc of ['euc-kr', 'shift_jis']) {
    try {
      const t = new TextDecoder(enc, { fatal: true }).decode(bytes)
      // 유럽 글자(é 등)가 우연히 한글처럼 읽히는 경우를 걸러 낸다
      if (HANGUL_OR_CJK.test(t)) return clean(t)
    } catch { /* 다음 인코딩 */ }
  }
  return clean(new TextDecoder('windows-1252').decode(bytes))
}

/** 저장할 때는 UTF-8 바이트로 적는다 (파일 작성기가 글자 하나를 바이트 하나로 쓰기 때문) */
const encodeMidiText = (text: string) => String.fromCharCode(...new TextEncoder().encode(text))

export function exportMidi(song: Song): Uint8Array<ArrayBuffer> {
  const midi = new Midi()
  midi.name = encodeMidiText(song.title)
  midi.header.setTempo(song.bpm)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [song.beatsPerBar, 4] })
  song.tracks.forEach((t, i) => {
    const tr = midi.addTrack()
    tr.name = encodeMidiText(t.name)
    tr.channel = Player.channelFor(song, i)
    tr.instrument.number = t.program
    tr.addCC({ number: 7, value: t.volume, ticks: 0 })
    if (t.bends?.length) {
      // 벤드 폭(RPN 0)을 먼저 알려 준다
      const range = Math.round(t.bendRange ?? 2)
      for (const [number, v] of [[101, 0], [100, 0], [6, range], [38, 0]] as const) tr.addCC({ number, value: v / 127, ticks: 0 })
      // @tonejs/midi는 저장할 때 값을 14비트로 바꾸지 않으므로 직접 바꿔서 넣는다 (-8192 ~ 8191)
      for (const b of t.bends) tr.addPitchBend({ ticks: b.tick, value: Math.max(-8192, Math.min(8191, Math.round(b.value * 8192))) })
    }
    for (const n of t.notes)
      tr.addNote({ midi: n.pitch, ticks: n.start, durationTicks: n.dur, velocity: n.vel / 127 })
  })
  return midi.toArray() as Uint8Array<ArrayBuffer>
}

type MidiTrack = Midi['tracks'][number]

/** 악기 계열 → 트랙 이름이 없을 때 쓸 한글 이름 */
const FAMILY_KO: Record<string, string> = {
  piano: '피아노', 'chromatic percussion': '건반 타악기', organ: '오르간', guitar: '기타', bass: '베이스',
  strings: '현악기', ensemble: '합주', brass: '금관', reed: '리드 악기', pipe: '관악기', 'synth lead': '신스 리드',
  'synth pad': '신스 패드', 'synth effects': '신스 효과', world: '민속 악기', percussive: '타악기', 'sound effects': '효과음',
}

const ccValue = (t: MidiTrack, n: number) => t.controlChanges[n]?.map((c) => ({ ticks: c.ticks, v: Math.round(c.value * 127) })) ?? []

/** 뱅크 선택으로 드럼 세트를 고른 트랙 (XG: 127, GM2: 120) — 10번 채널이 아니어도 드럼이다 */
const isDrumTrack = (t: MidiTrack) => t.instrument.percussion || ccValue(t, 0).some((c) => c.ticks === 0 && (c.v === 127 || c.v === 120))

/** RPN 0번(벤드 폭) 설정을 찾는다. 없으면 MIDI 기본값 2반음 */
function bendRangeOf(t: MidiTrack): number {
  const msb = ccValue(t, 101)
  const lsb = ccValue(t, 100)
  const data = ccValue(t, 6)
  for (const d of data) {
    const m = msb.filter((c) => c.ticks <= d.ticks).at(-1)
    const l = lsb.filter((c) => c.ticks <= d.ticks).at(-1)
    if (m?.v === 0 && l?.v === 0 && d.v > 0) return d.v
  }
  return 2
}

/** 서스테인 페달(CC64)을 밟은 동안 떼어진 음은 페달을 뗄 때까지 길게 늘인다 */
function applySustain(notes: Note[], t: MidiTrack, scale: number) {
  const ped = ccValue(t, 64).map((c) => ({ tick: Math.round(c.ticks * scale), down: c.v >= 64 }))
  if (!ped.some((p) => p.down)) return
  const byPitch = new Map<number, Note[]>()
  for (const n of notes) byPitch.set(n.pitch, [...(byPitch.get(n.pitch) ?? []), n])
  for (const list of byPitch.values()) list.sort((a, b) => a.start - b.start)
  for (const n of notes) {
    const end = n.start + n.dur
    const state = ped.filter((p) => p.tick <= end).at(-1)
    if (!state?.down) continue
    const up = ped.find((p) => p.tick > end && !p.down)?.tick ?? end
    const next = byPitch.get(n.pitch)!.find((m) => m.start > n.start)?.start ?? Infinity
    n.dur = Math.max(n.dur, Math.min(up, next) - n.start)
  }
}

export function importMidi(buf: ArrayBuffer, fileName: string): Song {
  const midi = new Midi(buf)
  const scale = PPQ / midi.header.ppq
  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? 120)
  const ts = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  // 박자는 분자를 박 수로 쓴다 (6/8 등은 8분음표 기준이 아니라 근사)
  const beatsPerBar = ts[1] === 8 ? Math.round(ts[0] / 2) || 3 : ts[0]
  const title = decodeMidiText(midi.name)
  let maxTick = 0
  let tracks: Track[] = []
  midi.tracks.forEach((t) => {
    if (t.notes.length === 0) return
    const drum = isDrumTrack(t)
    const notes: Note[] = t.notes.map((n) => ({
      id: uid(),
      pitch: n.midi,
      start: Math.round(n.ticks * scale),
      dur: Math.max(1, Math.round(n.durationTicks * scale)),
      vel: Math.max(1, Math.round(n.velocity * 127)),
    }))
    if (!drum) applySustain(notes, t, scale)
    for (const n of notes) maxTick = Math.max(maxTick, n.start + n.dur)
    let bends: Bend[] | undefined
    if (!drum && t.pitchBends.some((b) => Math.abs(b.value) > 0.001)) {
      bends = []
      for (const b of t.pitchBends) {
        const value = Math.max(-1, Math.min(1, b.value))
        const tick = Math.round(b.ticks * scale)
        const last = bends.at(-1)
        if (last && last.tick === tick) last.value = value
        else if (!last || last.value !== value) bends.push({ tick, value })
      }
    }
    const vol = ccValue(t, 7).find((c) => c.ticks <= (t.notes[0]?.ticks ?? 0))?.v
    const fallback = drum ? '드럼' : FAMILY_KO[t.instrument.family] ?? t.instrument.name
    // 한 트랙짜리(포맷 0) 파일은 곡 이름이 첫 트랙 이름에도 붙어 나온다 → 악기 이름을 쓴다
    const own = decodeMidiText(t.name)
    const name = own && !(own === title && midi.tracks.filter((x) => x.notes.length).length > 1) ? own : fallback
    tracks.push({
      id: uid(),
      name: name || `트랙 ${tracks.length + 1}`,
      program: t.instrument.number, // 드럼이면 드럼 세트 번호
      drum,
      volume: vol !== undefined ? Math.max(0.05, vol / 127) : 0.8,
      mute: false,
      solo: false,
      color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
      notes,
      ...(bends ? { bends, bendRange: bendRangeOf(t) } : {}),
    })
  })
  // 트랙은 16개까지. 넘으면 같은 악기끼리 합친다 (드럼끼리, 같은 악기 번호끼리)
  if (tracks.length > 16) {
    const merged = new Map<string, Track>()
    for (const t of tracks) {
      const key = t.drum ? 'drum' : String(t.program)
      const m = merged.get(key)
      if (m) m.notes.push(...t.notes)
      else merged.set(key, { ...t, notes: [...t.notes] })
    }
    tracks = [...merged.values()].sort((a, b) => b.notes.length - a.notes.length).slice(0, 16)
  }
  tracks.forEach((t, i) => (t.color = TRACK_COLORS[i % TRACK_COLORS.length]))
  const bars = ceil4(Math.ceil(maxTick / (beatsPerBar * PPQ)))
  return normalizeSong({
    title: title || fileName.replace(/\.midi?$/i, ''),
    bpm,
    beatsPerBar,
    bars,
    sections: [],
    tracks,
  })
}
