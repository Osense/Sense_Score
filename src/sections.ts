import { PPQ, uid, type Note, type Section, type SectionKind, type Song } from './types'

export const KINDS: Record<SectionKind, { label: string; color: string; hint: string }> = {
  a: { label: 'A', color: '#4f8cff', hint: '곡의 얼굴이 되는 첫 번째 가락(주제)' },
  b: { label: 'B', color: '#ff7a59', hint: 'A와 다른 분위기로 이야기를 이어 가는 가락(대비)' },
  intro: { label: '인트로', color: '#8b95a7', hint: '곡의 시작! 분위기를 살짝 보여줘요' },
  verse: { label: '벌스', color: '#4f8cff', hint: '이야기를 풀어가는 부분 (노래의 1절, 2절)' },
  prechorus: { label: '프리코러스', color: '#2ec4d6', hint: '후렴으로 올라가기 전에 긴장감을 만드는 부분' },
  chorus: { label: '코러스', color: '#ff7a59', hint: '가장 신나고 기억에 남는 후렴' },
  bridge: { label: '브릿지', color: '#b072ff', hint: '분위기를 확 바꾸는 부분' },
  interlude: { label: '간주', color: '#3ecf8e', hint: '노래 사이에 연주만 나오는 부분' },
  outro: { label: '아웃트로', color: '#f5b83d', hint: '곡을 마무리하는 부분' },
  free: { label: '자유', color: '#9aa0b0', hint: '정해진 역할 없이 마음대로' },
}

export const KIND_ORDER: SectionKind[] = ['a', 'b', 'intro', 'verse', 'prechorus', 'chorus', 'bridge', 'interlude', 'outro', 'free']

export type PartSpec = [SectionKind, number, string?]

export interface Structure {
  id: string
  label: string
  /** 음악 용어 */
  term: string
  desc: string
  /** 학생이 은연중에 배우는 설명 */
  learn: string[]
  parts: PartSpec[]
}

/** 시작 마법사에서 고르는 곡 구성(형식). 고르면서 음악 형식을 자연스럽게 배운다. */
export const STRUCTURES: Structure[] = [
  {
    id: 'ab',
    label: 'AB 형식',
    term: '두 도막 형식',
    desc: 'A → B',
    learn: [
      'A는 곡의 얼굴이 되는 첫 가락(주제)이에요.',
      'B는 A와 분위기가 다른 가락이에요. 이렇게 다른 것을 놓는 걸 ‘대비’라고 해요.',
      '짧은 동요나 연습곡에 많이 쓰이는, 가장 단순한 틀이에요.',
    ],
    parts: [['a', 4, 'A'], ['b', 4, 'B']],
  },
  {
    id: 'aba',
    label: 'ABA 형식',
    term: '세 도막 형식',
    desc: 'A → B → A',
    learn: [
      '처음 가락 A로 돌아와서 편안하게 끝나요. 돌아오는 것을 ‘재현’이라고 해요.',
      '가운데 B가 달라서, A가 다시 나올 때 더 반갑게 들려요.',
      '동요와 클래식 소품에서 정말 자주 만나는 틀이에요.',
    ],
    parts: [['a', 4, 'A'], ['b', 4, 'B'], ['a', 4, 'A (다시)']],
  },
  {
    id: 'aaba',
    label: 'AABA 형식',
    term: '반복이 있는 세 도막',
    desc: 'A → A → B → A',
    learn: [
      'A를 두 번 들려줘서 귀에 먼저 익숙해지게 해요. 반복은 기억에 남게 하는 힘이에요.',
      '그다음 B에서 분위기를 바꾸고, 마지막에 A로 돌아와요.',
      '재즈 스탠더드와 옛날 대중가요에 많이 쓰인 형식이에요.',
    ],
    parts: [['a', 4, 'A'], ['a', 4, 'A (반복)'], ['b', 4, 'B'], ['a', 4, 'A (다시)']],
  },
  {
    id: 'pop',
    label: '기성곡 형식 (가요·팝)',
    term: '벌스-코러스 형식',
    desc: '인트로 → 벌스 → 코러스 → 벌스 → 코러스 → 아웃트로',
    learn: [
      '벌스는 이야기를 풀어 가고, 코러스는 가장 신나는 후렴이에요. 둘을 번갈아 들려줘요.',
      '인트로로 분위기를 열고 아웃트로로 마무리해요.',
      '우리가 라디오에서 듣는 대부분의 노래가 이런 모양이에요.',
    ],
    parts: [['intro', 4], ['verse', 4], ['chorus', 4], ['verse', 4, '벌스 2'], ['chorus', 4, '코러스 2'], ['outro', 4]],
  },
  {
    id: 'full',
    label: '풀 세션 구성',
    term: '확장된 벌스-코러스 형식',
    desc: '인트로 → 벌스 → 코러스 → 벌스2 → 프리코러스 → 코러스 → 브릿지 → 코러스 → 아웃트로',
    learn: [
      '프리코러스는 후렴으로 올라가기 전에 긴장감을 쌓는 징검다리예요.',
      '브릿지는 분위기를 확 바꿔서, 마지막 코러스를 더 크게 느끼게 해요.',
      '코러스를 여러 번 반복해서 노래가 머릿속에 남게 해요. 조금 길지만 도전해 볼 만해요!',
    ],
    parts: [
      ['intro', 4], ['verse', 4], ['chorus', 4], ['verse', 4, '벌스 2'], ['prechorus', 4],
      ['chorus', 4, '코러스 2'], ['bridge', 4], ['chorus', 4, '코러스 3'], ['outro', 4],
    ],
  },
  {
    id: 'free',
    label: '처음엔 자유롭게',
    term: '자유 형식',
    desc: '8마디 한 덩어리',
    learn: ['정해진 틀 없이 시작해요. 쓰다가 구성 탭에서 파트를 나눠도 돼요.'],
    parts: [['free', 8, '전체']],
  },
]

