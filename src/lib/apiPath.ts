/**
 * 与 Vite `base`（如 `/readaloud/`）对齐的同域 API 路径。
 * 避免子路径部署 / GitHub·Vercel 预览时请求落到错误路径。
 */
export function apiPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  if (!base) return p
  return `${base}${p}`
}
