import { Loader2 } from 'lucide-react'
import { historyUrl, linkUrl, scanUrl } from '../lib/brandAssetUrls'
import { VoiceOrbIcon } from './VoiceOrbIcon'

type ActionGridProps = {
  voiceId: string
  onVoiceClick: () => void
  onHistoryClick: () => void
  historyDisabled?: boolean
  onScanClick: () => void
  onLinkClick: () => void
  scanBusy?: boolean
}

export function ActionGrid({
  voiceId,
  onVoiceClick,
  onHistoryClick,
  historyDisabled = false,
  onScanClick,
  onLinkClick,
  scanBusy = false,
}: ActionGridProps) {
  const voiceLabel = `Voice ${voiceId}`

  return (
    <div className="glass-container">
      <button
        type="button"
        onClick={onVoiceClick}
        className="glass-btn glass-btn-pill"
        title={voiceLabel}
      >
        <VoiceOrbIcon voiceId={voiceId} className="h-6 w-6 shrink-0" />
        <span className="glass-btn-text">{voiceLabel}</span>
      </button>

      <button
        type="button"
        disabled={scanBusy}
        onClick={onScanClick}
        className="glass-btn glass-btn-square disabled:cursor-wait disabled:opacity-70"
        aria-label={scanBusy ? '识别中' : '扫描'}
      >
        {scanBusy ? (
          <Loader2 className="size-6 animate-spin text-ios-label" aria-hidden />
        ) : (
          <img src={scanUrl} alt="" className="size-6" width={24} height={24} />
        )}
      </button>

      <button
        type="button"
        onClick={onLinkClick}
        className="glass-btn glass-btn-square"
        aria-label="链接"
      >
        <img src={linkUrl} alt="" className="size-6" width={24} height={24} />
      </button>

      <button
        type="button"
        disabled={historyDisabled}
        onClick={onHistoryClick}
        className="glass-btn glass-btn-square disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="历史"
      >
        <img src={historyUrl} alt="" className="size-6" width={24} height={24} />
      </button>
    </div>
  )
}
