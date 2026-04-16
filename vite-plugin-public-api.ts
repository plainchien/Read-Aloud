/**
 * 开发时同域代理：词典 / 翻译 / 链接抽正文（生产由 Vercel api/* 处理）
 */

import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { applyCors, headerOrigin, pickAllowedCorsOrigin } from "./api/cors.js";
import {
  dictionaryUpstreamUrl,
  translateUpstreamUrl,
  validateDictionaryWord,
} from "./api/external-fetch.js";
import { checkRateLimit, getClientIpFromHeaders } from "./api/rate-limit.js";
import { mapUrlExtractErrorToMessage } from "./api/url-extract-errors.js";
import { extractArticleFromUrl } from "./api/url-extract-core.js";

function parseQuery(pathAndQuery: string): Record<string, string> {
  const i = pathAndQuery.indexOf("?");
  if (i < 0) return {};
  const sp = new URLSearchParams(pathAndQuery.slice(i + 1));
  const out: Record<string, string> = {};
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function isDictionaryPath(pathname: string): boolean {
  return pathname === "/readaloud/api/dictionary-proxy" || pathname === "/api/dictionary-proxy";
}

function isTranslatePath(pathname: string): boolean {
  return pathname === "/readaloud/api/translate-proxy" || pathname === "/api/translate-proxy";
}

function isUrlExtractPath(pathname: string): boolean {
  return pathname === "/readaloud/api/url-extract" || pathname === "/api/url-extract";
}

const MAX_URL_EXTRACT_BODY = 8192;

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    n += b.length;
    if (n > maxBytes) throw new Error("BODY_TOO_LARGE");
    chunks.push(b);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw) as unknown;
}

function parseUrlFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const u = (body as { url?: unknown }).url;
  if (typeof u !== "string") return null;
  const t = u.trim();
  if (!t || t.length > 2048) return null;
  return t;
}

