import { PPQ, type Song } from '../types'
import { AudioEngine, MASTER_GAIN, SF_GAIN } from './audio'
import { Player } from './player'
import type { BendEvent, ChannelSetup, ExportJob, ExportReply, NoteEvent } from './exportWorker'

export type AudioFormat = 'mp3' | 'wav'

const SAMPLE_RATE = 44100
/** 마지막 음의 울림이 끊기지 않도록 곡 끝에 붙이는 여유 (초) */
const TAIL = 2

/** 곡을 음표 시각표로 바꾼다. 빠르기 연습 배속·반복·메트로놈은 넣지 않고 원래 빠르기로 만든다. */
function plan(song: Song) {
  const tps = (song.bpm * PPQ) / 60
  const anySolo = song.tracks.some((t) => t.solo)
  const channels: ChannelSetup[] = []
  const events: NoteEvent[] = []
  const bends: BendEvent[] = []
  let last = (song.bars * song.beatsPerBar * PPQ) / tps
  song.tracks.forEach((t, i) => {
    const ch = Player.channelFor(song, i)
    const audible = anySolo ? t.solo : !t.mute
    channels.push({ ch, program: t.program, drum: t.drum, volume: audible ? t.volume : 0, bend: !!t.bends?.length, bendRange: t.bendRange ?? 2 })
    if (!audible) return
    for (const b of t.bends ?? []) bends.push({ ch, t: b.tick / tps, value: b.value })
    for (const n of t.notes) {
      const on = n.start / tps
      const off = Math.max(on + 0.02, (n.start + n.dur) / tps - 0.005)
      events.push({ ch, pitch: n.pitch, vel: n.vel, on, off })
      last = Math.max(last, off)
    }
  })
  bends.sort((a, b) => a.t - b.t)
  return { channels, events, bends, duration: last + TAIL }
}

/** 구간 길이 (초). 한 구간에 노드를 너무 많이 만들면 렌더링이 급격히 느려진다. */
const SEGMENT = 2
/** 음을 끈 뒤 울림(릴리스·심벌 여운)이 사라지기까지 넉넉히 잡은 시간 (초) */
const RELEASE_TAIL = 1.5

type Plan = ReturnType<typeof plan>

function newEngine(ctx: OfflineAudioContext, channels: ChannelSetup[]) {
  const eng = new AudioEngine(ctx)
  for (const c of channels) {
    eng.configure(c.ch, c.program, c.drum)
    eng.setVolume(c.ch, c.volume)
    eng.setBendMode(c.ch, c.bend, c.bendRange)
  }
  return eng
}

/**
 * 내장 신디사이저로 곡 전체를 실시간보다 빠르게 렌더링한다.
 * 음표를 한꺼번에 다 예약하면 노드가 쌓여 긴 곡일수록 크게 느려지므로,
 * 실시간 재생처럼 약 1초마다 렌더링을 잠깐 멈추고 다음 구간 음표만 만들어 넣는다.
 */
async function renderBuiltin({ channels, events, bends, duration }: Plan, onProgress: (p: number) => void) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)
  const eng = newEngine(ctx, channels)
  events.sort((a, b) => a.on - b.on)
  let k = 0
  let kb = 0
  const scheduleUntil = (t: number) => {
    for (; kb < bends.length && bends[kb].t < t; kb++) eng.bend(bends[kb].ch, bends[kb].value, bends[kb].t)
    for (; k < events.length && events[k].on < t; k++) {
      const e = events[k]
      eng.noteOn(e.ch, e.pitch, e.vel, e.on)
      eng.noteOff(e.ch, e.pitch, e.off)
    }
  }
  const CHUNK = 128 * 344 // 렌더 단위(128샘플)의 배수, 약 1초
  const step = CHUNK / SAMPLE_RATE
  scheduleUntil(step + 0.05)
  for (let s = CHUNK; s < ctx.length; s += CHUNK) {
    const t = s / SAMPLE_RATE
    void ctx.suspend(t).then(() => {
      scheduleUntil(t + step + 0.05)
      onProgress((s / ctx.length) * 0.7)
      void ctx.resume()
    })
  }
  const buf = await ctx.startRendering()
  return { left: buf.getChannelData(0), right: buf.getChannelData(1) }
}

