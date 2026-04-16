import {
  countCodePoints,
  countHanCharacters,
  TTS_MAX_CODE_POINTS,
  TTS_MAX_HAN_CHARACTERS,
  validateTtsInput,
} from './ttsLimits'

/** 将超长片段按字符切到单次 TTS 可接受大小 */
function splitOversizedSegment(segment: string): string[] {
  const t = segment.trim()
  if (!t) return []
  const v = validateTtsInput(t)
  if (v.ok) return [t]

  const out: string[] = []
  let buf = ''
  for (const ch of t) {
    const next = buf + ch
    const cp = countCodePoints(next)
    const han = countHanCharacters(next)
    if (cp <= TTS_MAX_CODE_POINTS && han <= TTS_MAX_HAN_CHARACTERS) {
      buf = next
    } else {
      if (buf.trim()) out.push(buf.trim())
      buf = ch
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/**
 * 将句子列表合并为若干 TTS 块，每块满足 validateTtsInput
 */
export function chunkSentencesForTts(sentences: string[]): string[] {
  const chunks: string[] = []
  let buf = ''

  const flush = () => {
    if (buf.trim()) {
      chunks.push(...splitOversizedSegment(buf))
      buf = ''
    }
  }

  for (const s of sentences) {
    const t = s.trim()
    if (!t) continue
    const candidate = buf ? `${buf} ${t}` : t
    if (validateTtsInput(candidate).ok) {
      buf = candidate
    } else {
      flush()
      if (validateTtsInput(t).ok) {
        buf = t
      } else {
        chunks.push(...splitOversizedSegment(t))
      }
    }
  }
  flush()
  return chunks
}
