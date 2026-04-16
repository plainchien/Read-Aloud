/** 与 url-extract handler / Vite 开发中间件共用的错误文案 */
export function mapUrlExtractErrorToMessage(code: string): string {
  const table: Record<string, string> = {
    INVALID_URL: "无效的链接",
    INVALID_SCHEME: "仅支持 http / https 链接",
    URL_CREDENTIALS_FORBIDDEN: "链接中不能包含用户名或密码",
    INVALID_HOST: "无效的主机名",
    BLOCKED_HOST: "该主机地址不允许",
    BLOCKED_IP: "该地址不允许访问",
    DNS_FAILED: "无法解析链接主机",
    DNS_EMPTY: "无法解析链接主机",
    BODY_TOO_LARGE: "页面体积过大",
    FETCH_TIMEOUT: "请求超时",
    FETCH_FAILED: "无法获取页面",
    REDIRECT_NO_LOCATION: "重定向无效",
    TOO_MANY_REDIRECTS: "重定向次数过多",
  };
  if (code.startsWith("HTTP_")) return "页面无法访问";
  return table[code] ?? "提取失败";
}
