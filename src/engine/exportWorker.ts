/// <reference lib="webworker" />
// 소리 파일 내보내기 작업자: 화면이 멈추지 않도록 무거운 계산(사운드폰트 렌더링, MP3 변환)을 여기서 한다.
import { createMp3Encoder } from 'wasm-media-encoders'
import { SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core'

export interface NoteEvent { ch: number; pitch: number; vel: number; on: number; off: number }
export interface ChannelSetup { ch: number; program: number; drum: boolean; volume: number }

export type ExportJob =
  | { type: 'encode'; format: 'mp3' | 'wav'; sampleRate: number; left: Float32Array; right: Float32Array }
  | {
      type: 'soundfont'
      format: 'mp3' | 'wav'
      sampleRate: number
      gain: number
      soundfont: ArrayBuffer
      channels: ChannelSetup[]
      events: NoteEvent[]
      duration: number
    }

export type ExportReply =
  | { type: 'progress'; value: number }
  | { type: 'done'; data: Uint8Array }
  | { type: 'error'; message: string }

const post = (m: ExportReply, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer)

/** 사운드폰트로 곡 전체를 렌더링 (오디오 장치 없이 계산만) */
async function renderSoundfont(job: Extract<ExportJob, { type: 'soundfont' }>, progress: (p: number) => void) {
  const sr = job.sampleRate
  const total = Math.ceil(job.duration * sr)
  const left = new Float32Array(total)
  const right = new Float32Array(total)
  const synth = new SpessaSynthProcessor(sr, { effectsEnabled: true, eventsEnabled: false })
  synth.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(job.soundfont), 'main')
  await synth.ready
  for (const c of job.channels) {
    synth.midiChannels[c.ch]?.setDrums(c.drum)
    synth.programChange(c.ch, c.program)
    synth.controllerChange(c.ch, 7 as never, Math.round(c.volume * 127))
  }
  // 음 켜기/끄기를 시각 순서로 펼친다 (같은 시각이면 끄기 먼저 → 같은 음 연타가 끊기지 않음)
  const msgs: { s: number; on: boolean; e: NoteEvent }[] = []
  for (const e of job.events) {
    msgs.push({ s: Math.round(e.on * sr), on: true, e })
    msgs.push({ s: Math.round(e.off * sr), on: false, e })
  }
  msgs.sort((a, b) => a.s - b.s || Number(a.on) - Number(b.on))
  const BLOCK = 128
  const report = sr * 4
  let k = 0
  for (let pos = 0; pos < total; pos += BLOCK) {
    const end = pos + BLOCK
    while (k < msgs.length && msgs[k].s < end) {
      const m = msgs[k++]
      if (m.on) synth.noteOn(m.e.ch, m.e.pitch, m.e.vel)
      else synth.noteOff(m.e.ch, m.e.pitch)
    }
    synth.process(left, right, pos, Math.min(BLOCK, total - pos))
    if (pos % report < BLOCK) progress(pos / total)
  }
  if (job.gain !== 1)
    for (let i = 0; i < total; i++) {
      left[i] *= job.gain
      right[i] *= job.gain
    }
  return { left, right }
}

/** 소리가 찢어지지 않도록 너무 크면 전체를 살짝 줄인다 */
function limit(left: Float32Array, right: Float32Array) {
  let peak = 0
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  if (peak <= 0.98) return
  const scale = 0.98 / peak
  for (let i = 0; i < left.length; i++) {
    left[i] *= scale
    right[i] *= scale
  }
}

function encodeWav(l: Float32Array, r: Float32Array, sr: number): Uint8Array {
  const n = l.length
  const buf = new ArrayBuffer(44 + n * 4)
  const v = new DataView(buf)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 4, true)
  const pcm = new Int16Array(buf, 44)
  for (let i = 0; i < n; i++) {
    pcm[i * 2] = Math.round(Math.max(-1, Math.min(1, l[i])) * 32767)
    pcm[i * 2 + 1] = Math.round(Math.max(-1, Math.min(1, r[i])) * 32767)
  }
  return new Uint8Array(buf)
}

/** MP3 변환 (WebAssembly로 만든 LAME, 192kbps) */
async function encodeMp3(l: Float32Array, r: Float32Array, sr: number, progress: (p: number) => void): Promise<Uint8Array> {
  const enc = await createMp3Encoder()
  enc.configure({ channels: 2, sampleRate: sr, bitrate: 192 })
  const parts: Uint8Array[] = []
  const CHUNK = sr * 2
  for (let i = 0; i < l.length; i += CHUNK) {
    // encode()가 돌려주는 배열은 다음 호출 때 덮어써지므로 복사해 둔다
    parts.push(enc.encode([l.subarray(i, i + CHUNK), r.subarray(i, i + CHUNK)]).slice())
    progress(i / l.length)
  }
  parts.push(enc.finalize().slice())
  const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) {
    all.set(p, o)
    o += p.length
  }
  return all
}

self.onmessage = async (e: MessageEvent<ExportJob>) => {
  const job = e.data
  try {
    let left: Float32Array, right: Float32Array
    // 사운드폰트: 렌더링 0~80%, 변환 80~100% / 내장 소리: 렌더링은 이미 끝났으니 변환만
    const split = job.type === 'soundfont' ? 0.8 : 0
    if (job.type === 'soundfont') ({ left, right } = await renderSoundfont(job, (p) => post({ type: 'progress', value: p * split })))
    else ({ left, right } = job)
    limit(left, right)
    const data = job.format === 'wav'
      ? encodeWav(left, right, job.sampleRate)
      : await encodeMp3(left, right, job.sampleRate, (p) => post({ type: 'progress', value: split + p * (1 - split) }))
    post({ type: 'done', data }, [data.buffer])
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
