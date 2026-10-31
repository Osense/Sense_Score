import { useCallback, useRef, useState } from 'react'

const LIMIT = 100

/** 되돌리기/다시하기가 되는 상태. set(v, false)는 드래그 중처럼 기록 없이 갱신. */
export function useHistory<T>(initial: T) {
  const [present, setPresent] = useState(initial)
  const presentRef = useRef(initial)
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const [, bump] = useState(0)

  const set = useCallback((next: T | ((prev: T) => T), record = true) => {
    const value = typeof next === 'function' ? (next as (p: T) => T)(presentRef.current) : next
    if (record) {
      past.current.push(presentRef.current)
      if (past.current.length > LIMIT) past.current.shift()
      future.current = []
    }
    presentRef.current = value
    setPresent(value)
    bump((n) => n + 1)
  }, [])

  /** 드래그 시작 직전에 호출: 지금 상태를 되돌리기 지점으로 저장 */
  const checkpoint = useCallback(() => {
    past.current.push(presentRef.current)
    if (past.current.length > LIMIT) past.current.shift()
    future.current = []
    bump((n) => n + 1)
  }, [])

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (prev === undefined) return
    future.current.push(presentRef.current)
    presentRef.current = prev
    setPresent(prev)
    bump((n) => n + 1)
  }, [])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (next === undefined) return
    past.current.push(presentRef.current)
    presentRef.current = next
    setPresent(next)
    bump((n) => n + 1)
  }, [])

  const reset = useCallback((v: T) => {
    past.current = []
    future.current = []
    presentRef.current = v
    setPresent(v)
    bump((n) => n + 1)
  }, [])

  return {
    value: present,
    ref: presentRef,
    set,
    checkpoint,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
