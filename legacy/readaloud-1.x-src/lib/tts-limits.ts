/**
 * TTS 单次长度限制（浏览器端 `src`）
 * 服务端使用 [api/tts-limits.ts](../api/tts-limits.ts)；改规则须同步两处
 */

export const TTS_MAX_CODE_POINTS = 2000;
export const TTS_MAX_HAN_CHARACTERS = 500;

export type TtsValidation = { ok: true } | { ok: false; error: string; message: string };

export function countCodePoints(s: string): number {
  return [...s].length;
}

export function countHanCharacters(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (/^\p{Script=Han}$/u.test(ch)) n += 1;
  }
  return n;
}

export function validateTtsInput(text: string): TtsValidation {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "EMPTY", message: "缺少可读文本" };
  }
  const cp = countCodePoints(trimmed);
  if (cp > TTS_MAX_CODE_POINTS) {
    return {
      ok: false,
      error: "TTS_TEXT_TOO_LONG",
      message: `单次朗读最多 ${TTS_MAX_CODE_POINTS} 个字符，当前 ${cp} 个，请缩短或分段后再试`,
    };
  }
  const han = countHanCharacters(trimmed);
  if (han > TTS_MAX_HAN_CHARACTERS) {
    return {
      ok: false,
      error: "TTS_TEXT_TOO_LONG",
      message: `单次朗读汉字不超过 ${TTS_MAX_HAN_CHARACTERS} 个，当前约 ${han} 个，请缩短后再试`,
    };
  }
  return { ok: true };
}
