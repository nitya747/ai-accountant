"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, User, Bot, AlertTriangle, Paperclip } from "lucide-react";

export default function SessionChatPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = React.use(params);
  const sessionId = unwrappedParams.id;

  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getMessageText = (m: any): string => {
    if (typeof m.content === "string" && m.content) {
      return m.content;
    }
    if (Array.isArray(m.parts)) {
      return m.parts
        .map((part: any) => (part.type === "text" ? part.text : ""))
        .join("");
    }
    return m.content || "";
  };

  const [input, setInput] = useState("");

  const {
    messages,
    sendMessage,
    status,
    setMessages,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
    }),
    messages: initialMessages,
  });

  const fetchSessionData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
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
      setMessages(formatted);
    } catch (err: any) {
      setError(err.message || "Failed to load chat session");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionData(true);
  }, [sessionId]);

  const isChatStreaming = status === "streaming" || status === "submitted";

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("File size exceeds the 10MB limit.");
      return;
    }

    if (file.type !== "application/pdf") {
      alert("Only PDF documents are supported.");
      return;
    }

    try {
      setUploading(true);
      setUploadProgress("Reading and uploading PDF...");
      
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionId", sessionId);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to upload document");
      }

      setUploadProgress("Analyzing document & extracting tax metrics...");
      await fetchSessionData(false);
      window.dispatchEvent(new CustomEvent("session-updated"));
      
    } catch (err: any) {
      alert(err.message || "An error occurred during file upload.");
    } finally {
      setUploading(false);
      setUploadProgress("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isChatStreaming || uploading) return;
    sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
    setInput("");
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isChatStreaming]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current !== "ready" && status === "ready") {
      window.dispatchEvent(new CustomEvent("session-updated"));
    }
    prevStatusRef.current = status;
  }, [status]);

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
    <div className="flex flex-col flex-1 h-full bg-zinc-950 overflow-hidden relative">
      {/* Uploading Overlay */}
      {uploading && (
        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
          <div className="relative flex items-center justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <div className="absolute h-10 w-10 rounded-full bg-emerald-500/10 animate-ping" />
          </div>
          <div className="text-center space-y-1.5 font-sans">
            <p className="text-lg font-semibold text-white">Analyzing Tax Document</p>
            <p className="text-sm text-zinc-400 animate-pulse">{uploadProgress}</p>
          </div>
        </div>
      )}
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
            type="file"
            accept=".pdf"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isChatStreaming || uploading}
            className="absolute left-2.5 top-2.5 p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 disabled:opacity-30 transition-all cursor-pointer"
            title="Upload Form-16 / 26AS PDF"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about Section 80C, capital gains, regimes..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/40 py-3.5 pl-12 pr-12 text-sm text-zinc-100 placeholder-zinc-500 shadow-inner focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
            disabled={isChatStreaming || uploading}
          />
          <button
            type="submit"
            disabled={isChatStreaming || !input.trim() || uploading}
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
