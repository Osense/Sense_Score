import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_CORRECTION, PRESETS, type Correction } from '../correct'
import { nearestInScale } from '../editActions'
import { fitPitch, rangeLabel, rangeOf, soundRangeOf } from '../instruments'
import { inScale } from '../music'
import { useChordPcs } from '../useChordPcs'
import { KINDS } from '../sections'
import { PPQ, type Note, type Settings, type Song } from '../types'
import { HKeyboard } from './HKeyboard'
import { LiveRoll } from './LiveRoll'
import { KeyDisplayControls } from './KeyDisplayControls'
import { SongStrip } from './SongStrip'
import { DRUM_LANES, DrumKitView, DrumRoll, laneOf } from './DrumKit'
import { Icon } from './Icon'
import { rangesOf } from '../sections'

interface Props {
  song: Song
  settings: Settings
  trackId: string
  onTrack: (id: string) => void
  taking: boolean
  lastTake: { count: number } | null
  selectedSec: string | null
  playing: boolean
  getTick: () => number
  getLive: () => Note[]
  liveOn: (pitch: number, vel: number) => void
  liveOff: (pitch: number) => void
  onStart: (o: { replace: boolean; correction: Correction; countIn: boolean }) => void
  /** 녹음이 시작되는 자리(먼저 세기 동안 카운트다운에 쓴다) */
  takeFrom: number | null
  onSeek: (tick: number) => void
  onStop: () => void
  onPlay: () => void
  onSettings: (patch: Partial<Settings>) => void
  onFocusPart: (id: string) => void
  onAllParts: () => void
  /** 방금 녹음한 연주에 보정을 다시 적용 */
  onRecorrect: (c: Correction) => void
  onDiscard: () => void
  onMessage: (text: string) => void
}

/** 컴퓨터 키보드 한 줄이 피아노 한 옥타브 반: 가운데 줄이 흰 건반, 윗줄이 검은 건반 */
const KEYS: [string, number, string][] = [
  ['KeyA', 0, 'A'], ['KeyW', 1, 'W'], ['KeyS', 2, 'S'], ['KeyE', 3, 'E'], ['KeyD', 4, 'D'], ['KeyF', 5, 'F'],
  ['KeyT', 6, 'T'], ['KeyG', 7, 'G'], ['KeyY', 8, 'Y'], ['KeyH', 9, 'H'], ['KeyU', 10, 'U'], ['KeyJ', 11, 'J'],
  ['KeyK', 12, 'K'], ['KeyO', 13, 'O'], ['KeyL', 14, 'L'], ['KeyP', 15, 'P'], ['Semicolon', 16, ';'],
]

const GRIDS = [
  { v: 0, label: '안 맞춤' },
  { v: PPQ, label: '4분음표' },
  { v: PPQ / 2, label: '8분음표' },
  { v: PPQ / 4, label: '16분음표' },
  { v: PPQ / 8, label: '32분음표' },
]

type Assist = 'free' | 'snap' | 'lock'

