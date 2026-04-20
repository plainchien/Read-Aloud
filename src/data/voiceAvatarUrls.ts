/** 与 public/voice-avatars/*.png 对应；未知 id 回退 af_heart */
const VOICES_WITH_AVATAR = new Set([
  'af_heart',
  'af_bella',
  'am_fenrir',
  'am_michael',
  'bf_emma',
  'bm_fable',
])

export function getVoiceAvatarSrc(voiceId: string): string {
  const slug = VOICES_WITH_AVATAR.has(voiceId) ? voiceId : 'af_heart'
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}voice-avatars/${slug}.png`
}
