import { useEffect, useMemo, useRef, useState } from 'react'
import { evaluate, evaluationText } from '../evaluate'
import { keyOf, NOTE_NAMES_KO } from '../music'
import { KINDS, noteCounts, rangesOf } from '../sections'
import { PPQ, type Settings, type Song } from '../types'

interface Props {
  song: Song
  settings: Settings
  playing: boolean
  recording: boolean
  getTick: () => number
  onPlayAll: () => void
  onStop: () => void
  onSeek: (tick: number) => void
  onExportMidi: () => void
  onRecord: () => void
  /** 곡이 담긴 공유 링크 */
  makeLink: () => Promise<string>
  onCompose: (id: string) => void
  onWrite: () => void
  onMessage: (text: string) => void
}

type View = 'listen' | 'rate' | 'share'

/** 마지막 단계: 듣기 · 평가 · 공유 */
export function DeliverPage({ song, settings, playing, recording, getTick, onPlayAll, onStop, onSeek, onExportMidi, onRecord, makeLink, onCompose, onWrite, onMessage }: Props) {
  const [view, setView] = useState<View>('listen')
  const [link, setLink] = useState('')
  const barTicks = song.beatsPerBar * PPQ
  const totalTicks = song.bars * barTicks
  const headRef = useRef<HTMLDivElement>(null)
  const nowRef = useRef<HTMLSpanElement>(null)
  const ranges = rangesOf(song)
  const secs = Math.round(((song.bars * song.beatsPerBar) / (song.bpm * settings.speed)) * 60)
  const key = settings.scaleType === 'none' ? '음계 없음' : `${NOTE_NAMES_KO[settings.scaleRoot]} ${keyOf(settings.scaleRoot, settings.scaleType).minor ? '단조 계열' : '장조 계열'}`
  const ev = useMemo(() => evaluate(song, settings), [song, settings])
  const empty = song.sections.filter((s) => noteCounts(song, s.id).every((n) => n === 0))

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const t = Math.max(0, Math.min(totalTicks, getTick()))
      if (headRef.current) headRef.current.style.left = `${(t / totalTicks) * 100}%`
      if (nowRef.current) {
        const s = song.sections.find((x) => {
          const r = ranges.get(x.id)!
          return t >= r.start && t < r.end
        })
        nowRef.current.textContent = playing && s ? `지금: ${s.name}` : ''
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  })

  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text)
      onMessage(ok)
    } catch {
      onMessage('복사하지 못했어요. 글자를 직접 선택해서 복사해 주세요.')
    }
  }

  const createLink = async () => {
    try {
      const url = await makeLink()
      setLink(url)
      return url
    } catch {
      onMessage('링크를 만들지 못했어요.')
      return ''
    }
  }

  const nativeShare = async () => {
    const url = link || (await createLink())
    if (!url) return
    const text = `🎵 「${song.title || '내 곡'}」 ★${ev.stars} ${ev.total}점 — 내가 만든 곡을 들어 봐!`
    if (navigator.share) {
      try {
        await navigator.share({ title: song.title || '내 곡', text, url })
      } catch { /* 사용자가 공유를 취소함 */ }
    } else {
      void copy(`${text}\n${url}`, '공유 글을 복사했어요. 친구에게 붙여넣기 해 보세요!')
    }
  }

  const local = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname)

  return (
    <div className="page deliver">
      <header className="page-head">
        <div>
          <h2>🎬 완성 — {song.title || '이름 없는 곡'}</h2>
          <p>곡 전체를 들어 보고, 평가를 받고, 친구와 나눠 보세요.</p>
        </div>
        <div className="head-stats">
          <span><b>{song.bpm}</b> BPM</span>
          <span><b>{song.beatsPerBar}/4</b> 박자</span>
          <span>{key}</span>
          <span><b>{song.bars}</b>마디 · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
        </div>
      </header>

      <div className="sub-tabs" role="tablist">
        {([['listen', '🎧 듣기'], ['rate', '⭐ 평가'], ['share', '📤 공유']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'listen' && (
        <>
          <div className="play-hero">
            <button className="hero-play" onClick={onPlayAll}>{playing ? '⏹ 멈추기' : '▶ 처음부터 전체 재생'}</button>
            {playing && <button onClick={onStop}>⏸ 정지</button>}
            <span ref={nowRef} className="now" />
          </div>
          <div
            className="deliver-timeline"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              onSeek(Math.round(((e.clientX - r.left) / r.width) * song.bars) * barTicks)
            }}
            title="누르면 그 위치부터 들어요"
          >
            {song.sections.map((s) => (
              <div key={s.id} className="dl-block" style={{ flex: s.bars, background: KINDS[s.kind].color }}>
                <b>{s.name}</b>
                <small>{s.bars}마디</small>
              </div>
            ))}
            <div className="dl-head" ref={headRef} />
          </div>
          <section className="checklist">
            <h3>파트별 점검</h3>
            <ul>
              {song.sections.map((s) => {
                const counts = noteCounts(song, s.id)
                const total = counts.reduce((a, b) => a + b, 0)
                return (
                  <li key={s.id} className={total ? 'ok' : 'empty'}>
                    <i style={{ background: KINDS[s.kind].color }} />
                    <b>{s.name}</b>
                    <span>
                      {total ? song.tracks.map((t, i) => (counts[i] ? `${t.name} ${counts[i]}` : null)).filter(Boolean).join(' · ') : '아직 음표가 없어요'}
                    </span>
                    <button onClick={() => onCompose(s.id)}>{total ? '다듬기' : '채우러 가기'}</button>
                  </li>
                )
              })}
            </ul>
            {empty.length > 0 && <p className="note-text">비어 있는 파트는 재생할 때 조용히 지나가요.</p>}
          </section>
        </>
      )}

      {view === 'rate' && (
        <>
          <section className="score-card">
            <div className="score-ring" style={{ ['--p' as string]: ev.total }}>
              <b>{ev.total}</b>
              <small>점</small>
            </div>
            <div>
              <div className="stars" aria-label={`별 ${ev.stars}개`}>
                {'★'.repeat(ev.stars)}
                <span>{'★'.repeat(5 - ev.stars)}</span>
              </div>
              <h3>{ev.headline}</h3>
              <p className="note-text">
                {ev.melodyName ? `‘${ev.melodyName}’ 트랙의 멜로디를 기준으로 ` : ''}음악 기본 원리에 맞춰 살펴본 결과예요. 점수보다 아래 <b>팁</b>이 더 중요해요!
              </p>
            </div>
          </section>
          <ul className="criteria">
            {ev.criteria.map((c) => (
              <li key={c.id}>
                <div className="crit-head">
                  <span className="crit-icon">{c.icon}</span>
                  <b>{c.label}</b>
                  <span className="crit-score">{c.score === null ? '—' : `${c.score}점`}</span>
                </div>
                <div className="crit-bar">
                  <i style={{ width: `${c.score ?? 0}%`, background: c.score === null ? 'var(--border)' : c.score >= 75 ? '#3ecf8e' : c.score >= 50 ? '#f5b83d' : '#ff7a59' }} />
                </div>
                <p className="crit-detail">{c.detail}</p>
                <p className="crit-learn">📖 {c.learn}</p>
                {c.tip && <p className="crit-tip">👉 {c.tip}</p>}
              </li>
            ))}
          </ul>
          <div className="row-btns">
            <button className="primary" onClick={onWrite}>✏️ 직접 쓰기에서 고치러 가기</button>
            <button onClick={() => copy(evaluationText(song, ev), '평가 결과를 복사했어요!')}>📋 평가 결과 복사</button>
          </div>
        </>
      )}

      {view === 'share' && (
        <div className="share-grid">
          <section className="share-card">
            <h3>🔗 링크로 보내기</h3>
            <p>곡이 링크 안에 통째로 들어 있어요. 받은 친구가 링크를 열면 시작 화면에서 바로 곡을 열 수 있어요.</p>
            <div className="row-btns">
              <button className="primary" onClick={() => void createLink()}>링크 만들기</button>
              <button onClick={() => void nativeShare()}>📤 공유하기</button>
            </div>
            {link && (
              <div className="link-box">
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="공유 링크" />
                <button onClick={() => copy(link, '링크를 복사했어요!')}>복사</button>
              </div>
            )}
            {local && <p className="note-text">⚠️ 지금은 내 컴퓨터에서만 열리는 주소({location.host})예요. 친구가 열려면 이 앱이 인터넷에 올라가 있어야 해요.</p>}
          </section>
          <section className="share-card">
            <h3>🎧 소리 파일로 저장</h3>
            <p>곡을 처음부터 끝까지 재생하면서 녹음해요. 곡 길이만큼 시간이 걸려요 (약 {Math.floor(secs / 60)}분 {secs % 60}초). 메신저로 바로 들려줄 수 있어요.</p>
            <button className="primary" onClick={onRecord} disabled={recording}>{recording ? '🔴 녹음 중… (끝나면 자동 저장)' : '🎙 녹음해서 저장'}</button>
          </section>
          <section className="share-card">
            <h3>💾 MIDI 파일</h3>
            <p>다른 음악 프로그램에서도 열 수 있는 악보 파일이에요. 선생님께 제출하거나 보관할 때 좋아요.</p>
            <button onClick={onExportMidi}>.mid 저장</button>
          </section>
          <section className="share-card">
            <h3>📋 평가 결과 복사</h3>
            <p>별점과 점수를 글로 복사해서 소감과 함께 보낼 수 있어요.</p>
            <button onClick={() => copy(evaluationText(song, ev), '평가 결과를 복사했어요!')}>복사하기</button>
          </section>
        </div>
      )}
    </div>
  )
}
