/**
 * 服务端拉取用户提交的 URL 前的 SSRF 校验：仅 http(s)、禁止内网/保留地址、DNS 解析后逐 IP 检查。
 */

import dns from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

function ipv4Disallowed(a: number, b: number): boolean {
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/** true = 不允许访问（内网 / 保留 / 环回） */
export function isDisallowedEndpointIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const parts = ip.split(".").map((x) => parseInt(x, 10));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
    return ipv4Disallowed(parts[0]!, parts[1]!);
  }
  if (isIPv6(ip)) {
    const h = ip.toLowerCase();
    if (h === "::1") return true;
    if (h.startsWith("fe80:")) return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    if (h.startsWith("::ffff:")) {
      const tail = h.slice(7);
      const v4 = tail.includes(":") ? null : tail;
      if (v4 && isIPv4(v4)) return isDisallowedEndpointIp(v4);
    }
    return false;
  }
  return true;
}

function hostnameLooksBlocked(hostname: string): boolean {
  const hn = hostname.toLowerCase();
  if (hn === "localhost" || hn.endsWith(".localhost")) return true;
  if (hn.endsWith(".local") || hn.endsWith(".internal")) return true;
  return false;
}

/**
 * 解析 URL，校验 scheme/host，并对字面 IP 或 DNS 解析结果做阻断检查。
 * @throws Error 带简短英文 code 供日志；消息可安全返回给客户端（中文在 handler 里映射）
 */
export async function assertUrlSafeForFetch(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("INVALID_URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("INVALID_SCHEME");
  if (u.username || u.password) throw new Error("URL_CREDENTIALS_FORBIDDEN");

  const host = u.hostname;
  if (!host) throw new Error("INVALID_HOST");

  if (hostnameLooksBlocked(host)) throw new Error("BLOCKED_HOST");

  if (isIPv4(host) || isIPv6(host)) {
    if (isDisallowedEndpointIp(host)) throw new Error("BLOCKED_IP");
    return u;
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("DNS_FAILED");
  }
  if (!records.length) throw new Error("DNS_EMPTY");

  for (const r of records) {
    if (isDisallowedEndpointIp(r.address)) throw new Error("BLOCKED_IP");
  }

  return u;
}
