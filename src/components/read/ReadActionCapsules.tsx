import { Loader2 } from 'lucide-react'
import type { LoopMode } from '../../lib/loopMode'
import {
  LargeCapsuleIcon,
  LoopCapsuleIcon,
  TranslateCapsuleIcon,
} from './ReadCapsuleIcons'

type ReadActionCapsulesProps = {
  /** 无译文时请求翻译；已有译文时切换显示/隐藏 */
  onTranslateClick: () => void
  translateLoading: boolean
  hasTranslations: boolean
  translationVisible: boolean
  onLoop: () => void
  loopMode: LoopMode
  textLarge: boolean
  onTextSizeToggle: () => void
}

function loopLabel(mode: LoopMode): string {
  if (mode === 'sentence') return '单句循环'
  if (mode === 'article') return '单篇循环'
  return '循环'
}

const segmentClass =
  'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium text-ios-label transition hover:bg-[rgb(255_255_255/0.28)] active:bg-[rgb(255_255_255/0.4)]'

/** 翻译 icon 视窗 16×14，h-4 时宽度 = 16×16/14 —— 三钮左侧图标同槽宽、垂直居中 */
const capsuleIconSlotClass =
  'inline-flex h-4 w-[calc(16px*16/14)] shrink-0 items-center justify-center text-ios-label [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full'

function translateCapsuleLabel(
  hasTranslations: boolean,
  translationVisible: boolean,
): string {
  if (!hasTranslations) return '翻译'
  return translationVisible ? '隐藏译文' : '显示译文'
}

export function ReadActionCapsules({
  onTranslateClick,
  translateLoading,
  hasTranslations,
  translationVisible,
  onLoop,
  loopMode,
  textLarge,
  onTextSizeToggle,
}: ReadActionCapsulesProps) {
  return (
    <div className="read-glass-panel mb-2 w-full rounded-ios-squircle p-1.5">
      <div className="flex flex-wrap items-center justify-start gap-1">
        <button
          type="button"
          onClick={onTranslateClick}
          disabled={translateLoading}
          className={`${segmentClass} disabled:opacity-60`}
          aria-busy={translateLoading}
          aria-pressed={hasTranslations ? translationVisible : undefined}
        >
          <span className={capsuleIconSlotClass}>
            {translateLoading ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2} />
            ) : (
              <TranslateCapsuleIcon className="h-full w-auto" />
            )}
          </span>
          {translateCapsuleLabel(hasTranslations, translationVisible)}
        </button>
        <button type="button" onClick={onLoop} className={segmentClass}>
          <span className={capsuleIconSlotClass}>
            <LoopCapsuleIcon className="h-full w-auto" />
          </span>
          <span className="max-w-[10rem] truncate">{loopLabel(loopMode)}</span>
        </button>
        <button
          type="button"
          onClick={onTextSizeToggle}
          className={segmentClass}
          aria-pressed={textLarge}
        >
          <span className={capsuleIconSlotClass}>
            <LargeCapsuleIcon className="h-full w-auto" />
          </span>
          {textLarge ? '默认字号' : '大字'}
        </button>
      </div>
    </div>
  )
}
