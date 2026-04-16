/**
 * 受 SSRF 约束的 HTTP 拉取 + Readability 正文抽取（供 Vercel handler 与 Vite 开发中间件共用）
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { assertUrlSafeForFetch } from "./url-ssrf.js";

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 18_000;

async function readBodyWithLimit(res: Response, maxBytes: number): Promise<ArrayBuffer> {
  const body = res.body;
  if (!body) return new ArrayBuffer(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    if (total + value.length > maxBytes) {
      throw new Error("BODY_TOO_LARGE");
    }
    total += value.length;
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out.buffer;
}

function parseWithReadability(html: string, articleUrl: string): { title: string; text: string } {
  const dom = new JSDOM(html, { url: articleUrl });
  const doc = dom.window.document;
  const reader = new Readability(doc);
  const article = reader.parse();
  if (article?.textContent?.trim()) {
    return {
      title: (article.title ?? "").trim(),
      text: article.textContent.trim(),
    };
  }
  const bodyText = doc.body?.textContent?.trim() ?? "";
  return {
    title: (doc.title ?? "").trim(),
    text: bodyText,
  };
}

/**
 * @throws Error 消息为 UPPER_SNAKE code 或 HTTP_xxx
 */
export async function extractArticleFromUrl(urlInput: string): Promise<{ title: string; text: string }> {
  let current = urlInput.trim();
  let redirects = 0;
  while (true) {
    const u = await assertUrlSafeForFetch(current);
    let res: Response;
    try {
      res = await fetch(u.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "ReadAloud/1.0 (article-extract)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError" || name === "TimeoutError") throw new Error("FETCH_TIMEOUT");
      throw new Error("FETCH_FAILED");
    }

    if (res.status >= 300 && res.status < 400) {
      if (redirects >= MAX_REDIRECTS) throw new Error("TOO_MANY_REDIRECTS");
      const loc = res.headers.get("location");
      if (!loc) throw new Error("REDIRECT_NO_LOCATION");
      redirects += 1;
      current = new URL(loc, u.href).href;
      continue;
    }

    if (!res.ok) {
      throw new Error(`HTTP_${res.status}`);
    }

    const buf = await readBodyWithLimit(res, MAX_BODY_BYTES);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buf));
    return parseWithReadability(html, u.href);
  }
}
