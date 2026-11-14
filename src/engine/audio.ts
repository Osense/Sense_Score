import { WorkletSynthesizer } from 'spessasynth_lib'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'

/** 전체 음량 (내보내기에서도 같은 값을 쓴다) */
export const MASTER_GAIN = 0.8

/** 채널 단위로 소리를 내는 엔진. 내장 신디사이저 또는 사운드폰트(SF2/SF3). */
export class AudioEngine {
  /** 실시간 재생은 AudioContext, 소리 파일 내보내기는 OfflineAudioContext */
  ctx: BaseAudioContext
  private master: GainNode
  /** 모든 내장 소리가 지나가는 통로. 정지하면 통째로 갈아 끼워서 예약된 소리까지 한꺼번에 끊는다. */
  private bus: GainNode
  /** 사운드폰트 출력. 정지 직후 이미 예약된 음이 새어 나오지 않도록 잠깐 닫는다. */
  private sfGate: GainNode
  /** 이 시각 전에는 새 소리를 예약하면 안 된다 (정지 처리가 끝나는 시각) */
  guardUntil = 0
  private chGain: GainNode[] = []
  private chProgram: number[] = Array(16).fill(0)
  private chDrum: boolean[] = Array(16).fill(false)
  private chVol: number[] = Array(16).fill(-1)
  /** 채널별 피치 벤드: 값(센트)을 내는 소스를 그 채널 모든 오실레이터의 detune에 연결한다 */
  private bendSrc: ConstantSourceNode[] = []
  private bendOn: boolean[] = Array(16).fill(false)
  private bendRange: number[] = Array(16).fill(2)
  private active = new Map<string, { osc: OscillatorNode[]; gain: GainNode; amp: number; start: number; attack: number; decay: number }[]>()
  private sf?: WorkletSynthesizer
  soundfontName: string | null = null
  /** 불러온 사운드폰트 원본 (소리 파일 내보내기 때 다시 쓴다) */
  soundfontData: ArrayBuffer | null = null

  constructor(ctx: BaseAudioContext = new AudioContext()) {
    this.ctx = ctx
    this.master = ctx.createGain()
    this.bus = this.makeBus()
    this.sfGate = this.makeSfGate()
    this.master.gain.value = MASTER_GAIN
    this.master.connect(this.ctx.destination)
    for (let i = 0; i < 16; i++) {
      const g = this.ctx.createGain()
      g.connect(this.bus)
      this.chGain.push(g)
      const b = this.ctx.createConstantSource()
      b.offset.value = 0
      b.start()
      this.bendSrc.push(b)
    }
  }

  private makeBus() {
    const g = this.ctx.createGain()
    g.connect(this.master)
    return g
  }

  private makeSfGate() {
    const g = this.ctx.createGain()
    g.connect(this.master)
    return g
  }

  resume() {
    return this.ctx.state === 'running' || !(this.ctx instanceof AudioContext) ? Promise.resolve() : this.ctx.resume()
  }

  setMasterVolume(v: number) {
    this.master.gain.value = v
  }

  async loadSoundfont(buf: ArrayBuffer, name: string) {
    const copy = buf.slice(0) // 신디사이저에 넘기면 원본이 비워질 수 있다
    await this.ctx.audioWorklet.addModule(processorUrl)
    const synth = new WorkletSynthesizer(this.ctx)
    synth.connect(this.sfGate)
    await synth.soundBankManager.addSoundBank(buf, 'main')
    await synth.isReady
    this.sf?.disconnect(this.sfGate)
    this.sf = synth
    this.soundfontName = name
    this.soundfontData = copy
    this.chVol.fill(-1)
    for (let ch = 0; ch < 16; ch++) this.applyToSynth(ch)
  }

  private applyToSynth(ch: number) {
    if (!this.sf) return
    this.sf.midiChannels[ch]?.setDrums(this.chDrum[ch])
    this.sf.programChange(ch, this.chProgram[ch])
    this.sf.pitchWheelRange(ch, this.bendRange[ch])
  }

  /** 이 채널에서 피치 벤드를 쓸지와 벤드 폭(반음) */
  setBendMode(ch: number, on: boolean, range = 2) {
    if (this.bendOn[ch] === on && this.bendRange[ch] === range) return
    this.bendOn[ch] = on
    this.bendRange[ch] = range
    this.sf?.pitchWheelRange(ch, range)
  }

