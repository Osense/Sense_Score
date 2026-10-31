import { useCallback, useRef, useState } from 'react'

export interface DragState { from: number; over: number; dx: number; dy: number }

/**
 * 끌어서 순서 바꾸기 (마우스·손가락·펜 모두). HTML 드래그앤드롭은 터치에서 안 되므로 포인터 이벤트로 직접 만든다.
 * - handle(i): 끌기 시작점(손잡이)에 붙일 이벤트
 * - ref(i): 각 항목의 DOM (끌어다 놓을 자리를 계산하는 데 씀)
 */
export function useReorder(axis: 'x' | 'y', onMove: (from: number, to: number) => void) {
  const els = useRef<(HTMLElement | null)[]>([])
  const start = useRef<{ x: number; y: number; from: number; active: boolean } | null>(null)
  const latest = useRef<DragState | null>(null)
  const justDragged = useRef(false)
  const [drag, setDrag] = useState<DragState | null>(null)

  const ref = useCallback((i: number) => (el: HTMLElement | null) => { els.current[i] = el }, [])

  const finish = useCallback(() => {
    const s = start.current
    const d = latest.current
    start.current = null
    latest.current = null
    setDrag(null)
    if (s?.active) {
      justDragged.current = true
      setTimeout(() => { justDragged.current = false }, 0)
      if (d && d.over !== d.from) onMove(d.from, d.over)
    }
  }, [onMove])

  const handle = useCallback(
    (i: number) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        start.current = { x: e.clientX, y: e.clientY, from: i, active: false }
        e.currentTarget.setPointerCapture(e.pointerId)
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current
        if (!s) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        if (!s.active && Math.hypot(dx, dy) < 6) return
        s.active = true
        const pos = axis === 'x' ? e.clientX : e.clientY
        let over = s.from
        let best = Infinity
        els.current.forEach((el, k) => {
          if (!el) return
          const r = el.getBoundingClientRect()
          const c = axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2
          const d = Math.abs(pos - c)
          if (d < best) { best = d; over = k }
        })
        latest.current = { from: s.from, over, dx, dy }
        setDrag(latest.current)
      },
      onPointerUp: finish,
      onPointerCancel: finish,
    }),
    [axis, finish],
  )

  /** 끌기를 끝낸 직후의 click은 무시해야 할 때 쓴다 */
  const wasDrag = useCallback(() => justDragged.current, [])

  return { drag, ref, handle, wasDrag }
}
