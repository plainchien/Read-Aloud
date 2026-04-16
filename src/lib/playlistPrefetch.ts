import { chunkSentencesForTts } from './ttsChunk'
import { splitSentencesByPeriod } from './splitSentences'
import { fetchTtsAudio } from './ttsClient'

/**
 * 后台预取历史列表各条目的 TTS 分块，写入与朗读相同的缓存键。
 */
export async function prefetchPlaylistTts(
  items: readonly { text: string }[],
  voiceId: string,
  signal?: AbortSignal,
): Promise<void> {
  for (const item of items) {
    if (signal?.aborted) return
    const chunks = chunkSentencesForTts(splitSentencesByPeriod(item.text))
    for (const ch of chunks) {
      if (signal?.aborted) return
      try {
        await fetchTtsAudio(ch, voiceId, 1)
      } catch {
        /* 网络失败则跳过 */
      }
    }
  }
}
