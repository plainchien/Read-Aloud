/**
 * TTS 代理 API：调用阿里云百炼 Qwen 语音合成（DashScope multimodal-generation），API Key 仅在服务端
 *
 * 环境变量：
 * - QWENTTS_API_KEY（必填）
 * - QWENTTS_MODEL（可选）模型名，默认 qwen-tts；控制台若显示完整名（如带版本后缀）可在此覆盖
 * - QWENTTS_REGION = "cn" 使用北京端点，否则新加坡端点（Vercel 推荐）
 *
 * 音色：随机 Ethan / Katerina（若新模型不支持，需按百炼文档改 QWEN_VOICES）
 *
 * DashScope 通常返回 output.audio.url；部分响应仅有 output.audio.data（Base64 WAV），两种均支持。
 * 另兼容 data.output 嵌套及大小写 Audio/url。
 */

const DASHSCOPE_CN = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const DASHSCOPE_INTL = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_VOICES = ["Ethan", "Katerina"] as const;
const MAX_TEXT_LENGTH = 600;

/** 默认 qwen-tts；额度/模型变更时可在 Vercel 配 QWENTTS_MODEL，无需改代码 */
const DEFAULT_TTS_MODEL = "qwen-tts";

function pickRandomVoice(): string {
  return QWEN_VOICES[Math.floor(Math.random() * QWEN_VOICES.length)];
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 兼容不同嵌套：output / data.output */
function getDashScopeOutput(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const out = data.output;
  if (out && typeof out === "object" && !Array.isArray(out)) {
    return out as Record<string, unknown>;
  }
  const inner = data.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const o = (inner as Record<string, unknown>).output;
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return o as Record<string, unknown>;
    }
  }
  return undefined;
}

function getAudioObject(output: Record<string, unknown>): Record<string, unknown> | undefined {
  const a = output.audio ?? output.Audio;
  if (a && typeof a === "object" && !Array.isArray(a)) {
    return a as Record<string, unknown>;
  }
  return undefined;
}

/** 从 DashScope 响应解析音频：优先 HTTPS url，否则 Base64 data（WAV） */
function extractTtsPayload(data: Record<string, unknown>): { url?: string; rawBytes?: Buffer } {
  const output = getDashScopeOutput(data);
  if (!output) {
    return {};
  }

  const audio = getAudioObject(output);
  if (audio) {
    const urlVal = audio.url ?? audio.URL;
    if (typeof urlVal === "string") {
      const u = urlVal.trim();
      if (/^https?:\/\//i.test(u)) {
        return { url: u };
      }
    }

    const b64 = audio.data ?? audio.Data;
    if (typeof b64 === "string" && b64.length > 64) {
      try {
        const buf = Buffer.from(b64, "base64");
        if (buf.length > 32) {
          return { rawBytes: buf };
        }
      } catch {
        /* 非合法 Base64 */
      }
    }
  }

  const outUrl = output.url ?? output.URL;
  if (typeof outUrl === "string") {
    const u = outUrl.trim();
    if (/^https?:\/\//i.test(u)) {
      return { url: u };
    }
  }

  return {};
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (n: number) => { json: (o: object) => void; send?: (b: string | Buffer) => void };
    json: (o: object) => void;
  }
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = (process.env.QWENTTS_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(503).json({ error: "TTS_DISABLED", message: "TTS 未配置，请设置 QWENTTS_API_KEY" });
  }

  const useCn = process.env.QWENTTS_REGION === "cn";
  const apiUrl = useCn ? DASHSCOPE_CN : DASHSCOPE_INTL;

  const body = req.body as { text?: string; speed?: number };
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return res.status(400).json({ error: "缺少 text 参数" });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: "文本过长", message: `最大 ${MAX_TEXT_LENGTH} 字符` });
  }

  const voice = pickRandomVoice();
  const model = (process.env.QWENTTS_MODEL || DEFAULT_TTS_MODEL).trim();
  const requestBody = {
    model,
    input: {
      text,
      voice,
      language_type: "English",
    },
  };

  try {
    const genRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const rawText = await genRes.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      console.error("[TTS API] DashScope 响应解析失败", { status: genRes.status, body: rawText.slice(0, 500) });
      return res.status(500).json({ error: "API_ERROR", message: "服务响应异常" });
    }

    const statusCode = (data.status_code ?? data.statusCode ?? data.StatusCode) as number | undefined;
    const code = (data.code ?? data.error) as string | undefined;
    const message = (data.message ?? data.errorMessage ?? data.msg) as string | undefined;
    const { url: audioUrl, rawBytes } = extractTtsPayload(data);

    if (!genRes.ok) {
      console.error("[TTS API] DashScope HTTP 错误", {
        status: genRes.status,
        url: apiUrl,
        request: { model: requestBody.model, voice: requestBody.input.voice, textLen: text.length },
        raw: rawText.slice(0, 500),
      });
    }

    if (statusCode === 401 || genRes.status === 401) {
      return res.status(503).json({
        error: "TTS_DISABLED",
        message: "API Key 无效或地域不匹配（国际 Key 用新加坡端点，中国 Key 用 QWENTTS_REGION=cn）",
      });
    }

    if (statusCode === 429 || genRes.status === 429) {
      return res.status(429).json({ error: "TTS_QUOTA", message: "用量超限" });
    }

    const sendHex = (bytes: Uint8Array) => {
      const hex = bytesToHex(bytes);
      return res.status(200).json({ hex, format: "wav" });
    };

    if (genRes.ok && rawBytes && rawBytes.length > 32) {
      return sendHex(new Uint8Array(rawBytes));
    }

    if (genRes.ok && audioUrl && typeof audioUrl === "string") {
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        return res.status(500).json({ error: "音频下载失败" });
      }
      const arrayBuffer = await audioRes.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      return sendHex(bytes);
    }

    if (statusCode !== 200 && statusCode !== undefined) {
      const msg = message || code || `错误码 ${statusCode}`;
      console.error("[TTS API] DashScope 业务错误", {
        statusCode,
        code,
        message,
        request_id: data.request_id,
        raw: rawText.slice(0, 600),
      });
      return res.status(400).json({ error: "QWEN_ERROR", message: msg });
    }

    const output = getDashScopeOutput(data);
    const audioObj = output ? getAudioObject(output) : undefined;
    console.error("[TTS API] 响应中无可用音频（无 url / 无有效 data）", {
      httpStatus: genRes.status,
      request_id: data.request_id,
      topKeys: Object.keys(data),
      outputKeys: output ? Object.keys(output) : [],
      audioKeys: audioObj ? Object.keys(audioObj) : [],
      raw: rawText.slice(0, 800),
    });
    return res.status(500).json({
      error: "API_ERROR",
      message:
        "响应缺少音频地址或 Base64 数据。请查看 Vercel 函数日志中的 outputKeys/audioKeys。request_id: " +
        String(data.request_id ?? "无"),
    });
  } catch (err) {
    console.error("[TTS API] 请求失败", err);
    return res.status(500).json({ error: "请求失败" });
  }
}
