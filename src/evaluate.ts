import { L } from './i18n'
import { inScale, isMinorType, NOTE_NAMES_KO } from './music'
import { rangesOf } from './sections'
import { PPQ, type Note, type Settings, type Song, type Track } from './types'

export interface Criterion {
  id: string
  icon: string
  label: string
  /** null이면 아직 평가할 수 없는 항목 */
  score: number | null
  weight: number
  detail: string
  /** 이 항목이 음악에서 왜 중요한지 (배움 한 줄) */
  learn: string
  tip?: string
}

export interface Evaluation {
  total: number
  stars: number
  headline: string
  criteria: Criterion[]
  melodyName: string | null
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))

/** 평가할 멜로디 트랙: 이름에 ‘멜로디’가 있으면 그것, 없으면 음표가 가장 많은 일반 트랙 */
export function melodyTrackOf(song: Song): Track | null {
  const pitched = song.tracks.filter((t) => !t.drum)
  return pitched.find((t) => t.name.includes(L("멜로디"))) ?? [...pitched].sort((a, b) => b.notes.length - a.notes.length)[0] ?? null
}

/** 같은 시작 시각의 음은 가장 높은 음 하나만 남겨 한 줄 선율로 만든다 */
function line(notes: Note[]): Note[] {
  const by = new Map<number, Note>()
  for (const n of notes) {
    const o = by.get(n.start)
    if (!o || n.pitch > o.pitch) by.set(n.start, n)
  }
  return [...by.values()].sort((a, b) => a.start - b.start)
}

