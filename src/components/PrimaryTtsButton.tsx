type PrimaryTtsButtonProps = {
  /** 生成中：扫光文字 + 图标同渐变扫光（与 shiny-tts-text 一致） */
  loading?: boolean
  onClick?: () => void
}

export function PrimaryTtsButton({
  loading = false,
  onClick,
}: PrimaryTtsButtonProps) {
  const busy = loading

  return (
    <button
      type="button"
      onClick={onClick}
      aria-busy={busy}
      className={`flex h-[60px] w-full items-center justify-center gap-1.5 rounded-ios-squircle bg-black text-[16px] font-semibold ${
        busy ? 'pointer-events-none' : ''
      }`}
    >
      {busy ? (
        <span className="shiny-tts-icon" aria-hidden />
      ) : (
        <span className="tts-generate-icon-static" aria-hidden />
      )}
      <span
        className={
          busy ? 'shiny-tts-text font-semibold' : 'tts-label-gradient font-semibold'
        }
      >
        {busy ? '生成中...' : '文本转语音'}
      </span>
    </button>
  )
}
