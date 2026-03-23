/**
 * TTS 语音合成模块
 * 通过 Vercel Serverless 代理调用阿里云 Qwen3-TTS-Flash，API Key 不暴露给前端
 * Qwen 为主，失败时由调用方切换 Web Speech 兜底
 */

const TTS_API_URL = "/api/tts";
const DB_NAME = "ReadAloudTTS";
const DB_STORE = "audio";
const DB_VERSION = 2;
const CACHE_MAX = 100;

type CacheEntry = { hex: string; format?: string; ts: number };

export interface SpeakOptions {
  /** 播放倍速 0.75–1.5，默认 1 */
  speed?: number;
}

const DEFAULT_OPTIONS: Required<SpeakOptions> = {
  speed: 1,
};

let ttsDisabled = false;
let currentAudio: HTMLAudioElement | null = null;
let rejectCurrentPlay: (() => void) | null = null;

const memoryCache = new Map<string, CacheEntry>();

function log(level: "info" | "warn" | "error", msg: string, extra?: unknown): void {
  const prefix = "[TTS]";
  if (level === "info") {
    console.log(prefix, msg, extra ?? "");
  } else if (level === "warn") {
    console.warn(prefix, msg, extra ?? "");
  } else {
    console.error(prefix, msg, extra ?? "");
  }
}

function cacheKey(text: string): string {
  return text.trim();
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function mimeFromFormat(format?: string): string {
  return format === "wav" ? "audio/wav" : "audio/mpeg";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "key" });
      }
    };
  });
}

async function getFromIndexedDB(key: string): Promise<CacheEntry | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        resolve(row ? { hex: row.hex, format: row.format, ts: row.ts } : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    log("warn", "IndexedDB 读取失败", err);
    return null;
  }
}

async function saveToIndexedDB(key: string, hex: string, format?: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      store.put({ key, hex, format, ts: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    log("warn", "IndexedDB 写入失败", err);
  }
}

async function trimIndexedDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    const getAll = store.getAll();
    getAll.onsuccess = () => {
      const rows = getAll.result as { key: string; ts: number }[];
      if (rows.length <= CACHE_MAX) return;
      rows.sort((a, b) => a.ts - b.ts);
      const toDel = rows.slice(0, rows.length - CACHE_MAX);
      toDel.forEach((r) => store.delete(r.key));
    };
  } catch (err) {
    log("warn", "IndexedDB 清理失败", err);
  }
}

