import { useCallback, useRef } from 'react'

/** 손가락·펜으로 꾹 누르면 실행. 마우스는 우클릭 메뉴를 쓰므로 제외한다. */
export function useLongPress(ms = 480) {
  const ref = useRef<{ timer: number; x: number; y: number } | null>(null)

  const cancel = useCallback(() => {
    if (ref.current) {
      clearTimeout(ref.current.timer)
      ref.current = null
    }
  }, [])

  const start = useCallback(
    (e: { pointerType: string; clientX: number; clientY: number }, fire: () => void) => {
      cancel()
      if (e.pointerType === 'mouse') return
      ref.current = {
        timer: window.setTimeout(() => {
          ref.current = null
          fire()
        }, ms),
        x: e.clientX,
        y: e.clientY,
      }
    },
    [cancel, ms],
  )

  /** 조금이라도 움직이면 길게 누르기가 아니다 */
  const moved = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const r = ref.current
      if (r && Math.hypot(e.clientX - r.x, e.clientY - r.y) > 9) cancel()
    },
    [cancel],
  )

  return { start, cancel, moved }
}
