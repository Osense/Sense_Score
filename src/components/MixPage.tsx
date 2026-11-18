import type { ReactNode } from 'react'
import type { Song, Track } from '../types'
import { ProgramSelect } from './TrackPanel'
import { SongStrip } from './SongStrip'
import { Icon } from './Icon'

interface Props {
  song: Song
  master: number
  onMaster: (v: number) => void
  onChange: (id: string, patch: Partial<Track>) => void
  onCheckpoint: () => void
  onAdd: (drum: boolean) => void
  onRemove: (id: string) => void
  children?: ReactNode
  getTick: () => number
  onSeek: (tick: number) => void
}

/** 트랙별 악기·음량·뮤트·솔로를 한눈에 맞추는 믹서 */
export function MixPage({ song, master, onMaster, onChange, onAdd, onRemove, children, getTick, onSeek }: Props) {
  return (
    <div className="page mix">
      <header className="page-head">
        <div>
          <h2>믹스 — 소리 맞추기</h2>
          <p>곡을 재생하면서 악기를 바꾸고 음량을 맞춰 보세요. <b>끄기</b>는 그 파트만 빼고, <b>혼자</b>는 그 파트만 들려줘요.</p>
        </div>
      </header>
      <div className="mix-where">
        <SongStrip song={song} getTick={getTick} onSeek={onSeek} label="지금 위치" />
      </div>
      <div className="mix-list">
        {song.tracks.map((t) => (
          <div key={t.id} className={`mix-row ${t.mute ? 'is-mute' : ''} ${t.solo ? 'is-solo' : ''}`} style={{ ['--tc' as string]: t.color }}>
            <div className="mix-id">
              <input className="mix-name" value={t.name} onChange={(e) => onChange(t.id, { name: e.target.value })} aria-label="트랙 이름" />
              {t.drum ? <span className="mix-inst drum-label">드럼</span> : <ProgramSelect value={t.program} onChange={(v) => onChange(t.id, { program: v })} />}
            </div>
            <div className="mix-vol">
              <input className="mix-fader" type="range" min={0} max={1} step={0.01} value={t.volume}
                style={{ ['--v' as string]: `${t.volume * 100}%` }}
                onChange={(e) => onChange(t.id, { volume: +e.target.value })} aria-label={`${t.name} 음량`} />
              <b>{Math.round(t.volume * 100)}</b>
            </div>
            <div className="mix-btns">
              <button type="button" className={t.mute ? 'ms on mute' : 'ms'} aria-pressed={t.mute} onClick={() => onChange(t.id, { mute: !t.mute })}>끄기</button>
              <button type="button" className={t.solo ? 'ms on solo' : 'ms'} aria-pressed={t.solo} onClick={() => onChange(t.id, { solo: !t.solo })}>혼자</button>
              <button type="button" className="x" onClick={() => onRemove(t.id)} disabled={song.tracks.length <= 1} title="트랙 지우기" aria-label={`${t.name} 지우기`}>
                <Icon name="close" size={14} />
              </button>
            </div>
          </div>
        ))}
        <div className="mix-row master" style={{ ['--tc' as string]: 'var(--accent)' }}>
          <div className="mix-id"><b className="mix-name">전체 음량</b></div>
          <div className="mix-vol">
            <input className="mix-fader" type="range" min={0} max={1} step={0.01} value={master} style={{ ['--v' as string]: `${master * 100}%` }}
              onChange={(e) => onMaster(+e.target.value)} aria-label="전체 음량" />
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