/**
 * 렌더링 중 멈추기(suspend)를 못 하는 브라우저용.
 * 음 하나하나가 서로 독립인 소리라서, 곡을 짧은 구간으로 나눠 따로 렌더링한 뒤 더해도 한 번에 만든 것과 같다.
 */
async function renderSegmented({ channels, events, bends, duration }: Plan, onProgress: (p: number) => void) {
  const total = Math.ceil(duration * SAMPLE_RATE)
  const left = new Float32Array(total)
  const right = new Float32Array(total)
  const segs = Math.max(1, Math.ceil(duration / SEGMENT))
  for (let i = 0; i < segs; i++) {
    const t0 = i * SEGMENT
    const mine = events.filter((e) => e.on >= t0 && (e.on < t0 + SEGMENT || i === segs - 1))
    if (mine.length === 0) continue
    const end = Math.min(duration, Math.max(...mine.map((e) => e.off)) + RELEASE_TAIL)
    const ctx = new OfflineAudioContext(2, Math.ceil((end - t0) * SAMPLE_RATE), SAMPLE_RATE)
    const eng = newEngine(ctx, channels)
    // 이 구간에서 울리는 동안의 벤드: 시작 시점 값 + 구간 안의 변화
    for (const c of channels) {
      if (!c.bend) continue
      const before = bends.filter((b) => b.ch === c.ch && b.t <= t0).at(-1)
      if (before) eng.bend(c.ch, before.value, 0)
    }
    for (const b of bends) if (b.t > t0 && b.t < end) eng.bend(b.ch, b.value, b.t - t0)
    for (const e of mine) {
      eng.noteOn(e.ch, e.pitch, e.vel, e.on - t0)
      eng.noteOff(e.ch, e.pitch, e.off - t0)
    }
    const buf = await ctx.startRendering()
    const off = Math.round(t0 * SAMPLE_RATE)
    const l = buf.getChannelData(0)
    const r = buf.getChannelData(1)
    const n = Math.min(l.length, total - off)
    for (let j = 0; j < n; j++) {
      left[off + j] += l[j]
      right[off + j] += r[j]
    }
    onProgress(((i + 1) / segs) * 0.7)
  }
  return { left, right }
}

function runWorker(job: ExportJob, transfer: Transferable[], onProgress: (p: number) => void, from: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const w = new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<ExportReply>) => {
      const m = e.data
      if (m.type === 'progress') onProgress(from + m.value * (1 - from))
      else {
        w.terminate()
        if (m.type === 'done') resolve(m.data)
        else reject(new Error(m.message))
      }
    }
    w.onerror = (e) => {
      w.terminate()
      reject(new Error(e.message || '내보내기 작업이 멈췄어요'))
    }
    w.postMessage(job, transfer)
  })
}

/**
 * 곡을 MP3/WAV 파일 데이터로 만든다. 재생하며 녹음하지 않고 한 번에 계산한다.
 * 사운드폰트가 있으면 그 소리로, 없으면 내장 소리로 만든다.
 */
export async function exportAudio(song: Song, format: AudioFormat, soundfont: ArrayBuffer | null, onProgress: (p: number) => void): Promise<Blob> {
  onProgress(0)
  let data: Uint8Array
  if (soundfont) {
    const { channels, events, bends, duration } = plan(song)
    const sf = soundfont.slice(0)
    data = await runWorker(
      { type: 'soundfont', format, sampleRate: SAMPLE_RATE, gain: MASTER_GAIN * SF_GAIN, soundfont: sf, channels, events, bends, duration },
      [sf],
      onProgress,
      0,
    )
  } else {
    const p = plan(song)
    const canSuspend = typeof OfflineAudioContext.prototype.suspend === 'function'
    const { left, right } = await (canSuspend ? renderBuiltin : renderSegmented)(p, onProgress)
    data = await runWorker(
      { type: 'encode', format, sampleRate: SAMPLE_RATE, left, right },
      [left.buffer, right.buffer],
      onProgress,
      0.7,
    )
  }
  onProgress(1)
  return new Blob([data as Uint8Array<ArrayBuffer>], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' })
}
