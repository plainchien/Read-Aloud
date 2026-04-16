export type PlaylistItem = {
  id: string
  /** 列表展示标题（可截断） */
  title: string
  /** 用于合成 / 下载的全文 */
  text: string
  /** 副文案，如 23 Second · Today */
  meta: string
  createdAt: number
}

const KEY = 'readaloud_home_playlist_v1'

/** 按正文去重，保留时间顺序中首次出现（列表已按新→旧） */
function dedupeByText(items: PlaylistItem[]): PlaylistItem[] {
  const seen = new Set<string>()
  const out: PlaylistItem[] = []
  for (const it of items) {
    const k = it.text.trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

export function loadPlaylist(): PlaylistItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PlaylistItem[]
    if (!Array.isArray(parsed)) return []
    const deduped = dedupeByText(parsed)
    if (deduped.length !== parsed.length) {
      try {
        localStorage.setItem(KEY, JSON.stringify(deduped))
      } catch {
        /* quota */
      }
    }
    return deduped
  } catch {
    return []
  }
}

export function savePlaylist(items: PlaylistItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* quota */
  }
}

function formatMeta(d: Date, text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const sec = Math.max(1, Math.round(words / 2.8))
  const now = new Date()
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  const isYesterday =
    d.getDate() === y.getDate() &&
    d.getMonth() === y.getMonth() &&
    d.getFullYear() === y.getFullYear()
  if (isToday) return `${sec} Second · Today`
  if (isYesterday) return `${sec} Second · Yesterday`
  return `${sec} Second · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export function buildPlaylistItem(text: string): PlaylistItem {
  const t = text.trim()
  const title = t.length > 72 ? `${t.slice(0, 72)}…` : t
  const d = new Date()
  return {
    id: `pl-${d.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
    title,
    text: t,
    meta: formatMeta(d, t),
    createdAt: d.getTime(),
  }
}

/** 新条目插到最前；相同正文不重复；最多保留 200 条 */
export function prependPlaylistItem(items: PlaylistItem[], text: string): PlaylistItem[] {
  const t = text.trim()
  if (!t) return items
  const filtered = items.filter((x) => x.text.trim() !== t)
  const next = [buildPlaylistItem(t), ...filtered]
  return next.slice(0, 200)
}

export function removePlaylistItem(items: PlaylistItem[], id: string): PlaylistItem[] {
  return items.filter((x) => x.id !== id)
}
