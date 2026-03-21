/**
 * TTS 代理 API：将 MiniMax 请求转发到服务端，避免 API Key 暴露
 * 环境变量：MINIMAX_API_KEY, MINIMAX_ENABLED（可选，设为 "true" 启用，否则不调用 API）
 */

const T2A_URL = "https://api.minimaxi.com/v1/t2a_v2";
const MAX_TEXT_LENGTH = 5000;

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void }; json: (o: object) => void }
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (process.env.MINIMAX_ENABLED !== "true") {
    return res.status(503).json({ error: "MINIMAX_DISABLED", message: "TTS 已暂停" });
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.error("[TTS API] MINIMAX_API_KEY 未配置");
    return res.status(500).json({ error: "服务端配置错误" });
  }

  const body = req.body as { text?: string; voice_id?: string; vol?: number; pitch?: number };
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return res.status(400).json({ error: "缺少 text 参数" });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: "文本过长", message: `最大 ${MAX_TEXT_LENGTH} 字符` });
  }

  const voiceId = body.voice_id ?? "English_Gentle-voiced_man";
  const vol = typeof body.vol === "number" ? body.vol : 1;
  const pitch = typeof body.pitch === "number" ? body.pitch : 0;

  try {
    const minimaxRes = await fetch(T2A_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "speech-2.6-hd",
        text,
        stream: false,
        output_format: "hex",
        voice_setting: {
          voice_id: voiceId,
          speed: 1,
          vol,
          pitch,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: "mp3",
          channel: 1,
        },
        pronunciation_dict: { tone: [] },
        subtitle_enable: false,
      }),
    });

    const data = (await minimaxRes.json()) as Record<string, unknown>;
    const baseResp = (data?.base_resp as { status_code?: number; status_msg?: string }) || {};
    const statusCode = baseResp.status_code;

    if (statusCode === 1002 || statusCode === 1039) {
      return res.status(429).json({ error: "MINIMAX_QUOTA", message: "用量超限" });
    }

    if (statusCode !== 0) {
      const msg = baseResp.status_msg || `错误码 ${statusCode}`;
      return res.status(400).json({ error: "MINIMAX_ERROR", message: msg });
    }

    const audioHex = (data as { data?: { audio?: string } })?.data?.audio;
    if (!audioHex || typeof audioHex !== "string") {
      return res.status(500).json({ error: "未获取到音频数据" });
    }

    return res.status(200).json({ hex: audioHex });
  } catch (err) {
    console.error("[TTS API] 请求失败", err);
    return res.status(500).json({ error: "请求失败" });
  }
}