/** 모든 파트는 4마디 단위로 간다 (2/4·3/4·4/4 어느 박자든 4마디가 한 호흡) */
export const PART_UNIT = 4
export const ceil4 = (n: number) => Math.max(PART_UNIT, Math.ceil(n / PART_UNIT) * PART_UNIT)
export const floor4 = (n: number) => Math.max(PART_UNIT, Math.floor(n / PART_UNIT) * PART_UNIT)
/** 파트 마디 수를 4마디씩 늘리거나 줄인다. 4의 배수가 아닌 옛 파트는 가까운 4의 배수로 맞춘다. */
export function stepBars(bars: number, dir: 1 | -1, max = 64): number {
  const next = bars % PART_UNIT === 0 ? bars + dir * PART_UNIT : dir > 0 ? ceil4(bars) : floor4(bars)
  return Math.min(max, Math.max(PART_UNIT, next))
}

export const barsOf = (sections: Section[]) => sections.reduce((s, x) => s + x.bars, 0)

/** 같은 종류가 여러 개면 "벌스 2"처럼 번호를 붙인 이름 */
export function autoName(kind: SectionKind, existing: Section[]): string {
  const n = existing.filter((s) => s.kind === kind).length
  return n === 0 ? KINDS[kind].label : `${KINDS[kind].label} ${n + 1}`
}

export function namesFor(parts: PartSpec[]): Section[] {
  const out: Section[] = []
  for (const [kind, bars, name] of parts) out.push({ id: uid(), kind, bars, name: name ?? autoName(kind, out) })
  return out
}

export interface Range { start: number; end: number; bar0: number }

/** 파트별 시작/끝 tick */
export function rangesOf(song: Pick<Song, 'sections' | 'beatsPerBar'>): Map<string, Range> {
  const barTicks = song.beatsPerBar * PPQ
  const m = new Map<string, Range>()
  let bar = 0
  for (const s of song.sections) {
    m.set(s.id, { start: bar * barTicks, end: (bar + s.bars) * barTicks, bar0: bar })
    bar += s.bars
  }
  return m
}

/** 파트 정보와 곡 길이(song.bars)를 항상 일치시킨다 */
export function normalizeSong(song: Song): Song {
  let sections = song.sections
  if (!sections?.length) sections = [{ id: uid(), kind: 'free', name: '전체', bars: Math.max(1, song.bars) }]
  const sum = barsOf(sections)
  if (sum < song.bars) {
    const last = sections[sections.length - 1]
    sections = [...sections.slice(0, -1), { ...last, bars: last.bars + (song.bars - sum) }]
  }
  const bars = Math.max(sum, song.bars)
  if (sections === song.sections && bars === song.bars) return song
  return { ...song, sections, bars }
}

export interface PlanItem {
  /** 음표를 가져올 원래 파트 (없으면 빈 파트) */
  src: string | null
  /** 원래 파트를 그대로 이어받는 경우의 id */
  id?: string
  kind: SectionKind
  name: string
  bars: number
}

export const planOf = (sections: Section[]): PlanItem[] =>
  sections.map((s) => ({ src: s.id, id: s.id, kind: s.kind, name: s.name, bars: s.bars }))

/**
 * 파트 목록을 새로 짠다. 각 새 파트는 원래 파트의 음표를 그대로 들고 간다.
 * 순서 바꾸기·복제·삭제·길이 바꾸기·새 파트 추가를 모두 이 한 가지로 처리한다.
 */
export function applySections(song: Song, plan: PlanItem[]): Song {
  const barTicks = song.beatsPerBar * PPQ
  const old = rangesOf(song)
  const usedIds = new Set<string>()
  const usedNotes = new Set<string>()
  const tracks = song.tracks.map((t) => ({ ...t, notes: [] as Note[] }))
  const sections: Section[] = []
  let cursor = 0
  for (const item of plan) {
    const len = Math.max(1, item.bars) * barTicks
    const id = item.id && !usedIds.has(item.id) ? item.id : uid()
    usedIds.add(id)
    sections.push({ id, kind: item.kind, name: item.name, bars: Math.max(1, item.bars) })
    const r = item.src ? old.get(item.src) : undefined
    if (r) {
      song.tracks.forEach((t, ti) => {
        for (const n of t.notes) {
          const rel = n.start - r.start
          if (n.start < r.start || n.start >= r.end || rel >= len) continue
          const nid = usedNotes.has(n.id) ? uid() : n.id
          usedNotes.add(nid)
          tracks[ti].notes.push({ ...n, id: nid, start: cursor + rel, dur: Math.min(n.dur, len - rel) })
        }
      })
    }
    cursor += len
  }
  return { ...song, sections, bars: Math.max(1, cursor / barTicks), tracks }
}

/** 파트 안에 음표가 있는지 (트랙별 개수) */
export function noteCounts(song: Song, id: string): number[] {
  const r = rangesOf(song).get(id)
  return song.tracks.map((t) => (r ? t.notes.filter((n) => n.start >= r.start && n.start < r.end).length : 0))
}
