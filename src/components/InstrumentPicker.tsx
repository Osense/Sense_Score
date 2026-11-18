import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { instrumentByPatchID } from '@tonejs/midi/dist/InstrumentMaps'
import { DRUM_KITS, drumKitOf, FEEL, GROUP_INFO, INSTRUMENT_GROUPS, INSTRUMENTS, instrumentOf, rangeLabel, soundRangeOf } from '../instruments'
import { Icon } from './Icon'

/* ======================================================================
   악기 고르기 창: 스크롤 드롭다운 대신, 악기 묶음(건반·기타·현악기…)을 먼저 고르고
   묶음 설명(어떻게 소리를 내는지 · 어디에 어울리는지)과 악기마다의 느낌을 보면서 고른다.
   카드를 누르면 바로 바뀌고 소리가 나서 귀로 비교할 수 있다. ‘다 골랐어요’로 닫는다.
   ====================================================================== */

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
}

function Sheet({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  useEsc(true, onClose)
  return createPortal(
    <div className="ip-back" onPointerDown={onClose}>
      <div className="ip" role="dialog" aria-modal="true" aria-label={title} onPointerDown={(e) => e.stopPropagation()}>
        <header className="ip-head">
          <div>
            <h2>{title}</h2>
            <p>{sub}</p>
          </div>
          <button type="button" className="ip-done" onClick={onClose}>다 골랐어요</button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** 악기(음색) 고르기: 누르면 창이 열린다 */
export function ProgramSelect({ value, onChange }: { value: number; onChange: (program: number) => void }) {
  const [open, setOpen] = useState(false)
  const cur = instrumentOf(value)
  const [group, setGroup] = useState<string>(cur?.group ?? INSTRUMENT_GROUPS[0])
  const show = () => { setGroup(instrumentOf(value)?.group ?? INSTRUMENT_GROUPS[0]); setOpen(true) }
  const info = GROUP_INFO[group]
  return (
    <>
      <button type="button" className="ip-trigger" onClick={(e) => { e.stopPropagation(); show() }} aria-haspopup="dialog"
        title={cur ? `${cur.group} · ${cur.name} — 눌러서 악기 바꾸기` : '눌러서 악기 바꾸기'}>
        <span className="ip-trigger-g">{cur?.group ?? '불러온 소리'}</span>
        <b>{cur?.name ?? instrumentByPatchID[value] ?? `${value + 1}번`}</b>
        <Icon name="down" size={14} />
      </button>
      {open && (
        <Sheet title="악기 고르기" sub="왼쪽에서 악기 묶음을 고르고, 카드를 눌러 소리를 들어 보세요. 누르면 바로 바뀌어요." onClose={() => setOpen(false)}>
          <div className="ip-body">
            <nav className="ip-groups" aria-label="악기 묶음">
              {INSTRUMENT_GROUPS.map((g) => (
                <button key={g} type="button" className={g === group ? 'on' : ''} aria-pressed={g === group} onClick={() => setGroup(g)}>
                  <span>{g}</span>
                  <small>{INSTRUMENTS.filter((i) => i.group === g).length}</small>
                  {cur?.group === g && <i className="ip-dot" aria-label="지금 고른 악기가 있는 묶음" />}
                </button>
              ))}
            </nav>
            <section className="ip-main">
              <div className="ip-learn">
                <b>{group}</b>
                <p>{info.how} {info.use}</p>
              </div>
              <div className="ip-cards">
                {INSTRUMENTS.filter((i) => i.group === group).map((i) => {
                  const on = i.program === value
                  return (
                    <button key={i.program} type="button" className={`ip-card ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(i.program)}>
                      <span className="ip-card-top">
                        <b>{i.name}</b>
                        {on ? <span className="ip-check"><Icon name="check" size={14} /></span> : <span className="ip-play"><Icon name="play" size={12} /></span>}
                      </span>
                      <span className="ip-feel">{FEEL[i.program] ?? i.hint}</span>
                      <small>{i.hint}</small>
                      <em>어울리는 음역 {rangeLabel(soundRangeOf(i.program))}</em>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>
        </Sheet>
      )}
    </>
  )
}

/** 드럼 세트 고르기 */
export function DrumKitSelect({ value, onChange }: { value: number; onChange: (program: number) => void }) {
  const [open, setOpen] = useState(false)
  const cur = drumKitOf(value)
  return (
    <>
      <button type="button" className="ip-trigger" onClick={(e) => { e.stopPropagation(); setOpen(true) }} aria-haspopup="dialog" title="눌러서 드럼 세트 바꾸기">
        <span className="ip-trigger-g">드럼 세트</span>
        <b>{cur?.name ?? `불러온 세트 ${value + 1}`}</b>
        <Icon name="down" size={14} />
      </button>
      {open && (
        <Sheet title="드럼 세트 고르기" sub="세트를 누르면 킥과 스네어 소리로 들려줘요." onClose={() => setOpen(false)}>
          <div className="ip-main solo">
            <div className="ip-learn">
              <b>드럼 세트</b>
              <p>드럼 세트는 킥(큰북) · 스네어(작은북) · 하이햇 · 심벌 · 탐을 한데 모은 거예요. 세트마다 북의 크기와 울림, 만든 방법이 달라서 같은 리듬이라도 록 · 재즈 · 댄스처럼 장르 느낌이 바뀌어요. 실감 나는 소리(기본 악기 소리)에서 차이가 들려요.</p>
            </div>
            <div className="ip-cards">
              {DRUM_KITS.map((k) => {
                const on = k.program === value
                return (
                  <button key={k.program} type="button" className={`ip-card ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(k.program)}>
                    <span className="ip-card-top">
                      <b>{k.name}</b>
                      {on ? <span className="ip-check"><Icon name="check" size={14} /></span> : <span className="ip-play"><Icon name="play" size={12} /></span>}
                    </span>
                    <span className="ip-feel">{k.hint}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}
