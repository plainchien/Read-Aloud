# Read Aloud - 英语朗读练习

移动端优先的响应式网页，支持英文文本朗读、翻译、单词查词。

## 功能

- 输入/粘贴英文文本
- 整句朗读：**Kokoro TTS**（经同域 **`/readaloud/api/tts-proxy`** → Vercel 函数转发至 Hugging Face Space；密钥用环境变量 **`KOKORO_API_KEY`**，可选 **`KOKORO_TTS_URL`** 覆盖上游地址）。失败或未配置时自动降级 **Web Speech**
- 朗读时逐词高亮（仅在走 **Web Speech** 兜底时有效；Kokoro 播放为整段音频无逐词边界）
- 点击单词查看音标与释义（Free Dictionary API）
- 中文翻译（MyMemory API）
- 倍速 **0.75× / 1× / 1.5×**（播放端 `playbackRate`）；音频缓存（IndexedDB + 内存）减少重复请求

## 本地测试（含 Kokoro `/api/tts-proxy`）

1. 安装依赖：`npm install`
2. 复制环境变量：将 `.env.example` 复制为 `.env.local`，填入 `KOKORO_API_KEY`（与线上一致即可）。
3. 首次使用需关联 Vercel 项目：`npx vercel link`（仅本地仿真 API，可链到任意同名项目或使用个人 Hobby）。
4. 启动：**`npm run dev:vercel`**（用 Vercel CLI 同时拉起 Vite 开发与 `api/` 无服务器函数，与线上行为一致）。
5. 在终端提示的本地地址打开应用（注意应用带 `base`：`/readaloud/`），进入朗读页点击播放，在开发者工具 Network 中应看到对 **`/readaloud/api/tts-proxy`** 的 POST 且返回音频。

**只用 Vite（`npm run dev`，默认端口 5173）**：在 `.env.local` 中配置 **`KOKORO_API_KEY`** 即可；开发服务器会在本机处理 **`/readaloud/api/tts-proxy`**，无需 `vercel dev`。若希望 TTS 仍走**已部署**的线上 API，再在 `.env.local` 设置 **`VITE_API_BASE=https://你的域名`**（不要尾斜杠），此时会关闭本机 TTS 中间件并改用代理。

**升级说明**：旧版曾使用 `POST /api/tts`（阿里云 Qwen），该接口已从仓库移除。线上若仍看到对 `/api/tts` 的请求，说明浏览器或微信内置页缓存了旧 JS，请**强制刷新 / 清除站点数据**后再试。Vercel 上可删除不再使用的 **`QWENTTS_*`** 环境变量。

  