  /** 피치 벤드 값(-1~1)을 when 시각에 건다 */
  bend(ch: number, value: number, when: number) {
    if (this.sf) {
      this.sf.pitchWheel(ch, Math.max(0, Math.min(16383, Math.round(8192 + value * 8192))), { time: when })
      return
    }
    this.bendSrc[ch].offset.setValueAtTime(value * this.bendRange[ch] * 100, Math.max(when, this.ctx.currentTime))
  }

  useBuiltin() {
    this.sf?.disconnect(this.sfGate)
    this.sf = undefined
    this.soundfontName = null
    this.soundfontData = null
    this.chVol.fill(-1)
  }

  configure(ch: number, program: number, drum: boolean) {
    if (this.chProgram[ch] === program && this.chDrum[ch] === drum) return
    this.chProgram[ch] = program
    this.chDrum[ch] = drum
    this.applyToSynth(ch)
  }

  setVolume(ch: number, v: number) {
    if (this.chVol[ch] === v) return
    this.chVol[ch] = v
    if (this.sf) this.sf.controllerChange(ch, 7 as never, Math.round(v * 127))
    else this.chGain[ch].gain.value = v
  }

  noteOn(ch: number, pitch: number, vel: number, when: number) {
    if (this.sf) {
      this.sf.noteOn(ch, pitch, vel, { time: when })
      return
    }
    if (this.chDrum[ch]) this.drum(ch, pitch, vel, when)
    else this.tone(ch, pitch, vel, when)
  }

  noteOff(ch: number, pitch: number, when: number) {
    if (this.sf) {
      this.sf.noteOff(ch, pitch, { time: when })
      return
    }
    if (this.chDrum[ch]) return
    const list = this.active.get(`${ch}:${pitch}`)
    const v = list?.shift()
    if (!v) return
    const g = v.gain.gain
    const rel = this.release(this.chProgram[ch])
    // Release from the current envelope level; a fixed gain makes quiet notes jump louder.
    const elapsed = Math.max(0, when - v.start)
    const inAttack = elapsed < v.attack
    const level = inAttack
      ? 0.0001 + (v.amp - 0.0001) * elapsed / v.attack
      : v.amp * (v.decay ? 0.25 ** Math.min(1, (elapsed - v.attack) / v.decay) : 1)
    g.cancelScheduledValues(when)
    if (inAttack) g.linearRampToValueAtTime(Math.max(0.0001, level), when)
    else g.setValueAtTime(Math.max(0.0001, level), when)
    g.exponentialRampToValueAtTime(0.0001, when + rel)
    v.osc.forEach((o) => o.stop(when + rel + 0.02))
  }

  /** 지금 나는 소리와 이미 예약된 소리를 모두 즉시 끊는다. */
  allOff() {
    const now = this.ctx.currentTime

    // 내장 소리: 통로(bus)를 빠르게 줄이고 새 통로로 교체 → 드럼, 메트로놈, 아직 시작 전인 음까지 전부 사라진다
    const old = this.bus
    old.gain.cancelScheduledValues(now)
    old.gain.setValueAtTime(old.gain.value, now)
    old.gain.linearRampToValueAtTime(0, now + 0.01)
    setTimeout(() => old.disconnect(), 80)
    this.bus = this.makeBus()
    for (const g of this.chGain) {
      g.disconnect()
      g.connect(this.bus)
    }
    for (const list of this.active.values())
      for (const v of list) v.osc.forEach((o) => { try { o.stop(now + 0.02) } catch { /* 이미 끝남 */ } })
    this.active.clear()
    for (const b of this.bendSrc) {
      b.offset.cancelScheduledValues(now)
      b.offset.setValueAtTime(0, now)
    }

    // 사운드폰트: 모든 음을 끄고, 이미 예약된 음이 지나갈 때까지 출력을 잠깐 닫는다
    if (this.sf) {
      this.sf.stopAll(true)
      const until = now + 0.22
      this.sfGate.gain.cancelScheduledValues(now)
      this.sfGate.gain.setValueAtTime(0, now)
      this.sfGate.gain.setValueAtTime(1, until)
      for (let ch = 0; ch < 16; ch++) {
        this.sf.controllerChange(ch, 120 as never, 0, { time: until - 0.01 })
        this.sf.pitchWheel(ch, 8192, { time: until - 0.01 })
      }
      this.guardUntil = until
    }
  }

