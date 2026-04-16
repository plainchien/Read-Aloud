# 安全与运维说明

## 环境变量与密钥隔离

| 变量 | 用途 | 建议 |
|------|------|------|
| `KOKORO_API_KEY` | Kokoro / HF Space 调用 | **Production** 与 **Preview** 均配置；可用不同密钥；勿提交仓库 |
| `KOKORO_TTS_URL` | 自定义 TTS 上游 | 可选 |
| `TTS_CORS_ORIGINS` | 允许的浏览器 `Origin`（逗号分隔） | 生产务必加入**自定义域名**；未设时依赖 Vercel 注入 URL，自定义域需显式列出 |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | 全局限流（可选） | 不配则函数实例内内存限流 |
| `TTS_IP_RATE_LIMIT_MAX` / `TTS_IP_RATE_WINDOW_SEC` | TTS 每 IP 窗口 | 默认 30/60s |
| `PUBLIC_API_RATE_LIMIT_MAX` / `PUBLIC_API_RATE_WINDOW_SEC` | 词典/翻译代理 | 默认 60/60s |

## 后续若引入登录 / 付费（P2）

- **鉴权**：Session 或 JWT；HTTPS only；HttpOnly、Secure Cookie。
- **授权**：服务端校验用户身份后再放行敏感 API；勿仅靠前端隐藏按钮。
- **CSRF**：Cookie 会话需 SameSite + CSRF token 或双提交 cookie 等策略。
- **配额**：按用户 ID 限流（含 TTS），与 IP 限流组合。
- **Webhook**（如支付）：校验签名与幂等。
- **管理后台**：独立认证、最小权限、不在公网暴露调试接口。

## CSP

当前使用 **Content-Security-Policy-Report-Only** 以降低部署初期破坏风险；在浏览器控制台无大量误报后，可改为正式 **Content-Security-Policy** 并视情况收紧 `style-src`（减少 `unsafe-inline`）。

## TTS / 词典规则同步

[`api/tts-limits.ts`](api/tts-limits.ts) 与 [`src/lib/tts-limits.ts`](src/lib/tts-limits.ts) 须保持业务规则一致（Vercel 不应从 `api` import `src`）。
