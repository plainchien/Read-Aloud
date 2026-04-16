import type { LoopMode } from '../../lib/loopMode'
import { BottomSheet } from '../BottomSheet'

export type { LoopMode }

type LoopSheetProps = {
  open: boolean
  onClose: () => void
  mode: LoopMode
  onChange: (mode: LoopMode) => void
}

const options: { id: LoopMode; label: string; desc: string }[] = [
  { id: 'off', label: '关闭循环', desc: '播完即停' },
  { id: 'sentence', label: '单句循环', desc: '重复当前一句' },
  { id: 'article', label: '单篇循环', desc: '整篇结束后从头播放' },
]

export function LoopSheet({ open, onClose, mode, onChange }: LoopSheetProps) {
  return (
    <BottomSheet open={open} title="循环播放" onClose={onClose}>
      <div className="flex flex-col gap-2 pb-2">
        {options.map((opt) => {
          const active = mode === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onChange(opt.id)
                onClose()
              }}
              className={`flex w-full flex-col items-start rounded-ios-squircle px-3 py-3 text-left ${
                active ? 'bg-ios-secondary' : 'bg-ios-bg'
              }`}
            >
              <span className="text-[14px] font-semibold text-ios-label">{opt.label}</span>
              <span className="mt-0.5 text-[13px] text-ios-secondary-label">{opt.desc}</span>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
