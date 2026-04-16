/**
 * 同域 / 白名单 CORS：减少 /api/* 对外开放面
 *
 * - TTS_CORS_ORIGINS：逗号分隔的 Origin 完整列表（含生产自定义域）
 * - 未设置时：本地常见开发 Origin + Vercel 注入的 URL 变量
 * - `parseAllowedOriginsFromEnv(envOverride)` 供 Vite 传入 merge 后的 env
 */

import type { IncomingHttpHeaders } from "node:http";

export function parseAllowedOriginsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.TTS_CORS_ORIGINS?.trim();
  if (raw) {
    return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  }
  const out: string[] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ];
  if (env.VERCEL_URL) out.push(`https://${env.VERCEL_URL}`);
  if (env.VERCEL_BRANCH_URL) out.push(`https://${env.VERCEL_BRANCH_URL}`);
  const prod = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) out.push(`https://${prod}`);
  return [...new Set(out)];
}

export function headerOrigin(headers: IncomingHttpHeaders | undefined): string | undefined {
  if (!headers) return undefined;
  const o = headers.origin;
  return typeof o === "string" && o ? o : undefined;
}

export function pickAllowedCorsOrigin(
  rawOrigin: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (!rawOrigin) return undefined;
  const allowed = parseAllowedOriginsFromEnv(env);
  return allowed.includes(rawOrigin) ? rawOrigin : undefined;
}

export function applyCors(
  res: { setHeader(name: string, value: string | number | string[]): void },
  origin: string | undefined
): void {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
}
