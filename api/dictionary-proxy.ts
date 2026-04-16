/**
 * 词典代理：GET ?word= 仅允许字母与 '-，转发 dictionaryapi.dev
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, headerOrigin, pickAllowedCorsOrigin } from "./cors";
import { checkRateLimit, getClientIpFromHeaders } from "./rate-limit";
import { dictionaryUpstreamUrl, validateDictionaryWord } from "./external-fetch";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = pickAllowedCorsOrigin(headerOrigin(req.headers));

  if (req.method === "OPTIONS") {
    applyCors(res, origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ip = getClientIpFromHeaders(req.headers);
  if (!(await checkRateLimit(ip, "dictionary"))) {
    applyCors(res, origin);
    res.status(429).json({ error: "RATE_LIMIT", message: "请求过于频繁，请稍后再试" });
    return;
  }

  const word = typeof req.query.word === "string" ? req.query.word : "";
  if (!validateDictionaryWord(word)) {
    applyCors(res, origin);
    res.status(400).json({ error: "INVALID_WORD", message: "无效的单词参数" });
    return;
  }

  try {
    const r = await fetch(dictionaryUpstreamUrl(word), { headers: { Accept: "application/json" } });
    const body = await r.text();
    applyCors(res, origin);
    const ct = r.headers.get("content-type") || "application/json; charset=utf-8";
    res.status(r.status).setHeader("Content-Type", ct).end(body);
  } catch (e) {
    console.error("[dictionary-proxy]", e);
    applyCors(res, origin);
    res.status(502).json({ error: "UPSTREAM_ERROR", message: "词典服务暂时不可用" });
  }
}
