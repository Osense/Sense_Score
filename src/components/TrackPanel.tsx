import { instrumentByPatchID } from '@tonejs/midi/dist/InstrumentMaps'
import { DRUM_KITS, drumKitOf, INSTRUMENT_GROUPS, INSTRUMENTS, instrumentOf, rangeLabel, rangeOf } from '../instruments'
import type { Song, Track } from '../types'

/** 악기(음색) 고르기 */
export function ProgramSelect({ value, onChange }: { value: number; onChange: (program: number) => void }) {
  return (
    <select
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(+e.target.value)}
      title={`음역: ${rangeLabel(rangeOf(value))}`}
    >
      {INSTRUMENT_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {INSTRUMENTS.filter((i) => i.group === g).map((i) => (
            <option key={i.program} value={i.program} title={i.hint}>{i.name}</option>
          ))}
        </optgroup>
      ))}
      {!instrumentOf(value) && <option value={value}>불러온 소리 · {instrumentByPatchID[value] ?? value + 1}</option>}
    </select>
  )
}

/** 드럼 트랙의 드럼 세트 고르기 */
export function DrumKitSelect({ value, onChange }: { value: number; onChange: (program: number) => void }) {
  return (
    <select value={value} onClick={(e) => e.stopPropagation()} onChange={(e) => onChange(+e.target.value)} title="드럼 세트 · 실감 나는 소리에서 소리가 달라져요" aria-label="드럼 세트">
      {DRUM_KITS.map((k) => <option key={k.program} value={k.program} title={k.hint}>드럼 · {k.name}</option>)}
      {!drumKitOf(value) && <option value={value}>드럼 · 불러온 세트 {value + 1}</option>}
    </select>
  )
}

interface Props {
  song: Song
  activeId: string
  onSelect: (id: string) => void
  onChange: (id: string, patch: Partial<Track>, record?: boolean) => void
  onCheckpoint: () => void
  onAdd: (drum: boolean) => void
  onRemove: (id: string) => void
}

export function TrackPanel({ song, activeId, onSelect, onChange, onCheckpoint, onAdd, onRemove }: Props) {
  return (
    <section className="panel">
      <h3>트랙 (파트)</h3>
      <div className="tracks">
        {song.tracks.map((t) => (
          <div key={t.id} className={`track ${t.id === activeId ? 'active' : ''}`} onClick={() => onSelect(t.id)}>
            <div className="track-top">
              <span className="dot" style={{ background: t.color }} />
              <input
                className="name"
                value={t.name}
                onChange={(e) => onChange(t.id, { name: e.target.value })}
                onFocus={onCheckpoint}
              />
              <button
                className={`ms ${t.mute ? 'on mute' : ''}`}
                title="이 파트 소리 끄기 (뮤트)"
                onClick={(e) => { e.stopPropagation(); onChange(t.id, { mute: !t.mute }) }}
              >
                끄기
              </button>
              <button
                className={`ms ${t.solo ? 'on solo' : ''}`}
                title="이 파트만 듣기 (솔로)"
                onClick={(e) => { e.stopPropagation(); onChange(t.id, { solo: !t.solo }) }}
              >
                혼자
              </button>
              <button
                className="x"
                title="트랙 지우기"
                onClick={(e) => { e.stopPropagation(); onRemove(t.id) }}
                disabled={song.tracks.length <= 1}
              >
                ✕
              </button>
            </div>
            <div className="track-bottom">
              {t.drum ? (
                <DrumKitSelect value={t.program} onChange={(v) => onChange(t.id, { program: v })} />
              ) : (
                <ProgramSelect value={t.program} onChange={(v) => onChange(t.id, { program: v })} />
              )}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={t.volume}
                title={`음량 ${Math.round(t.volume * 100)}%`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onChange(t.id, { volume: +e.target.value }, false)}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="row-btns">
        <button onClick={() => onAdd(false)} disabled={song.tracks.length >= 16}>＋ 악기 추가</button>
        <button onClick={() => onAdd(true)} disabled={song.tracks.length >= 16 || song.tracks.some((t) => t.drum)}>
          ＋ 드럼
        </button>
      </div>
    </section>
  )
}
