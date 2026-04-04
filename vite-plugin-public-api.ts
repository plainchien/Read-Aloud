/**
 * 开发时同域代理：词典 / 翻译（生产由 Vercel api/dictionary-proxy、translate-proxy 处理）
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { applyCors, headerOrigin, pickAllowedCorsOrigin } from "./api/cors";
import {
  dictionaryUpstreamUrl,
  translateUpstreamUrl,
  validateDictionaryWord,
} from "./api/external-fetch";
import { checkRateLimit, getClientIpFromHeaders } from "./api/rate-limit";

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

export function publicApiDevProxy(): Plugin {
  return {
    name: "readaloud-public-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathAndQuery = (req.url ?? "").split("#")[0] ?? "";
        const pathname = pathAndQuery.split("?")[0] ?? "";
        if (!isDictionaryPath(pathname) && !isTranslatePath(pathname)) {
          next();
          return;
        }

        const env = { ...process.env, ...loadEnv(server.config.mode, process.cwd(), "") } as NodeJS.ProcessEnv;
        const sres = res as ServerResponse;
        const origin = pickAllowedCorsOrigin(headerOrigin(req.headers as IncomingMessage["headers"]), env);

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

        const ip = getClientIpFromHeaders(req.headers);
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
