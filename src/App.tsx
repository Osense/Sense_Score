import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { PianoRoll } from './components/PianoRoll'
import { StaffEditor } from './components/StaffEditor'
import { Toolbar } from './components/Toolbar'
import { TempoControl } from './components/TempoControl'
import { KeyDisplayControls } from './components/KeyDisplayControls'
import { ArrangePage, type ScaffoldPhase } from './components/ArrangePage'
import { DeliverPage } from './components/DeliverPage'
import { HelpModal } from './components/HelpModal'
import { MixPage } from './components/MixPage'
import { WorkspaceTabs, type Workspace } from './components/WorkspaceTabs'
import { Wizard } from './components/Wizard'
import { MelodyPage } from './components/MelodyPage'
import { Recorder } from './recorder'
import { correctTake, type Correction } from './correct'
import { TrackPanel } from './components/TrackPanel'
import { LearnPanel } from './components/LearnPanel'
import { PracticePanel } from './components/PracticePanel'
import { AudioEngine } from './engine/audio'
import { Player } from './engine/player'
import { useHistory } from './history'
import { exportMidi, importMidi } from './midi'
import { defaultSettings, defaultSong, loadSaved, newTrack, parseProject, save } from './storage'
import { diatonicChords, DRUM_PARTS, SCALES } from './music'
import { fitGroup, fitPitch, rangeLabel, rangeOf } from './instruments'
import { codeFromHash, decodeSong, encodeSong, shareUrl } from './share'
import { applySections, ceil4, KINDS, namesFor, normalizeSong, rangesOf, STRUCTURES, type PlanItem } from './sections'
import { autoPlans, findRoleTrack, generate, type PartPlan } from './scaffold'
import { PPQ, uid, type Note, type Section, type SectionKind, type Settings, type Song, type Tool, type Track } from './types'

const SNAPS = [
  { label: '4분음표 (한 박)', v: PPQ },
  { label: '8분음표 (2등분)', v: PPQ / 2 },
  { label: '16분음표 (4등분)', v: PPQ / 4 },
  { label: '32분음표', v: PPQ / 8 },
  { label: '셋잇단 8분', v: PPQ / 3 },
]

const saved = loadSaved()
const HELP_FLAG = 'composing-sense:help-seen'

