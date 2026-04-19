import { Pause } from 'lucide-react'
import { useEffect, useState } from 'react'
import { VOICE_OPTIONS_HOME } from '../data/kokoroVoices'
import { VoiceOrbIcon } from './VoiceOrbIcon'
import { getPlaybackState, playArrayBuffer, stopAudioPlayback } from '../lib/audioPlayback'
import { fetchTtsAudio } from '../lib/ttsClient'
import { BottomSheet } from './BottomSheet'
import { PlayIcon } from './PlayIcon'

/** 试听短句（英文） */
const VOICE_SAMPLE_EN =
  'Hello. This is a short preview of this voice for Read Aloud.'

type VoicePickerSheetProps = {
  open: boolean
  onClose: () => void
  voiceId: string
  onSelect: (id: string) => void
}

export function VoicePickerSheet({
  open,
  onClose,
  voiceId,
  onSelect,
}: VoicePickerSheetProps) {
  const [previewBusyId, setPreviewBusyId] = useState<string | null>(null)
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      stopAudioPlayback()
      setPreviewBusyId(null)
      setPreviewPlayingId(null)
      setError(null)
    }
  }, [open])

  async function togglePreview(id: string) {
    setError(null)
    const st = getPlaybackState()
    if (previewPlayingId === id && st === 'playing') {
      stopAudioPlayback()
      setPreviewPlayingId(null)
      return
    }

    stopAudioPlayback()
    setPreviewPlayingId(null)

    setPreviewBusyId(id)
    try {
      const buf = await fetchTtsAudio(VOICE_SAMPLE_EN, id, 1)
      setPreviewBusyId(null)
      setPreviewPlayingId(id)
      void playArrayBuffer(buf, 'audio/mpeg', {
        onEnded: () => setPreviewPlayingId(null),
        onPause: () => {},
        onPlay: () => {},
      }).catch((e) => {
        setError(e instanceof Error ? e.message : '播放失败')
        setPreviewPlayingId(null)
      })
    } catch (e) {
      setPreviewBusyId(null)
      setError(e instanceof Error ? e.message : '加载试听失败')
    }
  }

  return (
    <BottomSheet open={open} title="音色选择" onClose={onClose}>
      {error && (
        <p className="mb-3 rounded-[20px] bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
      )}
      <ul className="flex flex-col gap-2 pb-2">
        {VOICE_OPTIONS_HOME.map((v) => {
          const selected = voiceId === v.id
          const isPlaying =
            previewPlayingId === v.id && getPlaybackState() !== 'idle'
          return (
            <li key={v.id}>
              <div
                className={`flex h-[60px] min-w-0 items-center gap-[10px] rounded-[20px] px-3 ${
                  selected ? 'bg-[#F4F4F4]' : 'bg-transparent'
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-[10px] text-left"
                  onClick={() => onSelect(v.id)}
                >
                  <VoiceOrbIcon voiceId={v.id} className="size-[30px] shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[14px] font-semibold leading-tight text-[#000000]"
                      title={v.id}
                    >
                      {v.id}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] leading-tight text-[#000000]/70">
                      {v.region}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center overflow-visible rounded-xl px-1.5 py-1 text-ios-label"
                  aria-label={isPlaying ? '暂停试听' : '试听'}
                  disabled={previewBusyId !== null && previewBusyId !== v.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    void togglePreview(v.id)
                  }}
                >
                  {previewBusyId === v.id ? (
                    <span className="size-4 animate-pulse rounded-full bg-ios-label/30" aria-hidden />
                  ) : isPlaying ? (
                    <Pause className="size-4 fill-current" />
                  ) : (
                    <PlayIcon className="aspect-[23/26] h-[18px] w-auto shrink-0" />
                  )}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </BottomSheet>
  )
}
