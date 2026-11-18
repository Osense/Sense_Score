import { Midi } from '@tonejs/midi'
import { exportMidi, importMidi } from '../midi'
import { normalizeSong } from '../sections'
import { defaultSettings } from '../storage'
import type { PartPlan } from '../scaffold'
import { PPQ, uid, type Note, type Settings, type Song, type Track } from '../types'

/* ======================================================================
   프로젝트 파일 = 표준 MIDI 파일(.mid) 하나.
   - 음표 · 템포 · 박자 · 악기 · 음량 · 피치 벤드는 보통 MIDI 그대로 → GarageBand · MuseScore 등에서도 열린다.
   - 쎈스 컴포즈만 아는 정보(파트 구성, 반주 메뉴판 선택, 트랙 색 · 역할, 음계 등 설정)는
     첫 트랙의 텍스트 메타 이벤트 하나에 "sense-compose:<버전>:" + deflate + base64url로 넣는다.
     다른 프로그램은 이 이벤트를 무시하고, 다시 불러올 때 그대로 남는다(직접 확인함).
   - 다른 프로그램에서 고친 파일을 다시 열면: 음표는 MIDI 쪽을 믿고, 트랙 수가 같을 때만 메타 정보를 덧씌운다.
   ====================================================================== */

export const PROJECT_FORMAT = 1
const TAG = `sense-compose:${PROJECT_FORMAT}:`

export interface Project {
  song: Song
  settings: Settings
  plans: Record<string, PartPlan>
}

/** MIDI에 없는 정보 */
interface Extra {
  v: number
  id?: string
  title: string
  bars: number
  sections: Song['sections']
  tracks: Pick<Track, 'id' | 'name' | 'color' | 'role' | 'mute' | 'solo' | 'volume' | 'bendRange' | 'drum'>[]
  settings: Settings
  plans: Record<string, PartPlan>
  savedAt: string
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}
const toB64 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

/** 프로젝트 → .mid 바이트 */
export async function encodeProject(p: Project): Promise<Uint8Array> {
  const extra: Extra = {
    v: PROJECT_FORMAT,
    id: p.song.id,
    title: p.song.title,
    bars: p.song.bars,
    sections: p.song.sections,
    tracks: p.song.tracks.map(({ id, name, color, role, mute, solo, volume, bendRange, drum }) => ({ id, name, color, role, mute, solo, volume, bendRange, drum })),
    settings: p.settings,
    plans: p.plans,
    savedAt: new Date().toISOString(),
  }
  const packed = toB64(await pipe(new TextEncoder().encode(JSON.stringify(extra)), new CompressionStream('deflate-raw')))
  // 한 번에 써야 한다: @tonejs/midi로 다시 읽어 쓰면 피치 벤드 값이 사라진다(14비트 변환 문제)
  return exportMidi(p.song, TAG + packed)
}

async function readExtra(midi: Midi): Promise<Extra | null> {
  const m = midi.header.meta.find((x) => x.type === 'text' && x.text.startsWith('sense-compose:'))
  if (!m) return null
  const [, ver, body] = m.text.match(/^sense-compose:(\d+):(.*)$/s) ?? []
  if (!body || +ver > PROJECT_FORMAT) return null // 더 새 버전이 만든 파일: 음표만 읽는다
  try {
    return JSON.parse(new TextDecoder().decode(await pipe(fromB64(body), new DecompressionStream('deflate-raw')))) as Extra
  } catch {
    return null
  }
}

/** .mid 바이트 → 프로젝트. 쎈스 컴포즈 정보가 없거나 맞지 않으면 보통 MIDI처럼 불러온다 */
export async function decodeProject(bytes: Uint8Array, fileName = 'project.mid'): Promise<Project & { restored: boolean }> {
  const buf = bytes.slice().buffer
  const midi = new Midi(buf)
  const extra = await readExtra(midi)
  if (!extra || extra.tracks.length !== midi.tracks.length) {
    const song = importMidi(buf, fileName)
    return { song, settings: defaultSettings(song), plans: {}, restored: false }
  }
  const scale = PPQ / midi.header.ppq
  const tracks: Track[] = midi.tracks.map((t, i) => {
    const x = extra.tracks[i]
    const notes: Note[] = t.notes.map((n) => ({
      id: uid(), pitch: n.midi, start: Math.round(n.ticks * scale), dur: Math.max(1, Math.round(n.durationTicks * scale)), vel: Math.max(1, Math.round(n.velocity * 127)),
    }))
    // @tonejs/midi는 읽을 때 벤드 값을 -1~1로 준다
    const bends = t.pitchBends.some((b) => Math.abs(b.value) > 0.001) ? t.pitchBends.map((b) => ({ tick: Math.round(b.ticks * scale), value: Math.max(-1, Math.min(1, b.value)) })) : undefined
    return {
      id: x.id || uid(), name: x.name, color: x.color, role: x.role, mute: x.mute, solo: x.solo, volume: x.volume, drum: x.drum,
      program: t.instrument.number, notes, ...(bends ? { bends, bendRange: x.bendRange ?? 2 } : {}),
    }
  })
  const song = normalizeSong({
    id: extra.id, title: extra.title, bpm: Math.round(midi.header.tempos[0]?.bpm ?? 120),
    beatsPerBar: midi.header.timeSignatures[0]?.timeSignature[0] ?? 4, bars: extra.bars, sections: extra.sections, tracks,
  })
  return { song, settings: { ...defaultSettings(song), ...extra.settings }, plans: extra.plans ?? {}, restored: true }
}
