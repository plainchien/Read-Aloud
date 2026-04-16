/** 与主工程类似的 MyMemory 分块翻译（仅英文 → 中文） */
const CHUNK = 450

export async function translateEnToZh(fullText: string): Promise<string> {
  const text = fullText.trim()
  if (!text) return ''

  const chunks: string[] = []
  let remain = text
  while (remain.length > 0) {
    if (remain.length <= CHUNK) {
      chunks.push(remain)
      break
    }
    const dotIdx = remain.lastIndexOf('. ', CHUNK)
    const spaceIdx = remain.lastIndexOf(' ', CHUNK)
    let end = CHUNK
    if (dotIdx >= 0) end = dotIdx + 2
    else if (spaceIdx >= 0) end = spaceIdx + 1
    chunks.push(remain.slice(0, end).trim())
    remain = remain.slice(end).trim()
  }

  const results: string[] = []
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|zh`
    const res = await fetch(url)
    const data = (await res.json()) as { responseData?: { translatedText?: string } }
    results.push(data.responseData?.translatedText ?? '')
  }
  return results.join(' ').trim() || '翻译暂时无法使用。'
}
