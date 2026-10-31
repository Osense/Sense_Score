import { diatonicChords, NOTE_NAMES_KO, SCALES } from '../music'
import type { ScaleType, Settings } from '../types'

interface Props {
  settings: Settings
  drumTrack: boolean
  onSettings: (patch: Partial<Settings>) => void
  onChord: (offsets: number[], root: number) => void
  onProgression: (indices: number[]) => void
}

export function LearnPanel({ settings, drumTrack, onSettings, onChord, onProgression }: Props) {
  const on = settings.scaleType !== 'none'
  const chords = on ? diatonicChords(settings.scaleRoot, settings.scaleType) : []
  const minor = settings.scaleType === 'minor' || settings.scaleType === 'minorPent'
  return (
    <section className="panel">
      <h3>음계 도우미</h3>
      <p className="note-text">
        음계를 고르면 어울리는 음이 <b className="hl">밝게</b> 표시되고, 나머지는 어둡게 보여요.
      </p>
      <div className="field">
        <label>으뜸음</label>
        <select value={settings.scaleRoot} onChange={(e) => onSettings({ scaleRoot: +e.target.value })}>
          {NOTE_NAMES_KO.map((n, i) => (
            <option key={n} value={i}>{n}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>음계</label>
        <select value={settings.scaleType} onChange={(e) => onSettings({ scaleType: e.target.value as ScaleType | 'none' })}>
          <option value="none">사용 안 함</option>
          {(Object.keys(SCALES) as ScaleType[]).map((k) => (
            <option key={k} value={k}>{SCALES[k].label}</option>
          ))}
        </select>
      </div>
      {on && (
        <>
          <h4>코드(화음) 추천</h4>
          <p className="note-text">누르면 현재 재생 위치에 한 마디짜리 화음이 들어가요.</p>
          <div className="chords">
            {chords.map((c, i) => (
              <button key={i} disabled={drumTrack} title={`${c.ko} 화음`} onClick={() => onChord(c.offsets, c.root)}>
                <small>{c.roman}</small>
                {c.name}
              </button>
            ))}
          </div>
          <button
            className="wide"
            disabled={drumTrack}
            onClick={() => onProgression(minor ? [0, 5, 2, 6] : [0, 4, 5, 3])}
          >
            ✨ 인기 코드 진행 넣기 ({minor ? 'Ⅰ-Ⅵ-Ⅲ-Ⅶ' : 'Ⅰ-Ⅴ-Ⅵ-Ⅳ'})
          </button>
        </>
      )}
    </section>
  )
}
