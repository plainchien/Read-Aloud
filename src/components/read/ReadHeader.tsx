import { useEffect, useRef } from 'react'
import { ChevronLeft, MoreHorizontal } from 'lucide-react'

const FEEDBACK_EMAIL = 'resparkx@outlook.com'

type ReadHeaderProps = {
  title: string
  onBack: () => void
  /** 反馈浮层是否打开 */
  feedbackOpen: boolean
  onFeedbackOpenChange: (open: boolean) => void
}

export function ReadHeader({
  title,
  onBack,
  feedbackOpen,
  onFeedbackOpenChange,
}: ReadHeaderProps) {
  const moreWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!feedbackOpen) return
    const onDocPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (moreWrapRef.current?.contains(t)) return
      onFeedbackOpenChange(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [feedbackOpen, onFeedbackOpenChange])

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 pb-2">
      <button
        type="button"
        onClick={onBack}
        className="read-header-glass-btn"
        aria-label="返回"
      >
        <ChevronLeft className="size-5" strokeWidth={2} />
      </button>
      <p className="min-w-0 flex-1 truncate text-center text-[14px] font-semibold text-ios-label">{title}</p>
      <div ref={moreWrapRef} className="relative z-20 shrink-0">
        <button
          type="button"
          onClick={() => onFeedbackOpenChange(!feedbackOpen)}
          className="read-header-glass-btn"
          aria-expanded={feedbackOpen}
          aria-haspopup="dialog"
          aria-label="更多"
        >
          <MoreHorizontal className="size-5" strokeWidth={2} />
        </button>
        {feedbackOpen ? (
          <>
            <div
              className="fixed inset-0 z-[90] bg-transparent"
              aria-hidden
              onClick={() => onFeedbackOpenChange(false)}
            />
            <div
              role="dialog"
              aria-label="反馈与建议"
              className="absolute right-0 top-[calc(100%+6px)] z-[100] w-[min(18rem,calc(100vw-2rem))] rounded-ios-squircle bg-white p-3.5 shadow-lg"
            >
              <p className="whitespace-pre-line text-[14px] leading-snug text-ios-label">
                反馈建议{'\n'}
                <a
                  href={`mailto:${FEEDBACK_EMAIL}`}
                  className="font-medium text-[#007aff] underline decoration-[#007aff]/35 underline-offset-2"
                >
                  {FEEDBACK_EMAIL}
                </a>
              </p>
            </div>
          </>
        ) : null}
      </div>
    </header>
  )
}