function TimeDisplay({ getTick, song, speed }: { getTick: () => number; song: Song; speed: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const barTicks = song.beatsPerBar * PPQ
    const loop = () => {
      const t = Math.max(0, getTick())
      const bar = Math.floor(t / barTicks) + 1
      const beat = Math.floor((t % barTicks) / PPQ) + 1
      const sec = (t / PPQ) * (60 / (song.bpm * speed))
      const m = Math.floor(sec / 60)
      const s = (sec % 60).toFixed(1).padStart(4, '0')
      if (ref.current) ref.current.textContent = `${bar}마디 ${beat}박 · ${m}:${s}`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [getTick, song.beatsPerBar, song.bpm, speed])
  return <span className="time" ref={ref} />
}

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const hist = useHistory<Song>(saved?.song ?? defaultSong())
  const song = hist.value
  const [settings, setSettingsState] = useState<Settings>(saved?.settings ?? defaultSettings(song))
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const [activeId, setActiveId] = useState(song.tracks[0].id)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(1.5)
  const [follow, setFollow] = useState(true)
  const [mode, setMode] = useState<'keys' | 'score'>('keys')
  const [tool, setTool] = useState<Tool>('pen')
  const [ws, setWs] = useState<Workspace>('start')
  const [incoming, setIncoming] = useState<{ song: Song; scale: Pick<Settings, 'scaleRoot' | 'scaleType'> } | null>(null)
  const [recording, setRecording] = useState(false)
  const recRef = useRef<{ stop: () => Promise<Blob> } | null>(null)
  const [selectedSec, setSelectedSec] = useState<string | null>(null)
  const [plans, setPlans] = useState<Record<string, PartPlan>>({}) // 뼈대 세우기 메뉴판에서 고른 것
  const [phase, setPhase] = useState<ScaffoldPhase>('ask')
  const [showHelp, setShowHelp] = useState(false)
  const [master, setMaster] = useState(0.8)
  const hasSaved = useRef(!!saved).current
  // 멜로디 쓰기(라이브 녹음)
  const [melTrackId, setMelTrackId] = useState('')
  const [take, setTake] = useState(false)
  const [lastTake, setLastTake] = useState<{ count: number; trackId: string; raw: Note[] } | null>(null)
  const takeInfo = useRef<{ trackId: string; correction: Correction } | null>(null)
  const finishTakeRef = useRef<() => void>(() => {})
  const recorderRef = useRef<Recorder | null>(null)
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState<'saved' | 'saving' | 'error'>('saving')
  const latestSave = useRef({ song, settings })
  latestSave.current = { song, settings }

  const audioRef = useRef<{ engine: AudioEngine; player: Player } | null>(null)
  const audio = useCallback(() => {
    if (!audioRef.current) {
      const engine = new AudioEngine()
      const player = new Player(engine, () => hist.ref.current, () => settingsRef.current)
      player.onStop = () => {
        setPlaying(false)
        finishTakeRef.current() // 녹음 중이었다면 여기서 마무리
        // 녹음 중이었다면 끝소리가 사라질 때까지 잠깐 기다렸다가 저장한다
        const rec = recRef.current
        if (!rec) return
        recRef.current = null
        setTimeout(() => {
          void rec.stop().then((blob) => {
            download(blob, `${hist.ref.current.title || '내 곡'}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`, blob.type)
            setRecording(false)
          })
        }, 800)
      }
      audioRef.current = { engine, player }
    }
    return audioRef.current
  }, [hist.ref])

  const active: Track = song.tracks.find((t) => t.id === activeId) ?? song.tracks[0]

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => ({ ...s, ...patch }))
  }, [])

  const flash = (text: string) => {
    setMsg(text)
    setTimeout(() => setMsg((m) => (m === text ? '' : m)), 3500)
  }

  /* ---------- 자동 저장 ---------- */
  useEffect(() => {
    setDirty('saving')
    const t = setTimeout(() => {
      setDirty(save(song, settings) ? 'saved' : 'error')
    }, 600)
    return () => clearTimeout(t)
  }, [song, settings])

  // Tablet browsers may suspend the page without firing beforeunload.
  useEffect(() => {
    const flush = () => {
      const current = latestSave.current
      setDirty(save(current.song, current.settings) ? 'saved' : 'error')
    }
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  /* ---------- 편집 ---------- */
  /** 트랙 전체를 고치고, 음표가 곡 끝을 넘으면 마디를 늘린다 (여러 트랙을 한 번에 고치는 악보 편집용) */
  const editTracks = useCallback(
    (fn: (tracks: Track[]) => Track[], record: boolean) => {
      hist.set((s) => {
        const tracks = fn(s.tracks)
        let maxEnd = 0
        for (const t of tracks) for (const n of t.notes) maxEnd = Math.max(maxEnd, n.start + n.dur)
        const need = ceil4(Math.ceil(maxEnd / (s.beatsPerBar * PPQ))) // 곡이 늘어날 때도 4마디 단위
        return normalizeSong({ ...s, tracks, bars: Math.min(256, Math.max(s.bars, need)) })
      }, record)
    },
    [hist],
  )

  const updateNotes = useCallback(
    (trackId: string, fn: (n: Note[]) => Note[], record: boolean) =>
      editTracks((tracks) => tracks.map((t) => (t.id === trackId ? { ...t, notes: fn(t.notes) } : t)), record),
    [editTracks],
  )

  const changeTrack = (id: string, patch: Partial<Track>) => {
    // 악기를 바꾸면 새 악기의 음역을 벗어난 음표는 옥타브를 옮겨 음역 안으로 넣는다
    if (patch.program !== undefined) {
      const t = song.tracks.find((x) => x.id === id)
      if (t && !t.drum) {
        const r = rangeOf(patch.program)
        const moved = t.notes.filter((n) => fitPitch(n.pitch, r.low, r.high) !== n.pitch).length
        if (moved) {
          patch = { ...patch, notes: t.notes.map((n) => ({ ...n, pitch: fitPitch(n.pitch, r.low, r.high) })) }
          flash(`새 악기의 음역(${rangeLabel(r)}) 밖에 있던 음표 ${moved}개를 옥타브 옮겨 맞췄어요.`)
        }
      }
    }
    hist.set((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }), 'program' in patch)
    // 악기를 바꾸면 바로 들려줘서 적용됐는지 확인할 수 있게
    if (patch.program !== undefined) {
      const idx = song.tracks.findIndex((t) => t.id === id)
      const t = song.tracks[idx]
      if (t && !t.drum) audio().engine.preview(Player.channelFor(song, idx), patch.program, false, t.volume, 64, 90, 0.5)
    }
  }

  const addTrack = (drum: boolean) => {
    const t = newTrack(song.tracks.length, drum)
    if (!drum) t.program = [0, 24, 33, 48, 56, 73][song.tracks.filter((x) => !x.drum).length % 6]
    hist.set((s) => ({ ...s, tracks: [...s.tracks, t] }))
    setActiveId(t.id)
  }

  const removeTrack = (id: string) => {
    const t = song.tracks.find((x) => x.id === id)
    if (!t || song.tracks.length <= 1) return
    if (t.notes.length && !confirm(`"${t.name}" 트랙을 지울까요? (되돌리기로 복구할 수 있어요)`)) return
    hist.set((s) => ({ ...s, tracks: s.tracks.filter((x) => x.id !== id) }))
    if (id === activeId) setActiveId(song.tracks.find((x) => x.id !== id)!.id)
  }

  const setSong = (patch: Partial<Song>, record = true) => hist.set((s) => ({ ...s, ...patch }), record)

  /** 곡 끝(맨 뒤 파트)을 늘리거나 줄인다. 음표가 있는 곳 아래로는 줄이지 않는다. */
  const resizeEnd = (delta: number) =>
    hist.set((s) => {
      let maxEnd = 0
      for (const t of s.tracks) for (const n of t.notes) maxEnd = Math.max(maxEnd, n.start + n.dur)
      const used = ceil4(Math.ceil(maxEnd / (s.beatsPerBar * PPQ)))
      const target = Math.min(256, Math.max(4, used, s.bars + delta))
      const diff = target - s.bars
      const last = s.sections[s.sections.length - 1]
      if (!diff || last.bars + diff < 1) return s
      return { ...s, bars: target, sections: [...s.sections.slice(0, -1), { ...last, bars: last.bars + diff }] }
    })

  /* ---------- 파트(구성) ---------- */
  const applyPlan = (plan: PlanItem[]) => {
    hist.set((s) => applySections(s, plan))
    setSettings({ loop: false, loopStart: 0, loopEnd: plan.reduce((n, p) => n + p.bars, 0) * song.beatsPerBar * PPQ })
  }
  const setMeta = (sections: Section[]) => hist.set((s) => ({ ...s, sections }))

  /** 곡의 틀(형식)을 통째로 바꾼다 */
  const applyStructure = (id: string) => {
    const st = STRUCTURES.find((x) => x.id === id)
    if (!st) return
    if (song.tracks.some((t) => t.notes.length) && !confirm('곡의 틀을 바꾸면 지금 쓴 음표가 모두 지워져요. 바꿀까요? (되돌리기로 복구할 수 있어요)')) return
    const secs = namesFor(st.parts)
    hist.set((x) => applySections(x, secs.map((q) => ({ src: null, kind: q.kind, name: q.name, bars: q.bars }))))
    setPlans({})
    setPhase('ask')
    setSelectedSec(secs[0].id)
    setSettings({ loop: false, loopStart: 0, loopEnd: secs.reduce((n, q) => n + q.bars, 0) * song.beatsPerBar * PPQ })
    flash(`${st.label}(으)로 곡의 틀을 만들었어요. 파트를 끌어서 순서를 바꿔 보세요!`)
  }

  /** 메뉴판에서 고른 설정을 몇 마디만 임시 곡으로 만들어 바로 들려준다 (실제 곡은 그대로) */
  const audition = (plan: PartPlan, bars: number, kind: SectionKind) => {
    const real = hist.ref.current
    const base: Song = {
      ...real,
      bars,
      sections: [{ id: '__aud', kind, name: '미리듣기', bars }],
      tracks: real.tracks.map((t) => ({ ...t, mute: false, solo: false, notes: [] })),
    }
    const tmp = generate(base, settingsRef.current, { __aud: plan })
    const st: Settings = { ...settingsRef.current, loop: false, countIn: false, metronome: false, trainer: { ...settingsRef.current.trainer, on: false } }
    setPlaying(true)
    void audio().player.playTemp(tmp, st)
  }

  /** 메뉴판에서 고른 대로 코드·베이스·드럼 뼈대를 곡에 만든다 */
  const buildScaffold = (ids?: string[], listen?: string) => {
    const filled = autoPlans(hist.ref.current, settingsRef.current, plans)
    setPlans(filled)
    hist.set((x) => generate(x, settingsRef.current, filled, ids))
    if (listen) playPart(listen)
    else flash('뼈대를 세웠어요! 직접 쓰기에서 멜로디를 얹어 보세요 🎶')
  }

  const focusSection = (id: string) => {
    const r = rangesOf(hist.ref.current).get(id)
    if (!r) return
    setSelectedSec(id)
    setSettings({ loop: true, loopStart: r.start, loopEnd: r.end })
    seek(r.start)
    window.dispatchEvent(new CustomEvent('focus-tick', { detail: r.start }))
  }
  const goCompose = (id: string) => {
    setWs('compose')
    setTimeout(() => focusSection(id), 80)
  }
  /** 설정이 다음 렌더 전에 필요한 재생 시작용 */
  const playWith = (patch: Partial<Settings>, from: number) => {
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next
    setSettingsState(next)
    setPlaying(true)
    void audio().player.play(from)
  }
  const playPart = (id: string) => {
    const r = rangesOf(hist.ref.current).get(id)
    if (!r) return
    setSelectedSec(id)
    playWith({ loop: true, loopStart: r.start, loopEnd: r.end }, r.start)
  }
  const playAll = () => {
    const { player } = audio()
    if (player.playing) return player.stop()
    playWith({ loop: false }, 0)
  }
  /** 곡을 처음부터 끝까지 재생하면서 녹음해 소리 파일로 저장 */
  const recordAndSave = async () => {
    if (recording) return
    const { engine } = audio()
    await engine.resume()
    recRef.current = engine.startRecording()
    setRecording(true)
    flash('녹음을 시작했어요. 곡이 끝나면 자동으로 저장돼요.')
    playWith({ loop: false }, 0)
  }
  const makeLink = async () => shareUrl(await encodeSong(hist.ref.current, settingsRef.current))

  /* ---------- 멜로디 쓰기: 건반 연주를 라이브로 녹음 ---------- */
  const melTrack = song.tracks.find((t) => t.id === melTrackId && !t.drum) ?? findRoleTrack(song, 'melody') ?? song.tracks.find((t) => !t.drum)
  const melTrackRef = useRef<string | undefined>(undefined)
  melTrackRef.current = melTrack?.id

  /** 재생 위치(tick)에서 오디오 출력 지연만큼 빼서, 들은 타이밍 그대로 기록되게 한다 */
  const recorder = () =>
    (recorderRef.current ??= new Recorder(() => {
      const a = audioRef.current
      if (!a) return 0
      const c = a.engine.ctx
      const lat = (c.outputLatency || 0) + (c.baseLatency || 0)
      const tps = (hist.ref.current.bpm * settingsRef.current.speed * PPQ) / 60
      return a.player.currentTick() - lat * tps
    }))

  const liveChannel = () => {
    const s = hist.ref.current
    const idx = s.tracks.findIndex((t) => t.id === melTrackRef.current)
    return idx < 0 ? null : { ch: Player.channelFor(s, idx), t: s.tracks[idx] }
  }
  const liveOn = (pitch: number, vel: number) => {
    const c = liveChannel()
    if (!c) return
    const { engine } = audio()
    void engine.resume()
    engine.configure(c.ch, c.t.program, false)
    engine.setVolume(c.ch, c.t.volume)
    engine.noteOn(c.ch, pitch, vel, engine.ctx.currentTime)
    recorder().noteOn(pitch, vel)
  }
  const liveOff = (pitch: number) => {
    const c = liveChannel()
    if (!c) return
    const { engine } = audio()
    engine.noteOff(c.ch, pitch, engine.ctx.currentTime)
    recorder().noteOff(pitch)
  }

  const startTake = (o: { replace: boolean; correction: Correction }) => {
    if (!melTrack) return
    const { player } = audio()
    const st = settingsRef.current
    const loopOn = st.loop && st.loopEnd > st.loopStart
    let from = loopOn ? st.loopStart : Math.max(0, player.currentTick())
    if (from >= player.songEnd()) from = 0
    const end = loopOn ? st.loopEnd : Infinity
    if (o.replace) updateNotes(melTrack.id, (ns) => ns.filter((n) => !(n.start >= from && n.start < end)), true)
    takeInfo.current = { trackId: melTrack.id, correction: o.correction }
    recorder().begin(from)
    setTake(true)
    setLastTake(null)
    playWith({}, from)
  }
  const finishTake = () => {
    const info = takeInfo.current
    if (!info) return
    takeInfo.current = null
    setTake(false)
    const raw = recorder().finish()
    if (!raw.length) return flash('녹음된 음표가 없어요. 건반을 눌러 연주해 보세요!')
    const notes = correctTake(raw, info.correction, correctEnv(info.trackId))
    updateNotes(info.trackId, (ns) => [...ns, ...notes], true)
    setLastTake({ count: notes.length, trackId: info.trackId, raw })
    flash(`🎙 음표 ${notes.length}개를 녹음하고 보정했어요!`)
  }

  /** 보정에 필요한 환경 (템포, 음계, 악기 음역) */
  const correctEnv = (trackId: string) => {
    const s = hist.ref.current
    const st = settingsRef.current
    const t = s.tracks.find((x) => x.id === trackId)
    const r = rangeOf(t?.program ?? 0)
    return { bpm: s.bpm, speed: st.speed, scaleRoot: st.scaleRoot, scaleType: st.scaleType, low: r.low, high: r.high }
  }

  /** 방금 녹음한 연주에 다른 보정을 다시 적용 (원본 연주는 보관해 둔다) */
  const recorrectTake = (c: Correction) => {
    if (!lastTake) return
    const rawIds = new Set(lastTake.raw.map((n) => n.id))
    const notes = correctTake(lastTake.raw, c, correctEnv(lastTake.trackId))
    updateNotes(lastTake.trackId, (ns) => [...ns.filter((n) => !rawIds.has(n.id)), ...notes], false)
    setLastTake({ ...lastTake, count: notes.length })
  }
  const discardTake = () => {
    if (!lastTake) return
    const rawIds = new Set(lastTake.raw.map((n) => n.id))
    updateNotes(lastTake.trackId, (ns) => ns.filter((n) => !rawIds.has(n.id)), true)
    setLastTake(null)
    flash('방금 녹음을 지웠어요.')
  }
  finishTakeRef.current = finishTake

  const goMelody = (id: string) => {
    setWs('melody')
    setTimeout(() => focusSection(id), 80)
  }

  // 친구가 보낸 링크(#s=…)로 들어왔는지 확인
  useEffect(() => {
    const code = codeFromHash(location.hash)
    if (!code) return
    decodeSong(code)
      .then((r) => setIncoming({ song: r.song, scale: r.settings }))
      .catch(() => flash('링크 속 곡을 읽지 못했어요.'))
  }, [])
  const openIncoming = () => {
    if (!incoming) return
    stop()
    hist.reset(incoming.song)
    setActiveId(incoming.song.tracks[0].id)
    setSettingsState({ ...defaultSettings(incoming.song), ...incoming.scale })
    history.replaceState(null, '', location.pathname)
    setIncoming(null)
    setWs('deliver')
    flash('친구의 곡을 열었어요! 먼저 들어 보고 평가도 받아 보세요 🎧')
  }
  const changeMaster = (v: number) => {
    setMaster(v)
    audio().engine.setMasterVolume(v)
  }

  const preview = (pitch: number, trackId?: string) => {
    const { engine } = audio()
    const idx = Math.max(0, song.tracks.findIndex((t) => t.id === (trackId ?? active.id)))
    const t = song.tracks[idx]
    engine.preview(Player.channelFor(song, idx), t.program, t.drum, t.volume, pitch)
  }

  /* ---------- 재생 ---------- */
  const getTick = useCallback(() => audioRef.current?.player.currentTick() ?? 0, [])

  const togglePlay = useCallback(async () => {
    const { player } = audio()
    if (player.playing) {
      player.pause()
    } else {
      setPlaying(true)
      let from = player.currentTick()
      if (from >= player.songEnd()) from = 0
      await player.play(from)
    }
  }, [audio])

  const stop = useCallback(() => audioRef.current?.player.stop(), [])

  const seek = (tick: number) => {
    const { player } = audio()
    if (player.playing) void player.play(tick)
    else player.seek(tick)
  }

  /* ---------- 코드 넣기 ---------- */
  const insertChord = (offsets: number[], root: number, atTick?: number) => {
    const barTicks = song.beatsPerBar * PPQ
    const cur = atTick ?? Math.floor(Math.max(0, getTick()) / barTicks) * barTicks
    let base = 48 + ((root - 48) % 12 + 12) % 12
    if (active.drum) return
    base = Math.min(base, 60)
    const r = rangeOf(active.program)
    const pitches = fitGroup(offsets.map((o) => base + o), r.low, r.high)
    const notes: Note[] = pitches.map((pitch) => ({ id: uid(), pitch, start: cur, dur: barTicks, vel: 80 }))
    updateNotes(active.id, (ns) => [...ns, ...notes], true)
    notes.forEach((n) => preview(n.pitch))
    if (atTick === undefined) seek(cur + barTicks)
  }

  const insertProgression = (indices: number[]) => {
    const barTicks = song.beatsPerBar * PPQ
    const start = Math.floor(Math.max(0, getTick()) / barTicks) * barTicks
    const chords = diatonicChords(settings.scaleRoot, settings.scaleType)
    const all: Note[] = []
    indices.forEach((ci, i) => {
      const c = chords[ci]
      const base = Math.min(48 + ((c.root - 48) % 12 + 12) % 12, 60)
      const r = rangeOf(active.program)
      fitGroup(c.offsets.map((o) => base + o), r.low, r.high).forEach((pitch) =>
        all.push({ id: uid(), pitch, start: start + i * barTicks, dur: barTicks, vel: 80 }),
      )
    })
    updateNotes(active.id, (ns) => [...ns, ...all], true)
    seek(start + indices.length * barTicks)
  }

  /* ---------- 파일 ---------- */
  const fileRef = useRef<HTMLInputElement>(null)
  const projectRef = useRef<HTMLInputElement>(null)
  const sfRef = useRef<HTMLInputElement>(null)
  const [sfName, setSfName] = useState<string | null>(null)

  const openMidi = async (f: File) => {
    try {
      const s = importMidi(await f.arrayBuffer(), f.name)
      if (!s.tracks.length) return flash('음표가 있는 트랙이 없는 파일이에요.')
      stop()
      hist.reset(s)
      setActiveId(s.tracks[0].id)
      setSettingsState(defaultSettings(s))
      setWs('compose')
      flash(`"${f.name}"을(를) 불러왔어요.`)
    } catch {
      flash('MIDI 파일을 읽지 못했어요.')
    }
  }

  const saveMidi = () => {
    download(exportMidi(song), `${song.title || '내 곡'}.mid`, 'audio/midi')
    flash('.mid 파일로 저장했어요.')
  }

  const backupProject = () => {
    download(JSON.stringify({ format: 'sense-score', version: 1, song, settings }, null, 2),
      `${song.title || '내 곡'}.sense.json`, 'application/json')
    void navigator.storage?.persist?.().catch(() => false)
    flash('곡과 설정을 기기에 백업했어요.')
  }

  const restoreProject = async (file: File) => {
    try {
      const data = parseProject(await file.text())
      if (!confirm('현재 곡을 백업 파일의 곡으로 바꿀까요? 필요한 곡은 먼저 백업해 주세요.')) return
      stop()
      hist.reset(data.song)
      setSettingsState(data.settings)
      setActiveId(data.song.tracks[0].id)
      setPlans({})
      setWs('compose')
      flash('프로젝트 백업을 복원했어요.')
    } catch {
      flash('올바른 Sense Score 프로젝트 파일을 선택해 주세요.')
    }
  }

  const loadSf = async (f: File) => {
    try {
      flash('음색 파일을 불러오는 중…')
      await audio().engine.loadSoundfont(await f.arrayBuffer(), f.name)
      setSfName(f.name)
      flash(`음색 "${f.name}" 적용!`)
    } catch {
      flash('음색 파일을 불러오지 못했어요 (.sf2 / .sf3 / .dls).')
    }
  }

  const newSong = () => setWs('start') // 마법사에서 새 곡을 만들기 전에는 지금 곡이 그대로 남는다

  const createFromWizard = (next: Song, st: Settings) => {
    stop()
    hist.reset(next)
    setActiveId(next.tracks[0].id)
    setSettingsState(st)
    setSelectedSec(next.sections[0].id)
    setPlans({})
    setPhase('ask')
    setWs('arrange')
    flash('곡이 만들어졌어요! 이제 곡의 틀(형식)을 골라 보세요.')
  }

  const blankSong = () => {
    stop()
    const s = defaultSong()
    hist.reset(s)
    setActiveId(s.tracks[0].id)
    setSettingsState(defaultSettings(s))
    setWs('compose')
  }

  // 작곡 화면에 처음 들어오면 도구 사용법을 한 번 보여 준다
  useEffect(() => {
    if (ws !== 'compose') return
    try {
      if (!localStorage.getItem(HELP_FLAG)) {
        localStorage.setItem(HELP_FLAG, '1')
        setShowHelp(true)
      }
    } catch { /* 저장소를 못 쓰면 그냥 넘어간다 */ }
  }, [ws])

  /* ---------- 단축키 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && !(el as HTMLInputElement).type?.match(/range|checkbox/)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) hist.redo()
        else hist.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        hist.redo()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveMidi()
      } else if (e.key === ' ' && el.tagName !== 'BUTTON') {
        e.preventDefault()
        void togglePlay()
      } else if (e.key === 'Home') {
        stop()
      } else if (ws === 'compose' && !mod && !e.altKey && '1234'.includes(e.key) && e.key.length === 1) {
        setTool((['pen', 'eraser', 'hand', 'select'] as const)[+e.key - 1])
      } else if (ws === 'compose' && !mod && !e.altKey && !e.repeat && active.drum) {
        // 드럼 트랙: 컴퓨터 키보드로 파트 소리 내기
        const part = DRUM_PARTS.find((d) => d.key === e.key.toUpperCase())
        if (part) {
          preview(part.pitch)
          window.dispatchEvent(new CustomEvent('drum-hit', { detail: part.pitch }))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => () => audioRef.current?.player.stop(), [])

  const barTicks = song.beatsPerBar * PPQ

  const common = {
    song,
    settings,
    zoom,
    follow,
    playing,
    tool,
    getTick,
    onCheckpoint: hist.checkpoint,
    onUndo: hist.undo,
    onPreview: preview,
    onSeek: seek,
    onLoop: (a: number, b: number) => setSettings({ loop: true, loopStart: a, loopEnd: b }),
  }
  const zoomBy = (d: number) => setZoom((z) => Math.min(2.5, Math.max(0.4, Math.round((z + d) * 10) / 10)))

  const compose = ws === 'compose'
  const rg = rangesOf(song)
  const loopSec = song.sections.find((s) => {
    const r = rg.get(s.id)!
    return settings.loop && settings.loopStart === r.start && settings.loopEnd === r.end
  })

  const soundfontPanel = (
    <section className="panel">
      <h3>소리 파일</h3>
      <p className="note-text">
        지금은 {sfName ? <b>{sfName}</b> : '내장 간단한 소리'}를 쓰고 있어요. 더 실감 나는 악기 소리를 원하면 사운드폰트(.sf2/.sf3)를 불러오세요.
      </p>
      <div className="row-btns">
        <button onClick={() => sfRef.current?.click()}>🎹 불러오기</button>
        {sfName && (
          <button
            onClick={() => {
              audio().engine.useBuiltin()
              setSfName(null)
            }}
          >
            내장 소리로
          </button>
        )}
      </div>
    </section>
  )

  return (
    <div className="app">
      <header className="top">
        <div className="brand">🎼 작곡 놀이터</div>
        <input
          className="title"
          value={song.title}
          onFocus={hist.checkpoint}
          onChange={(e) => setSong({ title: e.target.value }, false)}
          aria-label="곡 제목"
        />
        <div className="grow" />
        <button onClick={hist.undo} disabled={!hist.canUndo} title="되돌리기 (Ctrl+Z)">↶ 되돌리기</button>
        <button onClick={hist.redo} disabled={!hist.canRedo} title="다시하기 (Ctrl+Y)">↷ 다시</button>
        <span className="sep" />
        <button onClick={() => setShowHelp(true)} title="도구 사용법">❓ 사용법</button>
        <button onClick={newSong}>📄 새 곡</button>
        <button onClick={() => fileRef.current?.click()}>📂 열기(.mid)</button>
        <button className="primary" onClick={saveMidi} title="Ctrl+S">💾 저장(.mid)</button>
        <button onClick={backupProject}>프로젝트 백업</button>
        <button onClick={() => projectRef.current?.click()}>백업 복원</button>
      </header>
      <div className={`local-status ${dirty === 'error' ? 'error' : ''}`} role="status" aria-live="polite">
        <span>{dirty === 'saved' ? '이 기기에 자동 저장됨 ✓' : dirty === 'error' ? '자동 저장 실패 — 저장 공간·브라우저 설정을 확인하고 프로젝트를 백업해 주세요.' : '이 기기에 저장 중…'}</span>
        <small>작업 내용은 서버에 전송되지 않아요. 브라우저 데이터 삭제 전에는 프로젝트를 백업해 주세요.</small>
        {dirty === 'error' && <button onClick={() => setDirty(save(song, settings) ? 'saved' : 'error')}>저장 재시도</button>}
      </div>
      <input ref={projectRef} type="file" accept=".json,application/json" hidden onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) void restoreProject(f)
        e.target.value = ''
      }} />
      <input
        ref={fileRef}
        type="file"
        accept=".mid,.midi,audio/midi"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void openMidi(f)
          e.target.value = ''
        }}
      />
      <input
        ref={sfRef}
        type="file"
        accept=".sf2,.sf3,.dls"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void loadSf(f)
          e.target.value = ''
        }}
      />

      {ws !== 'start' && (
        <div className="transport">
          <button className="big" onClick={stop} title="처음으로 (Home)">⏹</button>
          <button className="big play" onClick={() => void togglePlay()} title="재생/일시정지 (스페이스)">
            {playing ? '⏸' : '▶'}
          </button>
          <TimeDisplay getTick={getTick} song={song} speed={settings.speed} />
          <span className="sep" />
          <TempoControl value={song.bpm} onChange={(bpm) => setSong({ bpm }, false)} onCheckpoint={hist.checkpoint} />
          <label className="inline" title="한 마디가 몇 박인지">
            박자
            <select value={song.beatsPerBar} onChange={(e) => setSong({ beatsPerBar: +e.target.value })}>
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>{n}/4</option>
              ))}
            </select>
          </label>
          <label className="inline" title="느리게 연습하거나 빠르게 들어보기">
            속도 ×{settings.speed.toFixed(2)}
            <input type="range" min={0.25} max={2} step={0.05} value={settings.speed} onChange={(e) => setSettings({ speed: +e.target.value })} />
          </label>
          <span className="sep" />
          <button
            className={settings.loop ? 'toggle on' : 'toggle'}
            onClick={() => {
              const end = song.bars * barTicks
              if (!settings.loop && settings.loopEnd <= settings.loopStart) setSettings({ loop: true, loopStart: 0, loopEnd: end })
              else setSettings({ loop: !settings.loop })
            }}
            title="눈금자(위쪽 마디 숫자)를 끌거나 파트 이름을 눌러서 반복할 구간을 정해요"
          >
            🔁 반복
          </button>
          <button
            className={settings.metronome ? 'toggle on' : 'toggle'}
            onClick={() => setSettings({ metronome: !settings.metronome })}
            title="박자를 알려주는 딱딱 소리"
          >
            🥁 메트로놈
          </button>
          <button
            className={settings.countIn ? 'toggle on' : 'toggle'}
            onClick={() => setSettings({ countIn: !settings.countIn })}
            title="재생 전에 한 마디 박자를 세어줘요"
          >
            ⏱ 먼저 세기
          </button>
          {compose && (
            <>
              <span className="sep" />
              <label className="inline" title="음표를 놓을 수 있는 가장 작은 칸. 16분음표로 하면 한 박을 4등분해서 찍을 수 있어요">
                최소 칸
                <select value={settings.snap} onChange={(e) => setSettings({ snap: +e.target.value })}>
                  {SNAPS.map((s) => (
                    <option key={s.v} value={s.v}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="inline">
                확대
                <input type="range" min={0.4} max={2.5} step={0.1} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
              </label>
              <label className="check" title="재생 중 화면이 따라가요">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                <span>따라가기</span>
              </label>
              <button onClick={() => resizeEnd(4)}>＋ 4마디</button>
              <button onClick={() => resizeEnd(-4)} title="음표가 있는 곳까지만 줄여요 (맨 뒤 파트가 줄어요)">
                － 4마디
              </button>
            </>
          )}
        </div>
      )}

      {ws === 'start' && (
        <Wizard
          hasSaved={hasSaved}
          incoming={incoming ? { title: incoming.song.title } : null}
          onOpenIncoming={openIncoming}
          onCreate={createFromWizard}
          onBlank={blankSong}
          onContinue={() => setWs('compose')}
          onImport={() => fileRef.current?.click()}
          onScaleDemo={(root, type) => audio().engine.playScale(root, SCALES[type].steps)}
          onBeatDemo={(bpm, beats) => audio().engine.playBeats(bpm, beats)}
        />
      )}

      {ws === 'arrange' && (
        <ArrangePage
          song={song}
          settings={settings}
          selectedId={selectedSec}
          onSelect={setSelectedSec}
          onPlan={applyPlan}
          onMeta={setMeta}
          onCompose={goCompose}
          onMelody={goMelody}
          onPreview={playPart}
          onApplyStructure={applyStructure}
          phase={phase}
          onPhase={setPhase}
          plans={plans}
          onPlans={setPlans}
          onScaffold={buildScaffold}
          onAudition={audition}
        />
      )}

      {ws === 'melody' && (
        <MelodyPage
          song={song}
          settings={settings}
          trackId={melTrack?.id ?? ''}
          onTrack={setMelTrackId}
          taking={take}
          lastTake={lastTake}
          selectedSec={selectedSec}
          playing={playing}
          getTick={getTick}
          getLive={() => recorder().snapshot()}
          liveOn={liveOn}
          liveOff={liveOff}
          onStart={startTake}
          onStop={() => audio().player.stop()}
          onPlay={() => void togglePlay()}
          onSettings={setSettings}
          onFocusPart={focusSection}
          onAllParts={() => {
            setSettings({ loop: false })
            setSelectedSec(null)
            seek(0)
          }}
          onRecorrect={recorrectTake}
          onDiscard={discardTake}
          onMessage={flash}
        />
      )}

      {compose && (
        <main className="main">
          <Toolbar
            tool={tool}
            onTool={setTool}
            onUndo={hist.undo}
            onRedo={hist.redo}
            canUndo={hist.canUndo}
            canRedo={hist.canRedo}
            onZoom={zoomBy}
          />
          <div className="editor">
            <div className="editor-head">
            <div className="mode-tabs">
              <button className={mode === 'keys' ? 'tab on' : 'tab'} onClick={() => setMode('keys')}>
                {active.drum ? '🥁 드럼' : '🎹 건반'}
              </button>
              <button className={mode === 'score' ? 'tab on' : 'tab'} onClick={() => setMode('score')}>
                🎼 악보
              </button>
            </div>
            <div className="part-strip">
              <span className="lbl">파트</span>
              <button
                className={!loopSec ? 'chip on' : 'chip'}
                onClick={() => {
                  setSettings({ loop: false })
                  setSelectedSec(null)
                  window.dispatchEvent(new CustomEvent('focus-tick', { detail: 0 }))
                }}
                title="곡 전체 보기"
              >
                전체
              </button>
              {song.sections.map((s) => (
                <button
                  key={s.id}
                  className={loopSec?.id === s.id ? 'chip on' : 'chip'}
                  style={{ ['--c' as string]: KINDS[s.kind].color }}
                  onClick={() => focusSection(s.id)}
                  title={`${s.name} (${s.bars}마디) — 이 파트만 반복하며 작곡`}
                >
                  {s.name}
                </button>
              ))}
              <button className="chip ghost" onClick={() => setWs('arrange')}>🧩 파트 편집</button>
            </div>
            <span className="cur-track" title="지금 쓰고 있는 트랙과, 그 악기가 낼 수 있는 음역">
              <i style={{ background: active.color }} /> {active.name}
              {!active.drum && <small className="range-badge">음역 {rangeLabel(rangeOf(active.program))}</small>}
            </span>
            </div>
            {mode === 'keys' && !active.drum && <KeyDisplayControls settings={settings} onSettings={setSettings} />}
            {mode === 'keys' ? (
              <PianoRoll
                key={`k${active.id}`}
                {...common}
                track={active}
                onNotes={(fn, record) => updateNotes(active.id, fn, record)}
              />
            ) : (
              <StaffEditor
                {...common}
                activeId={active.id}
                onEdit={editTracks}
                onSelectTrack={setActiveId}
                onSettings={setSettings}
                onTitle={(title) => setSong({ title }, false)}
              />
            )}
          </div>
          <aside className="side">
            <TrackPanel
              song={song}
              activeId={active.id}
              onSelect={setActiveId}
              onChange={changeTrack}
              onCheckpoint={hist.checkpoint}
              onAdd={addTrack}
              onRemove={removeTrack}
            />
            <LearnPanel
              settings={settings}
              drumTrack={active.drum}
              onSettings={setSettings}
              onChord={(o, r) => insertChord(o, r)}
              onProgression={insertProgression}
            />
            <PracticePanel settings={settings} onSettings={setSettings} />
            {soundfontPanel}
          </aside>
        </main>
      )}

      {ws === 'mix' && (
        <MixPage
          song={song}
          master={master}
          onMaster={changeMaster}
          onChange={changeTrack}
          onCheckpoint={hist.checkpoint}
          onAdd={addTrack}
          onRemove={removeTrack}
        >
          {soundfontPanel}
        </MixPage>
      )}

      {ws === 'deliver' && (
        <DeliverPage
          song={song}
          settings={settings}
          playing={playing}
          recording={recording}
          getTick={getTick}
          onPlayAll={playAll}
          onStop={stop}
          onSeek={seek}
          onExportMidi={saveMidi}
          onRecord={() => void recordAndSave()}
          makeLink={makeLink}
          onCompose={goCompose}
          onWrite={() => setWs('compose')}
          onMessage={flash}
        />
      )}

      <WorkspaceTabs ws={ws} onChange={setWs} />
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}
