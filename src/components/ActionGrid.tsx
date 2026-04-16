import { publicUrl } from '../lib/publicUrl'

type ActionGridProps = {
  onHistoryClick: () => void
  /** 无历史记录时禁用「历史」按钮（视觉变浅） */
  historyDisabled?: boolean
  /** 点击「扫描」：由父组件触发隐藏 file input */
  onScanClick: () => void
  onLinkClick: () => void
  /** 扫描识别中 */
  scanBusy?: boolean
}

export function ActionGrid({
  onHistoryClick,
  historyDisabled = false,
  onScanClick,
  onLinkClick,
  scanBusy = false,
}: ActionGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        type="button"
        disabled={scanBusy}
        onClick={onScanClick}
        className="flex h-[60px] flex-row items-center justify-center gap-2 rounded-ios-squircle border border-[#ECECEC] bg-[#FFFFFF] px-2 text-ios-label disabled:cursor-wait disabled:opacity-60"
      >
        <img src={publicUrl('brand/scan.svg')} alt="" className="size-5 shrink-0" width={24} height={24} />
        <span className="text-[16px] font-semibold">{scanBusy ? '识别中…' : '扫描'}</span>
      </button>
      <button
        type="button"
        onClick={onLinkClick}
        className="flex h-[60px] flex-row items-center justify-center gap-2 rounded-ios-squircle border border-[#ECECEC] bg-[#FFFFFF] px-2 text-ios-label"
      >
        <img src={publicUrl('brand/link.svg')} alt="" className="size-5 shrink-0" width={24} height={24} />
        <span className="text-[16px] font-semibold">链接</span>
      </button>
      <button
        type="button"
        disabled={historyDisabled}
        onClick={onHistoryClick}
        className="flex h-[60px] flex-row items-center justify-center gap-2 rounded-ios-squircle border border-[#ECECEC] bg-[#FFFFFF] px-2 text-ios-label disabled:cursor-not-allowed disabled:opacity-50"
      >
        <img src={publicUrl('brand/history.svg')} alt="" className="size-5 shrink-0" width={24} height={24} />
        <span className="text-[16px] font-semibold">历史</span>
      </button>
    </div>
  )
}
