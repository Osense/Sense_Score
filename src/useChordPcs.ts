import { useEffect, useRef, useState } from 'react'
import type { Song } from './types'

/** Read chord tones only when their optional keyboard highlight is enabled. */
export function useChordPcs(song: Song, getTick: () => number, enabled: boolean) {
  const [pcs, setPcs] = useState<Set<number>>(new Set())
  const latest = useRef({ song, getTick })
  useEffect(() => { latest.current = { song, getTick } })
  useEffect(() => {
    if (!enabled) return
    let last: string | null = null
    const update = () => {
      const { song: s, getTick: tick } = latest.current
      const t = tick()
      const track = s.tracks.find(x => x.role === 'chords') ?? s.tracks.find(x => !x.drum && (x.name.includes('코드') || x.name.includes('반주')))
      const next = new Set<number>()
      for (const n of track?.notes ?? []) if (n.start <= t && t < n.start + n.dur) next.add(n.pitch % 12)
      const key = [...next].sort().join(',')
      if (key !== last) { last = key; setPcs(next) }
    }
    update()
    const id = window.setInterval(update, 120)
    return () => clearInterval(id)
  }, [enabled])
  return pcs
}
