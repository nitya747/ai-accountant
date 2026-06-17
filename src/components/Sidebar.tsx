"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Plus, MessageSquare, Trash2, LogOut, Menu, X } from "lucide-react";

interface SessionData {
  id: string;
  title: string;
  createdAt: string;
}

export function Sidebar() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchSessions();
    }

    const handleSessionUpdate = () => {
      fetchSessions();
    };

    window.addEventListener("session-updated", handleSessionUpdate);
    return () => {
      window.removeEventListener("session-updated", handleSessionUpdate);
    };
  }, [session, pathname]);

  const handleCreateSession = async () => {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (res.ok) {
        const newSession = await res.json();
        setSessions([newSession, ...sessions]);
        router.push(`/chat/${newSession.id}`);
        setIsMobileOpen(false);
      }
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this chat session?")) return;

    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSessions(sessions.filter((s) => s.id !== id));
        if (pathname === `/chat/${id}`) {
          router.push("/chat");
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800 text-zinc-200">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
          Corpus
        </span>
        <button
          onClick={handleCreateSession}
          className="p-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
          title="New Chat"
        >
          <Plus className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <button
          onClick={handleCreateSession}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-800/40 transition-all text-sm font-medium text-left"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>

        <div className="pt-4 pb-1 text-xs font-semibold text-zinc-500 px-3 uppercase tracking-wider font-sans">
          History
        </div>

        {loading ? (
          <div className="text-zinc-500 text-sm text-center py-4 font-sans">Loading chats...</div>
        ) : sessions.length === 0 ? (
          <div className="text-zinc-600 text-xs text-center py-4 italic font-sans">No chat history</div>
        ) : (
          sessions.map((s) => {
            const isActive = pathname === `/chat/${s.id}`;
            return (
              <Link
                key={s.id}
                href={`/chat/${s.id}`}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? "bg-emerald-950/30 text-emerald-300 border border-emerald-900/30"
                    : "hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? "text-emerald-400" : "text-zinc-500"}`} />
                  <span className="truncate text-left font-medium font-sans">{s.title}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(s.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-zinc-500 rounded-md hover:bg-zinc-800 transition-all"
                  title="Delete Chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Link>
            );
          })
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-zinc-800 flex items-center justify-between gap-3">
        <div className="min-w-0 flex flex-col font-sans">
          <span className="text-sm font-semibold text-zinc-200 truncate">
            {session?.user?.name || "User"}
          </span>
          <span className="text-xs text-zinc-500 truncate">
            {session?.user?.email}
          </span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Sign Out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between bg-zinc-900 border-b border-zinc-800 px-4 h-14 w-full sticky top-0 z-40 shrink-0">
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        <span className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
          Corpus
        </span>
        <button
          onClick={handleCreateSession}
          className="p-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-64 shrink-0 h-full">
        <SidebarContent />
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative w-64 max-w-xs h-full flex flex-col bg-zinc-900 shadow-2xl">
            <SidebarContent />
          </div>
        </div>
      )}
    </>
  );
}
