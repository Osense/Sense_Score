export type Workspace = 'start' | 'arrange' | 'melody' | 'compose' | 'mix' | 'deliver'

const TABS: { id: Workspace; icon: string; label: string; sub: string }[] = [
  { id: 'start', icon: '🏁', label: '시작', sub: '곡의 틀 만들기' },
  { id: 'arrange', icon: '🧩', label: '구성', sub: '파트 짜기' },
  { id: 'melody', icon: '🎤', label: '멜로디 쓰기', sub: '건반 연주를 녹음' },
  { id: 'compose', icon: '✏️', label: '직접 쓰기', sub: '건반·악보에 음표 쓰기' },
  { id: 'mix', icon: '🎚️', label: '믹스', sub: '소리 맞추기' },
  { id: 'deliver', icon: '🎬', label: '완성', sub: '듣기·평가·공유' },
]

/** 작업 흐름 순서대로 화면을 오가는 아래쪽 탭 (영상 편집기의 페이지 탭처럼) */
export function WorkspaceTabs({ ws, onChange }: { ws: Workspace; onChange: (w: Workspace) => void }) {
  return (
    <nav className="ws-tabs" aria-label="작업 단계">
      {TABS.map((t, i) => (
        <button key={t.id} className={`ws-tab ${ws === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)} aria-current={ws === t.id}>
          <span className="ws-icon">{t.icon}</span>
          <span className="ws-label">
            <b>
              {i + 1}. {t.label}
            </b>
            <small>{t.sub}</small>
          </span>
        </button>
      ))}
    </nav>
  )
}
