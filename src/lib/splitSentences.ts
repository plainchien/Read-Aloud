/**
 * 英文句子切分（朗读 / TTS 分句）。
 *
 * 优先使用 `Intl.Segmenter`（能较好处理小数、缩写、省略号等）；
 * 不可用时回退到启发式规则。
 */

function ensureTrailingSentenceMark(s: string): string {
  const x = s.trim()
  if (!x) return x
  if (/[.!?…]$/.test(x)) return x
  return `${x}.`
}

/** 句点后跟大写时，不把该句点当句末的常见缩写（小写） */
const ABBREV_NO_SPLIT = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'vs',
  'etc',
  'st',
  'ave',
  'inc',
  'ltd',
  'vol',
  'fig',
  'no',
  'pp',
  'approx',
  'eg',
  'ie',
  'am',
  'pm',
  'us',
  'uk',
  'al',
])

function wordBeforeDot(text: string, dotIndex: number): string {
  let j = dotIndex - 1
  while (j >= 0 && /[A-Za-z.]/.test(text[j])) j--
  return text.slice(j + 1, dotIndex).toLowerCase()
}

function isListOrOutlineNumberPeriod(text: string, i: number): boolean {
  if (text[i] !== '.') return false
  const lineStart = text.lastIndexOf('\n', i) + 1
  const upToDot = text.slice(lineStart, i + 1)
  return /^\s*\d+\.$/.test(upToDot)
}

function isSentenceEndingPeriod(text: string, i: number): boolean {
  if (text[i] !== '.') return false

  // 小数 / 版本号片段：数字.数字
  if (i > 0 && /\d/.test(text[i - 1]) && i + 1 < text.length && /\d/.test(text[i + 1])) {
    return false
  }

  // 省略号 … 或 ..
  if (i + 1 < text.length && text[i + 1] === '.') return false
  if (i > 0 && text[i - 1] === '.') return false

  // 无空格紧跟：域名、路径、邮箱等（example.com）
  if (i + 1 < text.length && !/\s/.test(text[i + 1])) return false

  if (isListOrOutlineNumberPeriod(text, i)) return false

  const w = wordBeforeDot(text, i)
  const key = w.replace(/\./g, '')
  if (w && (ABBREV_NO_SPLIT.has(w) || ABBREV_NO_SPLIT.has(key))) return false

  const after = text.slice(i + 1)
  if (/^\s*$/.test(after)) return true
  if (!/^\s/.test(after)) return false

  const afterTrim = after.trimStart()
  if (afterTrim === '') return true
  return /^[A-Z"'"(\d]/.test(afterTrim)
}

function splitSentencesFallback(text: string): string[] {
  const out: string[] = []
  let buf = ''

  for (let i = 0; i < text.length; i++) {
    const c = text[i]

    if (c === '.' && isSentenceEndingPeriod(text, i)) {
      buf += '.'
      const s = buf.trim()
      if (s) out.push(s)
      buf = ''
      while (i + 1 < text.length && /\s/.test(text[i + 1])) i++
      continue
    }

    if ((c === '!' || c === '?') && isSentenceEndingExclamation(text, i)) {
      buf += c
      while (i + 1 < text.length && /[!?]/.test(text[i + 1])) {
        i++
        buf += text[i]
      }
      const s = buf.trim()
      if (s) out.push(s)
      buf = ''
      while (i + 1 < text.length && /\s/.test(text[i + 1])) i++
      continue
    }

    buf += c
  }

  const tail = buf.trim()
  if (tail) out.push(tail)
  return out
}

function isSentenceEndingExclamation(text: string, i: number): boolean {
  const c = text[i]
  if (c !== '!' && c !== '?') return false
  const after = text.slice(i + 1)
  if (/^\s*$/.test(after)) return true
  if (!/^\s/.test(after)) return false
  return true
}

function splitWithIntlSegmenter(text: string): string[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  return [...segmenter.segment(text)]
    .map((seg) => seg.segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

export function splitSentencesByPeriod(text: string): string[] {
  const t = text.trim()
  if (!t) return []

  let parts: string[]

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      parts = splitWithIntlSegmenter(t)
    } catch {
      parts = splitSentencesFallback(t)
    }
  } else {
    parts = splitSentencesFallback(t)
  }

  return parts.map(ensureTrailingSentenceMark)
}
