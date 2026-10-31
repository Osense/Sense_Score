import type { Tool } from '../types'

interface Props {
  tool: Tool
  onTool: (t: Tool) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onZoom: (delta: number) => void
}

const svgProps = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const ICONS: Record<Tool, React.ReactNode> = {
  pen: (
    <svg {...svgProps}>
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
      <path d="M14.5 6.5l3 3M4 20l4-1" />
    </svg>
  ),
  eraser: (
    <svg {...svgProps}>
      <path d="M8 20h12M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 20H7.5l-2-2a2 2 0 0 1 0-2.8z" />
      <path d="M9.5 10.5l5 5" />
    </svg>
  ),
  hand: (
    <svg {...svgProps}>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-3.2-5a1.5 1.5 0 0 1 2.4-1.8L8 14" />
    </svg>
  ),
  select: (
    <svg {...svgProps}>
      <rect x="4" y="5" width="16" height="14" rx="1.5" strokeDasharray="3 3" />
    </svg>
  ),
}

const TOOLS: { id: Tool; label: string; tip: string; key: string }[] = [
  { id: 'pen', label: '쓰기', tip: '연필: 눌러서 음표 쓰기, 음표를 끌어 길이 조절', key: '1' },
  { id: 'eraser', label: '지우개', tip: '지우개: 닿는 음표 지우기 (끌면 문질러서 여러 개)', key: '2' },
  { id: 'hand', label: '손바닥', tip: '손바닥: 음표 옮기기, 끝 손잡이로 길이 조절, 빈 곳 끌면 화면 이동', key: '3' },
  { id: 'select', label: '선택', tip: '선택: 네모로 감싸 여러 음표를 한꺼번에 고르기', key: '4' },
]

/** 마우스 우클릭/Shift 없이도 쓸 수 있는 터치용 도구 모음 */
export function Toolbar({ tool, onTool, onUndo, onRedo, canUndo, canRedo, onZoom }: Props) {
  return (
    <nav className="toolbar" aria-label="도구">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`tool ${tool === t.id ? 'on' : ''}`}
          onClick={() => onTool(t.id)}
          title={`${t.tip} (${t.key})`}
          aria-pressed={tool === t.id}
        >
          {ICONS[t.id]}
          <span>{t.label}</span>
        </button>
      ))}
      <div className="tool-sep" />
      <button className="tool" onClick={onUndo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)">
        <b>↶</b>
        <span>되돌리기</span>
      </button>
      <button className="tool" onClick={onRedo} disabled={!canRedo} title="다시하기 (Ctrl+Y)">
        <b>↷</b>
        <span>다시</span>
      </button>
      <div className="tool-sep" />
      <button className="tool" onClick={() => onZoom(0.2)} title="크게 보기">
        <b>＋</b>
        <span>확대</span>
      </button>
      <button className="tool" onClick={() => onZoom(-0.2)} title="작게 보기">
        <b>－</b>
        <span>축소</span>
      </button>
    </nav>
  )
}
