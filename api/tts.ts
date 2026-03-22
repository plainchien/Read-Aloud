/**
 * TTS 代理 API：调用阿里云 Qwen3-TTS-Flash，API Key 仅在服务端
 * 环境变量：QWENTTS_API_KEY（必填）
 * 可选：QWENTTS_REGION = "cn" 使用北京端点，否则使用新加坡端点（Vercel 推荐）
 * 音色：随机使用 Ethan 或 Katerina
 */

const DASHSCOPE_CN = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const DASHSCOPE_INTL = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_VOICES = ["Ethan", "Katerina"] as const;
const MAX_TEXT_LENGTH = 2000;

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

  const apiKey = process.env.QWENTTS_API_KEY;
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

  try {
    const genRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "qwen3-tts-flash",
        input: {
          text,
          voice,
          language_type: "English",
        },
      }),
    });

    const rawText = await genRes.text();
    let data: {
      status_code?: number;
      code?: string;
      message?: string;
      request_id?: string;
      output?: { audio?: { url?: string } };
    };
    try {
      data = JSON.parse(rawText) as typeof data;
    } catch {
      console.error("[TTS API] DashScope 响应解析失败", { status: genRes.status, body: rawText.slice(0, 500) });
      return res.status(500).json({ error: "API_ERROR", message: "服务响应异常" });
    }

    if (!genRes.ok) {
      console.error("[TTS API] DashScope HTTP 错误", { status: genRes.status, code: data?.code, message: data?.message });
    }

    if (data.status_code === 401 || genRes.status === 401) {
      return res.status(503).json({ error: "TTS_DISABLED", message: "API Key 无效或地域不匹配（国际 Key 用新加坡端点，中国 Key 用 QWENTTS_REGION=cn）" });
    }

    if (data.status_code === 429 || genRes.status === 429) {
      return res.status(429).json({ error: "TTS_QUOTA", message: "用量超限" });
    }

    if (data.status_code !== 200) {
      const msg = data.message || data.code || `错误码 ${data.status_code}`;
      console.error("[TTS API] DashScope 业务错误", { status_code: data.status_code, code: data.code, message: data.message, request_id: data.request_id });
      return res.status(400).json({ error: "QWEN_ERROR", message: msg });
    }

    const audioUrl = data.output?.audio?.url;
    if (!audioUrl || typeof audioUrl !== "string") {
      return res.status(500).json({ error: "未获取到音频数据" });
    }

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return res.status(500).json({ error: "音频下载失败" });
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const hex = bytesToHex(bytes);
    const format = "wav";

    return res.status(200).json({ hex, format });
  } catch (err) {
    console.error("[TTS API] 请求失败", err);
    return res.status(500).json({ error: "请求失败" });
  }
}
