/**
 * 与 Vite `base` 对齐的同域 API 路径（如 /readaloud/api/...）
 */

export function siteApiUrl(route: string, search?: Record<string, string>): string {
  const prefix = import.meta.env.BASE_URL.replace(/\/?$/, "/");
  const path = route.replace(/^\/+/, "");
  const qs =
    search && Object.keys(search).length > 0 ? `?${new URLSearchParams(search).toString()}` : "";
  return `${prefix}${path}${qs}`;
}
