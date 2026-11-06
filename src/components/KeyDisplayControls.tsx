import { NOTE_NAMES_KO } from '../music'
import type { Settings } from '../types'

export function KeyDisplayControls({ settings, onSettings }: {
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
}) {
  const scaleOn = settings.scaleType !== 'none'
  return (
    <div className="key-display-controls" role="group" aria-label="건반 표시">
      <span>건반 표시</span>
      <label><input type="checkbox" checked={settings.showKeyRoot} onChange={(e) => onSettings({ showKeyRoot: e.target.checked })} /><i className="key-swatch root" />으뜸음{scaleOn ? `(${NOTE_NAMES_KO[settings.scaleRoot]})` : ''}</label>
      <label><input type="checkbox" checked={settings.showKeyScale} onChange={(e) => onSettings({ showKeyScale: e.target.checked })} /><i className="key-swatch scale" />추천 음계</label>
      <label><input type="checkbox" checked={settings.showKeyChord} onChange={(e) => onSettings({ showKeyChord: e.target.checked })} /><i className="key-swatch chord" />지금 화음의 음</label>
      {!scaleOn && <small>음계 도우미에서 음계를 고르면 으뜸음과 추천 음계가 표시돼요.</small>}
    </div>
  )
}
