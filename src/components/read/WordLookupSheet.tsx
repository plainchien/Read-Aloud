import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Volume2, X } from 'lucide-react'
import { fetchDictionaryEntry, type DictionaryEntry } from '../../lib/dictionaryProxy'
import { cleanEnglishWord, translateWordEnToZh } from '../../lib/translateProxy'

type WordLookupSheetProps = {
  word: string | null
  onClose: () => void
}

/** 与主工程 WordCard 中 POS_COLORS 一致 */
const POS_COLORS: Record<string, { bg: string; text: string }> = {
  noun: { bg: '#f0f4ff', text: '#4060cc' },
  verb: { bg: '#fff0f3', text: '#cc3355' },
  adjective: { bg: '#f0fff5', text: '#2a9955' },
  adverb: { bg: '#fffbf0', text: '#cc8800' },
  preposition: { bg: '#f5f0ff', text: '#7755cc' },
  conjunction: { bg: '#fff0f8', text: '#cc5599' },
  pronoun: { bg: '#f0f9ff', text: '#0080bb' },
  interjection: { bg: '#fff5f0', text: '#cc5533' },
}

/**
 * 与主工程 WordCard 一致：dictionary-proxy（词性+英文释义）+ translate-proxy（中文）+ 浏览器朗读
 */
export function WordLookupSheet({ word, onClose }: WordLookupSheetProps) {
  const clean = word != null ? cleanEnglishWord(word) : ''

  const [entry, setEntry] = useState<DictionaryEntry | null>(null)
  const [dictLoading, setDictLoading] = useState(true)
  const [dictError, setDictError] = useState(false)

  const [zh, setZh] = useState('')
  const [zhLoading, setZhLoading] = useState(true)

  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    if (!clean) {
      setEntry(null)
      setDictError(false)
      setDictLoading(false)
      return
    }
    let cancelled = false
    setDictLoading(true)
    setDictError(false)
    setEntry(null)
    fetchDictionaryEntry(clean)
      .then((e) => {
        if (cancelled) return
        if (e) setEntry(e)
        else setDictError(true)
      })
      .catch(() => {
        if (!cancelled) setDictError(true)
      })
      .finally(() => {
        if (!cancelled) setDictLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clean])

  useEffect(() => {
    if (!clean) {
      setZh('')
      setZhLoading(false)
      return
    }
    let cancelled = false
    setZhLoading(true)
    setZh('')
    translateWordEnToZh(clean)
      .then((t) => {
        if (!cancelled) setZh(t)
      })
      .catch(() => {
        if (!cancelled) setZh('')
      })
      .finally(() => {
        if (!cancelled) setZhLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clean])

  useEffect(() => {
    if (word == null || !clean) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [word, clean])

  const speakWord = useCallback(() => {
    if (!clean || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(clean)
    utt.lang = 'en-US'
    utt.rate = 0.85
    setSpeaking(true)
    utt.onend = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utt)
  }, [clean])

  const phonetic =
    entry?.phonetic || entry?.phonetics?.find((p) => p.text)?.text || ''

  if (word == null || !clean) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className="flex max-h-[75vh] w-full max-w-md flex-col rounded-t-[24px] border border-b-0 border-[#ebebeb] bg-white shadow-[0_-8px_40px_rgb(0_0_0/0.1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-9 rounded-full bg-[#e8e8e8]" aria-hidden />
        </div>

        <div className="flex shrink-0 items-start justify-between px-6 pb-4 pt-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="m-0 text-2xl font-semibold tracking-tight text-[#111]">{clean}</h2>
              <button
                type="button"
                onClick={speakWord}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border transition-transform active:scale-90"
                style={{
                  background: speaking ? '#111' : '#f5f5f5',
                  borderColor: speaking ? '#111' : '#ebebeb',
                }}
                aria-label="朗读单词"
              >
                {speaking ? (
                  <span className="flex h-[14px] items-end gap-px">
                    {[1, 2, 3].map((n) => (
                      <span
                        key={n}
                        className="inline-block w-[2.5px] rounded-sm bg-white"
                        style={{
                          height: `${5 + n * 3}px`,
                          animation: `word-lookup-wbar ${0.3 + n * 0.1}s ease-in-out infinite alternate`,
                        }}
                      />
                    ))}
                  </span>
                ) : (
                  <Volume2 size={15} color="#888" />
                )}
              </button>
            </div>
            {phonetic ? (
              <p className="mt-1 text-[0.82rem] tracking-wide text-[#aaa]">{phonetic}</p>
            ) : null}
            {zhLoading ? (
              <p className="mt-1.5 text-[0.83rem] text-[#ccc]">翻译中…</p>
            ) : zh ? (
              <p className="mt-1.5 text-[0.9rem] font-medium text-[#333]">中文：{zh}</p>
            ) : (
              <p className="mt-1.5 text-[0.85rem] text-[#ccc]">翻译暂时无法使用。</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-[#ebebeb] bg-[#f5f5f5] transition-transform active:scale-90"
            aria-label="关闭"
          >
            <X size={14} color="#999" />
          </button>
        </div>

        <div className="mx-6 h-px shrink-0 bg-[#f4f4f4]" />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {dictLoading && (
            <div className="flex items-center justify-center gap-2.5 py-10">
              <Loader2 size={16} className="animate-spin text-[#ccc]" />
              <span className="text-[0.83rem] text-[#ccc]">查询中…</span>
            </div>
          )}

          {dictError && !dictLoading && (
            <div className="py-8 text-center">
              <p className="text-[0.85rem] text-[#ccc]">未找到 &quot;{clean}&quot; 的释义</p>
            </div>
          )}

          {entry && !dictLoading && (
            <div className="flex flex-col gap-5">
              {entry.meanings.slice(0, 3).map((meaning, i) => {
                const posStyle = POS_COLORS[meaning.partOfSpeech] ?? { bg: '#f5f5f5', text: '#888' }
                return (
                  <div key={i}>
                    <div className="mb-3 flex items-center gap-2">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-wide"
                        style={{ background: posStyle.bg, color: posStyle.text }}
                      >
                        {meaning.partOfSpeech}
                      </span>
                      <div className="h-px flex-1 bg-[#f0f0f0]" />
                    </div>
                    <div className="flex flex-col gap-3.5">
                      {meaning.definitions.slice(0, 2).map((def, j) => (
                        <div key={j} className="flex gap-3">
                          <span
                            className="mt-2 size-1.5 shrink-0 rounded-full bg-[#d4d4d4]"
                            aria-hidden
                          />
                          <div>
                            <p className="m-0 text-[0.9rem] leading-relaxed text-[#222]">{def.definition}</p>
                            {def.example ? (
                              <p className="mt-1.5 border-l-2 border-[#ebebeb] pl-3 text-[0.8rem] italic leading-relaxed text-[#aaa]">
                                &ldquo;{def.example}&rdquo;
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ height: 'max(env(safe-area-inset-bottom), 16px)' }} />
      </div>

      <style>{`
        @keyframes word-lookup-wbar {
          from { transform: scaleY(0.5); }
          to { transform: scaleY(1.5); }
        }
      `}</style>
    </div>,
    document.body,
  )
}
