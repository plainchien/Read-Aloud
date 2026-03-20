# Read Aloud - 英语朗读练习

移动端优先的响应式网页，支持英文文本朗读、翻译、单词查词。

## 运行

```bash
npm install --cache .npm-cache
npm run dev
```

浏览器访问 **http://localhost:5173**

移动端测试：`npm run dev -- --host`，用手机访问终端显示的 Network 地址

## 功能

- 输入/粘贴英文文本
- 整句朗读：**MiniMax TTS**（高质量），用量超限时自动切换 **Web Speech**
- 朗读时高亮当前单词（Web Speech 模式）
- 点击单词查看音标与释义（Free Dictionary API）
- 中文翻译（MyMemory API）
- 倍速调节 0.5×～1.25×，音频缓存减少重复请求

## 部署到 Vercel（API Key 安全）

TTS 通过 Serverless 代理调用 MiniMax，API Key 不暴露给前端。

1. 在 Vercel 项目 **Settings → Environment Variables** 添加：
   - **Name**: `MINIMAX_API_KEY`
   - **Value**: 你的 MiniMax API Key
   - **Environment**: Production、Preview、Development 全选

2. 部署后 `/api/tts` 会转发请求到 MiniMax，前端只调用该代理

3. 本地开发：
   - **推荐**：`vercel dev` 同时启动前端和 API
   - 或 `VITE_API_BASE=https://你的项目.vercel.app npm run dev`，将 /api 代理到线上
  