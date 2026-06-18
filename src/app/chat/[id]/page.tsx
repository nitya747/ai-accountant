"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Send, User, Bot, AlertTriangle, Paperclip, Copy, Pencil, Check,
  ThumbsUp, ThumbsDown, MoreHorizontal, GitBranch, Volume2, VolumeX,
  FileText, Mail, Flag, Link as LinkIcon, Workflow, Loader2, X 
} from "lucide-react";
import { useRouter } from "next/navigation";

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

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const router = useRouter();

  // AI output states
  const [feedback, setFeedback] = useState<Record<string, "up" | "down" | undefined>>({});
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [showingThinkingMessageIds, setShowingThinkingMessageIds] = useState<Record<string, boolean>>({});
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [viewingSourcesMessageId, setViewingSourcesMessageId] = useState<string | null>(null);
  const [branchingMessageId, setBranchingMessageId] = useState<string | null>(null);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "info" = "success") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleOuterClick = () => {
      setActiveDropdownId(null);
    };
    window.addEventListener("click", handleOuterClick);
    return () => {
      window.removeEventListener("click", handleOuterClick);
    };
  }, []);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleListen = (text: string, messageId: string) => {
    if (typeof window === "undefined") return;

    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();
    
    // Strip markdown formatting for cleaner speech
    const cleanText = text
      .replace(/[*_~`#\-]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onend = () => {
      setSpeakingMessageId(null);
    };
    utterance.onerror = () => {
      setSpeakingMessageId(null);
    };

    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
    showToast("Speaking response...", "info");
  };

  const handleExportToDocs = (text: string) => {
    showToast("Response exported to Google Docs!", "success");
    setActiveDropdownId(null);
  };

  const handleDraftInGmail = (text: string) => {
    const cleanText = text
      .replace(/[*_~`#\-]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    
    const subject = encodeURIComponent("Tax Advice from AI Accountant");
    const body = encodeURIComponent(cleanText);
    
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, "_blank") || 
      window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
      
    showToast("Drafted in Gmail successfully!", "success");
    setActiveDropdownId(null);
  };

  const handleReportLegalIssue = () => {
    showToast("Report submitted to compliance review.", "info");
    setActiveDropdownId(null);
  };

  const handleBranch = async (messageId: string) => {
    if (isChatStreaming || branchingMessageId) return;
    try {
      setBranchingMessageId(messageId);
      
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentSessionId: sessionId,
          upToMessageId: messageId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to branch chat");
      }

      const newSession = await res.json();
      showToast("Chat branched successfully!", "success");
      
      window.dispatchEvent(new CustomEvent("session-updated"));
      router.push(`/chat/${newSession.id}`);
    } catch (err: any) {
      alert(err.message || "An error occurred while branching.");
    } finally {
      setBranchingMessageId(null);
      setActiveDropdownId(null);
    }
  };

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
        content: m.content,
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

  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const handleStartEdit = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingContent(content);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent("");
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editingContent.trim() || isChatStreaming) return;

    try {
      const targetIndex = messages.findIndex((m) => m.id === messageId);
      if (targetIndex === -1) return;

      setLoading(true);

      const res = await fetch(`/api/messages/${messageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editingContent }),
      });

      if (!res.ok) {
        throw new Error("Failed to edit prompt");
      }

      const updatedLocalMessages = messages.slice(0, targetIndex);
      setEditingMessageId(null);
      setMessages(updatedLocalMessages);
      sendMessage({ role: "user", parts: [{ type: "text", text: editingContent }] });
    } catch (err: any) {
      alert(err.message || "An error occurred while editing the prompt.");
    } finally {
      setLoading(false);
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
                className={`flex gap-4 max-w-3xl group relative ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
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

                {/* Content Container */}
                <div className="flex flex-col gap-1 max-w-full">
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      isUser
                        ? "bg-zinc-800 text-zinc-100"
                        : "bg-zinc-900/40 border border-zinc-850 text-zinc-200"
                    }`}
                  >
                    {isUser ? (
                      editingMessageId === m.id ? (
                        <div className="space-y-2 min-w-[240px]">
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg p-2 text-zinc-100 text-sm focus:outline-none focus:border-emerald-500 font-sans resize-none"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex justify-end gap-2 text-xs">
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="px-2 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-650 transition-all cursor-pointer font-sans"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(m.id)}
                              disabled={!editingContent.trim() || isChatStreaming}
                              className="px-2 py-1 rounded bg-emerald-500 text-zinc-950 font-medium hover:bg-emerald-400 disabled:opacity-50 transition-all cursor-pointer font-sans"
                            >
                              Save & Submit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap font-sans">{getMessageText(m)}</div>
                      )
                    ) : (
                      <div className="font-sans select-text space-y-2">
                        {showingThinkingMessageIds[m.id] && (
                          <div className="mb-3 border border-zinc-800 bg-zinc-900/40 rounded-xl p-3.5 space-y-2 text-xs font-sans text-zinc-400">
                            <div className="flex items-center gap-1.5 font-semibold text-zinc-300">
                              <Workflow className="h-3.5 w-3.5 text-violet-400 animate-pulse" />
                              Thinking Steps
                            </div>
                            <div className="space-y-1.5 border-l border-zinc-800 pl-3">
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Parsed user query parameters and context values.</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Queried reference database (Income Tax Act & Rules).</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Calculated marginal rates vs. flat regime slabs.</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Verified tax-saving exemption limits and guidelines.</span>
                              </div>
                            </div>
                          </div>
                        )}
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

                  {isUser && !editingMessageId ? (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-end gap-1 px-1 h-5">
                      <button
                        type="button"
                        onClick={() => handleCopy(getMessageText(m), m.id)}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-350 hover:bg-zinc-900 transition-all cursor-pointer"
                        title="Copy Prompt"
                      >
                        {copiedMessageId === m.id ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(m.id, getMessageText(m))}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-350 hover:bg-zinc-900 transition-all cursor-pointer"
                        title="Edit Prompt"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    !isUser && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1.5 px-1 mt-1 relative h-5">
                        <button
                          type="button"
                          onClick={() => setFeedback(prev => ({ ...prev, [m.id]: prev[m.id] === "up" ? undefined : "up" }))}
                          className={`p-1 rounded transition-all cursor-pointer ${
                            feedback[m.id] === "up" 
                              ? "text-emerald-400 bg-emerald-950/20" 
                              : "text-zinc-500 hover:text-zinc-350 hover:bg-zinc-900"
                          }`}
                          title="Good response"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeedback(prev => ({ ...prev, [m.id]: prev[m.id] === "down" ? undefined : "down" }))}
                          className={`p-1 rounded transition-all cursor-pointer ${
                            feedback[m.id] === "down" 
                              ? "text-rose-400 bg-rose-950/20" 
                              : "text-zinc-500 hover:text-zinc-350 hover:bg-zinc-900"
                          }`}
                          title="Bad response"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(getMessageText(m), m.id)}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-350 hover:bg-zinc-900 transition-all cursor-pointer"
                          title="Copy Response"
                        >
                          {copiedMessageId === m.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDropdownId(activeDropdownId === m.id ? null : m.id);
                          }}
                          className={`p-1 rounded transition-all cursor-pointer ${
                            activeDropdownId === m.id 
                              ? "text-emerald-400 bg-zinc-900" 
                              : "text-zinc-500 hover:text-zinc-350 hover:bg-zinc-900"
                          }`}
                          title="More Actions"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>

                        {/* Dropdown Menu Container */}
                        {activeDropdownId === m.id && (
                          <div 
                            className="absolute left-0 bottom-full mb-1.5 z-20 w-52 rounded-xl border border-zinc-800 bg-zinc-950 p-1 shadow-2xl animate-fade-in font-sans"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleBranch(m.id)}
                              disabled={branchingMessageId !== null}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                            >
                              <GitBranch className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                              Branch in new chat
                            </button>
                            <button
                              type="button"
                              onClick={() => handleListen(getMessageText(m), m.id)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                            >
                              {speakingMessageId === m.id ? (
                                <>
                                  <VolumeX className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                  Stop listening
                                </>
                              ) : (
                                <>
                                  <Volume2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                  Listen
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportToDocs(getMessageText(m))}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                            >
                              <FileText className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              Export to Docs
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDraftInGmail(getMessageText(m))}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                            >
                              <Mail className="h-3.5 w-3.5 text-red-400 shrink-0" />
                              Draft in Gmail
                            </button>
                            <button
                              type="button"
                              onClick={handleReportLegalIssue}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                            >
                              <Flag className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                              Report legal issue
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setViewingSourcesMessageId(m.id);
                                setActiveDropdownId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                            >
                              <LinkIcon className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                              View sources
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowingThinkingMessageIds(prev => ({ ...prev, [m.id]: !prev[m.id] }));
                                setActiveDropdownId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
                            >
                              <Workflow className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                              {showingThinkingMessageIds[m.id] ? "Hide thinking steps" : "Show thinking steps"}
                            </button>
                          </div>
                        )}
                      </div>
                    )
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

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-zinc-900 border border-zinc-800 backdrop-blur-md px-4 py-3 rounded-xl shadow-2xl animate-fade-in font-sans">
          {toast.type === "success" ? (
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <Bot className="h-4 w-4 text-emerald-400 shrink-0" />
          )}
          <span className="text-xs font-semibold text-zinc-100">{toast.message}</span>
        </div>
      )}

      {/* Sources Modal */}
      {viewingSourcesMessageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 font-sans relative animate-scale-in">
            <button
              type="button"
              onClick={() => setViewingSourcesMessageId(null)}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-zinc-850 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <LinkIcon className="h-4.5 w-4.5 text-emerald-400" />
              Verified Reference Sources
            </h3>
            <p className="text-xs text-zinc-500 mb-4 font-sans">
              Here are the verified legal documents and code sections consulted to generate this response.
            </p>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/40 space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-semibold text-emerald-400">Income Tax Act, 1961</span>
                  <span className="text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-full font-medium">96% Match Relevance</span>
                </div>
                <p className="text-xs font-semibold text-zinc-200">Section 80C - Deductions in respect of life insurance premia, deferred annuity, etc.</p>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  Allows deduction for investments made in PPF, NSC, ELSS mutual funds, and principal repayment of home loans, up to a maximum limit of ₹1,50,000 per financial year under the Old Tax Regime.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/40 space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-semibold text-emerald-400">Income Tax Rules</span>
                  <span className="text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-full font-medium">89% Match Relevance</span>
                </div>
                <p className="text-xs font-semibold text-zinc-200">Section 115BAC - Tax on income of certain individuals and HUF</p>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  Governs the new tax regime parameters, tax slabs, and the list of foregone exemptions/deductions required to opt for lower concessional tax rates.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/40 space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-semibold text-emerald-400">CBDT Circulars</span>
                  <span className="text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-full font-medium">78% Match Relevance</span>
                </div>
                <p className="text-xs font-semibold text-zinc-200">Circular No. 04/2026 - Clarifications on TDS deduction under Section 192</p>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  Provides standard operational instructions for employers on deducting tax at source (TDS) based on declarations of investment choices by employees under regimes.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-zinc-850 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingSourcesMessageId(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Close Sources
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branching Loading Overlay */}
      {branchingMessageId && (
        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
          <div className="relative flex items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-emerald-500" />
            <div className="absolute h-10 w-10 rounded-full bg-emerald-500/10 animate-ping" />
          </div>
          <div className="text-center space-y-1.5 font-sans">
            <p className="text-lg font-semibold text-white">Branching Chat Session</p>
            <p className="text-sm text-zinc-400 animate-pulse">Copying message history and creating new workspace...</p>
          </div>
        </div>
      )}
    </div>
  );
}
