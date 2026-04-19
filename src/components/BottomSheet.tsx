import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'

type BottomSheetProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="relative flex max-h-[85vh] flex-col rounded-t-[1.25rem] bg-ios-bg shadow-[0_-8px_40px_rgb(0_0_0/0.12)]">
        <div className="flex shrink-0 flex-col items-center pt-2 pb-1">
          <div className="h-[5px] w-[100px] rounded-full bg-ios-secondary" aria-hidden />
        </div>
        <div className="shrink-0 px-5 pb-3 pt-0">
          <h2 className="text-center text-[16px] font-semibold text-ios-label">
            {title}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
