import { WorkletSynthesizer } from 'spessasynth_lib'
import processorUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'

/** 채널 단위로 소리를 내는 엔진. 내장 신디사이저 또는 사운드폰트(SF2/SF3). */
export class AudioEngine {
  ctx = new AudioContext()
  private master = this.ctx.createGain()
  /** 녹음용 출력 (소리 파일로 저장할 때 쓴다) */
  private recDest = this.ctx.createMediaStreamDestination()
  /** 모든 내장 소리가 지나가는 통로. 정지하면 통째로 갈아 끼워서 예약된 소리까지 한꺼번에 끊는다. */
  private bus = this.makeBus()
  /** 사운드폰트 출력. 정지 직후 이미 예약된 음이 새어 나오지 않도록 잠깐 닫는다. */
  private sfGate = this.makeSfGate()
  /** 이 시각 전에는 새 소리를 예약하면 안 된다 (정지 처리가 끝나는 시각) */
  guardUntil = 0
  private chGain: GainNode[] = []
  private chProgram: number[] = Array(16).fill(0)
  private chDrum: boolean[] = Array(16).fill(false)
  private chVol: number[] = Array(16).fill(-1)
  private active = new Map<string, { osc: OscillatorNode[]; gain: GainNode }[]>()
  private sf?: WorkletSynthesizer
  soundfontName: string | null = null

  constructor() {
    this.master.gain.value = 0.8
    this.master.connect(this.ctx.destination)
    this.master.connect(this.recDest)
    for (let i = 0; i < 16; i++) {
      const g = this.ctx.createGain()
      g.connect(this.bus)
      this.chGain.push(g)
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
    return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume()
  }

  setMasterVolume(v: number) {
    this.master.gain.value = v
  }

  async loadSoundfont(buf: ArrayBuffer, name: string) {
    await this.ctx.audioWorklet.addModule(processorUrl)
    const synth = new WorkletSynthesizer(this.ctx)
    synth.connect(this.sfGate)
    await synth.soundBankManager.addSoundBank(buf, 'main')
    await synth.isReady
    this.sf?.disconnect(this.sfGate)
    this.sf = synth
    this.soundfontName = name
    this.chVol.fill(-1)
    for (let ch = 0; ch < 16; ch++) this.applyToSynth(ch)
  }

  private applyToSynth(ch: number) {
    if (!this.sf) return
    this.sf.midiChannels[ch]?.setDrums(this.chDrum[ch])
    this.sf.programChange(ch, this.chProgram[ch])
  }

  useBuiltin() {
    this.sf?.disconnect(this.sfGate)
    this.sf = undefined
    this.soundfontName = null
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
    g.cancelScheduledValues(when)
    g.setValueAtTime(0.2, when)
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

    // 사운드폰트: 모든 음을 끄고, 이미 예약된 음이 지나갈 때까지 출력을 잠깐 닫는다
    if (this.sf) {
      this.sf.stopAll(true)
      const until = now + 0.22
      this.sfGate.gain.cancelScheduledValues(now)
      this.sfGate.gain.setValueAtTime(0, now)
      this.sfGate.gain.setValueAtTime(1, until)
      for (let ch = 0; ch < 16; ch++) this.sf.controllerChange(ch, 120 as never, 0, { time: until - 0.01 })
      this.guardUntil = until
    }
  }

  /** 지금부터 나는 소리를 녹음한다. stop()을 부르면 소리 파일(Blob)이 나온다. */
  startRecording(): { stop: () => Promise<Blob> } {
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m))
    const rec = new MediaRecorder(this.recDest.stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.start()
    return {
      stop: () =>
        new Promise<Blob>((resolve) => {
          rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
          if (rec.state !== 'inactive') rec.stop()
          else resolve(new Blob(chunks))
        }),
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
    // 베이스는 낮은 소리라 작은 스피커에서는 거의 안 들린다 → 크게 키우고, 중음(배음)을 강조한다
    const bass = p >= 32 && p < 40
    const amp = (vel / 127) * 0.3 * (bass ? 2.4 : 1)
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
      // 너무 낮은 울림은 깎고(하이패스), 800~1000Hz 근처 중음을 돋운 뒤(피킹), 거친 고음은 다듬는다(로패스)
      const hp = this.ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 50
      const pk = this.ctx.createBiquadFilter()
      pk.type = 'peaking'
      pk.frequency.value = 900
      pk.Q.value = 0.8
      pk.gain.value = 9
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
      const og = this.ctx.createGain()
      og.gain.value = i === 0 ? 1 : bass ? 0.7 : 0.2 // 베이스는 한 옥타브 위 배음을 많이 섞어 중음을 살린다
      o.connect(og).connect(gain)
      o.start(when)
      return o
    })
    if (lfo) osc.push(lfo)
    const key = `${ch}:${pitch}`
    const list = this.active.get(key) ?? []
    list.push({ osc, gain })
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
    return noise('highpass', 7500, 0.06, amp * 0.55) // 닫힌 하이햇 등
  }
}
