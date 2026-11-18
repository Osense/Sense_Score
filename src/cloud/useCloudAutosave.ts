import { useEffect, useRef, useState } from 'react'
import type { PartPlan } from '../scaffold'
import type { Settings, Song } from '../types'
import { createAutosaver, cloudEnabled, type SaveState } from './autosave'
import { onSession, takeSessionFromUrl } from './session'

/**
 * 로그인했을 때 곡을 계정에 자동 저장한다 (.mid 기반). VITE_CLOUD_API가 비어 있거나 로그인 전이면 아무것도 하지 않는다.
 * 기기 안의 자동 저장(storage.ts의 localStorage)은 그대로 따로 돈다.
 */
export function useCloudAutosave(song: Song, settings: Settings, plans: Record<string, PartPlan>) {
  const [state, setState] = useState<SaveState>('idle')
  const [on, setOn] = useState(() => { takeSessionFromUrl(); return cloudEnabled() })
  const saver = useRef<ReturnType<typeof createAutosaver> | null>(null)
  if (!saver.current) saver.current = createAutosaver({ onState: (s) => setState(s) })

  useEffect(() => onSession(() => setOn(cloudEnabled())), [])
  // 다른 프로젝트를 열면 판 번호를 새로
  useEffect(() => { saver.current?.setRev(undefined) }, [song.id])
  useEffect(() => {
    if (on && song.id) saver.current?.touch({ song, settings, plans })
  }, [on, song, settings, plans])
  useEffect(() => {
    const flush = () => { if (on) void saver.current?.flush() }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [on])
  return { enabled: on, state }
}
