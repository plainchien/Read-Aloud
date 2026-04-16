import { BottomSheet } from '../BottomSheet'

const MIN = 0.75
const MAX = 1.5
const STEP = 0.05

type SpeedSheetProps = {
  open: boolean
  onClose: () => void
  speed: number
  onChange: (speed: number) => void
}

export function SpeedSheet({ open, onClose, speed, onChange }: SpeedSheetProps) {
  return (
    <BottomSheet open={open} title="播放倍速" onClose={onClose}>
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-ios-secondary-label">倍速</span>
          <span className="text-[18px] font-semibold tabular-nums text-ios-label">{speed.toFixed(2)}×</span>
        </div>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={speed}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-ios-secondary accent-ios-label"
        />
        <div className="flex justify-between text-[12px] text-ios-secondary-label">
          <span>{MIN}×</span>
          <span>{MAX}×</span>
        </div>
      </div>
    </BottomSheet>
  )
}
