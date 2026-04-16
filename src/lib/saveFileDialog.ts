/** 优先使用系统「另存为」对话框（File System Access API）；不支持则回退为浏览器下载 */
export async function saveBlobWithSaveDialog(blob: Blob, suggestedName: string): Promise<void> {
  const w = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName?: string
      types?: { description: string; accept: Record<string, string[]> }[]
    }) => Promise<FileSystemFileHandle>
  }

  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'MP3', accept: { 'audio/mpeg': ['.mp3'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      throw e
    }
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  a.click()
  URL.revokeObjectURL(url)
}
