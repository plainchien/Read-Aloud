/**
 * Fetch with CORS fallback: try direct first, use proxy if blocked (file:// or CORS)
 */
export async function fetchApi(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch {
    // CORS or network error - use proxy
  }
  const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
  const res = await fetch(proxyUrl);
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
