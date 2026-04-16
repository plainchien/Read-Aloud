/**
 * 链接正文抽取：POST JSON `{ "url": "https://..." }`，服务端 SSRF 校验后拉取 HTML，Readability 抽正文。
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, headerOrigin, pickAllowedCorsOrigin } from "./cors.js";
import { checkRateLimit, getClientIpFromHeaders } from "./rate-limit.js";
import { extractArticleFromUrl } from "./url-extract-core.js";
import { mapUrlExtractErrorToMessage } from "./url-extract-errors.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

const MAX_URL_LEN = 2048;

function parseUrlFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const u = (body as { url?: unknown }).url;
  if (typeof u !== "string") return null;
  const t = u.trim();
  if (!t || t.length > MAX_URL_LEN) return null;
  return t;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = pickAllowedCorsOrigin(headerOrigin(req.headers));

  if (req.method === "OPTIONS") {
    applyCors(res, origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ip = getClientIpFromHeaders(req.headers);
  if (!(await checkRateLimit(ip, "urlExtract"))) {
    applyCors(res, origin);
    res.status(429).json({ error: "RATE_LIMIT", message: "请求过于频繁，请稍后再试" });
    return;
  }

  let urlStr: string | null = parseUrlFromBody(req.body);
  if (urlStr == null && typeof req.body === "string") {
    try {
      urlStr = parseUrlFromBody(JSON.parse(req.body) as unknown);
    } catch {
      urlStr = null;
    }
  }
  if (urlStr == null) {
    applyCors(res, origin);
    res.status(400).json({
      error: "INVALID_BODY",
      message: "请提供有效的 url 字段（不超过 2048 字符）",
    });
    return;
  }

  try {
    const { title, text } = await extractArticleFromUrl(urlStr);
    if (!text.trim()) {
      applyCors(res, origin);
      res.status(422).json({
        error: "EMPTY_CONTENT",
        message: "未能从页面提取正文",
      });
      return;
    }
    applyCors(res, origin);
    res.status(200).json({ title: title || "", text: text.trim() });
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    console.error("[url-extract]", code, urlStr.slice(0, 120));
    applyCors(res, origin);
    res.status(400).json({
      error: code,
      message: mapUrlExtractErrorToMessage(code),
    });
  }
}
