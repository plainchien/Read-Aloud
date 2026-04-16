/** 停止当前预览 / 播放，避免叠音 */
let current: HTMLAudioElement | null = null
let currentUrl: string | null = null

function revokeIfCurrent(url: string) {
  if (currentUrl === url) {
    URL.revokeObjectURL(url)
    currentUrl = null
  }
}

export function stopAudioPlayback(): void {
  if (current) {
    current.pause()
    current.src = ''
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl)
      currentUrl = null
    }
    current = null
  }
}

export function pauseAudioPlayback(): void {
  if (current) current.pause()
}

export function resumeAudioPlayback(): Promise<void> {
  if (!current) return Promise.resolve()
  return current.play().catch(() => undefined)
}

export type PlaybackState = 'idle' | 'playing' | 'paused'

export function getPlaybackState(): PlaybackState {
  if (!current) return 'idle'
  if (current.ended) return 'idle'
  return current.paused ? 'paused' : 'playing'
}

export type PlayArrayBufferOptions = {
  onEnded?: () => void
  onPlay?: () => void
  onPause?: () => void
}

export function playArrayBuffer(
  buf: ArrayBuffer,
  mimeType = 'audio/mpeg',
  opts?: PlayArrayBufferOptions,
): Promise<void> {
  stopAudioPlayback()
  const blob = new Blob([buf], { type: mimeType })
  const url = URL.createObjectURL(blob)
  currentUrl = url
  const audio = new Audio(url)
  current = audio
  audio.onplay = () => opts?.onPlay?.()
  audio.onpause = () => opts?.onPause?.()
  return new Promise((resolve, reject) => {
    audio.onended = () => {
      opts?.onEnded?.()
      revokeIfCurrent(url)
      if (current === audio) current = null
      resolve()
    }
    audio.onerror = () => {
      opts?.onEnded?.()
      revokeIfCurrent(url)
      if (current === audio) current = null
      reject(new Error('音频播放失败'))
    }
    audio.play().catch((e) => {
      opts?.onEnded?.()
      revokeIfCurrent(url)
      if (current === audio) current = null
      reject(e instanceof Error ? e : new Error(String(e)))
    })
  })
}

/** 多块 MP3 顺序播放（与朗读分块一致，便于命中缓存） */
export async function playArrayBuffersSequential(
  buffers: ArrayBuffer[],
  mimeType = 'audio/mpeg',
): Promise<void> {
  for (const buf of buffers) {
    await playArrayBuffer(buf, mimeType)
  }
}

/** 下载用：多块同编码 MP3 简单拼接 */
export function mergeAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((a, b) => a + b.byteLength, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const b of buffers) {
    out.set(new Uint8Array(b), o)
    o += b.byteLength
  }
  return out.buffer
}
