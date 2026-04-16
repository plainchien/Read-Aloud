/** 与 Vite `base`（如 `/readaloud/`）对齐的 public 资源路径 */
export function publicUrl(path: string): string {
  const p = path.startsWith('/') ? path.slice(1) : path
  const base = import.meta.env.BASE_URL
  return base.endsWith('/') ? `${base}${p}` : `${base}/${p}`
}
