/**
 * Kokoro 分块音频本地缓存（IndexedDB + 小内存热区），与主工程思路一致。
 * 仅缓存 speed=1 的合成结果（与朗读管线一致）。
 */

const DB_NAME = 'ReadAloudHomeTTS'
const DB_VER = 1
const STORE = 'chunks'
const MAX_ROWS = 200
const MEM_MAX = 48

const mem = new Map<string, ArrayBuffer>()

function cacheKey(voiceId: string, text: string): string {
  return `${voiceId}\x00${text.trim()}`
}

function touchMem(key: string, buf: ArrayBuffer): void {
  if (mem.has(key)) mem.delete(key)
  mem.set(key, buf)
  while (mem.size > MEM_MAX) {
    const first = mem.keys().next().value as string | undefined
    if (first == null) break
    mem.delete(first)
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
  })
}

type Row = { key: string; buffer: ArrayBuffer; ts: number }

async function trimStore(db: IDBDatabase): Promise<void> {
  const rows = await new Promise<Row[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const r = tx.objectStore(STORE).getAll()
    r.onsuccess = () => resolve((r.result as Row[]) ?? [])
    r.onerror = () => reject(r.error)
  })
  if (rows.length <= MAX_ROWS) return
  rows.sort((a, b) => a.ts - b.ts)
  const drop = rows.slice(0, rows.length - MAX_ROWS)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    const os = tx.objectStore(STORE)
    for (const row of drop) {
      os.delete(row.key)
    }
  })
}

export async function getCachedTtsChunk(voiceId: string, text: string): Promise<ArrayBuffer | null> {
  const key = cacheKey(voiceId, text)
  const hot = mem.get(key)
  if (hot) return hot.slice(0)

  try {
    const db = await openDb()
    const row = await new Promise<Row | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).get(key)
      r.onsuccess = () => resolve(r.result as Row | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!row?.buffer?.byteLength) return null
    const copy = row.buffer.slice(0)
    touchMem(key, copy)
    return copy
  } catch {
    return null
  }
}

export async function putCachedTtsChunk(
  voiceId: string,
  text: string,
  buffer: ArrayBuffer,
): Promise<void> {
  const key = cacheKey(voiceId, text)
  const copy = buffer.slice(0)
  touchMem(key, copy)

  try {
    const db = await openDb()
    const row: Row = { key, buffer: copy, ts: Date.now() }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(STORE).put(row)
    })
    await trimStore(db)
  } catch {
    /* quota / private mode */
  }
}
