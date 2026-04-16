import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LoopMode } from './loopMode'
import { fetchTtsAudio } from './ttsClient'
import { chunkSentencesForTts } from './ttsChunk'

function audioDurationFromBuffer(buf: ArrayBuffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }))
    const a = new Audio()
    a.preload = 'metadata'
    a.src = url
    a.onloadedmetadata = () => {
      const d = a.duration
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(d) && d > 0 ? d : 0)
    }
    a.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取音频时长'))
    }
  })
}

function sentenceWeights(sentences: string[]): number[] {
  return sentences.map((s) => Math.max(1, [...s].length))
}

function sentenceIndexToTime(
  sentences: string[],
  index: number,
  totalDuration: number,
): number {
  const n = sentences.length
  if (n === 0 || totalDuration <= 0) return 0
  const w = sentenceWeights(sentences)
  const sum = w.reduce((a, b) => a + b, 0)
  let t = 0
  const i = Math.max(0, Math.min(n - 1, index))
  for (let j = 0; j < i; j++) {
    t += (w[j] / sum) * totalDuration
  }
  return t
}

function timeToSentenceIndex(
  sentences: string[],
  timeSec: number,
  totalDuration: number,
): number {
  const n = sentences.length
  if (n === 0 || totalDuration <= 0) return -1
  const w = sentenceWeights(sentences)
  const sum = w.reduce((a, b) => a + b, 0)
  const t = Math.max(0, Math.min(totalDuration, timeSec))
  let acc = 0
  for (let i = 0; i < n; i++) {
    const slice = (w[i] / sum) * totalDuration
    const end = acc + slice
    if (t < end || i === n - 1) return i
    acc = end
  }
  return n - 1
}

/** 与主工程 App 中 Web Speech 兜底一致：按词长粗略估计时长（秒） */
function estimateWebSpeechDurationSec(text: string, rate: number): number {
  const t = text.trim()
  if (!t) return 0
  const words = t.split(/\s+/).filter(Boolean).length
  const base = Math.max(6, words * 0.38 + t.length * 0.018)
  return base / Math.max(0.5, rate)
}

function charOffsetFromTime(fullText: string, timeSec: number, totalDuration: number): number {
  if (totalDuration <= 0 || fullText.length === 0) return 0
  const r = Math.max(0, Math.min(1, timeSec / totalDuration))
  return Math.min(fullText.length, Math.floor(r * fullText.length))
}

type TtsMode = 'kokoro' | 'webspeech'

type UseReadTtsPlaybackOptions = {
  sentences: string[]
  voiceId: string
  speed: number
  /** 循环：关闭 / 单句 / 整篇 */
  loopMode?: LoopMode
}

function sentenceCharRanges(sentences: string[]): { start: number; end: number }[] {
  const trimmed = sentences.map((s) => s.trim()).filter(Boolean)
  const ranges: { start: number; end: number }[] = []
  let pos = 0
  for (let i = 0; i < trimmed.length; i++) {
    const s = trimmed[i]
    if (i > 0) pos += 1
    ranges.push({ start: pos, end: pos + s.length })
    pos += s.length
  }
  return ranges
}

function charOffsetToSentenceIndex(
  charOffset: number,
  ranges: { start: number; end: number }[],
): number {
  if (ranges.length === 0) return -1
  const o = Math.max(0, charOffset)
  for (let i = 0; i < ranges.length; i++) {
    const end = ranges[i].end
    if (o < end || i === ranges.length - 1) return i
  }
  return ranges.length - 1
}

