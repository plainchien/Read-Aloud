/**
 * 调用与主工程同构的 `/api/tts-proxy`（开发时由 Vite 代理到主应用 dev 服务器）
 * speed=1 时读写本地分块缓存（与朗读管线一致）。
 */
import { getCachedTtsChunk, putCachedTtsChunk } from './ttsCache'

const TTS_URL = '/api/tts-proxy'

export async function fetchTtsAudio(text: string, voice: string, speed = 1): Promise<ArrayBuffer> {
  const t = text.trim()
  if (!t) throw new Error('缺少文本')

  if (speed === 1) {
    const hit = await getCachedTtsChunk(voice, t)
    if (hit) return hit
  }

  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: t, voice, speed }),
  })

  if (!res.ok) {
    let msg = res.statusText
    try {
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('application/json')) {
        const data = (await res.json()) as { message?: string; error?: string }
        msg = (data.message || data.error || msg) as string
      } else {
        const t2 = await res.text()
        if (t2) msg = t2.slice(0, 200)
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg || 'TTS 请求失败')
  }

  const buf = await res.arrayBuffer()
  if (speed === 1 && buf.byteLength > 0) {
    void putCachedTtsChunk(voice, t, buf)
  }
  return buf
}
