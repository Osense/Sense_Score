import type { ReactNode } from 'react'
import type { Song, Track } from '../types'
import { ProgramSelect } from './TrackPanel'

interface Props {
  song: Song
  master: number
  onMaster: (v: number) => void
  onChange: (id: string, patch: Partial<Track>) => void
  onCheckpoint: () => void
  onAdd: (drum: boolean) => void
  onRemove: (id: string) => void
  children?: ReactNode
}

/** 트랙별 악기·음량·뮤트·솔로를 한눈에 맞추는 믹서 */
export function MixPage({ song, master, onMaster, onChange, onAdd, onRemove, children }: Props) {
  return (
    <div className="page mix">
      <header className="page-head">
        <div>
          <h2>🎚️ 믹스 — 소리 맞추기</h2>
          <p>곡을 재생하면서 악기를 바꾸고 음량을 맞춰 보세요. <b>끄기</b>는 그 파트만 빼고, <b>혼자</b>는 그 파트만 들려줘요.</p>
        </div>
      </header>
      <div className="mixer">
        {song.tracks.map((t) => (
          <div key={t.id} className="strip">
            <span className="strip-color" style={{ background: t.color }} />
            <input className="strip-name" value={t.name} onChange={(e) => onChange(t.id, { name: e.target.value })} aria-label="트랙 이름" />
            {t.drum ? <span className="drum-label">🥁 드럼</span> : <ProgramSelect value={t.program} onChange={(v) => onChange(t.id, { program: v })} />}
            <div className="fader-wrap">
              <input
                className="fader"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={t.volume}
                onChange={(e) => onChange(t.id, { volume: +e.target.value })}
                aria-label={`${t.name} 음량`}
              />
              <b>{Math.round(t.volume * 100)}</b>
            </div>
            <div className="strip-btns">
              <button className={t.mute ? 'ms on mute' : 'ms'} onClick={() => onChange(t.id, { mute: !t.mute })}>끄기</button>
              <button className={t.solo ? 'ms on solo' : 'ms'} onClick={() => onChange(t.id, { solo: !t.solo })}>혼자</button>
              <button className="x" onClick={() => onRemove(t.id)} disabled={song.tracks.length <= 1} title="트랙 지우기">✕</button>
            </div>
          </div>
        ))}
        <div className="strip master">
          <span className="strip-color" style={{ background: 'var(--accent)' }} />
          <b className="strip-name">전체 음량</b>
          <div className="fader-wrap">
            <input className="fader" type="range" min={0} max={1} step={0.01} value={master} onChange={(e) => onMaster(+e.target.value)} aria-label="전체 음량" />
            <b>{Math.round(master * 100)}</b>
          </div>
        </div>
      </div>
      <div className="row-btns">
        <button onClick={() => onAdd(false)} disabled={song.tracks.length >= 16}>＋ 악기 추가</button>
        <button onClick={() => onAdd(true)} disabled={song.tracks.length >= 16 || song.tracks.some((t) => t.drum)}>＋ 드럼</button>
      </div>
      {children}
    </div>
  )
}
