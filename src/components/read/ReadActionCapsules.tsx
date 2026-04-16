import { ALargeSmall, Languages, Loader2, Repeat } from 'lucide-react'
import type { LoopMode } from '../../lib/loopMode'

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
  'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium text-ios-label transition active:bg-[rgb(60_60_67/0.06)]'

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
    <div className="mb-2 w-full rounded-ios-squircle bg-white p-1.5 shadow-[0_2px_12px_rgb(0_0_0/0.07)]">
      <div className="flex flex-wrap items-center justify-start gap-1">
        <button
          type="button"
          onClick={onTranslateClick}
          disabled={translateLoading}
          className={`${segmentClass} disabled:opacity-60`}
          aria-busy={translateLoading}
          aria-pressed={hasTranslations ? translationVisible : undefined}
        >
          {translateLoading ? (
            <Loader2 className="size-4 shrink-0 animate-spin" strokeWidth={2} />
          ) : (
            <Languages className="size-4 shrink-0" strokeWidth={2} />
          )}
          {translateCapsuleLabel(hasTranslations, translationVisible)}
        </button>
        <button type="button" onClick={onLoop} className={segmentClass}>
          <Repeat className="size-4 shrink-0" strokeWidth={2} />
          <span className="max-w-[10rem] truncate">{loopLabel(loopMode)}</span>
        </button>
        <button
          type="button"
          onClick={onTextSizeToggle}
          className={segmentClass}
          aria-pressed={textLarge}
        >
          <ALargeSmall className="size-4 shrink-0" strokeWidth={2} />
          {textLarge ? '默认字号' : '大字'}
        </button>
      </div>
    </div>
  )
}
