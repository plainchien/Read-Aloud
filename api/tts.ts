/**
 * TTS 代理 API：调用阿里云 Qwen3-TTS-Flash，API Key 仅在服务端
 * 环境变量：QWENTTS_API_KEY
 * 音色：随机使用 Ethan 或 Katerina
 */

const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
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
    return res.status(503).json({ error: "TTS_DISABLED", message: "TTS 未配置" });
  }

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
    const genRes = await fetch(DASHSCOPE_URL, {
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

    const data = (await genRes.json()) as {
      status_code?: number;
      code?: string;
      message?: string;
      output?: { audio?: { url?: string } };
    };

    if (data.status_code === 401) {
      return res.status(503).json({ error: "TTS_DISABLED", message: "API Key 无效" });
    }

    if (data.status_code === 429) {
      return res.status(429).json({ error: "TTS_QUOTA", message: "用量超限" });
    }

    if (data.status_code !== 200) {
      const msg = data.message || data.code || `错误码 ${data.status_code}`;
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
