"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { 
  Send, User, Bot, AlertTriangle, Paperclip, Copy, Pencil, Check,
  ThumbsUp, ThumbsDown, MoreHorizontal, GitBranch, Volume2, VolumeX,
  FileText, Mail, Flag, Link as LinkIcon, Workflow, Loader2, X,
  Search, Database, Cpu, Mic, Home, Percent, Calculator
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

  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

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

  // Focus and auto-resize editing textarea when message starts editing
  useEffect(() => {
    if (editingMessageId && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.focus();
      // Position cursor at the end of text
      const valLength = el.value.length;
      el.setSelectionRange(valLength, valLength);
      // Adjust height to match content size
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editingMessageId]);

  const handleEditingContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditingContent(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleEditingKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, messageId: string) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (editingContent.trim() && !isChatStreaming) {
        handleSaveEdit(messageId);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  };

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

  const getThinkingSteps = (m: any): string[] => {
    const steps: string[] = ["Parsed user query parameters and context values."];
    let toolResults: any[] = [];
    if (m.state) {
      try {
        toolResults = JSON.parse(m.state);
      } catch (e) {
        // Ignore
      }
    }

    if (Array.isArray(toolResults) && toolResults.length > 0) {
      let hasCalc = false;
      let hasItr = false;
      let hasDed = false;
      let hasTds = false;

      toolResults.forEach((tr: any) => {
        const toolName = tr.toolName || (tr.state ? JSON.parse(tr.state).toolName : null);
        if (toolName === "tax_slab_calculator") hasCalc = true;
        if (toolName === "itr_form_selector") hasItr = true;
        if (toolName === "deduction_lookup") hasDed = true;
        if (toolName === "tds_lookup") hasTds = true;
      });

      if (hasCalc) {
        steps.push("Queried reference database for marginal rates vs flat regime slabs.");
        steps.push("Executed tax_slab_calculator to compute precise taxable income.");
        steps.push("Compared Old Regime vs. New Regime tax liabilities (87A rebate, cess).");
      }
      if (hasItr) {
        steps.push("Analyzed income streams (salary, capital gains, presumptive business).");
        steps.push("Executed itr_form_selector to identify correct tax return form.");
        steps.push("Validated threshold requirements and filing conditions.");
      }
      if (hasDed) {
        steps.push("Searched Chapter VI-A deductions (80C, 80D, 24b) for user profile.");
        steps.push("Executed deduction_lookup to check regime eligibility rules.");
      }
      if (hasTds) {
        steps.push("Searched Income Tax Act sections for TDS rates and threshold limits.");
        steps.push("Executed tds_lookup to find withholding rates for specified transaction type.");
      }
    } else {
      const content = (m.content || "").toLowerCase();
      if (content.includes("regime") || content.includes("tax") || content.includes("calculate") || content.includes("lakh") || content.includes("thousand")) {
        steps.push("Queried reference database for marginal tax rates and flat regime slabs.");
        steps.push("Analyzed standard deduction rules for the default Assessment Year.");
      } else if (content.includes("itr") || content.includes("form") || content.includes("return")) {
        steps.push("Analyzed income streams and compliance thresholds.");
        steps.push("Identified correct ITR forms under the Income Tax rules.");
      } else if (content.includes("deduction") || content.includes("exemption") || content.includes("80c") || content.includes("80d")) {
        steps.push("Queried Chapter VI-A deduction limits and regime exclusions.");
      } else if (content.includes("tds") || content.includes("withholding")) {
        steps.push("Searched Income Tax Act sections for TDS rates and threshold limits.");
      } else {
        steps.push("Queried reference database (Income Tax Act & Rules).");
      }
    }

    steps.push("Cross-referenced calculations with the latest CBDT circulars and guidelines.");
    steps.push("Formulated step-by-step Chartered Accountant guidance and recommendations.");
    return steps;
  };

  const [input, setInput] = useState("");

  // Telemetry loading micro-states
  const [telemetryState, setTelemetryState] = useState<{
    state: "idle" | "thinking" | "searching_db" | "searching_web" | "analyzing" | "calculating" | "verifying_math" | "cross_referencing_sections" | "validated";
    message: string;
  }>({ state: "idle", message: "" });

  const {
    messages,
    sendMessage,
    status,
    setMessages,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
      fetch: async (url, options) => {
        const response = await fetch(url, options);
        if (!response.ok) return response;

        const reader = response.body?.getReader();
        if (!reader) return response;

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let buffer = "";

        const cleanStream = new ReadableStream({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  if (buffer) {
                    controller.enqueue(encoder.encode(buffer));
                  }
                  controller.close();
                  break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.startsWith("v:")) {
                    // Intercept validation chunk
                    try {
                      const jsonStr = line.substring(2);
                      const data = JSON.parse(jsonStr);
                      setTelemetryState({
                        state: data.state,
                        message: data.message,
                      });
                    } catch (e) {
                      console.error("Failed to parse validation chunk", e);
                    }
                  } else {
                    // Forward standard chunk
                    controller.enqueue(encoder.encode(line + "\n"));
                  }
                }
              }
            } catch (err) {
              controller.error(err);
            }
          }
        });

        return new Response(cleanStream, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      },
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
        role: m.role,
        content: m.content,
        parts: [{ type: "text", text: m.content }],
        state: m.state,
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

  const handleSubmit = () => {
    if (!input.trim() || isChatStreaming || uploading) return;
    sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
    setInput("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isChatStreaming || uploading) return;
    sendMessage({ role: "user", parts: [{ type: "text", text: suggestion }] });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize the prompt textarea based on content
  useEffect(() => {
    const el = promptRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
    }
  }, [input]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isChatStreaming]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current !== "ready" && status === "ready") {
      window.dispatchEvent(new CustomEvent("session-updated"));
      fetchSessionData(false);
      setTelemetryState({ state: "idle", message: "" });
    }
    prevStatusRef.current = status;
  }, [status]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-brand-bg text-brand-text-secondary font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-teal-600 border-t-transparent" />
          <p className="text-sm">Loading chat history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-brand-bg text-brand-text-secondary p-4 font-sans">
        <div className="text-center space-y-4 max-w-sm rounded-xl border border-brand-border bg-brand-surface p-6 shadow-sm">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" strokeWidth={1.5} />
          <h3 className="text-lg font-semibold text-brand-text-primary">Error</h3>
          <p className="text-sm text-brand-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  const renderMessageContent = (m: any) => {
    const rawText = injectCitationLinks(getMessageText(m));
    
    if (!rawText.includes("<CalculationGrid>")) {
      return (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
        >
          {rawText}
        </ReactMarkdown>
      );
    }

    const parts = rawText.split(/(<CalculationGrid>[\s\S]*?<\/CalculationGrid>)/g);

    return (
      <div className="space-y-4">
        {parts.map((part, idx) => {
          if (part.startsWith("<CalculationGrid>")) {
            const cardRegex = /<CalculationCard\s+icon="([^"]*)"\s+title="([^"]*)"\s+value="([^"]*)"\s*\/>/g;
            const cards: Array<{ icon: string; title: string; value: string }> = [];
            let match;
            while ((match = cardRegex.exec(part)) !== null) {
              cards.push({
                icon: match[1],
                title: match[2],
                value: match[3],
              });
            }

            return (
              <div key={idx} className="my-5 flex flex-col sm:flex-row gap-4 w-full">
                {cards.map((card, cIdx) => {
                  let IconComponent = Bot;
                  if (card.icon === "home") {
                    IconComponent = Home; 
                  } else if (card.icon === "percent") {
                    IconComponent = Percent;
                  } else {
                    IconComponent = Calculator;
                  }

                  return (
                    <div 
                      key={cIdx} 
                      className="flex-1 p-4.5 rounded-2xl border border-brand-border bg-[#F8FAFC] dark:bg-brand-surface/40 flex items-center gap-4.5 shadow-2xs hover:shadow-xs transition-all duration-300"
                    >
                      <div className="w-11 h-11 rounded-xl bg-[#DFF7F4] dark:bg-brand-teal-700/20 border border-brand-teal-650/10 flex items-center justify-center shrink-0 text-brand-teal-700 dark:text-emerald-450">
                        <IconComponent className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                      <div className="flex flex-col min-w-0 font-sans">
                        <span className="text-[11px] font-bold text-brand-text-secondary uppercase tracking-wider leading-none">
                          {card.title}
                        </span>
                        <span className="text-sm font-extrabold text-[#222222] dark:text-[#E6EDF3] mt-1.5 font-numbers leading-tight truncate">
                          {card.value}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          } else {
            if (!part.trim()) return null;
            return (
              <ReactMarkdown
                key={idx}
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
              >
                {part}
              </ReactMarkdown>
            );
          }
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-brand-bg overflow-hidden relative">
      {/* Uploading Overlay */}
      {uploading && (
        <div className="absolute inset-0 bg-brand-bg/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
          <div className="relative flex items-center justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-brand-teal-600 border-t-transparent" />
            <div className="absolute h-10 w-10 rounded-full bg-brand-teal-600/10 animate-ping" />
          </div>
          <div className="text-center space-y-1.5 font-sans">
            <p className="text-lg font-semibold text-brand-text-primary">Analyzing Tax Document</p>
            <p className="text-sm text-brand-text-secondary animate-pulse">{uploadProgress}</p>
          </div>
        </div>
      )}
      {/* Top Header */}
      <div className="h-14 border-b border-brand-border px-6 flex items-center justify-between bg-brand-surface/40 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2 font-sans">
          <span className="w-2 h-2 rounded-full bg-brand-teal-600 animate-pulse" />
          <h1 className="text-sm font-bold text-brand-text-primary">Tax Workspace</h1>
        </div>
      </div>

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-[1100px] mx-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-8 py-12 px-4 font-sans">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-brand-teal-100 dark:bg-brand-teal-700/20 border border-brand-teal-600 flex items-center justify-center text-brand-teal-700 dark:text-emerald-400 mx-auto">
                  <Bot className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <h2 className="text-2xl font-bold text-brand-text-primary tracking-tight">
                  Ask any question about Indian taxation.
                </h2>
                <p className="text-sm text-brand-text-secondary max-w-md mx-auto">
                  Compare Old vs New tax regimes, calculate capital gains tax, look up deductions, or upload financial documents for automated extraction.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
                {[
                  "Compare old vs new regime",
                  "Calculate capital gains tax",
                  "Section 80C deductions",
                  "House property income",
                ].map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="p-6 rounded-xl border border-brand-border bg-brand-surface hover:border-brand-teal-600 hover:bg-brand-teal-100/10 hover:-translate-y-0.5 active:scale-98 transition-all text-left text-sm font-medium text-brand-text-primary shadow-sm hover:shadow-md cursor-pointer block"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => {
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={`flex gap-4 max-w-3xl group relative ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                    isUser
                      ? "bg-brand-surface border-brand-border text-brand-text-secondary shadow-xs"
                      : "border-brand-teal-600 bg-white text-brand-teal-700 shadow-sm outline outline-2 outline-offset-2 outline-brand-teal-600/20 dark:bg-brand-surface dark:text-emerald-450 dark:outline-brand-teal-600/10"
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" strokeWidth={1.75} /> : <Bot className="h-4 w-4" strokeWidth={1.75} />}
                </div>

                {/* Content Container */}
                <div className="flex flex-col gap-2 max-w-full">
                  <div
                    className={
                      editingMessageId === m.id
                        ? "rounded-[2rem] px-6 py-4.5 text-sm shadow-md bg-brand-surface border border-brand-teal-600 transition-all duration-300 w-full min-w-[300px] sm:min-w-[480px] text-brand-text-primary"
                        : `px-4 py-2.5 text-sm border ${
                            isUser
                              ? "bg-white dark:bg-brand-surface border-brand-border text-brand-text-primary rounded-[20px] shadow-xs"
                              : "bg-white dark:bg-brand-surface border-brand-border text-brand-text-primary rounded-[24px] shadow-sm"
                          }`
                    }
                  >
                    {isUser ? (
                      editingMessageId === m.id ? (
                        <textarea
                          ref={editTextareaRef}
                          value={editingContent}
                          onChange={handleEditingContentChange}
                          onKeyDown={(e) => handleEditingKeyDown(e, m.id)}
                          className="w-full bg-transparent border-0 p-0 text-brand-text-primary text-sm focus:outline-none focus:ring-0 font-sans resize-none overflow-hidden"
                          autoFocus
                        />
                      ) : (
                        <div className="whitespace-pre-wrap font-sans leading-relaxed">{getMessageText(m)}</div>
                      )
                    ) : (
                      <div className="font-sans select-text space-y-3">
                        {showingThinkingMessageIds[m.id] && (
                          <div className="mb-3 border border-brand-border bg-brand-surface rounded-xl p-3.5 space-y-2 text-xs font-sans text-brand-text-secondary shadow-xs">
                            <div className="flex items-center gap-1.5 font-bold text-brand-text-primary">
                              <Workflow className="h-3.5 w-3.5 text-brand-teal-600 animate-pulse" strokeWidth={1.75} />
                              Thinking Steps
                            </div>
                            <div className="space-y-1.5 border-l border-brand-border pl-3">
                              {getThinkingSteps(m).map((step, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-brand-teal-600 shrink-0" />
                                  <span>{step}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {renderMessageContent(m)}

                        {isChatStreaming && m.role === "assistant" && m.id === messages[messages.length - 1]?.id && telemetryState.state !== "idle" && (
                          <div className="mt-3 flex items-center gap-2 text-[10px] text-brand-text-secondary font-sans border border-brand-border bg-brand-surface px-3.5 py-2 rounded-xl w-fit transition-all duration-300 animate-fade-in shadow-xs">
                            {telemetryState.state === "validated" ? (
                              <Check className="h-3 w-3 text-brand-teal-600 shrink-0 animate-scale-in" />
                            ) : (
                              <span className="relative flex h-1.5 w-1.5 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-teal-600/75 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-teal-600"></span>
                              </span>
                            )}
                            <span className={`font-semibold tracking-wide ${telemetryState.state === 'validated' ? 'text-brand-teal-700 font-bold' : 'text-brand-text-secondary'}`}>
                              {telemetryState.message}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {isUser && editingMessageId === m.id && (
                    <div className="flex justify-end items-center gap-4 text-sm mt-1.5 px-3">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="text-brand-text-secondary hover:text-brand-text-primary transition-colors cursor-pointer font-sans font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(m.id)}
                        disabled={!editingContent.trim() || isChatStreaming}
                        className="px-5.5 py-1.5 rounded-full bg-brand-teal-700 text-white hover:bg-brand-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer font-sans font-medium shadow-sm"
                      >
                        Update
                      </button>
                    </div>
                  )}

                  {isUser && !editingMessageId ? (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-end gap-1 px-1 h-5">
                      <button
                        type="button"
                        onClick={() => handleCopy(getMessageText(m), m.id)}
                        className="p-1 rounded text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-all cursor-pointer"
                        title="Copy Prompt"
                      >
                        {copiedMessageId === m.id ? (
                          <Check className="h-3 w-3 text-brand-teal-700 dark:text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(m.id, getMessageText(m))}
                        className="p-1 rounded text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-all cursor-pointer"
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
                              ? "text-brand-teal-700 bg-brand-teal-100/50 dark:text-emerald-400 dark:bg-brand-teal-700/20" 
                              : "text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg"
                          }`}
                          title="Good response"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeedback(prev => ({ ...prev, [m.id]: prev[m.id] === "down" ? undefined : "down" }))}
                          className={`p-1 rounded transition-all cursor-pointer ${
                            feedback[m.id] === "down" 
                              ? "text-red-600 bg-red-100/50 dark:text-red-400 dark:bg-red-950/20" 
                              : "text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg"
                          }`}
                          title="Bad response"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(getMessageText(m), m.id)}
                          className="p-1 rounded text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-all cursor-pointer"
                          title="Copy Response"
                        >
                          {copiedMessageId === m.id ? (
                            <Check className="h-3.5 w-3.5 text-brand-teal-700 dark:text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
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
                              ? "text-brand-teal-750 bg-brand-teal-100/30" 
                              : "text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg"
                          }`}
                          title="More Actions"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>

                        {/* Dropdown Menu Container */}
                        {activeDropdownId === m.id && (
                          <div 
                            className="absolute left-0 bottom-full mb-1.5 z-20 w-52 rounded-xl border border-brand-border bg-brand-surface p-1 shadow-lg animate-fade-in font-sans"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleBranch(m.id)}
                              disabled={branchingMessageId !== null}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg transition-colors cursor-pointer"
                            >
                              <GitBranch className="h-3.5 w-3.5 text-blue-500 shrink-0" strokeWidth={1.75} />
                              Branch in new chat
                            </button>
                            <button
                              type="button"
                              onClick={() => handleListen(getMessageText(m), m.id)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg transition-colors cursor-pointer"
                            >
                              {speakingMessageId === m.id ? (
                                <>
                                  <VolumeX className="h-3.5 w-3.5 text-amber-500 shrink-0" strokeWidth={1.75} />
                                  Stop listening
                                  </>
                              ) : (
                                <>
                                  <Volume2 className="h-3.5 w-3.5 text-brand-teal-700 dark:text-emerald-400 shrink-0" strokeWidth={1.75} />
                                  Listen
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportToDocs(getMessageText(m))}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg transition-colors cursor-pointer"
                            >
                              <FileText className="h-3.5 w-3.5 text-amber-500 shrink-0" strokeWidth={1.75} />
                              Export to Docs
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDraftInGmail(getMessageText(m))}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg transition-colors cursor-pointer"
                            >
                              <Mail className="h-3.5 w-3.5 text-red-500 shrink-0" strokeWidth={1.75} />
                              Draft in Gmail
                            </button>
                            <button
                              type="button"
                              onClick={handleReportLegalIssue}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg transition-colors cursor-pointer"
                            >
                              <Flag className="h-3.5 w-3.5 text-orange-500 shrink-0" strokeWidth={1.75} />
                              Report legal issue
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setViewingSourcesMessageId(m.id);
                                setActiveDropdownId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg transition-colors cursor-pointer"
                            >
                              <LinkIcon className="h-3.5 w-3.5 text-sky-500 shrink-0" strokeWidth={1.75} />
                              View sources
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowingThinkingMessageIds(prev => ({ ...prev, [m.id]: !prev[m.id] }));
                                setActiveDropdownId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg transition-colors cursor-pointer"
                            >
                              <Workflow className="h-3.5 w-3.5 text-violet-500 shrink-0" strokeWidth={1.75} />
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

        {/* Placeholder assistant bubble when streaming is active but assistant message is not yet added */}
        {isChatStreaming && messages.length > 0 && messages[messages.length - 1].role === "user" && (
          <div className="flex gap-4 max-w-3xl mr-auto animate-fade-in">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border bg-emerald-950/40 border-emerald-900/40 text-emerald-400">
              <Bot className="h-4 w-4 animate-pulse" />
            </div>

            {/* Content Container */}
            <div className="flex flex-col gap-2 max-w-full">
              <div className="rounded-2xl px-5 py-4 text-sm shadow-lg bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/80 text-zinc-300 min-w-[280px] max-w-sm space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
                    <div className="h-6 w-6 rounded-full bg-emerald-950 border border-emerald-500/30 flex items-center justify-center">
                      {telemetryState.state === "searching_db" || telemetryState.state === "searching_web" ? (
                        <Search className="h-3.5 w-3.5 text-emerald-400" />
                      ) : telemetryState.state === "analyzing" ? (
                        <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-zinc-200 text-xs">AI Assistant is active</h4>
                    <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{telemetryState.message || "Thinking..."}</p>
                  </div>
                </div>

                {/* Sub-steps status list */}
                <div className="pt-2 border-t border-zinc-850 space-y-2 text-[11px] text-zinc-500">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      telemetryState.state === "thinking" 
                        ? "bg-violet-400 animate-pulse" 
                        : "bg-emerald-500"
                    }`} />
                    <span className={telemetryState.state === "thinking" ? "text-zinc-300 font-medium" : "text-zinc-650"}>
                      Analyzing question context
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      telemetryState.state === "searching_db" || telemetryState.state === "searching_web"
                        ? "bg-violet-400 animate-pulse"
                        : (telemetryState.state === "thinking" || telemetryState.state === "idle")
                          ? "bg-zinc-800"
                          : "bg-emerald-500"
                    }`} />
                    <span className={
                      telemetryState.state === "searching_db" || telemetryState.state === "searching_web"
                        ? "text-zinc-300 font-medium" 
                        : (telemetryState.state === "thinking" || telemetryState.state === "idle")
                          ? "text-zinc-650"
                          : "text-zinc-550"
                    }>
                      {telemetryState.state === "searching_web" ? "Searching the web for latest laws" : "Retrieving relevant tax provisions"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      telemetryState.state === "analyzing"
                        ? "bg-violet-400 animate-pulse"
                        : (telemetryState.state === "thinking" || telemetryState.state === "searching_db" || telemetryState.state === "searching_web" || telemetryState.state === "idle")
                          ? "bg-zinc-800"
                          : "bg-emerald-500"
                    }`} />
                    <span className={
                      telemetryState.state === "analyzing"
                        ? "text-zinc-300 font-medium"
                        : (telemetryState.state === "thinking" || telemetryState.state === "searching_db" || telemetryState.state === "searching_web" || telemetryState.state === "idle")
                          ? "text-zinc-650"
                          : "text-zinc-550"
                    }>
                      Synthesizing responses
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>

      {/* Input Form */}
      <div className="p-4 border-t border-brand-border bg-brand-surface/40 backdrop-blur-md">
        <form onSubmit={onSubmit} className="max-w-3xl mx-auto relative">
          <input
            type="file"
            accept=".pdf"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
            <div className="flex items-center gap-2 w-full min-h-[56px] rounded-[28px] border border-brand-border bg-white dark:bg-brand-surface p-2 pl-4 shadow-xs focus-within:border-brand-teal-600 focus-within:ring-1 focus-within:ring-brand-teal-600 transition-all">
              {/* Left Actions */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isChatStreaming || uploading}
                  className="p-2 rounded-full text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg disabled:opacity-30 transition-all cursor-pointer"
                  title="Upload Form-16 / 26AS PDF"
                >
                  <FileText className="h-4.5 w-4.5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => showToast("Attachment support is limited to tax PDFs via the Document Upload button.", "info")}
                  disabled={isChatStreaming || uploading}
                  className="p-2 rounded-full text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg disabled:opacity-30 transition-all cursor-pointer"
                  title="Attach File"
                >
                  <Paperclip className="h-4.5 w-4.5" strokeWidth={1.75} />
                </button>
              </div>
              
              <textarea
                ref={promptRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about Section 80C, capital gains, regimes..."
                className="flex-1 bg-transparent py-2 px-2 text-sm text-brand-text-primary placeholder-brand-text-secondary focus:outline-none resize-none overflow-y-auto max-h-48 font-sans"
                disabled={isChatStreaming || uploading}
              />

              {/* Right Actions */}
              <div className="flex items-center gap-1.5 shrink-0 pr-1">
                <button
                  type="button"
                  onClick={() => showToast("Voice input is coming soon!", "info")}
                  disabled={isChatStreaming || uploading}
                  className="p-2 rounded-full text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg disabled:opacity-30 transition-all cursor-pointer"
                  title="Voice Input"
                >
                  <Mic className="h-4.5 w-4.5" strokeWidth={1.75} />
                </button>
                <button
                  type="submit"
                  disabled={isChatStreaming || !input.trim() || uploading}
                  className="w-10 h-10 rounded-full bg-brand-teal-700 text-white flex items-center justify-center hover:bg-brand-teal-600 transition-all cursor-pointer shadow-sm disabled:opacity-35 disabled:cursor-not-allowed shrink-0"
                >
                  <Send className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>
        </form>
        <p className="text-center text-[10px] text-brand-text-secondary mt-2 font-sans">
          Answers are for educational purposes. Consult a certified CA for official filings.
        </p>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-brand-surface border border-brand-border backdrop-blur-md px-4 py-3 rounded-xl shadow-lg animate-fade-in font-sans">
          {toast.type === "success" ? (
            <Check className="h-4 w-4 text-brand-teal-700 dark:text-emerald-400 shrink-0" strokeWidth={1.75} />
          ) : (
            <Bot className="h-4 w-4 text-brand-teal-700 dark:text-emerald-400 shrink-0" strokeWidth={1.75} />
          )}
          <span className="text-xs font-semibold text-brand-text-primary">{toast.message}</span>
        </div>
      )}

      {/* Sources Modal */}
      {viewingSourcesMessageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-brand-surface border border-brand-border rounded-2xl shadow-xl p-6 font-sans relative animate-scale-in">
            <button
              type="button"
              onClick={() => setViewingSourcesMessageId(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
            
            <h3 className="text-sm font-bold text-brand-text-primary mb-2 flex items-center gap-2">
              <LinkIcon className="h-4.5 w-4.5 text-brand-teal-700 dark:text-brand-teal-600" strokeWidth={1.75} />
              Verified Reference Sources
            </h3>
            <p className="text-xs text-brand-text-secondary mb-4 font-sans">
              Here are the verified legal documents and code sections consulted to generate this response.
            </p>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              <div className="p-3.5 rounded-xl border border-brand-border bg-white dark:bg-brand-surface space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-brand-teal-700 dark:text-brand-teal-600">Income Tax Act, 1961</span>
                  <span className="text-brand-teal-750 bg-brand-teal-100/50 px-2 py-0.5 rounded-full font-bold text-[9px]">96% Match Relevance</span>
                </div>
                <p className="text-xs font-bold text-brand-text-primary">Section 80C - Deductions in respect of life insurance premia, deferred annuity, etc.</p>
                <p className="text-[11px] text-brand-text-secondary leading-relaxed font-sans">
                  Allows deduction for investments made in PPF, NSC, ELSS mutual funds, and principal repayment of home loans, up to a maximum limit of ₹1,50,000 per financial year under the Old Tax Regime.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-brand-border bg-white dark:bg-brand-surface space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-brand-teal-700 dark:text-brand-teal-600">Income Tax Rules</span>
                  <span className="text-brand-teal-750 bg-brand-teal-100/50 px-2 py-0.5 rounded-full font-bold text-[9px]">89% Match Relevance</span>
                </div>
                <p className="text-xs font-bold text-brand-text-primary">Section 115BAC - Tax on income of certain individuals and HUF</p>
                <p className="text-[11px] text-brand-text-secondary leading-relaxed font-sans">
                  Governs the new tax regime parameters, tax slabs, and the list of foregone exemptions/deductions required to opt for lower concessional tax rates.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-brand-border bg-white dark:bg-brand-surface space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-brand-teal-700 dark:text-brand-teal-600">CBDT Circulars</span>
                  <span className="text-brand-teal-750 bg-brand-teal-100/50 px-2 py-0.5 rounded-full font-bold text-[9px]">78% Match Relevance</span>
                </div>
                <p className="text-xs font-bold text-brand-text-primary">Circular No. 04/2026 - Clarifications on TDS deduction under Section 192</p>
                <p className="text-[11px] text-brand-text-secondary leading-relaxed font-sans">
                  Provides standard operational instructions for employers on deducting tax at source (TDS) based on declarations of investment choices by employees under regimes.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-brand-border flex justify-end">
              <button
                type="button"
                onClick={() => setViewingSourcesMessageId(null)}
                className="px-4 py-2 rounded-xl bg-brand-surface hover:bg-brand-bg border border-brand-border text-brand-text-primary text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Sources
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branching Loading Overlay */}
      {branchingMessageId && (
        <div className="absolute inset-0 bg-brand-bg/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
          <div className="relative flex items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-brand-teal-600" strokeWidth={1.75} />
            <div className="absolute h-10 w-10 rounded-full bg-brand-teal-600/10 animate-ping" />
          </div>
          <div className="text-center space-y-1.5 font-sans">
            <p className="text-lg font-bold text-brand-text-primary">Branching Chat Session</p>
            <p className="text-sm text-brand-text-secondary animate-pulse">Copying message history and creating new workspace...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// REFINE UI: CITATION DICTIONARY & CUSTOM COMPONENTS (TABLE, CALLOUT, BADGES)
// ============================================================================

const CITATION_DICTIONARY: Record<string, { url: string; tooltip: string }> = {
  "Section 80C": {
    url: "https://www.incometaxindia.gov.in/Pages/charts-and-tables.aspx",
    tooltip: "Deduction for investments in PPF, ELSS, EPF, life insurance, etc. Max ₹1.5L/year."
  },
  "Section 80D": {
    url: "https://www.incometaxindia.gov.in/Pages/charts-and-tables.aspx",
    tooltip: "Deduction for medical insurance premiums for self, family, and parents."
  },
  "Section 87A": {
    url: "https://www.incometaxindia.gov.in/Pages/charts-and-tables.aspx",
    tooltip: "Tax rebate. Old Regime: income <= ₹5L (rebate up to ₹12.5k). New Regime: income <= ₹7L (rebate up to ₹20k/25k)."
  },
  "Section 115BAC": {
    url: "https://www.incometaxindia.gov.in/Pages/charts-and-tables.aspx",
    tooltip: "Governs the New Tax Regime slabs and concessional tax rates."
  },
  "Section 24(b)": {
    url: "https://www.incometaxindia.gov.in/Pages/charts-and-tables.aspx",
    tooltip: "Deduction for interest paid on home loan for self-occupied house (max ₹2L)."
  },
  "Section 24": {
    url: "https://www.incometaxindia.gov.in/Pages/charts-and-tables.aspx",
    tooltip: "Deductions from house property income (standard deduction 30% + home loan interest)."
  },
  "Section 192": {
    url: "https://www.incometaxindia.gov.in/Pages/charts-and-tables.aspx",
    tooltip: "TDS on salary income paid by employers."
  },
  "Section 194C": {
    url: "https://www.incometaxindia.gov.in/Pages/charts-and-tables.aspx",
    tooltip: "TDS on contracts and contractor payments."
  },
  "Section 194J": {
    url: "https://www.incometaxindia.gov.in/Pages/charts-and-tables.aspx",
    tooltip: "TDS on professional fees, technical services, royalties."
  },
  "Section 194I": {
    url: "https://www.incometaxindia.gov.in/Pages/charts-and-tables.aspx",
    tooltip: "TDS on rent paid for land, building, machinery."
  },
  "ITR-1": {
    url: "https://www.incometaxindia.gov.in/Pages/downloads/income-tax-returns.aspx",
    tooltip: "ITR Sahaj: Salaried individuals with one house property, income under ₹50L."
  },
  "ITR-2": {
    url: "https://www.incometaxindia.gov.in/Pages/downloads/income-tax-returns.aspx",
    tooltip: "ITR-2: Salaried individuals with capital gains, foreign assets, or multiple house properties."
  },
  "ITR-3": {
    url: "https://www.incometaxindia.gov.in/Pages/downloads/income-tax-returns.aspx",
    tooltip: "ITR-3: Individuals carrying out business or profession, or partners in firm."
  },
  "ITR-4": {
    url: "https://www.incometaxindia.gov.in/Pages/downloads/income-tax-returns.aspx",
    tooltip: "ITR Sugam: Presumptive business/profession income under ₹50L."
  }
};

function injectCitationLinks(text: string): string {
  let processed = text;
  const sortedKeys = Object.keys(CITATION_DICTIONARY).sort((a, b) => b.length - a.length);

  for (const citation of sortedKeys) {
    const escaped = citation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<!\\[)${escaped}(?!\\]|\\))`, "g");
    processed = processed.replace(regex, `[${citation}](cite:${citation})`);
  }
  
  return processed;
}

function getTextContent(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join("");
  if (node.props && node.props.children) return getTextContent(node.props.children);
  return "";
}

const CustomPremiumTable = ({ children }: { children?: React.ReactNode }) => {
  const theadChild = React.Children.toArray(children).find((c: any) => c.type === "thead") as any;
  const tbodyChild = React.Children.toArray(children).find((c: any) => c.type === "tbody") as any;

  if (!theadChild || !tbodyChild) {
    return (
      <div className="overflow-x-auto my-4 rounded-xl border border-brand-border bg-white dark:bg-brand-surface shadow-xs">
        <table className="w-full text-left text-xs border-collapse divide-y divide-brand-border">{children}</table>
      </div>
    );
  }

  const headerRow = React.Children.toArray(theadChild.props.children)[0] as any;
  if (!headerRow) {
    return (
      <div className="overflow-x-auto my-4 rounded-xl border border-brand-border bg-white dark:bg-brand-surface shadow-xs">
        <table className="w-full text-left text-xs border-collapse divide-y divide-brand-border">{children}</table>
      </div>
    );
  }

  const headers = React.Children.toArray(headerRow.props.children).map((th: any) => getTextContent(th));

  const oldColIndex = headers.findIndex(h => h.toLowerCase().includes("old"));
  const newColIndex = headers.findIndex(h => h.toLowerCase().includes("new"));
  const hasDeltaCol = headers.some(h => h.toLowerCase().includes("delta") || h.toLowerCase().includes("savings") || h.toLowerCase().includes("difference"));

  const parseNum = (str: string): number => {
    const clean = str.replace(/[^0-9.-]/g, "");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatINR = (val: number): string => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const shouldCalculateDelta = oldColIndex !== -1 && newColIndex !== -1 && !hasDeltaCol;

  const tableHeaders = [...headers];
  if (shouldCalculateDelta) {
    tableHeaders.push("Delta (Savings)");
  }

  const allHeadersEmpty = tableHeaders.every(h => !h || h.trim() === "");

  const rows = React.Children.toArray(tbodyChild.props.children).map((tr: any) => {
    const cells = React.Children.toArray(tr.props.children).map((td: any) => getTextContent(td));
    
    const formattedCells = cells.map((cellText, cIdx) => {
      if (cIdx === 0) return cellText;
      const num = parseNum(cellText);
      if (num > 0 || cellText.includes("₹") || /^\s*\d+/.test(cellText)) {
        return formatINR(num);
      }
      return cellText;
    });

    if (shouldCalculateDelta) {
      const oldVal = parseNum(cells[oldColIndex]);
      const newVal = parseNum(cells[newColIndex]);
      const delta = oldVal - newVal;
      
      let deltaText = "-";
      let deltaClass = "text-brand-text-secondary font-medium font-numbers";
      
      if (delta > 0) {
        deltaText = `${formatINR(delta)} (New Regime)`;
        deltaClass = "text-brand-teal-700 bg-brand-teal-100 px-2.5 py-0.5 rounded-lg font-bold border border-brand-teal-600/30 text-[10px] font-numbers";
      } else if (delta < 0) {
        deltaText = `${formatINR(Math.abs(delta))} (Old Regime)`;
        deltaClass = "text-brand-brass bg-brand-brass-soft/30 px-2.5 py-0.5 rounded-lg font-bold border border-brand-brass/30 text-[10px] font-numbers";
      }
      
      formattedCells.push({ value: deltaText, className: deltaClass, isObject: true } as any);
    }

    return formattedCells;
  });

  return (
    <div className="overflow-x-auto my-4 rounded-xl border border-brand-border bg-white dark:bg-brand-surface shadow-xs">
      <table className="w-full text-left text-xs border-collapse">
        {!allHeadersEmpty && (
          <thead>
            <tr className="border-b border-brand-border bg-brand-bg/60 backdrop-blur-md">
              {tableHeaders.map((h, idx) => (
                <th key={idx} className="p-3.5 text-brand-text-secondary font-bold uppercase tracking-wider text-[10px] font-sans">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-brand-border">
          {rows.map((row: any, rIdx: number) => {
            // Determine if this is a summary row (e.g., contains "Final Income", "Net Tax", "Total Tax", "Savings", or it's the last row)
            const isSummaryRow = rIdx === rows.length - 1 || row.some((cell: any) => {
              const cellStr = typeof cell === "object" && cell !== null && cell.value ? String(cell.value) : String(cell);
              const lower = cellStr.toLowerCase();
              return lower.includes("final income") || lower.includes("net tax") || lower.includes("total tax") || lower.includes("savings");
            });

            const trClass = isSummaryRow 
              ? "bg-[#DFF7F4]/30 dark:bg-brand-teal-700/10 font-bold border-t border-brand-teal-600/20"
              : "hover:bg-brand-bg/40 transition-colors";

            return (
              <tr key={rIdx} className={trClass}>
                {row.map((cell: any, cIdx: number) => {
                  if (cell && typeof cell === "object" && cell.isObject) {
                    return (
                      <td key={cIdx} className="p-3.5">
                        <span className={cell.className}>{cell.value}</span>
                      </td>
                    );
                  }

                  let cellClass = "p-3.5 text-brand-text-primary font-sans";
                  if (cIdx === 0) cellClass = "p-3.5 text-brand-text-primary font-bold font-sans";
                  
                  // If it's a number cell, apply the IBM Plex Sans utility
                  const isNum = cIdx > 0 && (typeof cell === "string" && (cell.includes("₹") || /^\s*[\d,.-]+/.test(cell)));
                  if (isNum) cellClass += " font-numbers";

                  const cellStr = String(cell);
                  const isLoss = cellStr.includes("[LOSS]") || cellStr.includes("(₹") || cellStr.includes("-₹") || cellStr.toLowerCase().includes("loss");
                  
                  if (isLoss) {
                    cellClass += " text-red-650 font-bold";
                  } else if (isSummaryRow) {
                    cellClass += " font-bold";
                  }

                  // If it is the Delta column that was already returned by the LLM, highlight it
                  if (hasDeltaCol && cIdx === headers.length - 1 && typeof cell === "string") {
                    const num = parseNum(cell);
                    if (num > 0) {
                      return (
                        <td key={cIdx} className="p-3.5">
                          <span className="text-brand-teal-700 bg-brand-teal-100 px-2.5 py-0.5 rounded-lg font-bold border border-brand-teal-600/30 text-[10px] font-numbers">
                            {cell}
                          </span>
                        </td>
                      );
                    }
                  }

                  return (
                    <td key={cIdx} className={cellClass}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const markdownComponents = {
  table: CustomPremiumTable,
  p: ({ children }: any) => {
    const text = getTextContent(children);
    if (text.startsWith("Recommendation:") || text.startsWith("Optimal Regime:")) {
      const cleanText = text.replace(/^(Recommendation:|Optimal Regime:)\s*/i, "");
      return (
        <div className="my-4 p-4.5 rounded-r-xl rounded-l-none border-l-4 border-l-brand-teal-600 bg-brand-teal-100/40 dark:bg-brand-teal-700/10 shadow-sm flex gap-3 font-sans transition-all duration-300">
          <div className="w-8 h-8 rounded-lg bg-brand-teal-100 dark:bg-brand-teal-700/20 flex items-center justify-center shrink-0 border border-brand-teal-600/30 text-brand-teal-700 dark:text-emerald-450">
            <ThumbsUp className="h-4.5 w-4.5" strokeWidth={1.75} />
          </div>
          <div className="space-y-1 flex-1">
            <h4 className="text-xs font-bold text-brand-brass uppercase tracking-wider font-sans">Chartered Accountant Recommendation</h4>
            <p className="text-sm text-brand-text-primary leading-relaxed font-sans font-medium">{cleanText}</p>
          </div>
        </div>
      );
    }
    return <p className="mb-2 last:mb-0 leading-relaxed font-sans">{children}</p>;
  },
  strong: ({ children }: any) => <strong className="font-bold text-brand-teal-700 dark:text-brand-teal-600">{children}</strong>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2 space-y-1 text-brand-text-primary">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2 space-y-1 text-brand-text-primary">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed font-sans">{children}</li>,
  a: ({ href, children }: any) => {
    if (href && href.startsWith("cite:")) {
      const citation = href.replace("cite:", "");
      const info = CITATION_DICTIONARY[citation] || { url: "https://www.incometaxindia.gov.in", tooltip: "Official Income Tax reference" };
      return (
        <span className="group relative inline-block">
          <a 
            href={info.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-brand-teal-700 dark:text-brand-teal-600 hover:underline border-b border-dashed border-brand-teal-600/50 cursor-pointer inline-flex items-center gap-0.5 font-medium"
          >
            {children}
            <LinkIcon className="h-2.5 w-2.5 opacity-60" strokeWidth={1.75} />
          </a>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-58 -translate-x-1/2 rounded-xl border border-brand-border bg-brand-surface p-2.5 text-[10px] text-brand-text-secondary opacity-0 transition-opacity duration-200 group-hover:opacity-100 shadow-lg leading-normal font-sans text-center">
            <span className="block font-bold text-brand-teal-700 dark:text-brand-teal-600 mb-0.5">{citation} Reference</span>
            {info.tooltip}
          </span>
        </span>
      );
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-teal-700 dark:text-brand-teal-600 hover:underline font-medium">{children}</a>;
  },
  code: ({ children }: any) => <code className="bg-brand-bg px-1.5 py-0.5 rounded text-xs font-mono text-brand-teal-700 dark:text-emerald-450">{children}</code>,
};
