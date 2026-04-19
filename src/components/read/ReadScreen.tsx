import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { translateEnToZh } from '../../lib/translateMyMemory'
import { splitSentencesByPeriod } from '../../lib/splitSentences'
import { useReadTtsPlayback } from '../../lib/useReadTtsPlayback'
import { ReadActionCapsules } from './ReadActionCapsules'
import { ReadContent } from './ReadContent'
import { ReadHeader } from './ReadHeader'
import { LoopSheet, type LoopMode } from './LoopSheet'
import { ReadPlayerBar } from './ReadPlayerBar'
import { SpeedSheet } from './SpeedSheet'
import { WordLookupSheet } from './WordLookupSheet'

type ReadScreenProps = {
  text: string
  voiceId: string
  onBack: () => void
  /** 打开音色选择（与首页共用 VoicePickerSheet） */
  onOpenVoicePicker: () => void
  /** 朗读成功并开始播放后写入本地历史（与缓存、预取同步） */
  onAddToHistory?: (text: string) => void
}

export function ReadScreen({
  text,
  voiceId,
  onBack,
  onOpenVoicePicker,
  onAddToHistory,
}: ReadScreenProps) {
  const sentences = useMemo(() => splitSentencesByPeriod(text), [text])
  const title = useMemo(() => {
    const t = text.trim()
    if (!t) return '朗读'
    const first = splitSentencesByPeriod(t)[0] ?? t
    const head = first.length > 36 ? `${first.slice(0, 36)}…` : first
    return head
  }, [text])

  const [loopOpen, setLoopOpen] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [loopMode, setLoopMode] = useState<LoopMode>('off')
  const [speed, setSpeed] = useState(1)

  const {
    preparing,
    ready,
    error: ttsError,
    isPlaying,
    progress,
    currentSec,
    durationSec,
    setProgress,
    togglePlay,
    seekToSentenceIndex,
    activeSentenceIndex,
  } = useReadTtsPlayback({ sentences, voiceId, speed, loopMode })

  /** 同一篇文本 + 音色下，首次成功开始播放时写入历史，避免重复 */
  const historyRecordedForSessionRef = useRef(false)
  useEffect(() => {
    historyRecordedForSessionRef.current = false
  }, [text, voiceId])

  useEffect(() => {
    if (!ready || ttsError || !onAddToHistory) return
    const t = text.trim()
    if (!t) return
    if (!isPlaying) return
    if (historyRecordedForSessionRef.current) return
    historyRecordedForSessionRef.current = true
    onAddToHistory(t)
  }, [ready, ttsError, isPlaying, text, voiceId, onAddToHistory])

  const [translations, setTranslations] = useState<string[] | null>(null)
  const [translationVisible, setTranslationVisible] = useState(true)
  const [translateLoading, setTranslateLoading] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const [textLarge, setTextLarge] = useState(false)
  const [lookupWord, setLookupWord] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  useEffect(() => {
    setTranslations(null)
    setTranslationVisible(true)
    setTranslateError(null)
  }, [text])

  const hasTranslations =
    translations !== null &&
    translations.length > 0 &&
    translations.some((t) => t.trim().length > 0)

  const handleTranslateClick = useCallback(async () => {
    if (sentences.length === 0) return
    if (
      translations !== null &&
      translations.some((t) => t.trim().length > 0)
    ) {
      setTranslationVisible((v) => !v)
      return
    }
    setTranslateError(null)
    setTranslateLoading(true)
    try {
      const results = await Promise.all(
        sentences.map((s) => translateEnToZh(s)),
      )
      setTranslations(results)
      setTranslationVisible(true)
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : '翻译失败')
    } finally {
      setTranslateLoading(false)
    }
  }, [sentences, translations])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 pt-1">
        <ReadHeader
          title={title}
          onBack={onBack}
          feedbackOpen={feedbackOpen}
          onFeedbackOpenChange={setFeedbackOpen}
        />
      </div>

      {ttsError ? (
        <p className="shrink-0 px-1 pb-2 text-[13px] text-red-600">{ttsError}</p>
      ) : null}
      {preparing ? (
        <p className="shrink-0 px-1 pb-2 text-[13px] text-ios-secondary-label">
          正在生成语音…
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2">
        <ReadContent
          sentences={sentences}
          translations={translations}
          translationVisible={translationVisible}
          translateLoading={translateLoading}
          translateError={translateError}
          activeSentenceIndex={activeSentenceIndex}
          textLarge={textLarge}
          onSentenceSeek={seekToSentenceIndex}
          onWordLongPress={(w) => setLookupWord(w)}
        />
      </div>

      <div className="flex w-full shrink-0 flex-col items-stretch pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
        <ReadActionCapsules
          onTranslateClick={handleTranslateClick}
          translateLoading={translateLoading}
          hasTranslations={hasTranslations}
          translationVisible={translationVisible}
          onLoop={() => setLoopOpen(true)}
          loopMode={loopMode}
          textLarge={textLarge}
          onTextSizeToggle={() => setTextLarge((v) => !v)}
        />
        <ReadPlayerBar
          progress={progress}
          currentSec={currentSec}
          durationSec={durationSec}
          isPlaying={isPlaying}
          onPlayToggle={togglePlay}
          speed={speed}
          onSpeedClick={() => setSpeedOpen(true)}
          onSeek={setProgress}
          disabled={!ready || !!ttsError || preparing}
          voiceId={voiceId}
          onVoiceClick={onOpenVoicePicker}
        />
      </div>

      <LoopSheet
        open={loopOpen}
        onClose={() => setLoopOpen(false)}
        mode={loopMode}
        onChange={setLoopMode}
      />
      <SpeedSheet
        open={speedOpen}
        onClose={() => setSpeedOpen(false)}
        speed={speed}
        onChange={setSpeed}
      />
      <WordLookupSheet word={lookupWord} onClose={() => setLookupWord(null)} />
    </div>
  )
}
