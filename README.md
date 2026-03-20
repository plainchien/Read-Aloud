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

## MiniMax TTS 配置

1. 在 MiniMax 开放平台获取 API Key
2. 编辑 `src/lib/minimaxTts.ts`，替换 `MINIMAX_API_KEY`
3. 用量超限时自动切换为 Web Speech API
  