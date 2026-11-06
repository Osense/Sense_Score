import { useState } from 'react'

const MIN = 30
const MAX = 300
const clamp = (value: number) => Math.min(MAX, Math.max(MIN, Math.round(value)))

export function TempoControl({ value, onChange, onCheckpoint }: {
  value: number
  onChange: (value: number) => void
  onCheckpoint: () => void
}) {
  // Keep unfinished input (including an empty field) separate from the song.
  const [draft, setDraft] = useState<string | null>(null)
  const number = () => draft?.trim() && Number.isFinite(Number(draft)) ? Number(draft) : value
  const commit = () => {
    onChange(clamp(number()))
    setDraft(null)
  }
  const step = (delta: number, checkpoint = true) => {
    if (checkpoint) onCheckpoint()
    const next = clamp(clamp(number()) + delta)
    onChange(next)
    setDraft(draft === null ? null : String(next))
  }

  return (
    <div className="tempo-control" role="group" aria-label="템포 조절">
      <label htmlFor="song-tempo">템포</label>
      <button type="button" aria-label="템포 내리기" title="1 BPM 내리기" onPointerDown={(e) => e.preventDefault()} onClick={() => step(-1)}>−</button>
      <input
        id="song-tempo"
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-label="템포 BPM"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value}
        title="30~300 BPM · 입력 후 Enter 또는 다른 곳을 누르면 적용"
        value={draft ?? String(value)}
        onFocus={() => { onCheckpoint(); setDraft(String(value)) }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
          if (e.key === 'Escape') { e.preventDefault(); setDraft(null) }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            step(e.key === 'ArrowUp' ? 1 : -1, false)
          }
        }}
      />
      <button type="button" aria-label="템포 올리기" title="1 BPM 올리기" onPointerDown={(e) => e.preventDefault()} onClick={() => step(1)}>+</button>
      <span>BPM</span>
    </div>
  )
}
