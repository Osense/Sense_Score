import { Icon, type IconName } from './Icon'

export type Workspace = 'start' | 'arrange' | 'melody' | 'compose' | 'mix' | 'deliver'

const TABS: { id: Workspace; icon: IconName; label: string; sub: string }[] = [
  { id: 'start', icon: 'start', label: '시작', sub: '곡의 틀 만들기' },
  { id: 'arrange', icon: 'arrange', label: '구성', sub: '파트 짜기' },
  { id: 'melody', icon: 'melody', label: '멜로디', sub: '건반 연주를 녹음' },
  { id: 'compose', icon: 'write', label: '직접 쓰기', sub: '건반·악보에 음표 쓰기' },
  { id: 'mix', icon: 'mix', label: '믹스', sub: '소리 맞추기' },
  { id: 'deliver', icon: 'done', label: '완성', sub: '듣기·평가·공유' },
]

/** 작업 흐름 순서대로 화면을 오가는 탭. 세로 화면은 아래, 가로 화면은 왼쪽 */
export function WorkspaceTabs({ ws, onChange }: { ws: Workspace; onChange: (w: Workspace) => void }) {
  return (
    <nav className="ws-tabs" aria-label="작업 단계">
      {TABS.map((t, i) => (
        <button key={t.id} className={`ws-tab ${ws === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)} aria-current={ws === t.id ? 'page' : undefined} title={t.sub}>
          <span className="ws-no">{String(i + 1).padStart(2, '0')}</span>
          <Icon name={t.icon} size={20} />
          <span className="ws-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
