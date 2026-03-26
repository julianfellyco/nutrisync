"use client";

import { useState, useRef, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "What should I eat to hit my protein goals today?",
  "Can you review my meals from this week?",
  "What's a good pre-workout snack?",
  "How can I reduce bloating?",
];

function TypingDots() {
  return (
    <div className="flex gap-1 items-center py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function ClientChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setLoading(true);
    try {
      const res = await api.ai.chat(trimmed, { session_id: sessionId });
      setSessionId(res.session_id);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      setMessages((m) => [...m, { role: "assistant", content: `_Error: ${msg}_` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="h-14 border-b border-black/[0.07] flex items-center px-6 shrink-0">
        <div>
          <p className="text-sm font-semibold text-ink">AI Nutritionist</p>
          <p className="text-2xs text-ink-3">Powered by Claude</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-sage-50 flex items-center justify-center">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#3D6B4F" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-ink mb-1">Ask your nutritionist anything</p>
              <p className="text-xs text-ink-3 max-w-xs">I have access to your meal history and nutrition goals to give personalised advice.</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-xs px-4 py-3 rounded-lg bg-surface border border-black/[0.07] text-ink-2 hover:border-sage-200 hover:text-ink transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[75%] bg-sage-500 text-white text-sm rounded-2xl rounded-br-sm px-4 py-2.5"
                  : "max-w-[80%] bg-surface border border-black/[0.07] text-sm rounded-2xl rounded-bl-sm px-4 py-3 prose-nutrition"
              }
            >
              {m.role === "assistant" ? (
                <ReactMarkdown>{m.content}</ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface border border-black/[0.07] rounded-2xl rounded-bl-sm px-4 py-3">
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-black/[0.07] px-6 py-4">
        <div className="flex gap-3 items-end max-w-2xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about nutrition, meal ideas, or your goals…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-black/[0.10] bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-sage-300 focus:border-sage-400 transition-shadow"
            style={{ maxHeight: 120 }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="shrink-0 w-10 h-10 rounded-xl bg-sage-500 disabled:bg-sage-200 flex items-center justify-center transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-center text-2xs text-ink-4 mt-2">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
