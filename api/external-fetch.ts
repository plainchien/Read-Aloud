/**
 * 词典 / MyMemory 上游 URL 构造（Serverless 与 Vite 中间件可共用）
 */

const DICTIONARY_WORD = /^[a-zA-Z'-]{1,80}$/;

export function validateDictionaryWord(word: string): boolean {
  return DICTIONARY_WORD.test(word);
}

export function dictionaryUpstreamUrl(word: string): string {
  return `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
}

/** MyMemory 单次 query 长度上限（与 App 分块策略一致） */
export const TRANSLATE_MAX_Q_CHARS = 500;

const DEFAULT_LANGPAIR = "en|zh";

export function validateLangpair(pair: string): boolean {
  return pair === DEFAULT_LANGPAIR;
}

/** @returns 上游 URL，非法时 null */
export function translateUpstreamUrl(q: string, langpair: string): string | null {
  if (!validateLangpair(langpair)) return null;
  const t = q.trim();
  if (!t || t.length > TRANSLATE_MAX_Q_CHARS) return null;
  return `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${encodeURIComponent(langpair)}`;
}
