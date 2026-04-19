import { useCallback, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { fetchUrlExtractText } from '../lib/urlExtractClient'

type LinkUrlSheetProps = {
  open: boolean
  onClose: () => void
  /** 将抽取的正文写入输入框（可含标题） */
  onApply: (text: string) => void
}

export function LinkUrlSheet({ open, onClose, onApply }: LinkUrlSheetProps) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = useCallback(() => {
    if (!busy) {
      setError(null)
      onClose()
    }
  }, [busy, onClose])

  const submit = useCallback(async () => {
    setError(null)
    const u = url.trim()
    if (!u) {
      setError('请输入网页链接')
      return
    }
    setBusy(true)
    try {
      const { title, text } = await fetchUrlExtractText(u)
      const t = text.trim()
      if (!t) {
        setError('未能从页面提取正文')
        return
      }
      const block = title.trim() ? `${title.trim()}\n\n${t}` : t
      onApply(block)
      setUrl('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '提取失败')
    } finally {
      setBusy(false)
    }
  }, [url, onApply, onClose])

  return (
    <BottomSheet open={open} title="从链接导入" onClose={handleClose}>
      <div className="flex flex-col gap-3 pb-2">
        <label className="text-[13px] font-medium text-[#3a3a3c]">
          网页地址（http / https）
        </label>
        <input
          type="url"
          name="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com/article"
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-xl border border-[#E5E5EA] bg-white px-3 py-2.5 text-base text-ios-label outline-none placeholder:text-[#8e8e93] focus:border-[#0099e6]"
        />
        {error ? (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-xl bg-[#000000] py-3 text-[16px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? '正在提取…' : '提取正文'}
        </button>
      </div>
    </BottomSheet>
  )
}
