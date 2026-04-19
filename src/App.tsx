import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionGrid } from './components/ActionGrid'
import { HomeHeader } from './components/HomeHeader'
import { PlaylistSheet } from './components/PlaylistSheet'
import { PrimaryTtsButton } from './components/PrimaryTtsButton'
import { ReadScreen } from './components/read/ReadScreen'
import { TextInputCard } from './components/TextInputCard'
import { LinkUrlSheet } from './components/LinkUrlSheet'
import { VoicePickerSheet } from './components/VoicePickerSheet'
import { ocrImageFile } from './lib/ocrClient'
import {
  loadPlaylist,
  prependPlaylistItem,
  removePlaylistItem,
  savePlaylist,
  type PlaylistItem,
} from './lib/playlistStorage'
import { loadVoiceId, saveVoiceId } from './lib/voiceStorage'

function App() {
  const [screen, setScreen] = useState<'home' | 'read'>('home')
  const [text, setText] = useState('')
  const [voiceId, setVoiceId] = useState(() => loadVoiceId())
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false)
  const [linkSheetOpen, setLinkSheetOpen] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const scanInputRef = useRef<HTMLInputElement>(null)
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>(() => loadPlaylist())

  useEffect(() => {
    savePlaylist(playlistItems)
  }, [playlistItems])

  const onPickVoice = useCallback((id: string) => {
    setVoiceId(id)
    saveVoiceId(id)
    setVoiceSheetOpen(false)
  }, [])

  function openPlaylist() {
    setPlaylistOpen(true)
  }

  function goRead() {
    if (!text.trim()) return
    setScreen('read')
  }

  const openScanPicker = useCallback(() => {
    scanInputRef.current?.click()
  }, [])

  const onScanFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file?.type.startsWith('image/')) return
      setScanBusy(true)
      try {
        const out = await ocrImageFile(file)
        setText((prev) => {
          const t = out.trim()
          if (!t) return prev
          return prev.trim() ? `${prev.trim()}\n\n${t}` : t
        })
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '识别失败')
      } finally {
        setScanBusy(false)
      }
    },
    [],
  )

  return (
    <>
      {screen === 'home' && (
        <div
          aria-hidden
          className="home-ambient-bg pointer-events-none fixed inset-0 z-0"
        />
      )}
      <div
        className={`relative z-10 box-border flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden text-[14px] leading-normal text-ios-label ${
          screen === 'home' ? 'bg-transparent' : 'bg-white'
        }`}
      >
      <div
        className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 0.75rem)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)',
        }}
      >
        {screen === 'home' ? (
          <>
            <HomeHeader />

            <main className="relative mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <input
                ref={scanInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-hidden
                onChange={onScanFile}
              />
              <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3">
                <div className="min-h-0 flex-1">
                  <TextInputCard value={text} onChange={setText} />
                </div>
                <div className="shrink-0 space-y-3">
                  <ActionGrid
                    voiceId={voiceId}
                    onVoiceClick={() => setVoiceSheetOpen(true)}
                    onHistoryClick={openPlaylist}
                    historyDisabled={playlistItems.length === 0}
                    onScanClick={openScanPicker}
                    onLinkClick={() => setLinkSheetOpen(true)}
                    scanBusy={scanBusy}
                  />
                  <PrimaryTtsButton onClick={goRead} />
                </div>
              </div>
            </main>
          </>
        ) : (
          <ReadScreen
            text={text}
            voiceId={voiceId}
            onBack={() => setScreen('home')}
            onOpenVoicePicker={() => setVoiceSheetOpen(true)}
            onAddToHistory={(t) => setPlaylistItems((prev) => prependPlaylistItem(prev, t))}
          />
        )}
      </div>

      <VoicePickerSheet
        open={voiceSheetOpen}
        onClose={() => setVoiceSheetOpen(false)}
        voiceId={voiceId}
        onSelect={onPickVoice}
      />
      {screen === 'home' && (
        <>
          <LinkUrlSheet
            open={linkSheetOpen}
            onClose={() => setLinkSheetOpen(false)}
            onApply={(block) => {
              setText((prev) => {
                const t = block.trim()
                if (!t) return prev
                return prev.trim() ? `${prev.trim()}\n\n${t}` : t
              })
            }}
          />
          <PlaylistSheet
            open={playlistOpen}
            onClose={() => setPlaylistOpen(false)}
            items={playlistItems}
            voiceId={voiceId}
            onDeleteItem={(id) =>
              setPlaylistItems((prev) => removePlaylistItem(prev, id))
            }
          />
        </>
      )}
      </div>
    </>
  )
}

export default App