  /** 음계 들려주기 (질문 화면의 ‘들어보기’) */
  playScale(root: number, steps: number[]) {
    void this.resume()
    this.configure(0, 0, false)
    this.setVolume(0, 0.9)
    const base = 60 + (root > 6 ? root - 12 : root)
    const t0 = this.ctx.currentTime + 0.05
    ;[...steps, 12].forEach((st, i) => {
      this.noteOn(0, base + st, 90, t0 + i * 0.32)
      this.noteOff(0, base + st, t0 + i * 0.32 + 0.28)
    })
  }

  /** 박자 들려주기: 첫 박이 강한 ‘딱 딱 딱’ 두 마디 */
  playBeats(bpm: number, beats: number) {
    void this.resume()
    const t0 = this.ctx.currentTime + 0.05
    const spb = 60 / bpm
    for (let i = 0; i < beats * 2; i++) this.click(t0 + i * spb, i % beats === 0)
  }

  /** 짧은 메트로놈 소리 */
  click(when: number, accent: boolean) {
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.frequency.value = accent ? 1600 : 1100
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
    o.connect(g).connect(this.bus)
    o.onended = () => g.disconnect()
    o.start(when)
    o.stop(when + 0.06)
  }

  /** 건반/음표를 눌렀을 때 미리 듣기 */
  preview(ch: number, program: number, drum: boolean, volume: number, pitch: number, vel = 90, len = 0.35) {
    void this.resume()
    this.configure(ch, program, drum)
    this.setVolume(ch, volume)
    const t = this.ctx.currentTime + 0.005
    this.noteOn(ch, pitch, vel, t)
    this.noteOff(ch, pitch, t + len)
  }

  private release(program: number) {
    if (program >= 40 && program < 56) return 0.35
    if (program >= 16 && program < 24) return 0.08
    return 0.18
  }

  private tone(ch: number, pitch: number, vel: number, when: number) {
    const p = this.chProgram[ch]
    const freq = 440 * 2 ** ((pitch - 69) / 12)
    // Keep bass audible on tablet speakers without overpowering the melody.
    const bass = p >= 32 && p < 40
    const amp = (vel / 127) * 0.3 * (bass ? 1.2 : 1)
    let types: OscillatorType[] = ['triangle']
    let attack = 0.005
    let decay = 0 // 0 = 지속음
    let cutoff = 0
    if (p < 8) { types = ['triangle', 'sine']; decay = 1.6 }
    else if (p < 16) { types = ['sine']; decay = 1.0 }
    else if (p < 24) { types = ['square']; cutoff = 2200 }
    else if (p < 32) { types = ['sawtooth']; decay = 0.9; cutoff = 2600 }
    else if (p < 40) { types = ['sawtooth', 'triangle']; decay = 1.0; cutoff = 2000 }
    else if (p < 56) { types = ['sawtooth']; attack = 0.08; cutoff = 2400 }
    else if (p < 80) { types = ['square']; attack = 0.02; cutoff = 2800 }
    else { types = ['sawtooth']; attack = 0.01; cutoff = 3500 }

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.linearRampToValueAtTime(amp, when + attack)
    if (decay) gain.gain.exponentialRampToValueAtTime(amp * 0.25, when + attack + decay)
    if (bass) {
      // Remove sub-bass rumble and add only a gentle midrange lift for small speakers.
      const hp = this.ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 50
      const pk = this.ctx.createBiquadFilter()
      pk.type = 'peaking'
      pk.frequency.value = 900
      pk.Q.value = 0.8
      pk.gain.value = 3
      const lp = this.ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = Math.min(cutoff + freq, 12000)
      gain.connect(hp).connect(pk).connect(lp).connect(this.chGain[ch])
    } else if (cutoff) {
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = Math.min(cutoff + freq, 12000)
      gain.connect(f).connect(this.chGain[ch])
    } else {
      gain.connect(this.chGain[ch])
    }
    const vibrato = (p >= 40 && p < 56) || (p >= 64 && p < 80)
    const lfo = vibrato ? this.ctx.createOscillator() : null
    if (lfo) {
      lfo.frequency.value = 5.5
      lfo.start(when)
    }
    const osc = types.map((t, i) => {
      const o = this.ctx.createOscillator()
      o.type = t
      o.frequency.value = i === 0 ? freq : freq * 2
      if (lfo) {
        const depth = this.ctx.createGain()
        depth.gain.value = freq * 0.006
        lfo.connect(depth).connect(o.frequency)
      }
      if (this.bendOn[ch]) this.bendSrc[ch].connect(o.detune)
      const og = this.ctx.createGain()
      og.gain.value = i === 0 ? 1 : bass ? 0.4 : 0.2
      o.connect(og).connect(gain)
      o.start(when)
      return o
    })
    // 소리가 끝나면 연결을 끊어 둔다. 남겨 두면 끝난 음도 계속 계산돼서 긴 곡일수록 느려진다.
    const bendSrc = this.bendOn[ch] ? this.bendSrc[ch] : null
    osc[osc.length - 1].onended = () => {
      gain.disconnect()
      if (bendSrc) for (const o of osc) try { bendSrc.disconnect(o.detune) } catch { /* 연결 안 됨 */ }
    }
    if (lfo) osc.push(lfo)
    const key = `${ch}:${pitch}`
    const list = this.active.get(key) ?? []
    list.push({ osc, gain, amp, start: when, attack, decay })
    this.active.set(key, list)
  }

