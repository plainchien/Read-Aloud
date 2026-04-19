const MAX_CHARS = 5000

type TextInputCardProps = {
  value: string
  onChange: (value: string) => void
}

export function TextInputCard({ value, onChange }: TextInputCardProps) {
  const count = value.length

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-ios-squircle bg-transparent">
      <div className="relative flex min-h-0 flex-1 flex-col px-0 pt-2">
        <label htmlFor="home-text" className="sr-only">
          输入或粘贴文本
        </label>
        {/* 须 ≥16px，否则 iOS Safari 聚焦时会放大整页视口（与首页背景层无关） */}
        <textarea
          id="home-text"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
          placeholder="输入/粘贴文本"
          className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent text-base leading-snug text-ios-label caret-black outline-none placeholder:text-base placeholder:text-ios-secondary-label"
        />
      </div>
      <div className="flex shrink-0 items-center justify-between px-0 py-2">
        <span className="text-sm tabular-nums text-ios-secondary-label">
          {count.toLocaleString('en-US')} / {MAX_CHARS.toLocaleString('en-US')}
        </span>
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-sm leading-none text-ios-secondary-label"
        >
          清空
        </button>
      </div>
    </div>
  )
}
