/**
 * Kokoro TTS 代理：浏览器只请求同域 `/api/tts-proxy`，由服务端携带 KOKORO_API_KEY 转发至 Hugging Face Space。
 *
 * 环境变量：
 * - KOKORO_API_KEY（必填）
 * - KOKORO_TTS_URL（可选）完整上游 POST 地址；默认与需求文档一致为 Space 根 URL。若实际为 `/v1/audio/speech`，请设为 `https://…/v1/audio/speech`。
 */

import { fetchKokoroTtsAudio, kokoroUpstreamUrlFromEnv } from "./kokoro-forward";

function parseJsonBody(req: { body?: unknown }): Record<string, unknown> {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === "string") {
    try {
      return JSON.parse(b) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof b === "object" && !Array.isArray(b)) {
    return b as Record<string, unknown>;
  }
  return {};
}

type Res = {
  setHeader: (k: string, v: string) => void;
  status: (n: number) => {
    json: (o: object) => void;
    send: (b: Buffer) => void;
    end: (chunk?: string | Buffer) => void;
  };
};

export default async function handler(
  req: { method?: string; body?: unknown },
  res: Res
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = (process.env.KOKORO_API_KEY || "").trim();
  if (!apiKey) {
    res.status(503).json({
      error: "TTS_DISABLED",
      message: "KOKORO_API_KEY 未配置",
    });
    return;
  }

  try {
    const body = parseJsonBody(req);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const voice = typeof body.voice === "string" ? body.voice : "af_heart";
    const speed = typeof body.speed === "number" && Number.isFinite(body.speed) ? body.speed : 1.0;

    if (!text) {
      res.status(400).json({ error: "缺少 text 参数" });
      return;
    }

    const result = await fetchKokoroTtsAudio({
      text,
      voice,
      speed,
      apiKey,
      upstreamUrl: kokoroUpstreamUrlFromEnv(process.env),
    });

    if (!result.ok) {
      console.error("[tts-proxy] Space 响应错误", result.status, result.logBody);
      res.status(502).json({
        error: "UPSTREAM_ERROR",
        message: result.message,
      });
      return;
    }

    const buf = Buffer.from(result.audio);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(buf);
  } catch (error) {
    console.error("[tts-proxy] TTS 代理错误:", error);
    res.status(500).json({ error: "TTS 服务暂时不可用" });
  }
}
