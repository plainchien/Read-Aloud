/**
 * 按英文句号「.」切分句子；每个片段末尾补「.」便于展示。
 */
export function splitSentencesByPeriod(text: string): string[] {
  const t = text.trim()
  if (!t) return []
  const parts = t.split('.').map((s) => s.trim()).filter((s) => s.length > 0)
  return parts.map((p) => (p.endsWith('.') ? p : `${p}.`))
}
