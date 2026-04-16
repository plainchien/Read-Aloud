/**
 * 调用主工程 `/api/url-extract`（开发时由 Vite 代理到主应用 dev 服务器）
 */
import { apiPath } from './apiPath'

const URL_EXTRACT = apiPath('/api/url-extract')

export async function fetchUrlExtractText(url: string): Promise<{ title: string; text: string }> {
  const u = url.trim()
  if (!u) throw new Error('请输入链接')

  const res = await fetch(URL_EXTRACT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: u }),
  })

  const ct = (res.headers.get('content-type') || '').toLowerCase()
  if (!ct.includes('application/json')) {
    const t = await res.text()
    throw new Error(!res.ok ? t.slice(0, 200) || res.statusText : '返回格式错误')
  }

  const data = (await res.json()) as {
    error?: string
    message?: string
    title?: string
    text?: string
  }

  if (!res.ok) {
    throw new Error(data.message || data.error || '提取失败')
  }

  return {
    title: typeof data.title === 'string' ? data.title : '',
    text: typeof data.text === 'string' ? data.text : '',
  }
}
