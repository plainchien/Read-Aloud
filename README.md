# Read Aloud - 英语朗读练习

移动端优先的响应式网页，支持英文文本朗读、翻译、单词查词。

## 功能

- 输入/粘贴英文文本
- 整句朗读：**阿里云百炼 Qwen TTS**（默认模型 `qwen-tts`，可在 Vercel 环境变量 `QWENTTS_MODEL` 覆盖），用量超限或未配置时自动切换 **Web Speech**
- 朗读时高亮当前单词（Web Speech 模式）
- 点击单词查看音标与释义（Free Dictionary API）
- 中文翻译（MyMemory API）
- 倍速调节 0.5×～1.25×，音频缓存减少重复请求

## 本地测试（含 Kokoro `/api/tts-proxy`）

1. 安装依赖：`npm install`
2. 复制环境变量：将 `.env.example` 复制为 `.env.local`，填入 `KOKORO_API_KEY`（与线上一致即可）。
3. 首次使用需关联 Vercel 项目：`npx vercel link`（仅本地仿真 API，可链到任意同名项目或使用个人 Hobby）。
4. 启动：**`npm run dev:vercel`**（用 Vercel CLI 同时拉起 Vite 开发与 `api/` 无服务器函数，与线上行为一致）。
5. 在终端提示的本地地址打开应用（注意应用带 `base`：`/readaloud/`），进入朗读页点击播放，在开发者工具 Network 中应看到对 **`/readaloud/api/tts-proxy`** 的 POST 且返回音频。

**只用 Vite（`npm run dev`，默认端口 5173）**：在 `.env.local` 中配置 **`KOKORO_API_KEY`** 即可；开发服务器会在本机处理 **`/readaloud/api/tts-proxy`**，无需 `vercel dev`。若希望 TTS 仍走**已部署**的线上 API，再在 `.env.local` 设置 **`VITE_API_BASE=https://你的域名`**（不要尾斜杠），此时会关闭本机 TTS 中间件并改用代理。

  
