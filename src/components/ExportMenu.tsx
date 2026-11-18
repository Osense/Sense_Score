import { useEffect, useRef, useState } from 'react'
import type { AudioFormat } from '../engine/export'
import { Icon } from './Icon'

interface Props {
  exporting: { format: AudioFormat; progress: number } | null
  onAudio: (format: AudioFormat) => void
  onMidi: () => void
  onShare: () => void
}

/** 어느 화면에서든 보이는 내보내기 버튼. 누르면 저장 형식을 고른다 */
export function ExportMenu({ exporting, onAudio, onMidi, onShare }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  const pick = (fn: () => void) => {
    fn()
    setOpen(false)
  }
  return (
    <div className="export" ref={ref}>
      <button className="primary export-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label="내보내기" title="내보내기 (MP3 · WAV · MIDI · 링크)">
        <Icon name="download" size={16} />
        <span className="export-word">{exporting ? `${exporting.format.toUpperCase()} ${Math.round(exporting.progress * 100)}%` : '내보내기'}</span>
      </button>
      {open && (
        <div className="export-pop" role="menu">
          <p className="eyebrow">소리 파일</p>
          <button role="menuitem" onClick={() => pick(() => onAudio('mp3'))} disabled={!!exporting}>
            <b>MP3</b>
            <span>작은 파일 · 메신저로 보내기 좋아요</span>
          </button>
          <button role="menuitem" onClick={() => pick(() => onAudio('wav'))} disabled={!!exporting}>
            <b>WAV</b>
            <span>음질 그대로 · 파일이 커요</span>
          </button>
          <p className="eyebrow">악보 데이터</p>
          <button role="menuitem" onClick={() => pick(onMidi)}>
            <b>MIDI</b>
            <span>.mid · 다른 음악 프로그램에서 열기</span>
          </button>
          <p className="eyebrow">공유</p>
          <button role="menuitem" onClick={() => pick(onShare)}>
            <b>링크</b>
            <span>완성 화면에서 공유 링크 만들기</span>
          </button>
        </div>
      )}
    </div>
  )
}
