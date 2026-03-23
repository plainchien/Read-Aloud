import { useState, useRef, useCallback, useEffect } from "react";
import {
  Play,
  Pause,
  Languages,
  Edit3,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { WordCard } from "./components/WordCard";
import { fetchApi } from "../lib/fetchApi";
import { speak, stop as ttsStop, isDisabled as isTtsDisabled, prefetch } from "../lib/tts";

const SAMPLE_TEXTS = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.",
  "Curiosity is the wick in the candle of learning. Without curiosity, knowledge withers away.",
  "Language is the road map of a culture. It tells you where its people come from and where they are going.",
  "The limits of my language mean the limits of my world. Every language opens a new window to reality.",
];

const SPEEDS = [0.75, 1, 1.5];

/** Qwen TTS 为主，失败时自动切换 Web Speech 兜底 */

interface Token {
  token: string;
  isWord: boolean;
  startIndex: number;
  wordIndex: number; // index among words only
}

function tokenize(text: string): Token[] {
  const parts = text.split(/(\s+|[,\.!?;:"""''()\[\]{}\-—…]+)/);
  let pos = 0;
  let wIdx = 0;
  return parts
    .filter((p) => p.length > 0)
    .map((p) => {
      const isWord = /^[a-zA-Z'-]+$/.test(p) && p.length > 1;
      const t: Token = { token: p, isWord, startIndex: pos, wordIndex: isWord ? wIdx : -1 };
      if (isWord) wIdx++;
      pos += p.length;
      return t;
    });
}

type Screen = "input" | "read";

export default function App() {
  const [screen, setScreen] = useState<Screen>("input");
  const [inputText, setInputText] = useState("");
  const [processedText, setProcessedText] = useState("");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  // TTS
  const [speaking, setSpeaking] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentCharIndex, setCurrentCharIndex] = useState(-1);
  const uttRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Translation
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const handleSpeakRef = useRef<() => void>(() => {});
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find active token index based on current char position
  const activeTokenIndex = currentCharIndex >= 0
    ? (() => {
        // Find the word token whose startIndex matches or is closest <= charIndex
        let best = -1;
        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i].isWord && tokens[i].startIndex <= currentCharIndex) {
            best = i;
          }
        }
        return best;
      })()
    : -1;

  // Auto-scroll active word into view
  useEffect(() => {
    if (activeTokenIndex >= 0) {
      const el = wordRefs.current.get(activeTokenIndex);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeTokenIndex]);

  const handleProcess = () => {
    if (!inputText.trim()) return;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    // 进入朗读页时提前解锁音频，首次点击播放即可出声
    if (typeof window !== "undefined") {
      const w = window as Window & { __ttsUnlocked?: boolean };
      if (!w.__ttsUnlocked) {
        w.__ttsUnlocked = true;
        const silent = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
        silent.play().catch(() => {});
      }
    }
    const text = inputText.trim();
    setProcessedText(text);
    setTokens(tokenize(text));
    setTranslation("");
    setShowTranslation(false);
    setCurrentCharIndex(-1);
    setSpeaking(false);
    window.speechSynthesis?.cancel();
    ttsStop();
    setScreen("read");
  };

  useEffect(() => {
    if (screen !== "read" || !processedText || isTtsDisabled()) return;
    const timer = setTimeout(() => prefetch(processedText), 300);
    return () => clearTimeout(timer);
  }, [screen, processedText]);

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  const handleSpeak = useCallback(async () => {
    if (speaking) {
      clearRestartTimeout();
      ttsStop();
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      setCurrentCharIndex(-1);
      return;
    }

    // 在用户点击的同步上下文中解锁音频，避免浏览器自动播放策略拦截；必须 await 确保解锁完成后再做异步请求
    if (typeof window !== "undefined") {
      const w = window as Window & { __ttsUnlocked?: boolean };
      if (!w.__ttsUnlocked) {
        w.__ttsUnlocked = true;
        const silent = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
        await silent.play().catch(() => {});
      }
    }

    clearRestartTimeout();
    ttsStop();
    window.speechSynthesis?.cancel();

    setSpeaking(true);
    setCurrentCharIndex(-1);

    const useWebSpeech = () => {
      if (!("speechSynthesis" in window)) {
        setSpeaking(false);
        return;
      }
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(processedText);
      utt.lang = "en-US";
      utt.rate = speed;
      uttRef.current = utt;
      utt.onboundary = (e) => {
        if (e.name === "word") setCurrentCharIndex(e.charIndex);
      };
      utt.onend = () => {
        setSpeaking(false);
        setCurrentCharIndex(-1);
      };
      utt.onerror = () => {
        setSpeaking(false);
        setCurrentCharIndex(-1);
      };
      window.speechSynthesis.speak(utt);
    };

    if (!isTtsDisabled()) {
      try {
        await speak(processedText, { speed });
        setSpeaking(false);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "STOPPED") {
          setSpeaking(false);
          return;
        }
        if (msg === "AUDIO_BLOCKED") {
          setSpeaking(false);
          return;
        }
        if (msg !== "TTS_QUOTA" && msg !== "TTS_DISABLED") {
          alert(`TTS 错误：${msg}`);
        }
      }
    }

    useWebSpeech();
  }, [speaking, processedText, speed, clearRestartTimeout]);

  useEffect(() => {
    handleSpeakRef.current = handleSpeak;
  }, [handleSpeak]);

  useEffect(() => () => {
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
  }, []);

  // When speed changes mid-play, restart
  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    if (speaking) {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      ttsStop();
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      setCurrentCharIndex(-1);
      restartTimeoutRef.current = setTimeout(() => {
        restartTimeoutRef.current = null;
        handleSpeakRef.current();
      }, 120);
    }
  };

  // MyMemory limit ~500 chars/request; split into chunks to support 100+ words
  const CHUNK_SIZE = 450;
  const handleTranslate = useCallback(async () => {
    if (!processedText) return;
    if (translation) {
      setShowTranslation((v) => !v);
      return;
    }
    setTranslating(true);
    setShowTranslation(true);
    try {
      const chunks: string[] = [];
      let remain = processedText;
      while (remain.length > 0) {
        if (remain.length <= CHUNK_SIZE) {
          chunks.push(remain);
          break;
        }
        const dotIdx = remain.lastIndexOf(". ", CHUNK_SIZE);
        const spaceIdx = remain.lastIndexOf(" ", CHUNK_SIZE);
        let end = CHUNK_SIZE;
        if (dotIdx >= 0) end = dotIdx + 2;
        else if (spaceIdx >= 0) end = spaceIdx + 1;
        chunks.push(remain.slice(0, end).trim());
        remain = remain.slice(end).trim();
      }
      const results: string[] = [];
      for (const chunk of chunks) {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|zh`;
        const res = await fetchApi(url);
        const data = await res.json();
        results.push(data.responseData?.translatedText || "");
      }
      setTranslation(results.join(" ") || "翻译暂时无法使用。");
    } catch {
      setTranslation("翻译失败，请重试。");
    } finally {
      setTranslating(false);
    }
  }, [processedText, translation]);

  const handleEdit = () => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    window.speechSynthesis?.cancel();
    ttsStop();
    setSpeaking(false);
    setCurrentCharIndex(-1);
    setScreen("input");
  };

  const useSample = () => {
    const s = SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)];
    setInputText(s);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ─── INPUT SCREEN ──────────────────────────────────────────────
  if (screen === "input") {
    return (
      <div
        className="min-h-screen w-full flex flex-col min-h-[100dvh]"
        style={{
          background: "#f9f9f9",
          color: "#111",
          fontFamily: "system-ui,-apple-system,sans-serif",
        }}
      >
        <div className="flex-1 flex flex-col w-full max-w-xl mx-auto min-w-0 sm:px-2 md:max-w-2xl md:px-4">
        {/* Header */}
        <header
          className="flex items-center px-5"
          style={{
            paddingTop: "max(env(safe-area-inset-top), 20px)",
            paddingBottom: "16px",
            background: "#fff",
            borderBottom: "1px solid #efefef",
          }}
        >
          <h1
            style={{
              fontFamily: "'Metal', serif",
              fontSize: "clamp(1rem, 4.5vw, 1.25rem)",
              margin: 0,
              color: "#121212",
            }}
          >
            📰 Daily Read Aloud
          </h1>
        </header>

        {/* Textarea area */}
        <div className="flex-1 flex flex-col px-4 pt-4 pb-4 gap-3 overflow-y-auto sm:px-5 md:px-6">
          <div
            className="flex-1 rounded-2xl overflow-hidden flex flex-col"
            style={{ background: "#fff", border: "1px solid #ebebeb", minHeight: "260px" }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid #f0f0f0" }}
            >
              <span style={{ fontSize: "0.72rem", color: "#bbb", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                English Text
              </span>
              <button
                onClick={useSample}
                className="px-3 py-1 rounded-lg transition-all active:scale-95"
                style={{
                  background: "#f5f5f5",
                  border: "1px solid #ebebeb",
                  color: "#888",
                  fontSize: "0.73rem",
                }}
              >
                示例文本
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="在此输入或粘贴英文文本…"
              className="flex-1 resize-none outline-none px-4 py-4"
              style={{
                background: "transparent",
                color: "#1a1a1a",
                fontSize: "1rem",
                lineHeight: 1.75,
                caretColor: "#111",
                minHeight: "200px",
              }}
            />
            {inputText.trim() && (
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderTop: "1px solid #f0f0f0" }}
              >
                <span style={{ fontSize: "0.72rem", color: "#ccc" }}>
                  {inputText.trim().split(/\s+/).filter(Boolean).length} 个单词
                </span>
                <button
                  onClick={() => setInputText("")}
                  style={{ fontSize: "0.72rem", color: "#ccc", background: "transparent" }}
                >
                  清空
                </button>
              </div>
            )}
          </div>

          <p style={{ textAlign: "center", fontSize: "0.72rem", color: "#ccc" }}>
            点击单词可查看发音与释义
          </p>
        </div>

        {/* Bottom process button — thumb-friendly */}
        <div
          className="px-4 pt-3"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom), 20px)",
            background: "#fff",
            borderTop: "1px solid #efefef",
          }}
        >
          <button
            onClick={handleProcess}
            disabled={!inputText.trim()}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-98"
            style={{
              background: inputText.trim() ? "#111" : "#f0f0f0",
              color: inputText.trim() ? "#fff" : "#ccc",
              fontSize: "0.95rem",
              letterSpacing: "0.01em",
            }}
          >
            <Sparkles size={16} />
            开始阅读
          </button>
        </div>

        </div>

        <footer
          className="py-3 text-center"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
        >
          <a
            href="https://www.resparkx.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "0.7rem", color: "#AEAFB4", textDecoration: "none" }}
          >
            ©2026 ReSparkX by Xlll
          </a>
        </footer>
        <style>{`
          textarea::placeholder { color: #ccc; }
          * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
          html { -webkit-text-size-adjust: 100%; }
        `}</style>
      </div>
    );
  }

  // Bottom control bar height (fixed) for padding calculation
  const BOTTOM_BAR_HEIGHT = 140;

  // ─── READ SCREEN ───────────────────────────────────────────────
  return (
    <div
      className="min-h-screen w-full flex flex-col min-h-[100dvh]"
      style={{ background: "#f9f9f9", color: "#111", fontFamily: "system-ui,-apple-system,sans-serif" }}
    >
      <div className="flex-1 flex flex-col w-full max-w-xl mx-auto min-w-0 sm:px-2 md:max-w-2xl md:px-4">
      {/* Header */}
      <header
        className="flex items-center justify-between px-5"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 16px)",
          paddingBottom: "14px",
          background: "#fff",
          borderBottom: "1px solid #efefef",
        }}
      >
        <h1
          style={{
            fontFamily: "'Metal', serif",
            fontSize: "clamp(1rem, 4.5vw, 1.25rem)",
            margin: 0,
            color: "#121212",
          }}
        >
          📰 Daily Read Aloud
        </h1>
        <button
          onClick={handleEdit}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all active:scale-95"
          style={{
            background: "#f5f5f5",
            border: "1px solid #ebebeb",
            color: "#666",
            fontSize: "0.78rem",
          }}
        >
          <Edit3 size={13} />
          编辑
        </button>
      </header>

      {/* ── TOP AREA: scrollable text + translation ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: BOTTOM_BAR_HEIGHT }}
      >
        {/* Text card */}
        <div className="px-4 pt-4 pb-3 sm:px-5 md:px-6">
          <div
            className="rounded-2xl px-5 py-5 sm:px-6 sm:py-6 md:px-8 md:py-6"
            style={{ background: "#fff", border: "1px solid #ebebeb" }}
          >
            <p style={{ lineHeight: 2.3, fontSize: "clamp(0.95rem, 2.5vw, 1.1rem)", margin: 0 }}>
              {tokens.map((t, i) =>
                t.isWord ? (
                  <span
                    key={i}
                    ref={(el) => {
                      if (el) wordRefs.current.set(i, el);
                      else wordRefs.current.delete(i);
                    }}
                    onClick={() => setSelectedWord(t.token)}
                    style={{
                      color: activeTokenIndex === i ? "#111" : "#222",
                      background:
                        activeTokenIndex === i
                          ? "#f0f0f0"
                          : "transparent",
                      borderBottom:
                        activeTokenIndex === i
                          ? "2px solid #111"
                          : "1.5px solid #d8d8d8",
                      paddingBottom: "1px",
                      paddingLeft: "1px",
                      paddingRight: "1px",
                      borderRadius: "2px",
                      cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s",
                      display: "inline",
                    }}
                    onTouchStart={(e) => {
                      if (activeTokenIndex !== i)
                        (e.currentTarget as HTMLElement).style.background = "#f5f5f5";
                    }}
                    onTouchEnd={(e) => {
                      if (activeTokenIndex !== i)
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    {t.token}
                  </span>
                ) : (
                  <span key={i} style={{ color: "#aaa" }}>
                    {t.token}
                  </span>
                )
              )}
            </p>
          </div>
        </div>

        {/* Word count hint */}
        <div className="flex items-center justify-center gap-2 px-4 pb-3">
          <div style={{ height: "1px", background: "#ebebeb", flex: 1 }} />
          <span style={{ fontSize: "0.68rem", color: "#ccc", whiteSpace: "nowrap" }}>
            {tokens.filter((t) => t.isWord).length} 个单词，点击查看释义
          </span>
          <div style={{ height: "1px", background: "#ebebeb", flex: 1 }} />
        </div>

        {/* Translation panel */}
        <div className="px-4 pb-4 sm:px-5 md:px-6">
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid #ebebeb", background: "#fff" }}
          >
            <button
              onClick={handleTranslate}
              className="w-full flex items-center justify-between px-5 py-3.5 transition-all active:scale-98"
              style={{ background: "transparent" }}
            >
              <div className="flex items-center gap-2.5">
                {translating ? (
                  <Loader2 size={15} style={{ color: "#bbb", animation: "spin 1s linear infinite" }} />
                ) : (
                  <Languages size={15} style={{ color: "#bbb" }} />
                )}
                <span style={{ fontSize: "0.85rem", color: "#888" }}>
                  {translating ? "翻译中…" : translation ? "中文翻译" : "点击翻译"}
                </span>
              </div>
              {translation && !translating && (
                showTranslation
                  ? <ChevronUp size={15} style={{ color: "#ccc" }} />
                  : <ChevronDown size={15} style={{ color: "#ccc" }} />
              )}
            </button>

            {showTranslation && translation && (
              <>
                <div style={{ height: "1px", background: "#f0f0f0", margin: "0 16px" }} />
                <div className="px-5 py-4">
                  <p style={{ color: "#333", fontSize: "0.95rem", lineHeight: 1.85, margin: 0 }}>
                    {translation}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM CONTROLS — fixed at bottom ── */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#fff",
          borderTop: "1px solid #ebebeb",
          paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.05)",
          zIndex: 10,
        }}
      >
        <div className="w-full max-w-xl mx-auto px-4 sm:px-5 md:max-w-2xl md:px-6">
        {/* Speed selector */}
        <div className="flex items-center justify-between pt-4 pb-3">
          <span style={{ fontSize: "0.7rem", color: "#bbb", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            速度
          </span>
          <div className="flex items-center gap-1.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className="rounded-lg transition-all active:scale-90"
                style={{
                  padding: "5px 10px",
                  background: speed === s ? "#111" : "#f5f5f5",
                  color: speed === s ? "#fff" : "#888",
                  border: "1px solid " + (speed === s ? "#111" : "#ebebeb"),
                  fontSize: "0.75rem",
                  fontWeight: speed === s ? 600 : 400,
                  letterSpacing: "-0.01em",
                }}
              >
                {s === 1 ? "1×" : `${s}×`}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "#f4f4f4", margin: "0 0 12px" }} />

        {/* Main controls row */}
        <div className="flex items-center justify-center">
          {/* Play/Pause — central large button */}
          <button
            onClick={handleSpeak}
            className="flex items-center justify-center gap-2.5 transition-all active:scale-95"
            style={{
              background: "#111",
              color: "#fff",
              borderRadius: "999px",
              width: "100%",
              maxWidth: "320px",
              height: "56px",
              fontSize: "0.95rem",
              boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
              border: "none",
              position: "relative",
            }}
          >
            {speaking ? (
              <>
                {/* Animated bars */}
                <span className="flex items-end gap-px" style={{ height: "18px" }}>
                  {[1, 2, 3, 4].map((n) => (
                    <span
                      key={n}
                      style={{
                        width: "3px",
                        background: "#fff",
                        borderRadius: "2px",
                        height: `${8 + (n % 3) * 5}px`,
                        animation: `bar ${0.35 + n * 0.07}s ease-in-out infinite alternate`,
                        opacity: 0.85,
                      }}
                    />
                  ))}
                </span>
                <Pause size={18} fill="#fff" />
                <span>暂停</span>
              </>
            ) : (
              <>
                <Play size={18} fill="#fff" />
                <span>播放</span>
              </>
            )}
          </button>
        </div>
        </div>
      </div>

      {/* Word card */}
      {selectedWord && (
        <WordCard word={selectedWord} onClose={() => setSelectedWord(null)} />
      )}

      <footer
        className="py-3 text-center"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        <a
          href="https://www.resparkx.com/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.7rem", color: "#AEAFB4", textDecoration: "none" }}
        >
          ©2026 ReSparkX by Xlll
        </a>
      </footer>
      </div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes bar {
          from { transform: scaleY(0.5); }
          to { transform: scaleY(1.4); }
        }
        textarea::placeholder { color: #ccc; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  );
}
