/* ======================================================================
   프로젝트 보관함. 내용은 언제나 .mid 바이트(projectFile.ts) 하나.
   - LocalProjectStore: 이 기기의 IndexedDB (오프라인 · 서버에 못 올린 것 잠시 보관)
   - RemoteProjectStore: 로그인한 계정의 서버 보관함 (API 약속은 docs/cloud-save.md)
   ====================================================================== */

export interface ProjectMeta {
  id: string
  title: string
  /** 서버가 매기는 판 번호. 다른 기기에서 먼저 저장했으면 저장이 거절된다(충돌) */
  rev: number
  updatedAt: string
  bytes?: number
}

export class ConflictError extends Error {
  current: ProjectMeta
  constructor(current: ProjectMeta) {
    super('다른 기기에서 먼저 저장된 판이 있어요')
    this.current = current
  }
}

export interface ProjectStore {
  list(): Promise<ProjectMeta[]>
  load(id: string): Promise<{ meta: ProjectMeta; data: Uint8Array }>
  /** baseRev: 내가 마지막으로 받은 판. 서버 판이 더 새것이면 ConflictError */
  save(meta: { id: string; title: string }, data: Uint8Array, baseRev?: number): Promise<ProjectMeta>
  remove(id: string): Promise<void>
}

/* ---------------- 이 기기 (IndexedDB) ---------------- */
const DB = 'sense-compose-projects'
const OS = 'projects'

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(OS, { keyPath: 'meta.id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((res, rej) => {
    const q = fn(db.transaction(OS, mode).objectStore(OS))
    q.onsuccess = () => res(q.result)
    q.onerror = () => rej(q.error)
  }))
}
interface Row { meta: ProjectMeta; data: Uint8Array }

export class LocalProjectStore implements ProjectStore {
  async list() {
    const rows = await tx<Row[]>('readonly', (s) => s.getAll() as IDBRequest<Row[]>)
    return rows.map((r) => r.meta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async load(id: string) {
    const r = await tx<Row | undefined>('readonly', (s) => s.get(id) as IDBRequest<Row | undefined>)
    if (!r) throw new Error('프로젝트를 찾을 수 없어요')
    return r
  }
  async save(m: { id: string; title: string }, data: Uint8Array, baseRev?: number) {
    const old = await tx<Row | undefined>('readonly', (s) => s.get(m.id) as IDBRequest<Row | undefined>)
    if (old && baseRev !== undefined && old.meta.rev > baseRev) throw new ConflictError(old.meta)
    const meta: ProjectMeta = { id: m.id, title: m.title, rev: (old?.meta.rev ?? 0) + 1, updatedAt: new Date().toISOString(), bytes: data.byteLength }
    await tx('readwrite', (s) => s.put({ meta, data }))
    return meta
  }
  async remove(id: string) {
    await tx('readwrite', (s) => s.delete(id))
  }
}

/* ---------------- 계정 (서버) ---------------- */
export class RemoteProjectStore implements ProjectStore {
  private base: string
  private token: () => string | null
  constructor(base: string, token: () => string | null) {
    this.base = base
    this.token = token
  }
  private async req(path: string, init: RequestInit = {}) {
    const t = this.token()
    if (!t) throw new Error('로그인이 필요해요')
    const r = await fetch(`${this.base.replace(/\/$/, '')}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } })
    if (r.status === 409) throw new ConflictError(await r.json())
    if (!r.ok) throw new Error(`서버 오류 ${r.status}`)
    return r
  }
  async list() {
    return (await (await this.req('/projects')).json()) as ProjectMeta[]
  }
  async load(id: string) {
    const r = await this.req(`/projects/${encodeURIComponent(id)}`, { headers: { Accept: 'audio/midi' } })
    const meta: ProjectMeta = {
      id, title: decodeURIComponent(r.headers.get('X-Project-Title') ?? ''), rev: Number(r.headers.get('ETag')?.replace(/"/g, '') ?? 0), updatedAt: r.headers.get('Last-Modified') ?? '',
    }
    return { meta, data: new Uint8Array(await r.arrayBuffer()) }
  }
  async save(m: { id: string; title: string }, data: Uint8Array, baseRev?: number) {
    const r = await this.req(`/projects/${encodeURIComponent(m.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'audio/midi', 'X-Project-Title': encodeURIComponent(m.title), ...(baseRev !== undefined ? { 'If-Match': `"${baseRev}"` } : {}) },
      body: data as BodyInit,
    })
    return (await r.json()) as ProjectMeta
  }
  async remove(id: string) {
    await this.req(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }
}
