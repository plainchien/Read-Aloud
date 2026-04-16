import { useCallback, useRef } from 'react'

type ReadContentProps = {
  sentences: string[]
  /** 与 sentences 等长；有译文时在该句英文下展示 */
  translations: string[] | null
  translationVisible: boolean
  translateLoading: boolean
  translateError: string | null
  /** 与进度对应的当前句索引（0-based） */
  activeSentenceIndex: number
  /** 英文大字 20px；关闭时为默认 16px */
  textLarge: boolean
  /** 点击某句时定位进度到该句起点（与播放器进度一致） */
  onSentenceSeek?: (sentenceIndex: number) => void
  /** 长按英文单词：与主工程 WordCard 一致走 translate-proxy */
  onWordLongPress?: (word: string) => void
}

/** 拆成「单词 / 非单词」片段，单词为 [a-zA-Z]+ 及常见撇号缩写 */
function tokenizeSentence(sentence: string): Array<{ type: 'word' | 'text'; text: string }> {
  const tokens: Array<{ type: 'word' | 'text'; text: string }> = []
  const re = /[a-zA-Z]+(?:'[a-zA-Z]+)?/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(sentence)) !== null) {
    if (m.index > last) {
      tokens.push({ type: 'text', text: sentence.slice(last, m.index) })
    }
    tokens.push({ type: 'word', text: m[0] })
    last = m.index + m[0].length
  }
  if (last < sentence.length) {
    tokens.push({ type: 'text', text: sentence.slice(last) })
  }
  return tokens
}

const LONG_PRESS_MS = 500

function WordSpan({
  text,
  onLongPress,
}: {
  text: string
  onLongPress: () => void
}) {
  const timerRef = useRef<number | null>(null)
  const pointerIdRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const endPointer = useCallback((e: React.PointerEvent) => {
    clearTimer()
    if (pointerIdRef.current != null && e.pointerId === pointerIdRef.current) {
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      pointerIdRef.current = null
    }
  }, [])

  return (
    <span
      className="touch-manipulation select-none [-webkit-touch-callout:none]"
      title="长按查看翻译"
      onContextMenu={(e) => {
        e.preventDefault()
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        clearTimer()
        pointerIdRef.current = e.pointerId
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          onLongPress()
        }, LONG_PRESS_MS)
      }}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {text}
    </span>
  )
}

export function ReadContent({
  sentences,
  translations,
  translationVisible,
  translateLoading,
  translateError,
  activeSentenceIndex,
  textLarge,
  onSentenceSeek,
  onWordLongPress,
}: ReadContentProps) {
  const suppressSentenceClickRef = useRef(false)

  if (sentences.length === 0) {
    return <p className="text-[14px] text-ios-secondary-label">暂无正文</p>
  }

  const hasAnyTranslation =
    translationVisible &&
    translations !== null &&
    translations.some((t) => t.trim().length > 0)
  const blockGap = hasAnyTranslation ? 'gap-7' : 'gap-5'

  const enClass = textLarge
    ? 'text-[20px] font-semibold leading-relaxed text-ios-label'
    : 'text-[16px] font-semibold leading-relaxed text-ios-label'
  const zhClass = textLarge
    ? 'text-[16px] leading-relaxed text-[#aeaeb2]'
    : 'text-[14px] leading-relaxed text-[#aeaeb2]'

  return (
    <div className="flex flex-col pb-4">
      {translateError ? (
        <p className="mb-3 text-[14px] text-red-600">{translateError}</p>
      ) : null}
      {translateLoading && !translations ? (
        <p className="mb-3 text-[14px] text-ios-secondary-label">翻译中…</p>
      ) : null}

      <div className={`flex flex-col items-start ${blockGap}`}>
        {sentences.map((sentence, i) => {
          const zh = translations?.[i]?.trim() ?? ''
          const showZh = translationVisible && zh.length > 0
          const innerGap = showZh ? 'gap-1.5' : 'gap-0'
          const isActive = i === activeSentenceIndex

          const tokens = tokenizeSentence(sentence)

          return (
            <button
              key={`${i}-${sentence.slice(0, 12)}`}
              type="button"
              onClick={() => {
                if (suppressSentenceClickRef.current) {
                  suppressSentenceClickRef.current = false
                  return
                }
                onSentenceSeek?.(i)
              }}
              className={`flex w-full max-w-full cursor-pointer appearance-none flex-col border-0 px-0 py-1 text-left outline-none ${innerGap} rounded-[10px] ${
                isActive
                  ? 'bg-[#E9F4FF]'
                  : 'hover:bg-[rgb(60_60_67/0.05)]'
              } focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(0_153_230/0.45)]`}
            >
              <p className={enClass}>
                {tokens.map((tok, ti) =>
                  tok.type === 'word' && onWordLongPress ? (
                    <WordSpan
                      key={ti}
                      text={tok.text}
                      onLongPress={() => {
                        suppressSentenceClickRef.current = true
                        onWordLongPress(tok.text)
                      }}
                    />
                  ) : (
                    <span key={ti}>{tok.text}</span>
                  ),
                )}
              </p>
              {showZh ? <p className={zhClass}>{zh}</p> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
