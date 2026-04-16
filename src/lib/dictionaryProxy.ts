/**
 * 与主工程 WordCard 一致：GET `/api/dictionary-proxy`（dictionaryapi.dev）
 */
import { apiPath } from './apiPath'
import { cleanEnglishWord } from './translateProxy'

const DICTIONARY_PROXY = apiPath('/api/dictionary-proxy')

export type DictionaryEntry = {
  word: string
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
  meanings: {
    partOfSpeech: string
    definitions: { definition: string; example?: string }[]
  }[]
}

export async function fetchDictionaryEntry(rawWord: string): Promise<DictionaryEntry | null> {
  const clean = cleanEnglishWord(rawWord)
  if (!clean) return null

  const url = `${DICTIONARY_PROXY}?word=${encodeURIComponent(clean)}`
  const res = await fetch(url)
  if (!res.ok) return null

  const data = (await res.json()) as unknown
  if (!Array.isArray(data) || data.length === 0) return null
  return data[0] as DictionaryEntry
}
