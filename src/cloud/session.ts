/* ======================================================================
   로그인 세션 (WSNS 계정). 지금은 저장만 해 두는 자리 — 실제 로그인 화면은 WSNS 사이트가 맡는다.
   흐름(예정): WSNS 로그인 → 쎈스 컴포즈로 돌아올 때 주소 끝에 #wsns-token=… → 여기서 받아 보관하고 주소에서 지움.
   ====================================================================== */
export interface CloudSession { token: string; userId: string; name?: string; expiresAt?: string }

const KEY = 'sense-compose:session'
type Listener = (s: CloudSession | null) => void
const listeners = new Set<Listener>()

export function getSession(): CloudSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as CloudSession | null
    if (s?.expiresAt && Date.parse(s.expiresAt) < Date.now()) return null
    return s
  } catch {
    return null
  }
}
export function setSession(s: CloudSession | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch { /* 저장 못 해도 이번 화면에서는 쓴다 */ }
  for (const l of listeners) l(s)
}
export function onSession(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** 주소의 #wsns-token=…&uid=…&name=… 를 읽어 세션으로 보관하고 주소에서 지운다 */
export function takeSessionFromUrl(): CloudSession | null {
  const h = new URLSearchParams(location.hash.slice(1))
  const token = h.get('wsns-token')
  if (!token) return null
  const s: CloudSession = { token, userId: h.get('uid') ?? '', name: h.get('name') ?? undefined, expiresAt: h.get('exp') ?? undefined }
  setSession(s)
  history.replaceState(null, '', location.pathname + location.search)
  return s
}
