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
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/** 黑色填充 + 圆角轮廓（无描边），与常见 solid 播放键一致 */
function PlayFilled({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
        clipRule="evenodd"
      />
    </svg>
  )
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
}: ReadPlayerBarProps) {
  return (
    <div className="w-full rounded-[1.25rem] bg-ios-bg p-2 shadow-[0_4px_24px_rgb(0_0_0/0.08)]">
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
        <div className="justify-self-start">
          <div
            className="size-8 rounded-full bg-ios-secondary"
            aria-hidden
            title="音色"
          />
        </div>
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
            <PlayFilled className="ml-0.5 size-9" />
          )}
        </button>
        <button
          type="button"
          onClick={onSpeedClick}
          className="justify-self-end min-w-0 text-right text-[17px] font-semibold tabular-nums leading-none text-ios-label"
        >
          {speed.toFixed(1)}×
        </button>
      </div>
    </div>
  )
}
