/**
 * Kokoro 音色 id 与展示名（与 hexgrad/kokoro VOICES 命名一致，上游 API 使用 `voice` 字段传 id）
 */
export type KokoroVoice = {
  id: string
  /** 列表主标题，如 Heart、Bella */
  name: string
  /** 副标题，如 American、British */
  region: string
}

/** 英文常用音色子集（美式 + 英式），便于朗读英文文本 */
export const KOKORO_VOICES: KokoroVoice[] = [
  { id: 'af_heart', name: 'Heart', region: 'American' },
  { id: 'af_bella', name: 'Bella', region: 'American' },
  { id: 'af_nicole', name: 'Nicole', region: 'American' },
  { id: 'af_sarah', name: 'Sarah', region: 'American' },
  { id: 'af_sky', name: 'Sky', region: 'American' },
  { id: 'am_michael', name: 'Michael', region: 'American' },
  { id: 'am_adam', name: 'Adam', region: 'American' },
  { id: 'bf_emma', name: 'Emma', region: 'British' },
  { id: 'bf_isabella', name: 'Isabella', region: 'British' },
  { id: 'bm_george', name: 'George', region: 'British' },
  { id: 'bm_lewis', name: 'Lewis', region: 'British' },
]

export const DEFAULT_VOICE_ID = 'af_heart'

export function findVoiceById(id: string): KokoroVoice | undefined {
  return KOKORO_VOICES.find((v) => v.id === id)
}
