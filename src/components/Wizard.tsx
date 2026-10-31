import { useState } from 'react'
import { NOTE_NAMES_EN, NOTE_NAMES_KO } from '../music'
import { buildTemplate, defaultAnswers, type Answers } from '../template'
import type { ScaleType, Settings, Song } from '../types'

interface Props {
  hasSaved: boolean
  /** 친구가 링크로 보내 준 곡 */
  incoming: { title: string } | null
  onOpenIncoming: () => void
  onCreate: (song: Song, settings: Settings) => void
  onBlank: () => void
  onContinue: () => void
  onImport: () => void
  onScaleDemo: (root: number, type: ScaleType) => void
  onBeatDemo: (bpm: number, beats: number) => void
}

const TEMPOS = [
  { bpm: 70, icon: '🐢', label: '느긋하게', term: '아다지오 (Adagio)', hint: '발라드, 잔잔한 곡' },
  { bpm: 100, icon: '🚶', label: '보통', term: '안단테 (Andante)', hint: '걷는 빠르기, 가장 무난해요' },
  { bpm: 130, icon: '🏃', label: '신나게', term: '알레그로 (Allegro)', hint: '댄스, 팝송' },
  { bpm: 160, icon: '🚀', label: '아주 빠르게', term: '비바체 (Vivace)', hint: '록, 신나는 게임 음악' },
]

const METERS = [
  { beats: 4, label: '4박자', hint: '하나-둘-셋-넷 · 가장 흔한 박자', accents: [1, 0, 0.5, 0] },
  { beats: 3, label: '3박자', hint: '하나-둘-셋 · 왈츠처럼 빙글빙글', accents: [1, 0, 0] },
  { beats: 2, label: '2박자', hint: '하나-둘 · 행진곡처럼 씩씩하게', accents: [1, 0] },
  { beats: 5, label: '5박자', hint: '하나-둘-셋-넷-다섯 · 독특해서 도전!', accents: [1, 0, 0, 0.5, 0] },
]

const MOODS: { type: ScaleType; icon: string; label: string; hint: string }[] = [
  { type: 'major', icon: '☀️', label: '밝고 경쾌하게', hint: '장음계 · 도레미파솔라시' },
  { type: 'minor', icon: '🌙', label: '차분하고 슬프게', hint: '단음계 · 어두운 분위기' },
  { type: 'pentatonic', icon: '🌈', label: '아무렇게나 쳐도 어울리게', hint: '5음계 · 틀리기 어려워요' },
  { type: 'blues', icon: '🎷', label: '블루스 느낌으로', hint: '블루스 음계 · 멋부린 느낌' },
]

const TITLE_IDEAS = ['나의 첫 곡', '봄날의 산책', '별이 빛나는 밤', '우리 동네 행진곡', '비 오는 날', '여름 방학', '꿈속의 놀이터', '달리는 자전거']

const STEP_TITLES = ['시작', '제목', '빠르기', '박자', '분위기', '악기', '마무리']

function Learn({ title = '알아두면 좋아요', children }: { title?: string; children: React.ReactNode }) {
  return (
    <aside className="learn">
      <b>💡 {title}</b>
      <div>{children}</div>
    </aside>
  )
}

