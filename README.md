# Read Aloud - 英语朗读练习

移动端优先的响应式网页，支持英文文本朗读、翻译、单词查词。

## 功能

- 输入/粘贴英文文本
- 整句朗读：**Kokoro TTS**（经同域 **`/readaloud/api/tts-proxy`** → Vercel 函数转发至 Hugging Face Space；密钥用环境变量 **`KOKORO_API_KEY`**，可选 **`KOKORO_TTS_URL`** 覆盖上游地址）。失败或未配置时自动降级 **Web Speech**
- 朗读时逐词高亮（仅在走 **Web Speech** 兜底时有效；Kokoro 播放为整段音频无逐词边界）
- 点击单词查看音标与释义（经同域 **`/readaloud/api/dictionary-proxy`** 转发 Free Dictionary API）
- 中文翻译（经同域 **`/readaloud/api/translate-proxy`** 转发 MyMemory）
- **安全**：TTS / 词典 / 翻译均限额流与输入校验；密钥仅服务端；详见 [`SECURITY.md`](SECURITY.md)（`TTS_CORS_ORIGINS`、Preview/Production 密钥、`CSP-Report-Only` 等）
- 倍速 **0.75× / 1× / 1.5×**（播放端 `playbackRate`）；音频缓存（IndexedDB + 内存）减少重复请求


**升级说明**：旧版曾使用 `POST /api/tts`（阿里云 Qwen），该接口已从仓库移除。线上若仍看到对 `/api/tts` 的请求，说明浏览器或微信内置页缓存了旧 JS，请**强制刷新 / 清除站点数据**后再试。Vercel 上可删除不再使用的 **`QWENTTS_*`** 环境变量。

  
