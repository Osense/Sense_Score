import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_CORRECTION, PRESETS, type Correction } from '../correct'
import { nearestInScale } from '../editActions'
import { fitPitch, rangeLabel, rangeOf } from '../instruments'
import { inScale, NOTE_NAMES_KO } from '../music'
import { KINDS } from '../sections'
import { PPQ, type Note, type Settings, type Song } from '../types'
import { HKeyboard } from './HKeyboard'
import { LiveRoll } from './LiveRoll'

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
  onStart: (o: { replace: boolean; correction: Correction }) => void
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

/** 멜로디 쓰기: 가로 건반으로 연주하고 녹음(⏺)하면 건반 소리가 MIDI 음표로 기록되고, 보정으로 다듬어진다 */
export function MelodyPage(p: Props) {
  const { song, settings } = p
  const tracks = song.tracks.filter((t) => !t.drum)
  const track = tracks.find((t) => t.id === p.trackId) ?? tracks[0]
  const range = rangeOf(track?.program ?? 0)
  const scaleOn = settings.scaleType !== 'none'

  const defaultBase = () => {
    const c = Math.floor((((range.low + range.high) / 2 - 12) / 12)) * 12
    return Math.max(Math.floor(range.low / 12) * 12, c)
  }
  const [base, setBase] = useState(defaultBase)
  const [whiteCount, setWhiteCount] = useState(21)
  const [assist, setAssist] = useState<Assist>('free')
  const [replace, setReplace] = useState(false)
  const [corr, setCorr] = useState<Correction>(DEFAULT_CORRECTION)
  const [presetId, setPresetId] = useState('clean')
  const [down, setDown] = useState<Set<number>>(new Set())
  const [chordPcs, setChordPcs] = useState<Set<number>>(new Set())
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

  // 지금 울리는 반주 화음의 구성음을 건반에 알려 준다 (멜로디가 그 음을 노리면 잘 어울려요)
  const latest = useRef(p)
  useEffect(() => {
    latest.current = p
  })
  useEffect(() => {
    let last = ''
    const id = window.setInterval(() => {
      const { song: s, getTick } = latest.current
      const t = getTick()
      const ct = s.tracks.find((x) => x.role === 'chords') ?? s.tracks.find((x) => !x.drum && (x.name.includes('코드') || x.name.includes('반주')))
      const pcs = new Set<number>()
      for (const n of ct?.notes ?? []) if (n.start <= t && t < n.start + n.dur) pcs.add(n.pitch % 12)
      const key = [...pcs].sort().join(',')
      if (key !== last) {
        last = key
        setChordPcs(pcs)
      }
    }, 120)
    return () => clearInterval(id)
  }, [])

  const shift = useCallback(
    (d: number) => setBase((b) => Math.max(Math.floor(range.low / 12) * 12, Math.min(Math.ceil(range.high / 12) * 12 - 12, b + d * 12))),
    [range.low, range.high],
  )

  const playable = (pitch: number) =>
    pitch >= range.low && pitch <= range.high && (assist !== 'lock' || !scaleOn || inScale(pitch, settings.scaleRoot, settings.scaleType))

  const noteOn = (pitch: number, vel: number) => {
    if (!playable(pitch)) return
    // 🧲 음계로 보정: 음계 밖 건반을 눌러도 가장 가까운 음계 안의 음이 소리 나고 기록된다
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
  const api = useRef({ noteOn, noteOff, shift, base })
  useEffect(() => {
    api.current = { noteOn, noteOff, shift, base }
  })

  useEffect(() => {
    const held = new Map<string, number>() // e.code → 누르는 음 (옥타브를 옮겨도 정확히 떼기 위해)
    const typing = (e: KeyboardEvent) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
    const onDown = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
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
      const pitch = held.get(e.code)
      if (pitch === undefined) return
      held.delete(e.code)
      api.current.noteOff(pitch)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
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
          const pitch = fitPitch(d[1], range.low, range.high)
          if (cmd === 0x90 && d[2] > 0) api.current.noteOn(pitch, d[2])
          else if (cmd === 0x80 || cmd === 0x90) api.current.noteOff(pitch)
        }
      })
      setMidiName(names.length ? names.join(', ') : null)
      p.onMessage(names.length ? `🎹 ${names.join(', ')} 연결됐어요!` : '연결된 MIDI 키보드가 없어요. 키보드를 꽂고 다시 눌러 주세요.')
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

  return (
    <div className="melody">
      <div className="part-strip mel-parts">
        <span className="lbl">녹음할 곳</span>
        <button className={!loopOn ? 'chip on' : 'chip'} onClick={p.onAllParts} title="곡 전체를 처음부터 (또는 지금 위치부터)">전체</button>
        {song.sections.map((s) => (
          <button
            key={s.id}
            className={curPart?.id === s.id ? 'chip on' : 'chip'}
            style={{ ['--c' as string]: KINDS[s.kind].color }}
            onClick={() => p.onFocusPart(s.id)}
            title={`${s.name} (${s.bars}마디) — 이 파트만 반복하며 녹음`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="mel-controls">
        <button
          className={`rec-btn ${p.taking ? 'on' : ''}`}
          onClick={() => (p.taking ? p.onStop() : p.onStart({ replace, correction: corr }))}
          disabled={!track}
          title={p.taking ? '녹음 끝내기' : '녹음 시작: 반주가 나오면서 건반 연주가 기록돼요'}
        >
          <i />
          {p.taking ? '녹음 중… 눌러서 끝내기' : '녹음'}
        </button>
        <button onClick={p.onPlay} disabled={p.taking}>{p.playing && !p.taking ? '⏸ 반주 멈추기' : '▶ 반주만 듣기'}</button>
        <label className="inline">
          연주할 트랙
          <select value={track?.id} onChange={(e) => p.onTrack(e.target.value)}>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        {track && <span className="range-badge" title="이 악기가 낼 수 있는 음역">음역 {rangeLabel(range)}</span>}
        <span className="sep" />
        <button className={settings.countIn ? 'toggle on' : 'toggle'} onClick={() => p.onSettings({ countIn: !settings.countIn })} title="녹음 전에 한 마디 박자를 세어줘요">⏱ 먼저 세기</button>
        <button className={settings.metronome ? 'toggle on' : 'toggle'} onClick={() => p.onSettings({ metronome: !settings.metronome })}>🥁 메트로놈</button>
        <button className={replace ? 'toggle on' : 'toggle'} onClick={() => setReplace(!replace)} title="녹음하기 전에 이 구간의 기존 음표를 지우고 새로 녹음해요">🧹 덮어쓰기</button>
        <span className="seg assist" title="연주하는 동안 틀린 음을 어떻게 도와줄지">
          {([['free', '자유롭게'], ['snap', '🧲 음계로 보정'], ['lock', '🔒 음계 안만']] as const).map(([v, t]) => (
            <button key={v} className={assist === v ? 'on' : ''} onClick={() => setAssist(v)} disabled={v !== 'free' && !scaleOn} title={v === 'snap' ? '음계 밖 건반을 눌러도 가장 가까운 음계 음이 소리 나요' : v === 'lock' ? '음계 밖 건반은 눌리지 않아요' : '아무 건반이나 눌러요'}>
              {t}
            </button>
          ))}
        </span>
        <button onClick={connectMidi} title="MIDI 키보드를 꽂았다면 연결해서 진짜 건반으로 연주해요">{midiName ? `🎹 ${midiName}` : '🎹 MIDI 키보드 연결'}</button>
        {p.lastTake && !p.taking && (
          <span className="take-info">
            ✅ 방금 {p.lastTake.count}개 녹음됨 <button onClick={p.onDiscard}>🗑 이 녹음 지우기</button>
          </span>
        )}
      </div>

      <div className="mel-fix">
        <span className="fix-title">🪄 연주 보정</span>
        <div className="fix-presets">
          {PRESETS.map((pr) => (
            <button key={pr.id} className={presetId === pr.id ? 'on' : ''} onClick={() => setCorrection(pr.c, pr.id)} title={pr.desc}>
              {pr.name}
            </button>
          ))}
        </div>
        <details className="fix-more">
          <summary>세부 설정</summary>
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
            <label className="chk"><input type="checkbox" checked={corr.toScale} disabled={!scaleOn} onChange={(e) => setCorrection({ ...corr, toScale: e.target.checked })} /> 음계 밖의 음을 음계 안으로</label>
            <label className="chk"><input type="checkbox" checked={corr.lenGrid} onChange={(e) => setCorrection({ ...corr, lenGrid: e.target.checked })} /> 음 길이도 칸에 맞추기</label>
            <label className="chk"><input type="checkbox" checked={corr.clean} onChange={(e) => setCorrection({ ...corr, clean: e.target.checked })} /> 실수로 스친 짧은 음 지우기</label>
          </div>
        </details>
        <span className="fix-note">
          {p.lastTake && !p.taking ? '👆 보정을 바꾸면 방금 녹음에 바로 적용돼요. 들어 보며 골라 보세요!' : '녹음이 끝나면 이 설정으로 다듬어져요. 녹음한 뒤에도 바꿀 수 있어요.'}
        </span>
      </div>

      <LiveRoll song={song} trackId={track?.id ?? ''} base={base} whiteCount={whiteCount} root={settings.scaleRoot} scale={settings.scaleType} getTick={p.getTick} getLive={p.getLive} />

      <div className="kb-bar">
        <button onClick={() => shift(-1)} title="한 옥타브 아래 (Z)">◀ 옥타브</button>
        <span className="kb-legend" aria-label="건반 색 설명">
          {scaleOn ? (
            <>
              <i className="lg root" /> 으뜸음({NOTE_NAMES_KO[settings.scaleRoot]})
              <i className="lg scale" /> 추천 음계
              <i className="lg chord" /> 지금 화음의 음
              <i className="lg out" /> 음계 밖
            </>
          ) : (
            <span>음계를 정하면 어울리는 건반이 색으로 표시돼요 (직접 쓰기의 음계 도우미)</span>
          )}
        </span>
        <button onClick={() => shift(1)} title="한 옥타브 위 (X)">옥타브 ▶</button>
      </div>
      <div className="kb-wrap" ref={kbWrap}>
        <HKeyboard
          base={base}
          whiteCount={whiteCount}
          low={range.low}
          high={range.high}
          root={settings.scaleRoot}
          scale={settings.scaleType}
          lock={assist === 'lock'}
          down={down}
          chordPcs={chordPcs}
          letters={letters}
          onDown={noteOn}
          onUp={noteOff}
        />
      </div>
      <p className="kb-hint">
        건반을 눌러 연주해요 · 컴퓨터 키보드 <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd>… 흰 건반, <kbd>W</kbd><kbd>E</kbd><kbd>T</kbd>… 검은 건반, <kbd>Z</kbd>/<kbd>X</kbd> 옥타브 · 건반 아래쪽을 누를수록 세게 나요
      </p>
    </div>
  )
}
