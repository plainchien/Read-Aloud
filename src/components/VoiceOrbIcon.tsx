import { getVoiceAvatarSrc } from '../data/voiceAvatarUrls'

type VoiceOrbIconProps = {
  voiceId: string
  className?: string
}

/** 音色圆形肖像（public/voice-avatars） */
export function VoiceOrbIcon({ voiceId, className }: VoiceOrbIconProps) {
  return (
    <img
      src={getVoiceAvatarSrc(voiceId)}
      alt=""
      className={`voice-avatar ${className ?? ''}`}
      draggable={false}
    />
  )
}
