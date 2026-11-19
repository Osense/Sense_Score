import { L } from '../i18n'
import { encodeProject, type Project } from './projectFile'
import { ConflictError, LocalProjectStore, RemoteProjectStore, type ProjectMeta, type ProjectStore } from './store'
import { getSession } from './session'

/* ======================================================================
   자동 저장: 곡이 바뀌면 잠시(기본 4초) 기다렸다가 .mid로 만들어 보관함에 올린다.
   - 로그인하면 계정 보관함(서버), 아니면 이 기기(IndexedDB)
   - 서버에 못 올리면(오프라인 등) 이 기기에 먼저 두고 다음 저장 때 다시 올린다
   - 다른 기기에서 먼저 저장했으면(충돌) 덮어쓰지 않고 onState로 알린다
   ====================================================================== */
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error'

/** 서버 주소: 빌드 때 VITE_CLOUD_API를 넣으면 켜진다 (비어 있으면 클라우드 저장 꺼짐) */
export const CLOUD_API: string = (import.meta.env?.VITE_CLOUD_API as string | undefined) ?? ''
export const cloudEnabled = () => !!CLOUD_API && !!getSession()

export function storeFor(): ProjectStore {
  return cloudEnabled() ? new RemoteProjectStore(CLOUD_API, () => getSession()?.token ?? null) : new LocalProjectStore()
}

export function createAutosaver(opts: { delayMs?: number; onState?: (s: SaveState, meta?: ProjectMeta) => void } = {}) {
  const delay = opts.delayMs ?? 4000
  let timer: ReturnType<typeof setTimeout> | null = null
  let latest: Project | null = null
  let rev: number | undefined
  let busy = false
  const local = new LocalProjectStore()
  const emit = (s: SaveState, m?: ProjectMeta) => opts.onState?.(s, m)

  async function flush() {
    timer = null
    if (!latest || busy) return
    const p = latest
    latest = null
    busy = true
    emit('saving')
    try {
      if (!p.song.id) throw new Error(L("프로젝트 번호가 없어요"))
      const data = await encodeProject(p)
      const store = storeFor()
      const meta = await store.save({ id: p.song.id, title: p.song.title }, data, rev)
      rev = meta.rev
      emit('saved', meta)
    } catch (e) {
      if (e instanceof ConflictError) emit('conflict', e.current)
      else {
        // 서버에 못 올렸으면 이 기기에라도 둔다
        try { if (p.song.id) await local.save({ id: p.song.id, title: p.song.title }, await encodeProject(p)) } catch { /* 무시 */ }
        latest = latest ?? p
        emit(navigator.onLine ? 'error' : 'offline')
      }
    } finally {
      busy = false
      if (latest && !timer) timer = setTimeout(flush, delay)
    }
  }

  return {
    /** 곡이 바뀔 때마다 부른다 */
    touch(p: Project) {
      latest = p
      emit('pending')
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    /** 탭을 닫기 전 등: 기다리지 않고 바로 */
    flush: () => { if (timer) clearTimeout(timer); return flush() },
    /** 다른 프로젝트를 열었을 때 판 번호를 맞춘다 */
    setRev(r: number | undefined) { rev = r },
    cancel() { if (timer) clearTimeout(timer); timer = null; latest = null },
  }
}
