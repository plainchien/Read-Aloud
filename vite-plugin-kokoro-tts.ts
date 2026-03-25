import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { fetchKokoroTtsAudio, kokoroUpstreamUrlFromEnv } from "./api/kokoro-forward";

function isTtsProxyPath(pathname: string): boolean {
  return pathname === "/readaloud/api/tts-proxy" || pathname === "/api/tts-proxy";
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * 纯 `npm run dev` 时处理 /readaloud/api/tts-proxy，读 .env.local 中的 KOKORO_API_KEY 转发上游。
 * 若设置了 VITE_API_BASE，则禁用本插件，改由代理走远程 API。
 */
export function kokoroTtsDevProxy(): Plugin {
  return {
    name: "kokoro-tts-dev-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0] ?? "";
        if (!isTtsProxyPath(pathname)) {
          next();
          return;
        }

        const env = { ...process.env, ...loadEnv(server.config.mode, process.cwd(), "") } as NodeJS.ProcessEnv;
        const sres = res as ServerResponse;

        if (req.method === "OPTIONS") {
          sres.setHeader("Access-Control-Allow-Origin", "*");
          sres.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          sres.setHeader("Access-Control-Allow-Headers", "Content-Type");
          sres.statusCode = 204;
          sres.end();
          return;
        }

        if (req.method !== "POST") {
          sres.setHeader("Allow", "POST");
          sres.statusCode = 405;
          sres.setHeader("Content-Type", "application/json; charset=utf-8");
          sres.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const apiKey = (env.KOKORO_API_KEY ?? "").trim();
        if (!apiKey) {
          sres.statusCode = 503;
          sres.setHeader("Content-Type", "application/json; charset=utf-8");
          sres.end(
            JSON.stringify({
              error: "TTS_DISABLED",
              message: "KOKORO_API_KEY 未配置（开发环境请写入 .env.local）",
            })
          );
          return;
        }

        try {
          const raw = await readBody(req as IncomingMessage);
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(raw || "{}") as Record<string, unknown>;
          } catch {
            body = {};
          }
          const text = typeof body.text === "string" ? body.text.trim() : "";
          const voice = typeof body.voice === "string" ? body.voice : "af_heart";
          const speed =
            typeof body.speed === "number" && Number.isFinite(body.speed) ? body.speed : 1.0;

          if (!text) {
            sres.statusCode = 400;
            sres.setHeader("Content-Type", "application/json; charset=utf-8");
            sres.end(JSON.stringify({ error: "缺少 text 参数" }));
            return;
          }

          const result = await fetchKokoroTtsAudio({
            text,
            voice,
            speed,
            apiKey,
            upstreamUrl: kokoroUpstreamUrlFromEnv(env),
          });

          if (!result.ok) {
            console.error("[vite dev tts] Space 响应错误", result.status, result.logBody);
            sres.statusCode = 502;
            sres.setHeader("Content-Type", "application/json; charset=utf-8");
            sres.end(JSON.stringify({ error: "UPSTREAM_ERROR", message: result.message }));
            return;
          }

          sres.statusCode = 200;
          sres.setHeader("Content-Type", "audio/mpeg");
          sres.setHeader("Access-Control-Allow-Origin", "*");
          sres.end(Buffer.from(result.audio));
        } catch (e) {
          console.error("[vite dev tts] 代理错误", e);
          sres.statusCode = 500;
          sres.setHeader("Content-Type", "application/json; charset=utf-8");
          sres.end(JSON.stringify({ error: "TTS 服务暂时不可用" }));
        }
      });
    },
  };
}
