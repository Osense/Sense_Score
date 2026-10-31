import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ActionId, MenuGroup } from '../editActions'

interface Props {
  x: number
  y: number
  groups: MenuGroup[]
  onRun: (id: ActionId) => void
  onClose: () => void
}

/** 음표를 우클릭하거나 꾹 누르면 나오는 편집 메뉴. 화면 밖으로 나가지 않게 자리를 조정한다. */
export function ContextMenu({ x, y, groups, onRun, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    })
  }, [x, y, groups])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ctx-back" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div
        ref={ref}
        className="ctx-menu"
        style={pos}
        role="menu"
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {groups.map((g) => (
          <section key={g.title}>
            <h6>{g.title}</h6>
            <div className="ctx-items">
              {g.items.map((it) => (
                <button
                  key={it.id}
                  role="menuitem"
                  className={`ctx-item ${it.danger ? 'danger' : ''}`}
                  disabled={it.disabled}
                  onClick={() => { onRun(it.id); onClose() }}
                >
                  <span className="ctx-icon">{it.icon}</span>
                  <span className="ctx-label">{it.label}</span>
                  {it.hint && <kbd>{it.hint}</kbd>}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
