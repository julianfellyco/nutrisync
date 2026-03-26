"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError, Client } from "@/lib/api";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "Suggest a high-protein breakfast",
  "Create a gluten-free dinner",
  "Review this week's macro balance",
];

export default function ClientChatPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();

  const [client, setClient]       = useState<Client | null>(null);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.clients.get(clientId).then(setClient).catch(() => null);
  }, [clientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    setError(null);

    setMessages((prev) => [...prev, { role: "user", content }]);
    setLoading(true);

    try {
      const res = await api.ai.chat(content, {
        session_id: sessionId,
        on_behalf_of_client_id: clientId,
      });
      setSessionId(res.session_id);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "AI service unavailable");
      setMessages((prev) => prev.slice(0, -1)); // remove optimistic user msg
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const empty = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col h-screen">

      {/* Header */}
      <div className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-black/[0.06] bg-surface">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-ink-3 hover:text-ink transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div>
            <p className="text-sm font-medium text-ink leading-tight">
              AI Nutritionist{client ? ` — ${client.name}` : ""}
            </p>
            <p className="text-2xs text-ink-3">Powered by Claude</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setSessionId(undefined); }}
            className="text-xs text-ink-3 hover:text-rose-600 transition-colors"
          >
            New session
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {empty ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-10 h-10 rounded-xl bg-sage-50 flex items-center justify-center mb-4">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-sage-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-ink mb-1">Smart Nutritionist</p>
            <p className="text-xs text-ink-3 max-w-xs mb-6">
              Ask about meal ideas, macro calculations, or dietary guidance for{" "}
              {client?.name ?? "this client"}.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-2 bg-white border border-black/[0.08] rounded hover:border-sage-300 hover:bg-sage-50 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-sage-100 flex items-center justify-center mr-2.5 mt-0.5 shrink-0">
                    <span className="text-sage-600 text-2xs font-semibold">AI</span>
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-sage-500 text-white"
                      : "bg-white border border-black/[0.07] text-ink"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose-nutrition">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-sage-100 flex items-center justify-center mr-2.5 mt-0.5 shrink-0">
                  <span className="text-sage-600 text-2xs font-semibold">AI</span>
                </div>
                <div className="bg-white border border-black/[0.07] rounded-xl px-4 py-3">
                  <span className="flex gap-1 items-center">
                    {[0, 150, 300].map((d) => (
                      <span
                        key={d}
                        className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <p className="text-center text-xs text-rose-500 py-2">{error}</p>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-black/[0.06] bg-surface px-6 py-4">
        <div className="max-w-2xl mx-auto flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about nutrition, meal ideas, macros…"
            className="flex-1 resize-none bg-canvas border border-black/[0.1] rounded-lg px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-sage-400 focus:bg-white transition-all leading-relaxed"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="btn btn-primary shrink-0"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Send
          </button>
        </div>
        <p className="text-center text-2xs text-ink-4 mt-2">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
