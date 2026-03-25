/**
 * Kokoro TTS 代理：浏览器只请求同域 `/api/tts-proxy`，由服务端携带 KOKORO_API_KEY 转发至 Hugging Face Space。
 *
 * 环境变量：
 * - KOKORO_API_KEY（必填）
 * - KOKORO_TTS_URL（可选）完整上游 POST 地址
 *
 * 说明：上游逻辑内联在本文件，避免 Vercel 打包时子模块解析失败导致 FUNCTION_INVOCATION_FAILED。
 * 开发环境 Vite 插件仍使用 `api/kokoro-forward.ts`，两处请保持请求体与默认 URL 一致。
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

/** Space 根路径往往 404；OpenAI 兼容语音接口一般在 /v1/audio/speech */
const DEFAULT_TTS_URL =
  "https://monklll-kokorotts-api.hf.space/v1/audio/speech";

function upstreamUrl(): string {
  return (process.env.KOKORO_TTS_URL || DEFAULT_TTS_URL).trim().replace(/\/$/, "");
}

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
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

async function forwardToKokoro(opts: {
  text: string;
  voice: string;
  speed: number;
  apiKey: string;
}): Promise<{ ok: true; audio: ArrayBuffer } | { ok: false; status: number; message: string; logBody?: string }> {
  const response = await fetch(upstreamUrl(), {
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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

    const result = await forwardToKokoro({ text, voice, speed, apiKey });

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
    // 部分环境下 res.status().send(Buffer) 不可用，用 end 更稳妥
    res.status(200).end(buf);
  } catch (error) {
    console.error("[tts-proxy] TTS 代理错误:", error);
    res.status(500).json({ error: "TTS 服务暂时不可用" });
  }
}
