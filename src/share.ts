import { normalizeSong } from './sections'
import { uid, type ScaleType, type SectionKind, type Settings, type Song } from './types'

/** 곡을 짧은 글자열로 줄여 링크(#s=…)로 나눌 수 있게 한다. 서버 없이 링크 안에 곡이 통째로 들어 있다. */
interface Packed {
  v: 1
  t: string
  b: number
  m: number
  sc: [number, ScaleType | 'none']
  sec: [SectionKind, string, number][]
  tr: [string, number, 0 | 1, number, string, number[][]][]
}

const toB64 = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64 = (str: string) => {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const w = stream.writable.getWriter()
  void w.write(bytes as unknown as BufferSource)
  void w.close()
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

export async function encodeSong(song: Song, settings: Settings): Promise<string> {
  const packed: Packed = {
    v: 1,
    t: song.title,
    b: song.bpm,
    m: song.beatsPerBar,
    sc: [settings.scaleRoot, settings.scaleType],
    sec: song.sections.map((s) => [s.kind, s.name, s.bars]),
    tr: song.tracks.map((t) => [
      t.name, t.program, t.drum ? 1 : 0, Math.round(t.volume * 100) / 100, t.color,
      t.notes.map((n) => [n.pitch, n.start, n.dur, n.vel]),
    ]),
  }
  const json = new TextEncoder().encode(JSON.stringify(packed))
  return toB64(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodeSong(code: string): Promise<{ song: Song; settings: Pick<Settings, 'scaleRoot' | 'scaleType'> }> {
  const json = new TextDecoder().decode(await pipe(fromB64(code), new DecompressionStream('deflate-raw')))
  const p = JSON.parse(json) as Packed
  if (p.v !== 1) throw new Error('지원하지 않는 곡 형식')
  const song = normalizeSong({
    title: p.t,
    bpm: p.b,
    beatsPerBar: p.m,
    bars: p.sec.reduce((n, s) => n + s[2], 0),
    sections: p.sec.map(([kind, name, bars]) => ({ id: uid(), kind, name, bars })),
    tracks: p.tr.map(([name, program, drum, volume, color, notes]) => ({
      id: uid(), name, program, drum: drum === 1, volume, mute: false, solo: false, color,
      notes: notes.map(([pitch, start, dur, vel]) => ({ id: uid(), pitch, start, dur, vel })),
    })),
  })
  return { song, settings: { scaleRoot: p.sc[0], scaleType: p.sc[1] } }
}

export const shareUrl = (code: string) => `${location.origin}${location.pathname}#s=${code}`
export const codeFromHash = (hash: string) => (hash.startsWith('#s=') ? hash.slice(3) : null)
