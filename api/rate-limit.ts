/**
 * 按 IP 滑动窗口限流（多命名空间：tts / dictionary / translate / urlExtract）
 *
 * 可选 Upstash：UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * TTS：TTS_IP_RATE_LIMIT_MAX（默认 30）、TTS_IP_RATE_WINDOW_SEC（默认 60）
 * 词典/翻译：PUBLIC_API_RATE_LIMIT_MAX（默认 60）、PUBLIC_API_RATE_WINDOW_SEC（默认 60）
 * 链接抽正文：URL_EXTRACT_IP_RATE_LIMIT_MAX（默认 15）、URL_EXTRACT_IP_RATE_WINDOW_SEC（默认 60）
 */

import type { IncomingHttpHeaders } from "node:http";

type RatelimitInstance = import("@upstash/ratelimit").Ratelimit;

const globalStore = globalThis as typeof globalThis & {
  __readaloudRateBuckets?: Map<string, number[]>;
};

export type RateLimitScope = "tts" | "dictionary" | "translate" | "urlExtract";

function getEnvInt(key: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const v = env[key];
  if (v == null || v === "") return fallback;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getClientIpFromHeaders(headers: IncomingHttpHeaders | undefined): string {
  if (!headers) return "unknown";
  const cf = headers["cf-connecting-ip"];
  const xf = headers["x-forwarded-for"];
  const real = headers["x-real-ip"];

  if (cf) {
    const v = Array.isArray(cf) ? cf[0] : cf;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (xf) {
    const raw = Array.isArray(xf) ? xf[0] : xf;
    const first = String(raw).split(",")[0]?.trim();
    if (first) return first;
  }
  if (real) {
    const v = Array.isArray(real) ? real[0] : real;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "unknown";
}

function limitParams(scope: RateLimitScope, env: NodeJS.ProcessEnv): { max: number; windowSec: number } {
  if (scope === "tts") {
    return {
      max: getEnvInt("TTS_IP_RATE_LIMIT_MAX", 30, env),
      windowSec: getEnvInt("TTS_IP_RATE_WINDOW_SEC", 60, env),
    };
  }
  if (scope === "urlExtract") {
    return {
      max: getEnvInt("URL_EXTRACT_IP_RATE_LIMIT_MAX", 15, env),
      windowSec: getEnvInt("URL_EXTRACT_IP_RATE_WINDOW_SEC", 60, env),
    };
  }
  return {
    max: getEnvInt("PUBLIC_API_RATE_LIMIT_MAX", 60, env),
    windowSec: getEnvInt("PUBLIC_API_RATE_WINDOW_SEC", 60, env),
  };
}

function memoryAllow(bucketKey: string, max: number, windowMs: number): boolean {
  const buckets = globalStore.__readaloudRateBuckets ?? (globalStore.__readaloudRateBuckets = new Map());
  const now = Date.now();
  const arr = buckets.get(bucketKey) ?? [];
  const pruned = arr.filter((t: number) => now - t < windowMs);
  if (pruned.length >= max) {
    buckets.set(bucketKey, pruned);
    return false;
  }
  pruned.push(now);
  buckets.set(bucketKey, pruned);
  return true;
}

const upstashLimiters = new Map<string, RatelimitInstance>();
let upstashGlobalFailed = false;

async function getUpstashLimiter(
  scope: RateLimitScope,
  env: NodeJS.ProcessEnv
): Promise<RatelimitInstance | null> {
  if (upstashGlobalFailed) return null;
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  if (upstashLimiters.has(scope)) return upstashLimiters.get(scope)!;

  try {
    const { Ratelimit } = await import("@upstash/ratelimit");
    const { Redis } = await import("@upstash/redis");
    const { max, windowSec } = limitParams(scope, env);
    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      prefix: `readaloud:rl:${scope}`,
    });
    upstashLimiters.set(scope, limiter);
    return limiter;
  } catch (e) {
    console.error("[rate-limit] Upstash 初始化失败，使用内存限流", e);
    upstashGlobalFailed = true;
    return null;
  }
}

export async function checkRateLimit(
  ip: string,
  scope: RateLimitScope,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const { max, windowSec } = limitParams(scope, env);
  const bucketKey = `${scope}:${ip}`;
  const limiter = await getUpstashLimiter(scope, env);
  if (limiter) {
    try {
      const { success } = await limiter.limit(ip);
      return success;
    } catch (e) {
      console.error("[rate-limit] Upstash limit() failed, using in-memory bucket", e);
      return memoryAllow(bucketKey, max, windowSec * 1000);
    }
  }
  return memoryAllow(bucketKey, max, windowSec * 1000);
}