export function evaluate(song: Song, settings: Settings): Evaluation {
  const mel = melodyTrackOf(song)
  const notes = mel ? line(mel.notes) : []
  const ranges = rangesOf(song)
  const scaleKnown = settings.scaleType !== 'none'
  const criteria: Criterion[] = []

  if (!mel || notes.length < 4) {
    return {
      total: 0,
      stars: 0,
      headline: L("아직 멜로디가 거의 없어요. 직접 쓰기 모드에서 음표를 찍어 보세요!"),
      melodyName: mel?.name ?? null,
      criteria: [
        {
          id: 'complete', icon: '', label: L("완성도"), score: 0, weight: 1,
          detail: L("멜로디 음표가 4개보다 적어요"),
          learn: L("노래는 멜로디(선율)가 주인공이에요."),
          tip: L("“멜로디” 트랙에 음표를 찍어 곡을 채워 보세요."),
        },
      ],
    }
  }

  // 1. 완성도: 멜로디가 있는 파트의 비율
  const filled = song.sections.filter((s) => {
    const r = ranges.get(s.id)!
    return notes.some((n) => n.start >= r.start && n.start < r.end)
  })
  const emptyNames = song.sections.filter((s) => !filled.includes(s)).map((s) => s.name)
  criteria.push({
    id: 'complete', icon: '', label: L("완성도"), weight: 25,
    score: song.sections.length ? Math.round((filled.length / song.sections.length) * 100) : 0,
    detail: L("{0}개 파트 중 {1}개에 멜로디가 있어요", song.sections.length, filled.length),
    learn: L("곡은 여러 파트가 이어져 하나의 이야기가 돼요. 빈 파트가 없어야 끝까지 흘러가요."),
    tip: emptyNames.length ? L("{0} 파트를 채워 보세요.", emptyNames.join(', ')) : undefined,
  })

  // 2. 음계 지키기
  if (scaleKnown) {
    const inside = notes.filter((n) => inScale(n.pitch, settings.scaleRoot, settings.scaleType)).length
    const pct = inside / notes.length
    criteria.push({
      id: 'scale', icon: '', label: L("음계 지키기"), weight: 15, score: Math.round(pct * 100),
      detail: L("음표 {0}개 중 {1}개가 정한 음계 안에 있어요", notes.length, inside),
      learn: L("같은 음계 안의 음들은 서로 잘 어울려서 ‘한 곡’처럼 들려요. 음계 밖의 음은 양념처럼 조금만 쓰면 멋져요."),
      tip: pct < 0.8 ? L("어두운 칸(음계 밖의 음)에 찍은 음표를 밝은 칸으로 옮겨 보세요.") : undefined,
    })
  } else {
    criteria.push({
      id: 'scale', icon: '', label: L("음계 지키기"), weight: 15, score: null,
      detail: L("음계를 정하지 않았어요"),
      learn: L("음계를 정하면 어울리는 음이 어디인지 알 수 있어요."),
      tip: L("직접 쓰기 모드 오른쪽의 “음계 도우미”에서 음계를 골라 보세요."),
    })
  }

  // 3. 리듬 다양성: 서로 다른 음표 길이의 종류
  const durs = new Set(notes.map((n) => Math.round(n.dur / (PPQ / 4))))
  const rhythm = durs.size <= 1 ? 20 : durs.size === 2 ? 55 : durs.size === 3 ? 80 : 100
  criteria.push({
    id: 'rhythm', icon: '', label: L("리듬 다양성"), weight: 10, score: rhythm,
    detail: L("서로 다른 길이의 음표를 {0}가지 썼어요", durs.size),
    learn: L("길고 짧은 음표가 섞이면 리듬이 살아나요. 같은 길이만 쓰면 단조롭게 들려요."),
    tip: durs.size < 3 ? L("긴 음표와 짧은 음표를 섞어 보세요.") : undefined,
  })

  // 4. 멜로디 모양: 인접한 음 사이의 거리
  const iv = notes.slice(1).map((n, i) => Math.abs(n.pitch - notes[i].pitch))
  const stepwise = iv.filter((x) => x > 0 && x <= 4).length / iv.length
  const same = iv.filter((x) => x === 0).length / iv.length
  const big = iv.filter((x) => x > 9).length / iv.length
  const shape = clamp(100 - Math.abs(stepwise - 0.7) * 120 - Math.max(0, big - 0.1) * 250 - Math.max(0, same - 0.4) * 120)
  criteria.push({
    id: 'shape', icon: '', label: L("멜로디 모양"), weight: 15, score: Math.round(shape),
    detail: L("가까운 음으로 이어지는 비율 {0}% · 같은 음 반복 {1}% · 큰 도약 {2}%", Math.round(stepwise * 100), Math.round(same * 100), Math.round(big * 100)),
    learn: L("좋은 멜로디는 대부분 가까운 음으로 걸어가듯 움직이고, 가끔 점프해서 놀라움을 줘요."),
    tip: big > 0.2 ? L("너무 크게 뛰는 곳이 많아요. 중간에 징검다리 음을 넣어 보세요.") : same > 0.5 ? L("같은 음이 많이 반복돼요. 음 높이를 조금씩 바꿔 보세요.") : undefined,
  })

  // 5. 음역
  const lo = Math.min(...notes.map((n) => n.pitch))
  const hi = Math.max(...notes.map((n) => n.pitch))
  const span = hi - lo
  const range = span < 5 ? 40 : span < 7 ? 70 : span <= 19 ? 100 : span <= 24 ? 70 : 40
  criteria.push({
    id: 'range', icon: '↕️', label: L("음역"), weight: 5, score: range,
    detail: L("가장 낮은 음과 높은 음이 {0}반음 차이 ({1})", span, span >= 12 ? L("{0}옥타브 {1}반음", Math.floor(span / 12), span % 12) : L("한 옥타브 안")),
    learn: L("사람이 편하게 부르는 노래는 보통 한 옥타브 반(18반음) 안쪽이에요. 너무 좁으면 밋밋하고 너무 넓으면 부르기 힘들어요."),
    tip: span < 7 ? L("조금 더 높은 음, 낮은 음도 써 보세요.") : span > 19 ? L("음역이 넓어서 부르기 어려울 수 있어요.") : undefined,
  })

  // 6. 반복과 변화: 같은 종류의 파트는 닮고, 다른 종류의 파트는 달라야 한다
  const sig = (id: string) => {
    const r = ranges.get(id)!
    return new Set(notes.filter((n) => n.start >= r.start && n.start < r.end).map((n) => `${Math.round((n.start - r.start) / (PPQ / 2))}:${n.pitch % 12}`))
  }
  const jac = (x: Set<string>, y: Set<string>) => {
    const inter = [...x].filter((v) => y.has(v)).length
    const uni = x.size + y.size - inter
    return uni ? inter / uni : 0
  }
  const sigs = song.sections.map((s) => ({ s, g: sig(s.id) })).filter((x) => x.g.size > 0)
  const sameSims: number[] = []
  const diffSims: number[] = []
  for (let i = 0; i < sigs.length; i++)
    for (let j = i + 1; j < sigs.length; j++)
      (sigs[i].s.kind === sigs[j].s.kind ? sameSims : diffSims).push(jac(sigs[i].g, sigs[j].g))
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const parts: number[] = []
  if (sameSims.length) parts.push(clamp(avg(sameSims) / 0.5, 0, 1))
  if (diffSims.length) parts.push(clamp((1 - avg(diffSims)) / 0.6, 0, 1))
  criteria.push({
    id: 'form', icon: '', label: L("반복과 변화"), weight: 15, score: parts.length ? Math.round(avg(parts) * 100) : null,
    detail: parts.length
      ? L("같은 종류 파트의 닮은 정도 {0} · 다른 파트와의 닮은 정도 {1}", sameSims.length ? Math.round(avg(sameSims) * 100) + '%' : '-', diffSims.length ? Math.round(avg(diffSims) * 100) + '%' : '-')
      : L("비교할 파트가 아직 부족해요"),
    learn: L("같은 가락이 돌아오면 기억에 남고(반복), 다른 가락이 나오면 지루하지 않아요(변화). 둘의 균형이 형식의 핵심이에요."),
    tip: sameSims.length && avg(sameSims) < 0.3 ? L("같은 종류의 파트(예: 코러스끼리)는 비슷한 가락으로 돌아오게 해 보세요. 복제 기능이 도와줘요.") : diffSims.length && avg(diffSims) > 0.7 ? L("서로 다른 파트가 너무 비슷해요. B 가락은 조금 다르게 만들어 보세요.") : undefined,
  })

  // 7. 마무리: 으뜸음으로 끝나는가
  if (scaleKnown) {
    const last = notes[notes.length - 1].pitch % 12
    const root = settings.scaleRoot
    const minor = isMinorType(settings.scaleType)
    const third = (root + (minor ? 3 : 4)) % 12
    const fifth = (root + 7) % 12
    const ok = last === root ? 100 : last === third || last === fifth ? 60 : 20
    criteria.push({
      id: 'end', icon: '', label: L("마무리"), weight: 10, score: ok,
      detail: L("마지막 음은 ‘{0}’{1}", NOTE_NAMES_KO[last], last === root ? L(" — 으뜸음이에요!") : ''),
      learn: L("으뜸음은 음계의 ‘집’이에요. 곡이 집에 도착하면 끝난 느낌이 나고, 다른 음에서 멈추면 이야기가 이어질 것처럼 들려요."),
      tip: ok < 100 ? L("마지막 음을 으뜸음 ‘{0}’로 바꿔 보세요.", NOTE_NAMES_KO[root]) : undefined,
    })
  }

  // 8. 악기 구성
  const layers = song.tracks.filter((t) => t.notes.length > 0).length
  criteria.push({
    id: 'layers', icon: '', label: L("악기 구성"), weight: 5, score: layers <= 1 ? 40 : layers === 2 ? 70 : 100,
    detail: L("소리가 나는 트랙이 {0}개예요", layers),
    learn: L("멜로디 아래에 화음(코드), 저음(베이스), 리듬(드럼)이 깔리면 소리가 풍성해져요."),
    tip: layers <= 1 ? L("코드 반주나 드럼을 더해 보세요.") : undefined,
  })

  const rated = criteria.filter((c) => c.score !== null)
  const wsum = rated.reduce((a, c) => a + c.weight, 0)
  const total = Math.round(rated.reduce((a, c) => a + c.weight * (c.score as number), 0) / wsum)
  const stars = total >= 90 ? 5 : total >= 75 ? 4 : total >= 55 ? 3 : total >= 35 ? 2 : 1
  const headline = ['', L("시작이 반이에요! 조금만 더 다듬어 봐요."), L("좋은 출발이에요. 아래 팁을 따라 해 보세요."), L("잘하고 있어요! 몇 가지만 더하면 완성돼요."), L("멋진 곡이에요! 거의 다 왔어요."), L("훌륭해요! 친구들에게 들려줘도 좋겠어요. ")][stars]
  return { total, stars, headline, criteria, melodyName: mel.name }
}

/** 공유용 글 */
export function evaluationText(song: Song, ev: Evaluation): string {
  const bar = '★'.repeat(ev.stars) + '☆'.repeat(5 - ev.stars)
  const lines = ev.criteria.filter((c) => c.score !== null).map((c) => L("· {0} {1}점", c.label, c.score))
  return L("「{0}」 {1} {2}점\n{3}\n{4}", song.title || L("이름 없는 곡"), bar, ev.total, ev.headline, lines.join('\n'))
}
