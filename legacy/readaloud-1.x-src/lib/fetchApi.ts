/**
 * 同源 / 已允许的 URL 请求；不再经第三方 CORS 代理（避免隐私与供应链风险）。
 */
export async function fetchApi(url: string): Promise<Response> {
  return fetch(url);
}
