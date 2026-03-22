/**
 * TTS 代理 API：调用阿里云 Qwen3-TTS-Flash，API Key 仅在服务端
 * 环境变量：QWENTTS_API_KEY（必填）
 * 可选：QWENTTS_REGION = "cn" 使用北京端点，否则使用新加坡端点（Vercel 推荐）
 * 音色：随机使用 Ethan 或 Katerina
 */

const DASHSCOPE_CN = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const DASHSCOPE_INTL = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_VOICES = ["Ethan", "Katerina"] as const;
const MAX_TEXT_LENGTH = 600;

function pickRandomVoice(): string {
  return QWEN_VOICES[Math.floor(Math.random() * QWEN_VOICES.length)];
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (n: number) => { json: (o: object) => void };
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
  const requestBody = {
    model: "qwen3-tts-flash",
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
    const output = data.output as Record<string, unknown> | undefined;
    const audio = output?.audio as Record<string, unknown> | undefined;
    const audioUrl = audio?.url as string | undefined;

    if (!genRes.ok) {
      console.error("[TTS API] DashScope HTTP 错误", { status: genRes.status, url: apiUrl, request: { model: requestBody.model, voice: requestBody.input.voice, textLen: text.length }, raw: rawText.slice(0, 500) });
    }

    if (statusCode === 401 || genRes.status === 401) {
      return res.status(503).json({ error: "TTS_DISABLED", message: "API Key 无效或地域不匹配（国际 Key 用新加坡端点，中国 Key 用 QWENTTS_REGION=cn）" });
    }

    if (statusCode === 429 || genRes.status === 429) {
      return res.status(429).json({ error: "TTS_QUOTA", message: "用量超限" });
    }

    if (genRes.ok && audioUrl && typeof audioUrl === "string") {
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        return res.status(500).json({ error: "音频下载失败" });
      }
      const arrayBuffer = await audioRes.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const hex = bytesToHex(bytes);
      return res.status(200).json({ hex, format: "wav" });
    }

    if (statusCode !== 200 && statusCode !== undefined) {
      const msg = message || code || `错误码 ${statusCode}`;
      console.error("[TTS API] DashScope 业务错误", { statusCode, code, message, request_id: data.request_id, raw: rawText.slice(0, 600) });
      return res.status(400).json({ error: "QWEN_ERROR", message: msg });
    }

    if (!audioUrl || typeof audioUrl !== "string") {
      console.error("[TTS API] 响应结构异常，无 audio.url", { httpStatus: genRes.status, keys: Object.keys(data), request: { model: requestBody.model, voice: requestBody.input.voice }, raw: rawText.slice(0, 600) });
      return res.status(500).json({ error: "API_ERROR", message: "响应缺少音频地址，request_id: " + ((data.request_id as string) || "无") });
    }

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return res.status(500).json({ error: "音频下载失败" });
    }
    const arrayBuffer = await audioRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const hex = bytesToHex(bytes);
    return res.status(200).json({ hex, format: "wav" });
  } catch (err) {
    console.error("[TTS API] 请求失败", err);
    return res.status(500).json({ error: "请求失败" });
  }
}
