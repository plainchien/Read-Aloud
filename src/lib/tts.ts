/**
 * TTS 语音合成模块
 * 通过同域 `/api/tts-proxy` 调用自部署 Kokoro（Hugging Face Space），密钥仅在服务端。
 * 页面倍速仅作用于播放（HTMLAudioElement.playbackRate）；上游合成使用固定 speed=1，便于缓存与预取一致。
 * 失败时由调用方切换 Web Speech 兜底。
 */

const TTS_API_URL = "/api/tts-proxy";
/** 与代理默认一致，英文学朗读 */
const KOKORO_VOICE = "af_heart";
/** 上游合成语速；UI 倍速见 SpeakOptions.speed → playbackRate */
const KOKORO_SYNTH_SPEED = 1.0;
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy], { type: mime });
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
  log("info", "调用 Kokoro TTS 代理", {
    text: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
  });

  const res = await fetch(TTS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice: KOKORO_VOICE,
      speed: KOKORO_SYNTH_SPEED,
    }),
  });

  const ct = (res.headers.get("content-type") || "").toLowerCase();

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

  if (!res.ok) {
    let msg = res.statusText;
    let errCode: string | undefined;
    if (ct.includes("application/json")) {
      try {
        const data = (await res.json()) as { error?: string; message?: string };
        errCode = data.error;
        msg = (data.message || data.error || msg) as string;
      } catch {
        log("error", "TTS 错误响应解析失败");
      }
    } else {
      try {
        const t = await res.text();
        if (t) msg = t.slice(0, 200);
      } catch {
        /* ignore */
      }
    }
    if (errCode === "TTS_QUOTA" || errCode === "TTS_DISABLED") {
      ttsDisabled = true;
    } else {
      log("error", "TTS 代理错误", { status: res.status, errCode, msg });
    }
    throw new Error(msg || errCode || "TTS 请求失败");
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 32) {
    log("error", "未获取到有效音频数据");
    throw new Error("未获取到音频数据");
  }

  return { hex: bytesToHex(buf), format: "mp3" };
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
 * 朗读文本（Kokoro，经 /api/tts-proxy）
 * @param text 待朗读的文本
 * @param options 可选：speed（播放倍速，非上游合成参数）
 */
async function getOrFetchChunk(chunk: string): Promise<CacheEntry> {
  const key = cacheKey(chunk);
  let cached = await getFromIndexedDB(key);
  if (cached) return cached;
  const memHit = memoryCache.get(key);
  if (memHit) return memHit;
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
    const memHit = memoryCache.get(key);
    if (memHit) {
      log("info", "缓存命中 (内存)");
      await playHexAudio(memHit.hex, opts.speed, memHit.format);
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
