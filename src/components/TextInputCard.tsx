const MAX_CHARS = 3000

type TextInputCardProps = {
  value: string
  onChange: (value: string) => void
}

export function TextInputCard({ value, onChange }: TextInputCardProps) {
  const count = value.length

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-ios-squircle bg-ios-bg">
      <div className="relative flex min-h-0 flex-1 flex-col px-0 pt-2">
        <label htmlFor="home-text" className="sr-only">
          输入或粘贴文本
        </label>
        {/* 16px 避免 iOS 聚焦输入框时自动放大页面 */}
        <textarea
          id="home-text"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
          placeholder="输入/粘贴文本"
          className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent text-[16px] leading-snug text-ios-label caret-black outline-none placeholder:text-ios-secondary-label"
        />
      </div>
      <div className="flex shrink-0 items-center justify-between px-0 py-2">
        <span className="text-[14px] tabular-nums text-ios-secondary-label">
          {count.toLocaleString()} / {MAX_CHARS.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-[14px] text-ios-secondary-label"
        >
          清空
        </button>
      </div>
    </div>
  )
}