function playHexAudio(hex: string, playbackRate = 1, format?: string): Promise<void> {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  rejectCurrentPlay = null;

  return new Promise((resolve, reject) => {
    try {
      const bytes = hexToBytes(hex);
      const mime = mimeFromFormat(format);
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = playbackRate;
      currentAudio = audio;

      const cleanup = () => {
        rejectCurrentPlay = null;
        if (currentAudio === audio) {
          audio.pause();
          audio.currentTime = 0;
          currentAudio = null;
        }
        URL.revokeObjectURL(url);
      };

      rejectCurrentPlay = () => {
        cleanup();
        reject(new Error("STOPPED"));
      };

      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error("音频播放失败"));
      };
      audio.play().catch((err: unknown) => {
        cleanup();
        const msg = err instanceof Error ? err.message : String(err);
        const name = err instanceof Error && "name" in err ? (err as Error & { name?: string }).name : "";
        if (name === "NotAllowedError" || /not allowed|user denied|user agent/i.test(msg)) {
          reject(new Error("AUDIO_BLOCKED"));
        } else {
          reject(err);
        }
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

async function fetchFromAPI(text: string): Promise<{ hex: string; format?: string }> {
  log("info", "调用 Qwen TTS 代理", { text: text.slice(0, 50) + "..." });

  const res = await fetch(TTS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (res.status === 429) {
    ttsDisabled = true;
    log("warn", "TTS 限流或用量超限，自动切换 Web Speech");
    throw new Error("TTS_QUOTA");
  }

  if (res.status === 503) {
    ttsDisabled = true;
    log("warn", "TTS 未配置或已禁用");
    throw new Error("TTS_DISABLED");
  }

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    log("error", "API 响应解析失败");
    throw new Error("API 响应解析失败");
  }

  if (!res.ok) {
    const err = data?.error as string | undefined;
    const msg = (data?.message as string) || res.statusText;
    if (err === "TTS_QUOTA" || err === "TTS_DISABLED") {
      ttsDisabled = true;
    } else {
      log("error", "TTS 代理错误", { status: res.status, err, msg });
    }
    // 优先展示服务端返回的具体错误信息
    throw new Error(msg || err || "TTS 请求失败");
  }

  const audioHex = data?.hex;
  if (!audioHex || typeof audioHex !== "string") {
    log("error", "未获取到音频数据");
    throw new Error("未获取到音频数据");
  }

  const format = typeof data?.format === "string" ? data.format : undefined;
  return { hex: audioHex, format };
}

/** 分块阈值，超长文本分块并行请求以加快首段播放 */
const CHUNK_SIZE = 350;

function splitIntoChunks(text: string): string[] {
  const t = text.trim();
  if (t.length <= CHUNK_SIZE) return [t];
  const chunks: string[] = [];
  let remain = t;
  while (remain.length > 0) {
    if (remain.length <= CHUNK_SIZE) {
      chunks.push(remain.trim());
      break;
    }
    const slice = remain.slice(0, CHUNK_SIZE);
    const lastDot = slice.lastIndexOf(". ");
    const lastBang = slice.lastIndexOf("! ");
    const lastQ = slice.lastIndexOf("? ");
    const lastBreak = Math.max(lastDot, lastBang, lastQ);
    const end = lastBreak >= 0 ? lastBreak + 2 : CHUNK_SIZE;
    chunks.push(remain.slice(0, end).trim());
    remain = remain.slice(end).trim();
  }
  return chunks.filter((c) => c.length > 0);
}

/**
 * 预取音频到缓存（不播放），进入朗读页时调用可减少点击播放的等待
 */
export async function prefetch(text: string): Promise<void> {
  const t = text.trim();
  if (!t || ttsDisabled) return;
  const key = cacheKey(t);
  if (memoryCache.has(key)) return;
  try {
    const cached = await getFromIndexedDB(key);
    if (cached) return;
    const { hex, format } = await fetchFromAPI(t);
    const entry: CacheEntry = { hex, format, ts: Date.now() };
    memoryCache.set(key, entry);
    await saveToIndexedDB(key, hex, format);
    trimIndexedDB();
    log("info", "预取完成", { len: t.length });
  } catch (err) {
    log("warn", "预取失败", err);
  }
}

/**
 * 朗读文本（Qwen TTS）
 * @param text 待朗读的文本
 * @param options 可选：speed
 */
async function getOrFetchChunk(chunk: string): Promise<CacheEntry> {
  const key = cacheKey(chunk);
  let cached = await getFromIndexedDB(key);
  if (cached) return cached;
  cached = memoryCache.get(key);
  if (cached) return cached;
  const { hex, format } = await fetchFromAPI(chunk);
  const entry: CacheEntry = { hex, format, ts: Date.now() };
  memoryCache.set(key, entry);
  await saveToIndexedDB(key, hex, format);
  trimIndexedDB();
  return entry;
}

export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  const t = text.trim();
  if (!t) return;

  if (ttsDisabled) {
    throw new Error("TTS_DISABLED");
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks = splitIntoChunks(t);

  if (chunks.length === 1) {
    const key = cacheKey(t);
    let cached = await getFromIndexedDB(key);
    if (cached) {
      log("info", "缓存命中 (IndexedDB)");
      await playHexAudio(cached.hex, opts.speed, cached.format);
      return;
    }
    cached = memoryCache.get(key);
    if (cached) {
      log("info", "缓存命中 (内存)");
      await playHexAudio(cached.hex, opts.speed, cached.format);
      return;
    }
    const { hex, format } = await fetchFromAPI(t);
    const entry: CacheEntry = { hex, format, ts: Date.now() };
    memoryCache.set(key, entry);
    await saveToIndexedDB(key, hex, format);
    trimIndexedDB();
    await playHexAudio(hex, opts.speed, format);
    return;
  }

  const entries = await Promise.all(chunks.map((c) => getOrFetchChunk(c)));
  for (const e of entries) {
    await playHexAudio(e.hex, opts.speed, e.format);
  }
}

/** 停止当前播放 */
export function stop(): void {
  if (rejectCurrentPlay) {
    rejectCurrentPlay();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

/** 是否因用量超限或未配置已禁用 */
export function isDisabled(): boolean {
  return ttsDisabled;
}
