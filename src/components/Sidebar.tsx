"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Plus, MessageSquare, Trash2, LogOut, Menu, X, ChevronLeft, ChevronRight, Sun, Moon } from "lucide-react";

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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Load state from localStorage on client side
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Load state from localStorage on client side
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved !== null) {
      setIsCollapsed(saved === "true");
    }
  }, []);

  const toggleCollapse = () => {
    const newVal = !isCollapsed;
    setIsCollapsed(newVal);
    localStorage.setItem("sidebar-collapsed", String(newVal));
  };

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

  const SidebarContent = ({ isMobile = false }) => {
    const collapsed = !isMobile && isCollapsed;

    return (
      <div className="flex flex-col h-full bg-brand-surface border-r border-brand-border text-brand-text-primary transition-all duration-300">
        {/* Sidebar Header */}
        <div className={`p-4 border-b border-brand-border flex items-center justify-between ${collapsed ? "flex-col gap-4 px-2" : ""}`}>
          {collapsed ? (
            <span className="text-xl font-extrabold text-brand-teal-700 dark:text-brand-teal-600 tracking-wider">
              C.
            </span>
          ) : (
            <span className="text-xl font-extrabold text-brand-teal-700 dark:text-brand-teal-600 tracking-tight">
              Corpus
            </span>
          )}
          
          <div className={`flex items-center gap-1.5 ${collapsed ? "flex-col" : ""}`}>
            {!isMobile && (
              <button
                onClick={toggleCollapse}
                className="p-1.5 rounded-lg border border-brand-border hover:bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary transition-colors cursor-pointer"
                title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4" strokeWidth={1.75} /> : <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />}
              </button>
            )}
            <button
              onClick={handleCreateSession}
              className="p-1.5 rounded-lg border border-brand-border hover:bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary transition-colors cursor-pointer"
              title="New Chat"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div className={`flex-1 overflow-y-auto p-3 space-y-1 ${collapsed ? "px-1.5" : ""}`}>
          {!collapsed ? (
            <button
              onClick={handleCreateSession}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-brand-border text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-teal-600 hover:bg-brand-teal-100/30 transition-all text-sm font-medium text-left cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              New Chat
            </button>
          ) : (
            <button
              onClick={handleCreateSession}
              className="w-full flex items-center justify-center p-2.5 rounded-xl border border-dashed border-brand-border text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-teal-600 hover:bg-brand-teal-100/30 transition-all cursor-pointer"
              title="New Chat"
            >
              <Plus className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
            </button>
          )}

          {!collapsed && (
            <div className="pt-4 pb-1 text-[10px] font-bold text-brand-text-secondary px-3 uppercase tracking-wider font-sans">
              Recent Chats
            </div>
          )}

          {loading ? (
            <div className="text-brand-text-secondary text-xs text-center py-4 font-sans">
              {collapsed ? "..." : "Loading chats..."}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-brand-text-secondary/60 text-[11px] text-center py-4 italic font-sans">
              {collapsed ? "" : "No chat history"}
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = pathname === `/chat/${s.id}`;
              return (
                <Link
                  key={s.id}
                  href={`/chat/${s.id}`}
                  className={`group flex items-center justify-between rounded-[14px] text-sm transition-all border ${
                    collapsed ? "p-2.5 justify-center" : "px-3 py-2.5"
                  } ${
                    isActive
                      ? "bg-brand-teal-100 border-brand-teal-600 text-brand-teal-700 dark:bg-brand-teal-700/20 dark:border-brand-teal-600 dark:text-emerald-450 font-semibold"
                      : "border-transparent hover:bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary"
                  }`}
                  title={collapsed ? s.title : undefined}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-teal-600 dark:text-emerald-450" : "text-brand-text-secondary"}`} strokeWidth={1.75} />
                    {!collapsed && <span className="truncate text-left font-medium font-sans">{s.title}</span>}
                  </div>
                  {!collapsed && (
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-600 dark:hover:text-red-400 text-brand-text-secondary rounded-md hover:bg-brand-bg transition-all cursor-pointer"
                      title="Delete Chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                </Link>
              );
            })
          )}
        </div>

        {/* Sidebar Footer */}
        <div className={`p-4 border-t border-brand-border flex items-center justify-between gap-3 ${collapsed ? "flex-col px-2 py-4 animate-fade-in" : ""}`}>
          {!collapsed ? (
            <div className="min-w-0 flex flex-col font-sans">
              <span className="text-sm font-semibold text-brand-text-primary truncate">
                {session?.user?.name || "Taxpayer"}
              </span>
              <span className="text-xs text-brand-text-secondary truncate">
                {session?.user?.email}
              </span>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-brand-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(session?.user?.name || "T")[0].toUpperCase()}
            </div>
          )}
          <div className={`flex items-center gap-1.5 shrink-0 ${collapsed ? "flex-col w-full" : ""}`}>
            <button
              onClick={toggleTheme}
              className={`p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg transition-colors cursor-pointer ${collapsed ? "w-full flex justify-center" : ""}`}
              title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === "light" ? (
                <Moon className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Sun className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className={`p-2 text-brand-text-secondary hover:text-red-600 dark:hover:text-red-400 hover:bg-brand-bg rounded-lg transition-colors cursor-pointer ${collapsed ? "w-full flex justify-center" : ""}`}
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between bg-brand-surface border-b border-brand-border px-4 h-14 w-full sticky top-0 z-40 shrink-0">
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-1 rounded-md text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg cursor-pointer"
        >
          {isMobileOpen ? <X className="h-6 w-6" strokeWidth={1.75} /> : <Menu className="h-6 w-6" strokeWidth={1.75} />}
        </button>
        <span className="text-lg font-extrabold text-brand-teal-700 dark:text-brand-teal-600">
          Corpus
        </span>
        <button
          onClick={handleCreateSession}
          className="p-1.5 rounded-lg border border-brand-border bg-brand-surface text-brand-text-secondary hover:text-brand-text-primary cursor-pointer"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      {/* Desktop Sidebar */}
      <div className={`hidden lg:block shrink-0 h-full transition-all duration-300 ${isCollapsed ? "w-[72px]" : "w-[280px]"}`}>
        <SidebarContent isMobile={false} />
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative w-[280px] max-w-xs h-full flex flex-col bg-brand-surface shadow-2xl animate-fade-in">
            <SidebarContent isMobile={true} />
          </div>
        </div>
      )}
    </>
  );
}