  private noiseBuf?: AudioBuffer
  private noise() {
    if (!this.noiseBuf) {
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate)
      const d = b.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this.noiseBuf = b
    }
    return this.noiseBuf
  }

  private drum(ch: number, pitch: number, vel: number, when: number) {
    const amp = (vel / 127) * 0.6
    const out = this.chGain[ch]
    const env = (g: GainNode, peak: number, len: number) => {
      g.gain.setValueAtTime(peak, when)
      g.gain.exponentialRampToValueAtTime(0.0001, when + len)
    }
    const sweep = (from: number, to: number, sweepLen: number, len: number, type: OscillatorType = 'sine', peak = amp) => {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(from, when)
      o.frequency.exponentialRampToValueAtTime(to, when + sweepLen)
      env(g, peak, len)
      o.connect(g).connect(out)
      o.onended = () => g.disconnect()
      o.start(when)
      o.stop(when + len + 0.02)
    }
    const noise = (filter: BiquadFilterType, freq: number, len: number, peak = amp, q = 1) => {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noise()
      const f = this.ctx.createBiquadFilter()
      f.type = filter
      f.frequency.value = freq
      f.Q.value = q
      const g = this.ctx.createGain()
      env(g, peak, len)
      src.connect(f).connect(g).connect(out)
      src.onended = () => g.disconnect()
      src.start(when)
      src.stop(when + len + 0.02)
    }
    const TOM: Record<number, number> = { 41: 85, 43: 105, 45: 130, 47: 155, 48: 185, 50: 215 }
    if (pitch === 35 || pitch === 36) return sweep(150, 45, 0.12, 0.3)
    if (TOM[pitch]) return sweep(TOM[pitch] * 1.6, TOM[pitch], 0.08, 0.38)
    if (pitch === 37 || pitch === 38 || pitch === 40) {
      sweep(220, 160, 0.05, 0.12, 'triangle', amp * 0.6)
      return noise('bandpass', 2200, 0.18, amp * 0.9)
    }
    if (pitch === 56) {
      // 카우벨: 두 개의 사각파
      for (const fr of [562, 845]) {
        const o = this.ctx.createOscillator()
        const f = this.ctx.createBiquadFilter()
        const g = this.ctx.createGain()
        o.type = 'square'
        o.frequency.value = fr
        f.type = 'bandpass'
        f.frequency.value = 700
        env(g, amp * 0.35, 0.28)
        o.connect(f).connect(g).connect(out)
        o.onended = () => g.disconnect()
        o.start(when)
        o.stop(when + 0.3)
      }
      return
    }
    if (pitch === 49 || pitch === 52 || pitch === 55 || pitch === 57) return noise('highpass', 5000, 1.1, amp * 0.8)
    if (pitch === 51 || pitch === 53 || pitch === 59) {
      sweep(5200, 5200, 0.01, 0.5, 'sine', amp * 0.15)
      return noise('highpass', 8500, 0.55, amp * 0.45)
    }
    if (pitch === 46) return noise('highpass', 7000, 0.3, amp * 0.55)
    if (pitch === 39) return noise('bandpass', 1400, 0.16, amp * 0.9, 1.5) // 박수
    if (pitch === 54) return noise('highpass', 9000, 0.22, amp * 0.5) // 탬버린
    if (pitch === 69 || pitch === 70) return noise('highpass', 9500, 0.07, amp * 0.4) // 카바사·마라카스
    return noise('highpass', 7500, 0.06, amp * 0.55) // 닫힌 하이햇 등
  }
}
