import { useEffect, useState } from "react";
import { X, Volume2, Loader2 } from "lucide-react";
import { fetchApi } from "../../lib/fetchApi";
import { siteApiUrl } from "../../lib/siteApi";

interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string }[];
  }[];
}

interface WordCardProps {
  word: string;
  onClose: () => void;
}

const POS_COLORS: Record<string, { bg: string; text: string }> = {
  noun:        { bg: "#f0f4ff", text: "#4060cc" },
  verb:        { bg: "#fff0f3", text: "#cc3355" },
  adjective:   { bg: "#f0fff5", text: "#2a9955" },
  adverb:      { bg: "#fffbf0", text: "#cc8800" },
  preposition: { bg: "#f5f0ff", text: "#7755cc" },
  conjunction: { bg: "#fff0f8", text: "#cc5599" },
  pronoun:     { bg: "#f0f9ff", text: "#0080bb" },
  interjection:{ bg: "#fff5f0", text: "#cc5533" },
};

export function WordCard({ word, onClose }: WordCardProps) {
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [zhDefinition, setZhDefinition] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const cleanWord = word.replace(/[^a-zA-Z'-]/g, "").toLowerCase();

  useEffect(() => {
    setLoading(true);
    setError(false);
    setEntry(null);
    setZhDefinition("");
    fetchApi(siteApiUrl("api/dictionary-proxy", { word: cleanWord }))
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setEntry(data[0]);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [cleanWord]);

  // Fetch concise Chinese definition
  useEffect(() => {
    if (!cleanWord) return;
    fetchApi(siteApiUrl("api/translate-proxy", { q: cleanWord, langpair: "en|zh" }))
      .then((r) => r.json())
      .then((data) => {
        const zh = data?.responseData?.translatedText?.trim();
        setZhDefinition(zh || "");
      })
      .catch(() => {});
  }, [cleanWord]);

  const speakWord = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(cleanWord);
    utt.lang = "en-US";
    utt.rate = 0.85;
    setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  };

  const phonetic =
    entry?.phonetic ||
    entry?.phonetics?.find((p) => p.text)?.text ||
    "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md flex flex-col"
        style={{
          background: "#fff",
          borderRadius: "24px 24px 0 0",
          border: "1px solid #ebebeb",
          borderBottom: "none",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.1)",
          maxHeight: "75vh",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "#e8e8e8" }} />
        </div>

        {/* Word header */}
        <div className="flex items-start justify-between px-6 pt-3 pb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2
                style={{
                  fontSize: "1.5rem",
                  color: "#111",
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                {cleanWord}
              </h2>
              <button
                onClick={speakWord}
                className="flex items-center justify-center rounded-full transition-all active:scale-90"
                style={{
                  width: 36,
                  height: 36,
                  background: speaking ? "#111" : "#f5f5f5",
                  border: "1px solid " + (speaking ? "#111" : "#ebebeb"),
                  flexShrink: 0,
                }}
              >
                {speaking ? (
                  <span className="flex items-end gap-px" style={{ height: 14 }}>
                    {[1, 2, 3].map((n) => (
                      <span
                        key={n}
                        style={{
                          width: 2.5,
                          borderRadius: 2,
                          background: "#fff",
                          height: `${5 + n * 3}px`,
                          animation: `wbar ${0.3 + n * 0.1}s ease-in-out infinite alternate`,
                        }}
                      />
                    ))}
                  </span>
                ) : (
                  <Volume2 size={15} color="#888" />
                )}
              </button>
            </div>
            {phonetic && (
              <p style={{ fontSize: "0.82rem", color: "#aaa", margin: "4px 0 0", letterSpacing: "0.02em" }}>
                {phonetic}
              </p>
            )}
            {zhDefinition && (
              <p style={{ fontSize: "0.9rem", color: "#333", margin: "6px 0 0", fontWeight: 500 }}>
                中文：{zhDefinition}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full transition-all active:scale-90"
            style={{
              width: 32,
              height: 32,
              background: "#f5f5f5",
              border: "1px solid #ebebeb",
              flexShrink: 0,
              marginLeft: 8,
              marginTop: 2,
            }}
          >
            <X size={14} color="#999" />
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#f4f4f4", margin: "0 24px" }} />

        {/* Content */}
        <div className="overflow-y-auto px-6 py-5" style={{ flex: 1 }}>
          {loading && (
            <div className="flex items-center justify-center py-10 gap-2.5">
              <Loader2 size={16} style={{ color: "#ccc", animation: "wspin 1s linear infinite" }} />
              <span style={{ fontSize: "0.83rem", color: "#ccc" }}>查询中…</span>
            </div>
          )}

          {error && !loading && (
            <div className="py-8 text-center">
              <p style={{ color: "#ccc", fontSize: "0.85rem" }}>
                未找到 "{cleanWord}" 的释义
              </p>
            </div>
          )}

          {entry && !loading && (
            <div className="flex flex-col gap-5">
              {entry.meanings.slice(0, 3).map((meaning, i) => {
                const posStyle = POS_COLORS[meaning.partOfSpeech] || { bg: "#f5f5f5", text: "#888" };
                return (
                  <div key={i}>
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="px-2.5 py-0.5 rounded-full"
                        style={{
                          background: posStyle.bg,
                          color: posStyle.text,
                          fontSize: "0.7rem",
                          letterSpacing: "0.05em",
                          fontWeight: 600,
                        }}
                      >
                        {meaning.partOfSpeech}
                      </span>
                      <div style={{ height: 1, background: "#f0f0f0", flex: 1 }} />
                    </div>

                    <div className="flex flex-col gap-3.5">
                      {meaning.definitions.slice(0, 2).map((def, j) => (
                        <div key={j} className="flex gap-3">
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#d4d4d4",
                              flexShrink: 0,
                              marginTop: 8,
                            }}
                          />
                          <div>
                            <p style={{ color: "#222", fontSize: "0.9rem", lineHeight: 1.65, margin: 0 }}>
                              {def.definition}
                            </p>
                            {def.example && (
                              <p
                                style={{
                                  color: "#aaa",
                                  fontSize: "0.8rem",
                                  lineHeight: 1.6,
                                  margin: "6px 0 0",
                                  paddingLeft: 12,
                                  borderLeft: "2px solid #ebebeb",
                                  fontStyle: "italic",
                                }}
                              >
                                "{def.example}"
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ height: "max(env(safe-area-inset-bottom), 16px)" }} />
      </div>

      <style>{`
        @keyframes wbar {
          from { transform: scaleY(0.5); }
          to { transform: scaleY(1.5); }
        }
        @keyframes wspin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
