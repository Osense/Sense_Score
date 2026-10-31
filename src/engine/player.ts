import { PPQ, type Settings, type Song } from '../types'
import type { AudioEngine } from './audio'

const LOOKAHEAD = 0.15
const TIMER_MS = 25

interface Anchor { time: number; tick: number; tps: number }

export class Player {
  playing = false
  onStop?: () => void
  private timer = 0
  private cursorTick = 0
  private cursorTime = 0
  private anchors: Anchor[] = []
  private songEndTime = Infinity
  private trainerBpm = 0
  private pausedAt = 0
  /** 미리듣기용 임시 곡/설정. 있으면 실제 곡 대신 이것을 재생한다 */
  private override: Song | null = null
  private ovSettings: Settings | null = null
  private keepAt = 0

  private engine: AudioEngine
  private getSong: () => Song
  private getSettings: () => Settings

  constructor(engine: AudioEngine, getSong: () => Song, getSettings: () => Settings) {
    this.engine = engine
    this.getSong = getSong
    this.getSettings = getSettings
  }

  /** 일반 트랙은 채널 0-8,10-15 / 드럼은 9 */
  static channelFor(song: Song, trackIndex: number): number {
    if (song.tracks[trackIndex].drum) return 9
    let n = 0
    for (let i = 0; i < trackIndex; i++) if (!song.tracks[i].drum) n++
    const c = n % 15
    return c >= 9 ? c + 1 : c
  }

  /** 믹서 상태(솔로/뮤트/볼륨/악기)를 엔진에 반영. 재생 중에도 계속 호출된다. */
  syncChannels(song: Song) {
    const anySolo = song.tracks.some((t) => t.solo)
    song.tracks.forEach((t, i) => {
      const ch = Player.channelFor(song, i)
      this.engine.configure(ch, t.program, t.drum)
      const audible = anySolo ? t.solo : !t.mute
      this.engine.setVolume(ch, audible ? t.volume : 0)
    })
  }

  private song(): Song {
    return this.override ?? this.getSong()
  }

  private settings(): Settings {
    return this.ovSettings ?? this.getSettings()
  }

  /** 곡 일부만 만든 임시 곡을 처음부터 한 번 들려준다 (끝나면 원래 재생 위치로 돌아간다) */
  async playTemp(song: Song, settings: Settings) {
    if (this.playing) this.stopInternal()
    this.keepAt = this.pausedAt
    this.override = song
    this.ovSettings = settings
    await this.play(0)
  }

  songEnd(song = this.song()) {
    return song.bars * song.beatsPerBar * PPQ
  }

  async play(fromTick: number) {
    await this.engine.resume()
    if (this.playing) this.stopInternal()
    const s = this.settings()
    const song = this.song()
    this.syncChannels(song)
    const countBeats = s.countIn ? song.beatsPerBar : 0
    this.cursorTick = fromTick - countBeats * PPQ
    this.cursorTime = Math.max(this.engine.ctx.currentTime + 0.08, this.engine.guardUntil + 0.02)
    this.anchors = []
    this.songEndTime = Infinity
    this.trainerBpm = s.trainer.on ? s.trainer.from : song.bpm
    this.pausedAt = fromTick
    this.playing = true
    this.timer = window.setInterval(() => this.pump(), TIMER_MS)
    this.pump()
  }

  pause() {
    this.pausedAt = Math.max(0, this.currentTick())
    this.stopInternal()
    this.onStop?.()
  }

  stop() {
    this.pausedAt = 0
    this.stopInternal()
    this.onStop?.()
  }

  seek(tick: number) {
    this.pausedAt = tick
  }

  private stopInternal() {
    clearInterval(this.timer)
    this.playing = false
    this.engine.allOff()
    if (this.override) {
      this.override = null
      this.ovSettings = null
      this.pausedAt = this.keepAt
    }
  }

  currentTick(): number {
    if (!this.playing) return this.pausedAt
    const now = this.engine.ctx.currentTime
    let a: Anchor | undefined
    for (const x of this.anchors) {
      if (x.time <= now) a = x
      else break
    }
    while (this.anchors.length > 2 && this.anchors[1].time <= now) this.anchors.shift()
    if (!a) return this.pausedAt
    return a.tick + (now - a.time) * a.tps
  }

  private pump() {
    const now = this.engine.ctx.currentTime
    if (now > this.songEndTime) {
      this.pausedAt = 0
      this.stopInternal()
      this.onStop?.()
      return
    }
    const horizon = now + LOOKAHEAD
    for (let guard = 0; this.cursorTime < horizon && guard < 50; guard++) {
      const song = this.song()
      const s = this.settings()
      this.syncChannels(song)
      const songEnd = this.songEnd(song)
      const end = s.loop ? Math.min(s.loopEnd, songEnd) : songEnd
      const bpm = (s.trainer.on ? this.trainerBpm : song.bpm) * s.speed
      const tps = (bpm * PPQ) / 60
      this.anchors.push({ time: this.cursorTime, tick: this.cursorTick, tps })
      let next = this.cursorTick + (horizon - this.cursorTime) * tps
      let hitEnd = false
      if (next >= end && this.cursorTick < end) {
        next = end
        hitEnd = true
      } else if (this.cursorTick >= end) {
        next = this.cursorTick
        hitEnd = true
      }
      this.scheduleRange(song, s, this.cursorTick, next, this.cursorTime, tps)
      this.cursorTime += (next - this.cursorTick) / tps
      this.cursorTick = next
      if (hitEnd) {
        if (s.loop && s.loopEnd > s.loopStart) {
          this.cursorTick = s.loopStart
          if (s.trainer.on && this.trainerBpm < s.trainer.to)
            this.trainerBpm = Math.min(s.trainer.to, this.trainerBpm + s.trainer.step)
        } else {
          this.songEndTime = this.cursorTime + 0.6
          this.cursorTime = Infinity
          break
        }
      }
    }
  }

  private scheduleRange(song: Song, s: Settings, from: number, to: number, t0: number, tps: number) {
    if (to <= from) return
    const eng = this.engine
    const at = (tick: number) => t0 + (tick - from) / tps
    // 메트로놈 / 카운트 인
    for (let b = Math.ceil(from / PPQ); b * PPQ < to; b++) {
      const tick = b * PPQ
      if (s.metronome || tick < 0) {
        const inBar = ((b % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar
        eng.click(at(tick), inBar === 0)
      }
    }
    const cut = s.loop ? s.loopEnd : Infinity
    song.tracks.forEach((tr, i) => {
      const ch = Player.channelFor(song, i)
      for (const n of tr.notes) {
        if (n.start < from || n.start >= to) continue
        const on = at(n.start)
        const off = at(Math.min(n.start + n.dur, cut))
        eng.noteOn(ch, n.pitch, n.vel, on)
        eng.noteOff(ch, n.pitch, Math.max(on + 0.02, off - 0.005))
      }
    })
  }
}
