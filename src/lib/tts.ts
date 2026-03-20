/**
 * TTS 语音合成模块
 * 通过 Vercel Serverless 代理调用 MiniMax，API Key 不暴露给前端
 */

// 通过 Vercel Serverless 代理，API Key 仅在服务端
const TTS_API_URL = "/api/tts";
const DB_NAME = "ReadAloudTTS";
const DB_STORE = "audio";
const DB_VERSION = 1;
const CACHE_MAX = 100;

export interface SpeakOptions {
  /** 播放倍速 0.75–1.5，默认 1 */
  speed?: number;
  /** MiniMax 音色 ID，默认 English_Gentle-voiced_man */
  voice_id?: string;
  /** 音量 0–2，默认 1 */
  vol?: number;
  /** 音调 -12–12，默认 0 */
  pitch?: number;
}

const DEFAULT_OPTIONS: Required<SpeakOptions> = {
  speed: 1,
  voice_id: "English_Gentle-voiced_man",
  vol: 1,
  pitch: 0,
};

let ttsDisabled = false;
let currentAudio: HTMLAudioElement | null = null;
let rejectCurrentPlay: (() => void) | null = null;

// 内存缓存：IndexedDB 未就绪时的备用
const memoryCache = new Map<string, { hex: string; ts: number }>();

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

async function getFromIndexedDB(key: string): Promise<{ hex: string; ts: number } | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        resolve(row ? { hex: row.hex, ts: row.ts } : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    log("warn", "IndexedDB 读取失败", err);
    return null;
  }
}

async function saveToIndexedDB(key: string, hex: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      store.put({ key, hex, ts: Date.now() });
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

function playHexAudio(hex: string, playbackRate = 1): Promise<void> {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  rejectCurrentPlay = null;

  return new Promise((resolve, reject) => {
    try {
      const bytes = hexToBytes(hex);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
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
      audio.play().catch((err) => {
        cleanup();
        reject(err);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

async function fetchFromAPI(
  text: string,
  voiceId: string,
  vol: number,
  pitch: number
): Promise<string> {
  log("info", "调用 TTS 代理", { text: text.slice(0, 50) + "..." });

  const res = await fetch(TTS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voiceId, vol, pitch }),
  });

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
    if (err === "MINIMAX_QUOTA") {
      ttsDisabled = true;
      log("warn", "MiniMax 用量超限，已禁用");
    } else {
      log("error", "TTS 代理错误", { status: res.status, msg });
    }
    throw new Error(err || msg);
  }

  const audioHex = data?.hex;
  if (!audioHex || typeof audioHex !== "string") {
    log("error", "未获取到音频数据");
    throw new Error("未获取到音频数据");
  }

  return audioHex;
}

/**
 * 朗读文本
 * @param text 待朗读的文本
 * @param options 可选：speed、voice_id、vol、pitch
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  const t = text.trim();
  if (!t) return;

  if (ttsDisabled) {
    throw new Error("MINIMAX_DISABLED");
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const key = cacheKey(t);

  // 1. 优先从 IndexedDB 读取
  let cached = await getFromIndexedDB(key);
  if (cached) {
    log("info", "缓存命中 (IndexedDB)");
    await playHexAudio(cached.hex, opts.speed);
    return;
  }

  // 2. 内存缓存
  cached = memoryCache.get(key);
  if (cached) {
    log("info", "缓存命中 (内存)");
    await playHexAudio(cached.hex, opts.speed);
    return;
  }

  // 3. 调用 API
  const hex = await fetchFromAPI(t, opts.voice_id, opts.vol, opts.pitch);

  // 4. 写入缓存
  const entry = { hex, ts: Date.now() };
  memoryCache.set(key, entry);
  await saveToIndexedDB(key, hex);
  trimIndexedDB();

  // 5. 播放
  await playHexAudio(hex, opts.speed);
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

/** 是否因用量超限已禁用 */
export function isDisabled(): boolean {
  return ttsDisabled;
}
