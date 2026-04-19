import { VoiceOrbIcon } from '../VoiceOrbIcon'
import { PlayIcon } from '../PlayIcon'

type ReadPlayerBarProps = {
  /** 0–1 进度 */
  progress: number
  currentSec: number
  durationSec: number
  isPlaying: boolean
  onPlayToggle: () => void
  speed: number
  onSpeedClick: () => void
  onSeek?: (ratio: number) => void
  /** 语音未就绪或出错时禁用播放与进度条 */
  disabled?: boolean
  /** 当前音色 id，用于圆点颜色 */
  voiceId: string
  /** 打开音色列表 */
  onVoiceClick: () => void
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/** 纯黑色圆角矩形（与播放三角同 24 视窗、同 size-9） */
function PauseFilled({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="3"
        fill="currentColor"
      />
    </svg>
  )
}

export function ReadPlayerBar({
  progress,
  currentSec,
  durationSec,
  isPlaying,
  onPlayToggle,
  speed,
  onSpeedClick,
  onSeek,
  disabled = false,
  voiceId,
  onVoiceClick,
}: ReadPlayerBarProps) {
  return (
    <div className="read-glass-panel w-full rounded-[1.25rem] p-2">
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-[11px] tabular-nums text-ios-secondary-label">
          {formatTime(currentSec)}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          disabled={disabled}
          onChange={(e) => onSeek?.(Number(e.target.value))}
          className="read-player-range flex-1 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="进度"
        />
        <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-ios-secondary-label">
          {formatTime(durationSec)}
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-3 items-center gap-1 px-0.5">
        <button
          type="button"
          onClick={onVoiceClick}
          className="justify-self-start rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(0_153_230/0.45)]"
          aria-label="选择音色"
        >
          <VoiceOrbIcon voiceId={voiceId} className="size-[30px] shrink-0" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onPlayToggle}
          className="justify-self-center flex items-center justify-center text-ios-label disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? (
            <PauseFilled className="size-9" />
          ) : (
            <PlayIcon className="ml-1 h-[26px] w-auto" />
          )}
        </button>
        <button
          type="button"
          onClick={onSpeedClick}
          className="justify-self-end min-w-0 text-right text-[20.4px] font-semibold tabular-nums leading-none text-ios-label"
        >
          {speed.toFixed(1)}×
        </button>
      </div>
    </div>
  )
}