export function publicApiDevProxy(): Plugin {
  return {
    name: "readaloud-public-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathAndQuery = (req.url ?? "").split("#")[0] ?? "";
        const pathname = pathAndQuery.split("?")[0] ?? "";
        if (!isDictionaryPath(pathname) && !isTranslatePath(pathname) && !isUrlExtractPath(pathname)) {
          next();
          return;
        }

        const env = { ...process.env, ...loadEnv(server.config.mode, process.cwd(), "") } as NodeJS.ProcessEnv;
        const sres = res as ServerResponse;
        const origin = pickAllowedCorsOrigin(headerOrigin(req.headers as IncomingMessage["headers"]), env);
        const ip = getClientIpFromHeaders(req.headers);

        if (isUrlExtractPath(pathname)) {
          if (req.method === "OPTIONS") {
            applyCors(sres, origin);
            sres.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
            sres.setHeader("Access-Control-Allow-Headers", "Content-Type");
            sres.statusCode = 204;
            sres.end();
            return;
          }
          if (req.method !== "POST") {
            sres.setHeader("Allow", "POST, OPTIONS");
            sres.statusCode = 405;
            sres.setHeader("Content-Type", "application/json; charset=utf-8");
            sres.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }

          try {
            if (!(await checkRateLimit(ip, "urlExtract", env))) {
              applyCors(sres, origin);
              sres.statusCode = 429;
              sres.setHeader("Content-Type", "application/json; charset=utf-8");
              sres.end(JSON.stringify({ error: "RATE_LIMIT", message: "请求过于频繁，请稍后再试" }));
              return;
            }
            let raw: unknown;
            try {
              raw = await readJsonBody(req as IncomingMessage, MAX_URL_EXTRACT_BODY);
            } catch (parseErr) {
              const msg = parseErr instanceof Error ? parseErr.message : "";
              applyCors(sres, origin);
              sres.statusCode = msg === "BODY_TOO_LARGE" ? 400 : 400;
              sres.setHeader("Content-Type", "application/json; charset=utf-8");
              sres.end(
                JSON.stringify({
                  error: msg === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" : "INVALID_BODY",
                  message: msg === "BODY_TOO_LARGE" ? "请求体过大" : "请求体格式错误",
                }),
              );
              return;
            }
            const urlStr = parseUrlFromBody(raw);
            if (urlStr == null) {
              applyCors(sres, origin);
              sres.statusCode = 400;
              sres.setHeader("Content-Type", "application/json; charset=utf-8");
              sres.end(
                JSON.stringify({
                  error: "INVALID_BODY",
                  message: "请提供有效的 url 字段（不超过 2048 字符）",
                }),
              );
              return;
            }
            const { title, text } = await extractArticleFromUrl(urlStr);
            if (!text.trim()) {
              applyCors(sres, origin);
              sres.statusCode = 422;
              sres.setHeader("Content-Type", "application/json; charset=utf-8");
              sres.end(JSON.stringify({ error: "EMPTY_CONTENT", message: "未能从页面提取正文" }));
              return;
            }
            applyCors(sres, origin);
            sres.statusCode = 200;
            sres.setHeader("Content-Type", "application/json; charset=utf-8");
            sres.end(JSON.stringify({ title: title || "", text: text.trim() }));
            return;
          } catch (e) {
            const code = e instanceof Error ? e.message : "UNKNOWN";
            console.error("[vite url-extract]", code);
            applyCors(sres, origin);
            if (code === "BODY_TOO_LARGE") {
              sres.statusCode = 400;
              sres.setHeader("Content-Type", "application/json; charset=utf-8");
              sres.end(JSON.stringify({ error: code, message: "请求体过大" }));
              return;
            }
            sres.statusCode = 400;
            sres.setHeader("Content-Type", "application/json; charset=utf-8");
            sres.end(JSON.stringify({ error: code, message: mapUrlExtractErrorToMessage(code) }));
            return;
          }
        }

        if (req.method === "OPTIONS") {
          applyCors(sres, origin);
          sres.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          sres.setHeader("Access-Control-Allow-Headers", "Content-Type");
          sres.statusCode = 204;
          sres.end();
          return;
        }

        if (req.method !== "GET") {
          sres.statusCode = 405;
          sres.setHeader("Content-Type", "application/json; charset=utf-8");
          sres.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const qparams = parseQuery(pathAndQuery);

        try {
          if (isDictionaryPath(pathname)) {
            if (!(await checkRateLimit(ip, "dictionary", env))) {
              applyCors(sres, origin);
              sres.statusCode = 429;
              sres.setHeader("Content-Type", "application/json; charset=utf-8");
              sres.end(JSON.stringify({ error: "RATE_LIMIT", message: "请求过于频繁，请稍后再试" }));
              return;
            }
            const word = qparams.word ?? "";
            if (!validateDictionaryWord(word)) {
              applyCors(sres, origin);
              sres.statusCode = 400;
              sres.setHeader("Content-Type", "application/json; charset=utf-8");
              sres.end(JSON.stringify({ error: "INVALID_WORD", message: "无效的单词参数" }));
              return;
            }
            const r = await fetch(dictionaryUpstreamUrl(word), { headers: { Accept: "application/json" } });
            const body = await r.text();
            applyCors(sres, origin);
            sres.statusCode = r.status;
            sres.setHeader("Content-Type", r.headers.get("content-type") || "application/json; charset=utf-8");
            sres.end(body);
            return;
          }

          if (isTranslatePath(pathname)) {
            if (!(await checkRateLimit(ip, "translate", env))) {
              applyCors(sres, origin);
              sres.statusCode = 429;
              sres.setHeader("Content-Type", "application/json; charset=utf-8");
              sres.end(JSON.stringify({ error: "RATE_LIMIT", message: "请求过于频繁，请稍后再试" }));
              return;
            }
            const q = qparams.q ?? "";
            const langpair = qparams.langpair ?? "en|zh";
            const url = translateUpstreamUrl(q, langpair);
            if (!url) {
              applyCors(sres, origin);
              sres.statusCode = 400;
              sres.setHeader("Content-Type", "application/json; charset=utf-8");
              sres.end(JSON.stringify({ error: "INVALID_QUERY", message: "无效或过长的翻译文本" }));
              return;
            }
            const r = await fetch(url, { headers: { Accept: "application/json" } });
            const body = await r.text();
            applyCors(sres, origin);
            sres.statusCode = r.status;
            sres.setHeader("Content-Type", r.headers.get("content-type") || "application/json; charset=utf-8");
            sres.end(body);
            return;
          }
        } catch (e) {
          console.error("[vite public api]", e);
          applyCors(sres, origin);
          sres.statusCode = 502;
          sres.setHeader("Content-Type", "application/json; charset=utf-8");
          sres.end(JSON.stringify({ error: "UPSTREAM_ERROR" }));
          return;
        }

        next();
      });
    },
  };
}
