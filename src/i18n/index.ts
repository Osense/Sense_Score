import { EN } from './en'

/* ======================================================================
   언어: 한국어(ko) · 영어(en). 소스의 화면 문구는 한국어 원문이 그대로 키다 → L('저장', …값)
   - 처음 열면 기기 언어(navigator.language)가 한국어면 ko, 아니면 en. 머리줄에서 바꾸면 localStorage에 남긴다.
   - 언어는 페이지를 연 순간 정해진다(모듈 맨 위의 상수 목록도 그 언어로 만들어짐). 바꿀 때는 저장 후 새로 불러온다.
   - 사전(en.ts)에 없는 문구는 한국어 그대로 보인다. 개발 중에는 window.__i18nMissing에 모인다.
   ====================================================================== */
export type Lang = 'ko' | 'en'
const KEY = 'sense-score:lang'

export function detectLang(): Lang {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'ko' || s === 'en') return s
  } catch { /* 저장소를 못 쓰는 환경 */ }
  if (typeof navigator === 'undefined') return 'ko'
  const first = (navigator.languages?.[0] ?? navigator.language ?? 'ko').toLowerCase()
  return first.startsWith('ko') ? 'ko' : 'en'
}

export const lang: Lang = detectLang()
export const isEn = lang === 'en'
if (typeof document !== 'undefined') {
  document.documentElement.lang = lang
  if (lang === 'en') document.title = 'Sense Compose · Songwriting playground'
}

const missing = new Set<string>()

/** 한국어 원문 → 지금 언어. {0} {1} … 자리에 값을 넣는다 */
export function L(ko: string, ...args: unknown[]): string {
  let s = ko
  if (lang === 'en') {
    const e = EN[ko]
    if (e !== undefined) s = e
    else if (import.meta.env?.DEV && !missing.has(ko)) {
      missing.add(ko)
      ;(globalThis as { __i18nMissing?: string[] }).__i18nMissing = [...missing]
    }
  }
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[+i] === undefined ? m : String(args[+i]))) : s
}

/** 언어 바꾸기: 저장해 두고 새로 불러온다 (beforeSwitch에서 곡을 먼저 저장) */
export function setLang(l: Lang, beforeSwitch?: () => void) {
  if (l === lang) return
  try {
    beforeSwitch?.()
    localStorage.setItem(KEY, l)
  } catch { /* 무시 */ }
  location.reload()
}
