import type { Settings } from '../types'

interface Props {
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
}

export function PracticePanel({ settings, onSettings }: Props) {
  const t = settings.trainer
  const set = (patch: Partial<Settings['trainer']>) => onSettings({ trainer: { ...t, ...patch } })
  return (
    <section className="panel">
      <h3>연습 도우미</h3>
      <label className="check">
        <input type="checkbox" checked={t.on} onChange={(e) => set({ on: e.target.checked })} />
        <span>점점 빠르게 연습 (스피드 트레이너)</span>
      </label>
      <p className="note-text">반복 구간을 한 번 돌 때마다 템포가 조금씩 올라가요. 위쪽 🔁 반복을 켜 두세요.</p>
      {t.on && (
        <div className="trainer">
          <label>
            시작 템포
            <input type="number" min={20} max={300} value={t.from} onChange={(e) => set({ from: +e.target.value })} />
          </label>
          <label>
            목표 템포
            <input type="number" min={20} max={300} value={t.to} onChange={(e) => set({ to: +e.target.value })} />
          </label>
          <label>
            한 번에
            <input type="number" min={1} max={50} value={t.step} onChange={(e) => set({ step: +e.target.value })} />
            올림
          </label>
        </div>
      )}
    </section>
  )
}
