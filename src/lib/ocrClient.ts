/**
 * 浏览器内 OCR：Tesseract.js（eng + 简体中文），无需服务端侧车。
 */

import { createWorker } from 'tesseract.js'

let workerPromise: ReturnType<typeof createWorker> | null = null

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng+chi_sim', 1, {
      logger: () => {},
    })
  }
  return workerPromise
}

/** 压缩大图：最长边 maxEdge，JPEG 质量 quality */
async function downscaleIfNeeded(
  file: File,
  maxEdge = 2000,
  quality = 0.85,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const { width: w, height: h } = bmp
  const max = Math.max(w, h)
  if (max <= maxEdge) {
    bmp.close()
    return file
  }
  const scale = maxEdge / max
  const cw = Math.round(w * scale)
  const ch = Math.round(h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close()
    return file
  }
  ctx.drawImage(bmp, 0, 0, cw, ch)
  bmp.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
  )
  if (!blob) return file
  return new File([blob], 'scan.jpg', { type: 'image/jpeg' })
}

export async function ocrImageFile(file: File): Promise<string> {
  const prepared = await downscaleIfNeeded(file)
  const worker = await getWorker()
  const {
    data: { text },
  } = await worker.recognize(prepared)
  return text.trim()
}
