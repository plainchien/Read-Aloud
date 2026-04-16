import { Download, Pause, Play, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PlaylistItem } from '../lib/playlistStorage'
import {
  getPlaybackState,
  mergeAudioBuffers,
  pauseAudioPlayback,
  playArrayBuffer,
  resumeAudioPlayback,
  stopAudioPlayback,
} from '../lib/audioPlayback'
import { prefetchPlaylistTts } from '../lib/playlistPrefetch'
import { saveBlobWithSaveDialog } from '../lib/saveFileDialog'
import { chunkSentencesForTts } from '../lib/ttsChunk'
import { splitSentencesByPeriod } from '../lib/splitSentences'
import { fetchTtsAudio } from '../lib/ttsClient'
import { BottomSheet } from './BottomSheet'

type PlaylistSheetProps = {
  open: boolean
  onClose: () => void
  items: PlaylistItem[]
  voiceId: string
  onDeleteItem: (id: string) => void
}

async function fetchTtsChunksForText(text: string, voiceId: string): Promise<ArrayBuffer[]> {
  const chunks = chunkSentencesForTts(splitSentencesByPeriod(text))
  const bufs: ArrayBuffer[] = []
  for (const ch of chunks) {
    bufs.push(await fetchTtsAudio(ch, voiceId, 1))
  }
  return bufs
}

export function PlaylistSheet({
  open,
  onClose,
  items,
  voiceId,
  onDeleteItem,
}: PlaylistSheetProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [, forceUi] = useState(0)
  const prefetchAbortRef = useRef<AbortController | null>(null)

  const tick = () => forceUi((n) => n + 1)

  useEffect(() => {
    if (!open) {
      prefetchAbortRef.current?.abort()
      prefetchAbortRef.current = null
      return
    }
    const ac = new AbortController()
    prefetchAbortRef.current = ac
    void prefetchPlaylistTts(items, voiceId, ac.signal)
    return () => {
      ac.abort()
      prefetchAbortRef.current = null
    }
  }, [open, items, voiceId])

  async function playItem(item: PlaylistItem) {
    setError(null)
    const st = getPlaybackState()
    if (playingId === item.id && st === 'playing') {
      pauseAudioPlayback()
      tick()
      return
    }
    if (playingId === item.id && st === 'paused') {
      await resumeAudioPlayback()
      tick()
      return
    }

    stopAudioPlayback()
    setPlayingId(null)
    tick()

    setBusyId(`play-${item.id}`)
    try {
      const bufs = await fetchTtsChunksForText(item.text, voiceId)
      const merged = mergeAudioBuffers(bufs)
      setBusyId(null)
      setPlayingId(item.id)
      tick()
      void playArrayBuffer(merged, 'audio/mpeg', {
        onEnded: () => {
          setPlayingId(null)
          tick()
        },
        onPlay: () => tick(),
        onPause: () => tick(),
      }).catch((e) => {
        setError(e instanceof Error ? e.message : '播放失败')
        setPlayingId(null)
        tick()
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '播放失败')
      setPlayingId(null)
    } finally {
      setBusyId(null)
    }
  }

  async function downloadItem(item: PlaylistItem) {
    setError(null)
    setBusyId(`dl-${item.id}`)
    try {
      const bufs = await fetchTtsChunksForText(item.text, voiceId)
      const merged = mergeAudioBuffers(bufs)
      const safe = item.title.slice(0, 24).replace(/[^\w\u4e00-\u9fff]+/g, '_') || 'readaloud'
      const blob = new Blob([merged], { type: 'audio/mpeg' })
      await saveBlobWithSaveDialog(blob, `${safe}.mp3`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败')
    } finally {
      setBusyId(null)
    }
  }

  function deleteItem(item: PlaylistItem) {
    setError(null)
    if (playingId === item.id) {
      stopAudioPlayback()
      setPlayingId(null)
      tick()
    }
    onDeleteItem(item.id)
  }

  return (
    <BottomSheet open={open} title="历史" onClose={onClose}>
      {error && (
        <p className="mb-3 rounded-ios-squircle bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
      )}
      <ul className="flex flex-col gap-2 pb-2">
        {items.map((item) => {
          const isThisPlaying =
            playingId === item.id && getPlaybackState() === 'playing'
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-ios-squircle border border-[rgb(60_60_67/0.12)] bg-ios-bg px-2 py-2.5 sm:px-3"
            >
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[14px] font-semibold leading-snug text-ios-label"
                  title={item.title}
                >
                  {item.title}
                </p>
                <p
                  className="mt-0.5 truncate text-[12px] leading-snug text-ios-secondary-label"
                  title={item.meta}
                >
                  {item.meta}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5 pt-0.5 sm:gap-3">
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-ios-squircle bg-ios-secondary text-ios-label"
                  aria-label={isThisPlaying ? '暂停' : '播放'}
                  disabled={busyId !== null && busyId !== `play-${item.id}`}
                  onClick={() => void playItem(item)}
                >
                  {isThisPlaying ? (
                    <Pause className="size-4 fill-current" />
                  ) : (
                    <Play className="ml-0.5 size-4 fill-current" />
                  )}
                </button>
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-ios-squircle bg-ios-secondary text-ios-label"
                  aria-label="下载"
                  disabled={busyId !== null}
                  onClick={() => void downloadItem(item)}
                >
                  <Download className="size-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-ios-squircle bg-ios-secondary text-ios-label"
                  aria-label="删除"
                  disabled={busyId !== null}
                  onClick={() => deleteItem(item)}
                >
                  <Trash2 className="size-4" strokeWidth={2} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </BottomSheet>
  )
}