/** 멜로디 쓰기: 가로 건반으로 연주하고 녹음()하면 건반 소리가 MIDI 음표로 기록되고, 보정으로 다듬어진다 */
export function MelodyPage(p: Props) {
  const { song, settings } = p
  const tracks = song.tracks
  const track = tracks.find((t) => t.id === p.trackId) ?? tracks[0]
  const drum = !!track?.drum
  const [countIn, setCountIn] = useState(true)
  const [flash, setFlash] = useState<Set<number>>(new Set())
  const range = rangeOf(track?.program ?? 0)
  const scaleOn = settings.scaleType !== 'none'

  const sound = soundRangeOf(track?.program ?? 0)
  const defaultBase = () => {
    // 처음 보이는 건반은 그 악기가 잘 어울리는 음역 가운데쯤
    const c = Math.floor((((sound.low + sound.high) / 2 - 12) / 12)) * 12
    return Math.max(Math.floor(range.low / 12) * 12, c)
  }
  const [base, setBase] = useState(defaultBase)
  const [whiteCount, setWhiteCount] = useState(21)
  const [assist, setAssist] = useState<Assist>('free')
  const [replace, setReplace] = useState(false)
  const [corr, setCorr] = useState<Correction>(DEFAULT_CORRECTION)
  const [presetId, setPresetId] = useState('clean')
  const [down, setDown] = useState<Set<number>>(new Set())
  const chordPcs = useChordPcs(song, p.getTick, settings.showKeyChord)
  const [midiName, setMidiName] = useState<string | null>(null)
  const kbWrap = useRef<HTMLDivElement>(null)
  const snapMap = useRef(new Map<number, number>()) // 누른 건반 → 실제로 소리 난 음(보정된 경우)

  // 악기를 바꾸면 그 악기의 음역으로 건반 위치를 다시 맞춘다
  useEffect(() => {
    setBase(defaultBase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, track?.program])

  // 화면 폭에 맞춰 건반 수를 정한다 (한 건반 폭 약 44px)
  useEffect(() => {
    const el = kbWrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWhiteCount(Math.max(8, Math.min(36, Math.floor(el.clientWidth / 44)))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const shift = useCallback(
    (d: number) => setBase((b) => Math.max(Math.floor(range.low / 12) * 12, Math.min(Math.ceil(range.high / 12) * 12 - 12, b + d * 12))),
    [range.low, range.high],
  )

  const playable = (pitch: number) =>
    pitch >= range.low && pitch <= range.high && (assist !== 'lock' || !scaleOn || inScale(pitch, settings.scaleRoot, settings.scaleType))

  const noteOn = (pitch: number, vel: number) => {
    if (!playable(pitch)) return
    // 음계로 보정: 음계 밖 건반을 눌러도 가장 가까운 음계 안의 음이 소리 나고 기록된다
    const sounded = assist === 'snap' && scaleOn ? nearestInScale(pitch, settings.scaleRoot, settings.scaleType, range.low, range.high) : pitch
    snapMap.current.set(pitch, sounded)
    setDown((s) => new Set(s).add(pitch))
    p.liveOn(sounded, vel)
  }
  const noteOff = (pitch: number) => {
    const sounded = snapMap.current.get(pitch) ?? pitch
    snapMap.current.delete(pitch)
    setDown((s) => {
      const n = new Set(s)
      n.delete(pitch)
      return n
    })
    p.liveOff(sounded)
  }

  // 컴퓨터 키보드와 MIDI 키보드 입력은 항상 최신 상태를 보도록 ref로 연결
  /** 드럼: 레인 하나를 친다 (소리 + 녹음 + 잠깐 빛나기) */
  const hitDrum = (lane: number, pitch?: number) => {
    const l = DRUM_LANES[lane]
    if (!l) return
    const pt = pitch ?? l.pitch
    p.liveOn(pt, 104)
    setTimeout(() => p.liveOff(pt), 90)
    setFlash((f) => new Set(f).add(lane))
    setTimeout(() => setFlash((f) => { const n = new Set(f); n.delete(lane); return n }), 120)
  }
  const api = useRef({ noteOn, noteOff, shift, base, drum, hitDrum })
  useEffect(() => {
    api.current = { noteOn, noteOff, shift, base, drum, hitDrum }
  })

  useEffect(() => {
    const held = new Map<string, number>() // e.code → 누르는 음 (옥타브를 옮겨도 정확히 떼기 위해)
    const typing = (e: KeyboardEvent) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
    const onDown = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return
      if (api.current.drum) {
        for (let i = 0; i < DRUM_LANES.length; i++) {
          const k = DRUM_LANES[i].keys.find((x) => x.code === e.code)
          if (!k) continue
          // 스페이스(킥)가 재생 버튼으로 가지 않게 여기서 멈춘다
          e.preventDefault()
          e.stopImmediatePropagation()
          if (!e.repeat) api.current.hitDrum(i, k.pitch)
          return
        }
        return
      }
      if (e.repeat) return
      if (e.code === 'KeyZ') return api.current.shift(-1)
      if (e.code === 'KeyX') return api.current.shift(1)
      const k = KEYS.find((x) => x[0] === e.code)
      if (!k) return
      e.preventDefault()
      const pitch = api.current.base + k[1]
      held.set(e.code, pitch)
      api.current.noteOn(pitch, 96)
    }
    const onUp = (e: KeyboardEvent) => {
      if (api.current.drum && e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation() }
      const pitch = held.get(e.code)
      if (pitch === undefined) return
      held.delete(e.code)
      api.current.noteOff(pitch)
    }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
      for (const pitch of held.values()) api.current.noteOff(pitch)
    }
  }, [])

  const connectMidi = async () => {
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }
    if (!nav.requestMIDIAccess) return p.onMessage('이 브라우저는 MIDI 키보드 연결을 지원하지 않아요. (크롬·엣지에서 써 보세요)')
    try {
      const access = await nav.requestMIDIAccess()
      const names: string[] = []
      access.inputs.forEach((input) => {
        names.push(input.name ?? 'MIDI 키보드')
        input.onmidimessage = (m) => {
          const d = m.data
          if (!d || d.length < 3) return
          const cmd = d[0] & 0xf0
          if (api.current.drum) {
            if (cmd === 0x90 && d[2] > 0) { const i = laneOf(d[1]); if (i >= 0) api.current.hitDrum(i, d[1]) }
            return
          }
          const pitch = fitPitch(d[1], range.low, range.high)
          if (cmd === 0x90 && d[2] > 0) api.current.noteOn(pitch, d[2])
          else if (cmd === 0x80 || cmd === 0x90) api.current.noteOff(pitch)
        }
      })
      setMidiName(names.length ? names.join(', ') : null)
      p.onMessage(names.length ? `${names.join(', ')} 연결됐어요!` : '연결된 MIDI 키보드가 없어요. 키보드를 꽂고 다시 눌러 주세요.')
    } catch {
      p.onMessage('MIDI 접근이 허용되지 않았어요.')
    }
  }

  /** 보정 설정을 바꾼다. 방금 녹음한 연주가 있으면 바로 다시 적용해서 들어 보며 고를 수 있다. */
  const setCorrection = (next: Correction, preset = '') => {
    setCorr(next)
    setPresetId(preset)
    if (p.lastTake) p.onRecorrect(next)
  }

  const letters = new Map<number, string>()
  for (const [, off, ch] of KEYS) letters.set(base + off, ch)

  const loopOn = settings.loop && settings.loopEnd > settings.loopStart
  const curPart = loopOn
    ? song.sections.find((s) => {
        let bar = 0
        for (const x of song.sections) {
          if (x.id === s.id) return settings.loopStart === bar * song.beatsPerBar * PPQ
          bar += x.bars
        }
        return false
      })
    : undefined

  const rec = () => {
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    if (p.taking) p.onStop()
    else p.onStart({ replace, correction: corr, countIn })
  }

  return (
    <div className={`melody ${drum ? 'drum-mode' : ''}`}>
      <div className="mel-top">
        <button className={`rec-btn ${p.taking ? 'on' : ''}`} onClick={rec} disabled={!track}
          title={p.taking ? '녹음 끝내기' : '녹음 시작: 반주가 나오면서 연주가 기록돼요'}>
          <i />
          {p.taking ? '녹음 끝내기' : '녹음'}
        </button>
        <button className="mel-btn" onClick={p.onPlay} disabled={p.taking}>
          <Icon name={p.playing && !p.taking ? 'stop' : 'play'} size={15} />{p.playing && !p.taking ? '멈추기' : '반주 듣기'}
        </button>
        <label className="mel-track" title="녹음할 악기(트랙)">
          <select value={track?.id} onChange={(e) => p.onTrack(e.target.value)} aria-label="연주할 트랙">
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>{t.drum ? '드럼 · ' : ''}{t.name}</option>
            ))}
          </select>
        </label>
        <button className={countIn ? 'toggle on' : 'toggle'} aria-pressed={countIn} onClick={() => setCountIn(!countIn)} title="녹음 전에 한 마디 동안 박을 세어 줘요 (예비박)">
          <Icon name="countin" size={15} />예비박
        </button>
        <details className="mel-more">
          <summary><Icon name="more" size={16} />설정</summary>
          <div className="mel-pop">
            <div className="mel-pop-row">
              <button className={settings.metronome ? 'toggle on' : 'toggle'} onClick={() => p.onSettings({ metronome: !settings.metronome })}><Icon name="metronome" size={15} />메트로놈</button>
              <button className={replace ? 'toggle on' : 'toggle'} onClick={() => setReplace(!replace)} title="녹음하기 전에 이 구간의 기존 음표를 지우고 새로 녹음해요">덮어쓰기</button>
              <button onClick={connectMidi} title="MIDI 키보드·드럼 패드를 꽂았다면 연결해요">{midiName ? midiName : 'MIDI 기기 연결'}</button>
            </div>
            {!drum && (
              <div className="mel-pop-row">
                <span className="mel-pop-t">틀린 음 도와주기</span>
                <span className="seg assist">
                  {([['free', '자유롭게'], ['snap', '음계로 보정'], ['lock', '음계 안만']] as const).map(([v, t]) => (
                    <button key={v} className={assist === v ? 'on' : ''} onClick={() => setAssist(v)} disabled={v !== 'free' && !scaleOn}>{t}</button>
                  ))}
                </span>
                {track && <span className="range-badge" title="이 악기에 잘 어울리는 음 높이예요. 밖에도 칠 수 있어요.">어울리는 음역 {rangeLabel(sound)}</span>}
              </div>
            )}
            <div className="mel-pop-row">
              <span className="mel-pop-t">연주 보정</span>
              <div className="fix-presets">
                {PRESETS.map((pr) => (
                  <button key={pr.id} className={presetId === pr.id ? 'on' : ''} onClick={() => setCorrection(pr.c, pr.id)} title={pr.desc}>{pr.name}</button>
                ))}
              </div>
            </div>
            <div className="fix-grid">
              <label>
                박자 칸
                <select value={corr.grid} onChange={(e) => setCorrection({ ...corr, grid: +e.target.value })}>
                  {GRIDS.map((g) => <option key={g.v} value={g.v}>{g.label}</option>)}
                </select>
              </label>
              <label>
                칸에 맞추는 힘 <b>{Math.round(corr.strength * 100)}%</b>
                <input type="range" min={0} max={1} step={0.05} value={corr.strength} onChange={(e) => setCorrection({ ...corr, strength: +e.target.value })} disabled={!corr.grid} />
              </label>
              <label>
                세기 고르게 <b>{Math.round(corr.smooth * 100)}%</b>
                <input type="range" min={0} max={1} step={0.05} value={corr.smooth} onChange={(e) => setCorrection({ ...corr, smooth: +e.target.value })} />
              </label>
              <label title="소리가 늦게 들려서 박자가 밀린다면 조절해요 (+는 뒤로, −는 앞으로)">
                소리 지연 보정 <b>{corr.offsetMs > 0 ? '+' : ''}{corr.offsetMs}ms</b>
                <input type="range" min={-150} max={150} step={5} value={corr.offsetMs} onChange={(e) => setCorrection({ ...corr, offsetMs: +e.target.value })} />
              </label>
              {!drum && <label className="chk"><input type="checkbox" checked={corr.toScale} disabled={!scaleOn} onChange={(e) => setCorrection({ ...corr, toScale: e.target.checked })} /> 음계 밖의 음을 음계 안으로</label>}
              {!drum && <label className="chk"><input type="checkbox" checked={corr.lenGrid} onChange={(e) => setCorrection({ ...corr, lenGrid: e.target.checked })} /> 음 길이도 칸에 맞추기</label>}
              {!drum && <label className="chk"><input type="checkbox" checked={corr.clean} onChange={(e) => setCorrection({ ...corr, clean: e.target.checked })} /> 실수로 스친 짧은 음 지우기</label>}
            </div>
          </div>
        </details>
        {p.lastTake && !p.taking && (
          <span className="take-info">
            방금 {p.lastTake.count}개 녹음 <button onClick={p.onDiscard}>지우기</button>
          </span>
        )}
      </div>

      <div className="mel-where">
        <button className={!loopOn ? 'chip on' : 'chip'} onClick={p.onAllParts} title="곡 전체 (지금 위치부터)">전체</button>
        <SongStrip song={song} getTick={p.getTick} onSeek={p.onSeek} onPart={p.onFocusPart} activePart={curPart?.id ?? null} label="녹음할 곳" />
      </div>

      <div className="mel-stage">
        {drum
          ? <DrumRoll song={song} trackId={track?.id ?? ''} getTick={p.getTick} getLive={p.getLive} flash={flash} />
          : <LiveRoll song={song} trackId={track?.id ?? ''} base={base} whiteCount={whiteCount} root={settings.scaleRoot} scale={settings.scaleType} display={settings} getTick={p.getTick} getLive={p.getLive} />}
        <Cue song={song} getTick={p.getTick} playing={p.playing} taking={p.taking} takeFrom={p.takeFrom} />
      </div>

      {drum ? (
        <div className="kit-wrap">
          <DrumKitView onHit={hitDrum} flash={flash} />
          <p className="kb-hint">
            드럼을 눌러 치거나 키보드로 쳐요 · 왼손 <kbd>F</kbd> 스네어 <kbd>R</kbd> 크래시 · 오른손 <kbd>J</kbd> 하이햇(<kbd>K</kbd> 열린 하이햇) <kbd>O</kbd> 라이드 · 가운데 <kbd>G</kbd><kbd>H</kbd> 탐 · <kbd>L</kbd> 플로어 탐 · 엄지 <kbd>Space</kbd> 킥
          </p>
        </div>
      ) : (
        <>
          <div className="kb-bar">
            <button onClick={() => shift(-1)} title="한 옥타브 아래 (Z)"><Icon name="left" size={15} />옥타브<kbd>Z</kbd></button>
            <KeyDisplayControls settings={settings} onSettings={p.onSettings} />
            <button onClick={() => shift(1)} title="한 옥타브 위 (X)"><kbd>X</kbd>옥타브<Icon name="right" size={15} /></button>
          </div>
          <div className="kb-wrap" ref={kbWrap}>
            <HKeyboard
              base={base}
              whiteCount={whiteCount}
              low={range.low}
              high={range.high}
              root={settings.scaleRoot}
              scale={settings.scaleType}
              display={settings}
              lock={assist === 'lock'}
              down={down}
              chordPcs={chordPcs}
              letters={letters}
              onDown={noteOn}
              onUp={noteOff}
            />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * 크게 보여 주는 카운트다운.
 * 먼저 세기 동안: "첫 파트: 인트로 · 준비하세요!" + 4 3 2 1
 * 재생 중 다음 파트가 한 마디 안으로 다가오면: "다음 파트는 코러스입니다! 준비하세요!" + 남은 박
 */
function Cue({ song, getTick, playing, taking, takeFrom }: { song: Song; getTick: () => number; playing: boolean; taking: boolean; takeFrom: number | null }) {
  const [cue, setCue] = useState<{ n: number; text: string; color: string } | null>(null)
  const latest = useRef({ song, getTick, playing, taking, takeFrom })
  useEffect(() => { latest.current = { song, getTick, playing, taking, takeFrom } })
  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = () => {
      const { song, getTick, playing, taking, takeFrom } = latest.current
      let next: { n: number; text: string; color: string } | null = null
      if (playing) {
        const t = getTick()
        const bar = song.beatsPerBar * PPQ
        const rg = rangesOf(song)
        const partAt = (tick: number) => song.sections.find((s) => tick >= rg.get(s.id)!.start && tick < rg.get(s.id)!.end)
        if (taking && takeFrom !== null && t < takeFrom) {
          const p = partAt(takeFrom)
          next = { n: Math.max(1, Math.ceil((takeFrom - t) / PPQ - 0.001)), text: p ? `첫 파트는 ${p.name}! 준비하세요` : '준비하세요!', color: p ? KINDS[p.kind].color : '' }
        } else {
          const up = song.sections.map((s) => rg.get(s.id)!.start).find((st) => st > t && st - t <= bar)
          if (up !== undefined) {
            const p = partAt(up)
            const cur = partAt(t)
            if (p && cur && p.id !== cur.id) next = { n: Math.max(1, Math.ceil((up - t) / PPQ - 0.001)), text: `다음 파트는 ${p.name}입니다! 준비하세요`, color: KINDS[p.kind].color }
          }
        }
      }
      const key = next ? `${next.n}|${next.text}` : ''
      if (key !== last) {
        last = key
        setCue(next)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  if (!cue) return null
  return (
    <div className="cue" style={{ ['--c' as string]: cue.color || 'var(--accent)' }} aria-live="assertive">
      <span className="cue-text">{cue.text}</span>
      <b key={cue.n} className="cue-n">{cue.n}</b>
    </div>
  )
}
