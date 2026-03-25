/**
 * Kokoro 上游请求（Vercel 函数与 Vite 开发中间件共用）
 */

/** Space 根路径往往 404；OpenAI 兼容语音接口一般在 /v1/audio/speech */
const DEFAULT_TTS_URL =
  "https://monklll-kokorotts-api.hf.space/v1/audio/speech";

export function kokoroUpstreamUrlFromEnv(env: NodeJS.ProcessEnv): string {
  return (env.KOKORO_TTS_URL || DEFAULT_TTS_URL).trim().replace(/\/$/, "");
}

export type KokoroForwardOk = { ok: true; audio: ArrayBuffer };
export type KokoroForwardErr = {
  ok: false;
  status: number;
  message: string;
  logBody?: string;
};
export type KokoroForwardResult = KokoroForwardOk | KokoroForwardErr;

export async function fetchKokoroTtsAudio(opts: {
  text: string;
  voice: string;
  speed: number;
  apiKey: string;
  upstreamUrl: string;
}): Promise<KokoroForwardResult> {
  const response = await fetch(opts.upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      input: opts.text,
      voice: opts.voice,
      speed: opts.speed,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      message: `Space API 响应错误: ${response.status}`,
      logBody: errText.slice(0, 500),
    };
  }

  const audio = await response.arrayBuffer();
  return { ok: true, audio };
}
