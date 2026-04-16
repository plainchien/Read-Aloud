import { DEFAULT_VOICE_ID } from '../data/kokoroVoices'

const KEY = 'readaloud_home_voice_v1'

export function loadVoiceId(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v && v.trim()) return v.trim()
  } catch {
    /* ignore */
  }
  return DEFAULT_VOICE_ID
}

export function saveVoiceId(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* ignore */
  }
}
