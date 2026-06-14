"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, User, Bot, AlertTriangle } from "lucide-react";

export default function SessionChatPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = React.use(params);
  const sessionId = unwrappedParams.id;

  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getMessageText = (m: UIMessage): string => {
    return m.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
  };

  useEffect(() => {
    const fetchSessionData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) {
          throw new Error("Failed to load chat history");
        }
        const data = await res.json();
        const formatted = data.messages.map((m: any) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          parts: [{ type: "text", text: m.content }],
        }));
        setInitialMessages(formatted);
      } catch (err: any) {
        setError(err.message || "Failed to load chat session");
      } finally {
        setLoading(false);
      }
    };

    fetchSessionData();
  }, [sessionId]);

  const [input, setInput] = useState("");

  const {
    messages,
    sendMessage,
    status,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
    }),
    messages: initialMessages,
  });

  const isChatStreaming = status === "streaming" || status === "submitted";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isChatStreaming) return;
    sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
    setInput("");
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isChatStreaming]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950 text-zinc-400 font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-sm">Loading chat history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950 text-zinc-400 p-4 font-sans">
        <div className="text-center space-y-4 max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
          <h3 className="text-lg font-semibold text-white">Error</h3>
          <p className="text-sm text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-full bg-zinc-950 overflow-hidden">
      {/* Top Header */}
      <div className="h-14 border-b border-zinc-900 px-6 flex items-center justify-between bg-zinc-900/40 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2 font-sans">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-sm font-semibold text-zinc-200">Chatting with Tax AI</h1>
        </div>
      </div>

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4 font-sans">
            <Bot className="h-12 w-12 text-emerald-400 animate-bounce" />
            <h2 className="text-xl font-bold text-white">Ask your Indian Tax questions</h2>
            <p className="text-sm text-zinc-500">
              I can help you compute taxes under the Old vs New Regimes, identify the correct ITR forms, and guide you on Section 80C/80D deductions.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={`flex gap-4 max-w-3xl ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                    isUser
                      ? "bg-zinc-850 border-zinc-700 text-zinc-300"
                      : "bg-emerald-950/40 border-emerald-900/40 text-emerald-400"
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                {/* Content */}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                    isUser
                      ? "bg-zinc-800 text-zinc-100"
                      : "bg-zinc-900/40 border border-zinc-850 text-zinc-200"
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap font-sans">{getMessageText(m)}</div>
                  ) : (
                    <div className="font-sans select-text space-y-2">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold text-emerald-400">{children}</strong>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">{children}</a>,
                          code: ({ children }) => <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs font-mono text-emerald-350">{children}</code>,
                        }}
                      >
                        {getMessageText(m)}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-zinc-900 bg-zinc-950">
        <form onSubmit={onSubmit} className="max-w-3xl mx-auto relative">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about Section 80C, capital gains, regimes..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3.5 pr-12 text-sm text-zinc-100 placeholder-zinc-500 shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
            disabled={isChatStreaming}
          />
          <button
            type="submit"
            disabled={isChatStreaming || !input.trim()}
            className="absolute right-2.5 top-2.5 p-2 rounded-lg bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:opacity-30 disabled:hover:bg-emerald-500 transition-all cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="text-center text-[10px] text-zinc-650 mt-2 font-sans">
          Answers are for educational purposes. Consult a certified CA for official filings.
        </p>
      </div>
    </div>
  );
}