export function Wizard({ hasSaved, incoming, onOpenIncoming, onCreate, onBlank, onContinue, onImport, onScaleDemo, onBeatDemo }: Props) {
  const [step, setStep] = useState(0)
  const [a, setA] = useState<Answers>(defaultAnswers)
  const set = (patch: Partial<Answers>) => setA((x) => ({ ...x, ...patch }))
  const tempo = TEMPOS.slice().reverse().find((t) => a.bpm >= t.bpm - 15) ?? TEMPOS[0]
  const mood = MOODS.find((m) => m.type === a.scaleType)!

  const body = () => {
    switch (step) {
      case 0:
        return (
          <>
            <h2>어떤 곡을 만들어 볼까요? 🎵</h2>
            <p className="lead">
              먼저 곡의 기본 설정(제목·빠르기·박자·분위기)을 정해요. 그다음 <b>구성</b>에서 곡의 틀을 짜고, <b>멜로디 쓰기</b>로 녹음한 뒤 <b>직접 쓰기 모드</b>에서 다듬고 듣고·평가받고·친구에게 공유해요.
            </p>
            {incoming && (
              <button className="incoming" onClick={onOpenIncoming}>
                🎁 친구가 보낸 곡 「{incoming.title || '이름 없는 곡'}」이 도착했어요! 열어 보기
              </button>
            )}
            <div className="wiz-actions">
              <button className="primary big-btn" onClick={() => setStep(1)}>🧙 새 곡 시작하기</button>
              {hasSaved && <button className="big-btn" onClick={onContinue}>▶ 하던 곡 이어서 하기</button>}
              <button className="big-btn" onClick={onBlank}>✏️ 틀 없이 바로 직접 쓰기</button>
              <button className="big-btn" onClick={onImport}>📂 MIDI 파일 불러오기</button>
            </div>
            <ol className="flow-list">
              <li><b>시작</b> 제목·빠르기·박자·분위기 정하기</li>
              <li><b>구성</b> 곡의 틀(형식) 고르고 파트 배열하기, 화음·리듬 뼈대 세우기</li>
              <li><b>멜로디 쓰기</b> 건반을 연주하며 녹음해서 멜로디 만들기</li>
              <li><b>직접 쓰기</b> 건반·악보에서 음표를 하나하나 다듬기</li>
              <li><b>믹스</b> 악기와 음량 맞추기</li>
              <li><b>완성</b> 전체 듣기 · 평가 받기 · 공유하기</li>
            </ol>
          </>
        )
      case 1:
        return (
          <>
            <h2>곡의 제목은 뭘로 할까요?</h2>
            <p className="lead">나중에 바꿀 수 있으니 편하게 지어 보세요.</p>
            <input className="title-input" autoFocus value={a.title} onChange={(e) => set({ title: e.target.value })} placeholder="예) 나의 첫 곡" />
            <div className="chips-row">
              <span className="lbl">제목이 떠오르지 않으면</span>
              {TITLE_IDEAS.slice(0, 5).map((t) => (
                <button key={t} className="chip ghost" onClick={() => set({ title: t })}>{t}</button>
              ))}
              <button className="chip" onClick={() => set({ title: TITLE_IDEAS[Math.floor(Math.random() * TITLE_IDEAS.length)] })}>🎲 아무거나</button>
            </div>
            <Learn>제목은 곡의 분위기를 한마디로 알려 줘요. 클래식에서는 ‘왈츠’, ‘행진곡’처럼 곡의 종류나 박자를 제목에 쓰기도 해요.</Learn>
          </>
        )
      case 2:
        return (
          <>
            <h2>만들고 싶은 곡의 빠르기는 어떤가요?</h2>
            <p className="lead">빠르기를 <b>템포</b>라고 해요. 1분 동안 몇 박을 치는지(BPM)로 나타내요.</p>
            <div className="wiz-grid">
              {TEMPOS.map((t) => (
                <button key={t.bpm} className={`wiz-card ${a.bpm === t.bpm ? 'on' : ''}`} onClick={() => set({ bpm: t.bpm })}>
                  <span className="big-icon">{t.icon}</span>
                  <b>{t.label}</b>
                  <small>{t.hint}</small>
                  <span className="term">{t.term}</span>
                  <em>{t.bpm}</em>
                </button>
              ))}
            </div>
            <div className="fine">
              세밀하게 조절 <b>{a.bpm}</b>
              <input type="range" min={50} max={200} value={a.bpm} onChange={(e) => set({ bpm: +e.target.value })} />
              <button onClick={() => onBeatDemo(a.bpm, a.beats)}>🔊 박 소리 들어보기</button>
            </div>
            <Learn>
              악보에는 빠르기를 이탈리아어로 적어요. 지금 고른 빠르기는 <b>{tempo.term}</b>쯤이에요. 같은 멜로디도 빠르기에 따라 신나게도, 슬프게도 들려요.
            </Learn>
          </>
        )
      case 3:
        return (
          <>
            <h2>박자는 몇 박으로 할까요?</h2>
            <p className="lead">한 마디 안에 박이 몇 개 들어가는지 정해요. 곡의 ‘걸음걸이’예요.</p>
            <div className="wiz-grid">
              {METERS.map((m) => (
                <button key={m.beats} className={`wiz-card ${a.beats === m.beats ? 'on' : ''}`} onClick={() => set({ beats: m.beats })}>
                  <span className="big-icon meter">{m.beats}/4</span>
                  <b>{m.label}</b>
                  <small>{m.hint}</small>
                  <span className="beat-dots" aria-hidden>
                    {m.accents.map((x, i) => (
                      <i key={i} style={{ width: 10 + x * 12, height: 10 + x * 12 }} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
            <div className="fine">
              <button onClick={() => onBeatDemo(a.bpm, a.beats)}>🔊 {a.beats}박자 들어보기</button>
            </div>
            <Learn>
              박자는 <b>센 박</b>과 <b>여린 박</b>이 반복되는 규칙이에요. 큰 동그라미가 센 박이고, 마디의 첫 박이 가장 세요. 4박자는 ‘강-약-중강-약’, 3박자는 ‘강-약-약’으로 느껴져요.
            </Learn>
          </>
        )
      case 4:
        return (
          <>
            <h2>어떤 분위기의 음계를 쓰고 싶나요?</h2>
            <p className="lead">음계는 곡에 쓸 음을 모아 놓은 ‘음 상자’예요. 음계를 정하면 편집할 때 어울리는 음이 밝게 표시되고, 코드(화음)도 자동으로 맞춰져요.</p>
            <div className="wiz-grid">
              {MOODS.map((m) => (
                <button key={m.type} className={`wiz-card ${a.scaleType === m.type ? 'on' : ''}`} onClick={() => set({ scaleType: m.type })}>
                  <span className="big-icon">{m.icon}</span>
                  <b>{m.label}</b>
                  <small>{m.hint}</small>
                </button>
              ))}
            </div>
            <h4>으뜸음(곡의 ‘집’이 되는 음)은 무엇으로 할까요?</h4>
            <div className="key-row">
              {NOTE_NAMES_KO.map((n, i) => (
                <button key={n} className={`key-btn ${a.root === i ? 'on' : ''} ${n.includes('#') ? 'sharp' : ''}`} onClick={() => set({ root: i })}>
                  {n}
                  <small>{NOTE_NAMES_EN[i]}</small>
                </button>
              ))}
            </div>
            <div className="fine">
              <button onClick={() => onScaleDemo(a.root, a.scaleType)}>🔊 {NOTE_NAMES_KO[a.root]}에서 시작하는 {mood.label.split(' ')[0]} 음계 들어보기</button>
            </div>
            <Learn>
              같은 도레미라도 장음계는 밝고, 단음계는 어둡게 들려요. 으뜸음은 음계의 <b>집</b>이라서, 곡이 이 음에서 끝나면 ‘끝났다’는 편안한 느낌이 나요.
            </Learn>
          </>
        )
      case 5:
        return (
          <>
            <h2>어떤 악기들로 연주할까요?</h2>
            <p className="lead">하나 이상 골라요. 나중에 얼마든지 더하거나 뺄 수 있어요.</p>
            <div className="wiz-grid">
              {([
                ['melody', '🎹', '멜로디', '내가 직접 만드는 주인공 선율'],
                ['chords', '🎸', '코드 반주', '화음으로 받쳐 주는 반주'],
                ['bass', '🪕', '베이스', '낮은 음으로 바닥을 깔아 줘요'],
                ['drums', '🥁', '드럼', '킥·스네어·하이햇으로 리듬'],
              ] as const).map(([k, icon, label, hint]) => (
                <button key={k} className={`wiz-card ${a[k] ? 'on' : ''}`} onClick={() => set({ [k]: !a[k] })}>
                  <span className="big-icon">{icon}</span>
                  <b>{label}</b>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
            <Learn>
              음악은 네 가지 역할이 겹쳐져요. <b>멜로디</b>(선율) 위에 <b>화성</b>(코드)이 색을 입히고, <b>베이스</b>가 바닥을 받치고, <b>리듬</b>(드럼)이 움직임을 만들어요. 밴드가 이 역할을 나눠 맡는 거예요. 악기마다 낼 수 있는 음의 높이(<b>음역</b>)가 달라서, 직접 쓰기에서는 고른 악기의 음역 안의 건반만 보여 줘요.
            </Learn>
          </>
        )
      default:
        return (
          <>
            <h2>마지막이에요! 이렇게 시작할게요 ✨</h2>
            <div className="summary">
              <h4>🎼 「{a.title.trim() || '새 곡'}」</h4>
              <p>
                <b>{a.bpm}</b> BPM({tempo.term.split(' ')[0]}) · <b>{a.beats}/4</b> 박자 · <b>{NOTE_NAMES_KO[a.root]}</b> {mood.label} · 트랙{' '}
                <b>{[a.melody && '멜로디', a.chords && '코드 반주', a.bass && '베이스', a.drums && '드럼'].filter(Boolean).join(' · ')}</b>
              </p>
            </div>
            <Learn title="이제 어떻게 되나요?">
              다음은 <b>구성</b> 탭이에요. 곡의 <b>틀</b>(AB, ABA, 벌스-코러스…)을 고르고 파트를 끌어서 배열해요. 원하면 메뉴판에서 <b>화음·리듬·드럼·베이스</b>를 골라 뼈대도 세워 줘요. 멜로디는 <b>멜로디 쓰기</b>에서 건반을 연주해 녹음하고, <b>직접 쓰기</b>에서 다듬어요!
            </Learn>
          </>
        )
    }
  }

  const last = step === STEP_TITLES.length - 1
  return (
    <div className="wizard">
      <div className="wiz-steps" aria-label="진행 단계">
        {STEP_TITLES.map((t, i) => (
          <button key={t} className={`wiz-dot ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} onClick={() => i <= step && setStep(i)} disabled={i > step}>
            <i>{i < step ? '✓' : i + 1}</i>
            <span>{t}</span>
          </button>
        ))}
      </div>
      <div className="wiz-body">{body()}</div>
      {step > 0 && (
        <div className="wiz-nav">
          <button onClick={() => setStep(step - 1)}>← 이전</button>
          {last ? (
            <button className="primary big-btn" onClick={() => { const r = buildTemplate(a); onCreate(r.song, r.settings) }}>
              🎉 곡 만들기 시작!
            </button>
          ) : (
            <button className="primary" onClick={() => setStep(step + 1)} disabled={step === 5 && !a.melody && !a.chords && !a.bass && !a.drums}>
              다음 →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
