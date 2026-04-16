/**
 * 翻译代理：GET ?q=&langpair=en|zh 转发 MyMemory（q 长度受 external-fetch 约束）
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, headerOrigin, pickAllowedCorsOrigin } from "./cors.js";
import { checkRateLimit, getClientIpFromHeaders } from "./rate-limit.js";
import { translateUpstreamUrl } from "./external-fetch.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

const DEFAULT_LANGPAIR = "en|zh";

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
  if (!(await checkRateLimit(ip, "translate"))) {
    applyCors(res, origin);
    res.status(429).json({ error: "RATE_LIMIT", message: "请求过于频繁，请稍后再试" });
    return;
  }

  const q = typeof req.query.q === "string" ? req.query.q : "";
  const langpairRaw = typeof req.query.langpair === "string" ? req.query.langpair : DEFAULT_LANGPAIR;
  const url = translateUpstreamUrl(q, langpairRaw);
  if (!url) {
    applyCors(res, origin);
    res.status(400).json({
      error: "INVALID_QUERY",
      message: "无效或过长的翻译文本",
    });
    return;
  }

  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await r.text();
    applyCors(res, origin);
    const ct = r.headers.get("content-type") || "application/json; charset=utf-8";
    res.status(r.status).setHeader("Content-Type", ct).end(body);
  } catch (e) {
    console.error("[translate-proxy]", e);
    applyCors(res, origin);
    res.status(502).json({ error: "UPSTREAM_ERROR", message: "翻译服务暂时不可用" });
  }
}
