/** 얇은 선 아이콘 몇 개. 이모지 대신 쓴다 (기기마다 모양이 달라지지 않게) */
const PATHS = {
  play: 'M7 5v14l12-7z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6z',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'm15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  loop: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  metronome: 'M9 3h6l4 18H5zM12 17l5-9M8 15h8',
  countin: 'M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  upload: 'M12 16V5m0 0-4 4m4-4 4 4M5 20h14',
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7zM14 3v4h4',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 18h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  save: 'M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 3v5h7M8 21v-7h8v7',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12m0-12-4 4m4-4 4 4',
  start: 'M5 21V4m0 0h11l-2 4 2 4H5',
  arrange: 'M3 5h7v6H3zM14 5h7v6h-7zM3 15h18v4H3z',
  melody: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  write: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  mix: 'M6 3v18M12 3v18M18 3v18M4 14h4M10 8h4M16 16h4',
  done: 'M4 12l5 5L20 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  keys: 'M3 5h18v14H3zM8 5v9M13 5v9M18 5v9M6 5v6h4V5M16 5v6h4',
  score: 'M3 7h18M3 11h18M3 15h18M15 6v10M15 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  drum: 'M3 9c0-2 4-3.5 9-3.5S21 7 21 9v6c0 2-4 3.5-9 3.5S3 17 3 15zM3 9c0 2 4 3.5 9 3.5S21 11 21 9M8 3l3 4M16 3l-3 4',
  record: 'M12 12m-6 0a6 6 0 1 0 12 0 6 6 0 1 0-12 0',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  sound: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
} as const

export type IconName = keyof typeof PATHS

const FILLED = new Set<IconName>(['play', 'stop', 'record'])

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const filled = FILLED.has(name)
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
