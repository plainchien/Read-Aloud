/**
 * 与主工程 WordCard 一致：同域 GET `/api/translate-proxy`（MyMemory en→zh）
 */
const TRANSLATE_PROXY = '/api/translate-proxy'

export function cleanEnglishWord(raw: string): string {
  return raw.replace(/[^a-zA-Z'-]/g, '').toLowerCase()
}

export async function translateWordEnToZh(word: string): Promise<string> {
  const clean = cleanEnglishWord(word)
  if (!clean) throw new Error('无效单词')

  const url = `${TRANSLATE_PROXY}?q=${encodeURIComponent(clean)}&langpair=${encodeURIComponent('en|zh')}`
  const res = await fetch(url)
  const data = (await res.json()) as {
    responseData?: { translatedText?: string }
    message?: string
    error?: string
  }

  if (!res.ok) {
    throw new Error(data.message || data.error || res.statusText || '翻译失败')
  }

  return (data.responseData?.translatedText ?? '').trim()
}