export function useReadTtsPlayback({
  sentences,
  voiceId,
  speed,
  loopMode = 'off',
}: UseReadTtsPlaybackOptions) {
  const [ttsMode, setTtsMode] = useState<TtsMode>('kokoro')
  const ttsModeRef = useRef<TtsMode>('kokoro')
  useEffect(() => {
    ttsModeRef.current = ttsMode
  }, [ttsMode])

  const loopModeRef = useRef<LoopMode>(loopMode)
  useEffect(() => {
    loopModeRef.current = loopMode
  }, [loopMode])

  const [preparing, setPreparing] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [totalDuration, setTotalDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const fullText = useMemo(
    () => sentences.map((s) => s.trim()).filter(Boolean).join(' '),
    [sentences],
  )

  const sentenceRanges = useMemo(() => sentenceCharRanges(sentences), [sentences])

  const buffersRef = useRef<ArrayBuffer[]>([])
  const durationsRef = useRef<number[]>([])
  const currentChunkIndexRef = useRef(0)
  const audioUrlRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cancelledRef = useRef(false)

  /** 浏览器中 setInterval 返回 number；与 Node Timeout 区分 */
  const wsTickRef = useRef<number | null>(null)
  const wsWallStartRef = useRef(0)
  const wsFromTimeRef = useRef(0)
  const wsTotalDurRef = useRef(0)
  const speedRef = useRef(speed)
  const lastWsSpokenSpeedRef = useRef(speed)

  const clearWebSpeechTick = useCallback(() => {
    if (wsTickRef.current != null) {
      clearInterval(wsTickRef.current)
      wsTickRef.current = null
    }
  }, [])

  const progress = useMemo(
    () => (totalDuration > 0 ? currentTime / totalDuration : 0),
    [currentTime, totalDuration],
  )

  const revokeAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [])

  const sumBeforeChunk = useCallback((chunkIdx: number) => {
    const d = durationsRef.current
    let s = 0
    for (let i = 0; i < chunkIdx && i < d.length; i++) s += d[i]
    return s
  }, [])

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    return audioRef.current
  }, [])

  const syncTimeFromAudio = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    const idx = currentChunkIndexRef.current
    const base = sumBeforeChunk(idx)
    setCurrentTime(base + (Number.isFinite(a.currentTime) ? a.currentTime : 0))
  }, [sumBeforeChunk])

  const bindChunkSrc = useCallback(
    (chunkIdx: number, offsetInChunk: number) => {
      const buffers = buffersRef.current
      const a = ensureAudio()
      revokeAudioUrl()
      if (chunkIdx < 0 || chunkIdx >= buffers.length) return
      const url = URL.createObjectURL(
        new Blob([buffers[chunkIdx]], { type: 'audio/mpeg' }),
      )
      audioUrlRef.current = url
      currentChunkIndexRef.current = chunkIdx
      a.src = url
      const applyOffset = () => {
        const max = a.duration || 0
        a.currentTime = Math.max(0, Math.min(offsetInChunk, max))
      }
      if (a.readyState >= 2) applyOffset()
      else a.addEventListener('loadeddata', applyOffset, { once: true })
    },
    [ensureAudio, revokeAudioUrl],
  )

  const isPlayingRef = useRef(false)
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  const currentTimeRef = useRef(currentTime)
  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  /** Kokoro：单句循环时用于检测「进入下一句」并跳回当前句首 */
  const lastSentIdxForLoopRef = useRef(-1)

  const speakWebSentenceAtRef = useRef<(idx: number) => void>(() => {})

  /** Web Speech：单句模式只朗读一句，onend 时按 loopMode 重复或停止 */
  const speakWebSentenceAt = useCallback(
    (sentenceIndex: number) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
      const text = fullText
      const td = wsTotalDurRef.current
      const ranges = sentenceRanges
      if (!text || td <= 0 || ranges.length === 0) return

      const i = Math.max(0, Math.min(sentenceIndex, ranges.length - 1))
      const { start, end } = ranges[i]
      const slice = text.slice(start, end).trim()
      if (!slice) {
        setCurrentTime(td)
        setIsPlaying(false)
        return
      }

      window.speechSynthesis.cancel()
      clearWebSpeechTick()

      const fromTime = (start / Math.max(1, text.length)) * td
      const sentenceDur = ((end - start) / Math.max(1, text.length)) * td
      wsFromTimeRef.current = fromTime
      wsWallStartRef.current = performance.now()
      setCurrentTime(fromTime)

      const utt = new SpeechSynthesisUtterance(slice)
      utt.lang = 'en-US'
      utt.rate = speedRef.current
      utt.onboundary = (e) => {
        if (e.name === 'word' && typeof e.charIndex === 'number') {
          const globalChar = start + e.charIndex
          const approxTime = (globalChar / Math.max(1, text.length)) * td
          setCurrentTime(Math.min(approxTime, fromTime + sentenceDur))
        }
      }
      utt.onend = () => {
        clearWebSpeechTick()
        if (loopModeRef.current === 'sentence') {
          speakWebSentenceAtRef.current(i)
          return
        }
        setCurrentTime(td)
        setIsPlaying(false)
      }
      utt.onerror = () => {
        clearWebSpeechTick()
        setIsPlaying(false)
      }

      const tick = () => {
        const elapsed = (performance.now() - wsWallStartRef.current) / 1000
        const r = speedRef.current
        setCurrentTime(() => {
          const next = fromTime + Math.min(elapsed * r, sentenceDur)
          return Math.min(next, fromTime + sentenceDur)
        })
      }
      wsTickRef.current = window.setInterval(tick, 120)

      window.speechSynthesis.speak(utt)
      setIsPlaying(true)
    },
    [fullText, sentenceRanges, clearWebSpeechTick],
  )

  useEffect(() => {
    speakWebSentenceAtRef.current = speakWebSentenceAt
  }, [speakWebSentenceAt])

  /** Web Speech：与 App.tsx useWebSpeech 一致，并驱动进度条近似时间 */
  const speakWebFromChar = useCallback(
    (charOffset: number) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
      const text = fullText
      const td = wsTotalDurRef.current
      if (!text || td <= 0) return

      if (loopModeRef.current === 'sentence') {
        const idx = charOffsetToSentenceIndex(charOffset, sentenceRanges)
        if (idx >= 0) speakWebSentenceAt(idx)
        return
      }

      window.speechSynthesis.cancel()
      clearWebSpeechTick()

      const slice = text.slice(charOffset).trimStart()
      if (!slice) {
        setCurrentTime(td)
        setIsPlaying(false)
        return
      }

      const fromTimeSec = (charOffset / Math.max(1, text.length)) * td
      wsFromTimeRef.current = fromTimeSec
      wsWallStartRef.current = performance.now()
      setCurrentTime(fromTimeSec)

      const utt = new SpeechSynthesisUtterance(slice)
      utt.lang = 'en-US'
      utt.rate = speedRef.current
      utt.onboundary = (e) => {
        if (e.name === 'word' && typeof e.charIndex === 'number') {
          const globalChar = charOffset + e.charIndex
          const approxTime = (globalChar / Math.max(1, text.length)) * td
          setCurrentTime(Math.min(approxTime, td))
        }
      }
      utt.onend = () => {
        clearWebSpeechTick()
        if (loopModeRef.current === 'article') {
          speakWebFromChar(0)
          return
        }
        setCurrentTime(td)
        setIsPlaying(false)
      }
      utt.onerror = () => {
        clearWebSpeechTick()
        setIsPlaying(false)
      }

      const tick = () => {
        const elapsed = (performance.now() - wsWallStartRef.current) / 1000
        const r = speedRef.current
        const portion = td - wsFromTimeRef.current
        setCurrentTime(() => {
          const next = wsFromTimeRef.current + Math.min(elapsed * r, portion)
          return Math.min(next, td)
        })
      }
      wsTickRef.current = window.setInterval(tick, 120)

      window.speechSynthesis.speak(utt)
      setIsPlaying(true)
    },
    [fullText, clearWebSpeechTick, sentenceRanges, speakWebSentenceAt],
  )

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    cancelledRef.current = false
    setError(null)
    setReady(false)
    setPreparing(false)
    setTotalDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setTtsMode('kokoro')
    buffersRef.current = []
    durationsRef.current = []
    currentChunkIndexRef.current = 0

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    clearWebSpeechTick()

    const a = ensureAudio()
    a.pause()
    revokeAudioUrl()
    a.removeAttribute('src')
    a.onended = null
    a.ontimeupdate = null

    const chunks = chunkSentencesForTts(sentences)
    if (chunks.length === 0) {
      return
    }

    lastSentIdxForLoopRef.current = -1

    setPreparing(true)

    ;(async () => {
      try {
        const buffers: ArrayBuffer[] = []
        const durations: number[] = []
        for (const ch of chunks) {
          if (cancelledRef.current) return
          const buf = await fetchTtsAudio(ch, voiceId, 1)
          if (cancelledRef.current) return
          buffers.push(buf)
          durations.push(await audioDurationFromBuffer(buf))
        }
        if (cancelledRef.current) return
        buffersRef.current = buffers
        durationsRef.current = durations
        const total = durations.reduce((x, y) => x + y, 0)
        setTotalDuration(total)
        bindChunkSrc(0, 0)
        setTtsMode('kokoro')
        setReady(true)
      } catch (e) {
        if (cancelledRef.current) return
        console.warn('Kokoro 失败，降级到 Web Speech API', e)
        if (typeof window !== 'undefined' && 'speechSynthesis' in window && fullText.trim()) {
          const td = estimateWebSpeechDurationSec(fullText, speedRef.current)
          wsTotalDurRef.current = td
          setTotalDuration(td)
          setTtsMode('webspeech')
          setError(null)
          setReady(true)
        } else {
          setError(e instanceof Error ? e.message : '语音合成失败')
        }
      } finally {
        if (!cancelledRef.current) setPreparing(false)
      }
    })()

    return () => {
      cancelledRef.current = true
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      clearWebSpeechTick()
      const el = audioRef.current
      if (el) {
        el.pause()
        el.onended = null
        el.ontimeupdate = null
        el.removeAttribute('src')
      }
      revokeAudioUrl()
    }
  }, [
    sentences,
    voiceId,
    ensureAudio,
    revokeAudioUrl,
    bindChunkSrc,
    fullText,
    clearWebSpeechTick,
  ])

  useEffect(() => {
    const a = audioRef.current
    if (!a || !ready || ttsMode !== 'kokoro') return
    a.playbackRate = speed
  }, [speed, ready, ttsMode])

  /** Web Speech：倍速变化时若正在播放则重启 utterance（与 App handleSpeedChange 一致） */
  useEffect(() => {
    if (ttsMode !== 'webspeech' || !ready || !isPlaying) {
      lastWsSpokenSpeedRef.current = speed
      return
    }
    if (lastWsSpokenSpeedRef.current === speed) return
    lastWsSpokenSpeedRef.current = speed
    const td = totalDuration
    if (td <= 0 || !fullText) return
    const off = charOffsetFromTime(fullText, currentTimeRef.current, td)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    clearWebSpeechTick()
    wsTotalDurRef.current = td
    speakWebFromChar(off)
  }, [speed, ttsMode, ready, isPlaying, fullText, totalDuration, speakWebFromChar, clearWebSpeechTick])

  const seekToTime = useCallback(
    (timeSec: number) => {
      if (ttsModeRef.current === 'webspeech') {
        const td = totalDuration
        if (td <= 0 || !fullText) return
        const wasPlaying = isPlayingRef.current
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel()
        }
        clearWebSpeechTick()
        const t = Math.max(0, Math.min(td, timeSec))
        setCurrentTime(t)
        lastSentIdxForLoopRef.current = timeToSentenceIndex(sentences, t, td)
        if (wasPlaying) {
          wsTotalDurRef.current = td
          speakWebFromChar(charOffsetFromTime(fullText, t, td))
        }
        return
      }

      const durations = durationsRef.current
      const buffers = buffersRef.current
      if (buffers.length === 0) return
      const td = durations.reduce((x, y) => x + y, 0)
      if (td <= 0) return
      const t = Math.max(0, Math.min(td, timeSec))
      let acc = 0
      let idx = 0
      for (let i = 0; i < durations.length; i++) {
        const end = acc + durations[i]
        if (t < end || i === durations.length - 1) {
          idx = i
          break
        }
        acc = end
      }
      const offset = t - sumBeforeChunk(idx)
      bindChunkSrc(idx, offset)
      setCurrentTime(t)
      lastSentIdxForLoopRef.current = timeToSentenceIndex(sentences, t, td)
      const a = audioRef.current
      if (isPlayingRef.current && a) {
        const p = () => void a.play().catch(() => setIsPlaying(false))
        if (a.readyState >= 2) p()
        else a.addEventListener('canplay', p, { once: true })
      }
    },
    [bindChunkSrc, sumBeforeChunk, fullText, totalDuration, clearWebSpeechTick, speakWebFromChar, sentences],
  )

  const setProgress = useCallback(
    (p: number) => {
      if (ttsModeRef.current === 'webspeech') {
        seekToTime(p * totalDuration)
        return
      }
      const td = durationsRef.current.reduce((x, y) => x + y, 0)
      seekToTime(p * td)
    },
    [seekToTime, totalDuration],
  )

  const seekToSentenceIndex = useCallback(
    (sentenceIndex: number) => {
      const td =
        ttsModeRef.current === 'webspeech'
          ? totalDuration
          : durationsRef.current.reduce((x, y) => x + y, 0)
      seekToTime(sentenceIndexToTime(sentences, sentenceIndex, td))
    },
    [sentences, seekToTime, totalDuration],
  )

  const advanceOrStop = useCallback(() => {
    const buffers = buffersRef.current
    const durations = durationsRef.current
    const next = currentChunkIndexRef.current + 1
    const td = durations.reduce((x, y) => x + y, 0)
    const mode = loopModeRef.current

    if (next < buffers.length) {
      bindChunkSrc(next, 0)
      const a = ensureAudio()
      const p = () => void a.play().catch(() => setIsPlaying(false))
      if (a.readyState >= 2) p()
      else a.addEventListener('canplay', p, { once: true })
      return
    }

    if (mode === 'article' && td > 0) {
      seekToTime(0)
      const a = ensureAudio()
      void a.play().catch(() => setIsPlaying(false))
      return
    }

    if (mode === 'sentence' && sentences.length > 0 && td > 0) {
      const lastS = sentences.length - 1
      seekToTime(sentenceIndexToTime(sentences, lastS, td))
      const a = ensureAudio()
      void a.play().catch(() => setIsPlaying(false))
      return
    }

    setIsPlaying(false)
    setCurrentTime(td)
  }, [bindChunkSrc, ensureAudio, seekToTime, sentences])

  useEffect(() => {
    const a = audioRef.current
    if (!a || !ready || ttsMode !== 'kokoro') return

    const onEnded = () => {
      advanceOrStop()
    }
    const onTimeUpdate = () => {
      const durations = durationsRef.current
      const td = durations.reduce((x, y) => x + y, 0)
      const idx = currentChunkIndexRef.current
      const base = sumBeforeChunk(idx)
      const t =
        base + (Number.isFinite(a.currentTime) ? a.currentTime : 0)

      if (loopModeRef.current === 'sentence' && sentences.length > 0 && td > 0) {
        const prev = lastSentIdxForLoopRef.current
        const curr = timeToSentenceIndex(sentences, t, td)
        if (prev >= 0 && curr > prev && prev < sentences.length) {
          seekToTime(sentenceIndexToTime(sentences, prev, td))
          return
        }
        lastSentIdxForLoopRef.current = curr
      } else {
        lastSentIdxForLoopRef.current = timeToSentenceIndex(sentences, t, td)
      }

      syncTimeFromAudio()
    }

    a.onended = onEnded
    if (isPlaying) {
      a.ontimeupdate = onTimeUpdate
    } else {
      a.ontimeupdate = null
    }

    return () => {
      a.onended = null
      a.ontimeupdate = null
    }
  }, [ready, isPlaying, advanceOrStop, syncTimeFromAudio, ttsMode, seekToTime, sumBeforeChunk, sentences])

  const togglePlay = useCallback(() => {
    if (!ready || preparing) return

    if (ttsModeRef.current === 'webspeech') {
      const td = totalDuration
      if (td <= 0 || !fullText.trim()) return

      if (isPlaying) {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel()
        }
        clearWebSpeechTick()
        setIsPlaying(false)
        return
      }

      const atEnd = td > 0 && currentTime >= td - 0.05
      const startChar = atEnd ? 0 : charOffsetFromTime(fullText, currentTime, td)
      wsTotalDurRef.current = td
      speakWebFromChar(startChar)
      return
    }

    const a = ensureAudio()
    if (buffersRef.current.length === 0) return

    if (isPlaying) {
      a.pause()
      syncTimeFromAudio()
      setIsPlaying(false)
      return
    }

    const td = durationsRef.current.reduce((x, y) => x + y, 0)
    const atEnd = td > 0 && currentTime >= td - 0.05
    if (atEnd) {
      seekToTime(0)
    }

    void a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
  }, [
    ready,
    preparing,
    isPlaying,
    ensureAudio,
    syncTimeFromAudio,
    currentTime,
    seekToTime,
    fullText,
    totalDuration,
    clearWebSpeechTick,
    speakWebFromChar,
  ])

  const activeSentenceIndex = useMemo(
    () => timeToSentenceIndex(sentences, currentTime, totalDuration),
    [sentences, currentTime, totalDuration],
  )

  return {
    preparing,
    ready,
    error,
    isPlaying,
    progress,
    currentSec: currentTime,
    durationSec: totalDuration,
    setProgress,
    togglePlay,
    seekToSentenceIndex,
    activeSentenceIndex,
  }
}
