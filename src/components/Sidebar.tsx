"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Plus, MessageSquare, Trash2, LogOut, Menu, X, ChevronLeft, ChevronRight, Gem } from "lucide-react";

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
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

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

  const getUserInitials = (name: string) => {
    if (!name) return "T";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const SidebarContent = ({ isMobile = false }) => {
    const collapsed = !isMobile && isCollapsed;

    return (
      <div className="flex flex-col h-full bg-[#FAF8F3] dark:bg-brand-surface border-r border-brand-border text-brand-text-primary transition-all duration-300">
        {/* Sidebar Header */}
        <div className={`p-4 flex items-center justify-between ${collapsed ? "flex-col gap-4 px-2" : ""}`}>
          {!collapsed && (
            <span className="text-xl font-extrabold text-brand-teal-700 dark:text-brand-teal-600 tracking-tight">
              Corpus
            </span>
          )}
          
          <div className={`flex items-center gap-1.5 ${collapsed ? "flex-col" : "ml-auto"}`}>
            {!isMobile && (
              <button
                onClick={toggleCollapse}
                className="p-1.5 rounded-lg border border-brand-border hover:bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary transition-colors cursor-pointer"
                title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4" strokeWidth={1.75} /> : <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />}
              </button>
            )}
          </div>
        </div>

        {/* Sessions List */}
        <div className={`flex-1 overflow-y-auto p-3 space-y-1 ${collapsed ? "px-1.5" : ""}`}>
          {!collapsed ? (
            <button
              onClick={handleCreateSession}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-brand-teal-700 hover:bg-brand-teal-600 text-white font-semibold transition-all text-sm shadow-xs hover:shadow-md cursor-pointer"
            >
              <Plus className="h-4.5 w-4.5 shrink-0" strokeWidth={2.5} />
              New Chat
            </button>
          ) : (
            <button
              onClick={handleCreateSession}
              className="w-full flex items-center justify-center p-2.5 rounded-xl bg-brand-teal-700 hover:bg-brand-teal-600 text-white transition-all cursor-pointer shadow-xs"
              title="New Chat"
            >
              <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} />
            </button>
          )}

          {!collapsed && (
            <div className="pt-5 pb-1 text-[10px] font-bold text-brand-text-secondary px-3 uppercase tracking-wider font-sans">
              History
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
                      ? "bg-[#DFF7F4]/40 border-[#0F766E]/20 text-[#0F766E] font-bold"
                      : "border-transparent hover:bg-brand-bg text-brand-text-secondary hover:text-brand-text-primary"
                  }`}
                  title={collapsed ? s.title : undefined}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? "text-[#0D9488]" : "text-brand-text-secondary"}`} strokeWidth={1.75} />
                    {!collapsed && <span className="truncate text-left font-medium font-sans">{s.title}</span>}
                  </div>
                  {!collapsed && (
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-650 dark:hover:text-red-400 text-brand-text-secondary rounded-md hover:bg-brand-bg transition-all cursor-pointer"
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
        <div className={`p-3 border-t border-brand-border flex flex-col gap-3.5 ${collapsed ? "px-2 py-4" : ""}`}>
          
          {/* User Profile Card */}
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className={`flex items-center rounded-xl border border-brand-border bg-white dark:bg-brand-surface hover:bg-brand-bg/50 transition-all cursor-pointer shadow-xs ${
                collapsed 
                  ? "w-12 h-12 justify-center p-1 mx-auto" 
                  : "w-full justify-between p-3.5 text-left"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-brand-teal-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {getUserInitials(session?.user?.name || "Taxpayer")}
                </div>
                {!collapsed && (
                  <div className="min-w-0 flex flex-col font-sans">
                    <span className="text-sm font-bold text-brand-text-primary truncate leading-tight">
                      {session?.user?.name || "Taxpayer"}
                    </span>
                    <span className="text-xs text-brand-text-secondary truncate mt-0.5">
                      {session?.user?.email || "taxpayer@example.com"}
                    </span>
                  </div>
                )}
              </div>
              {!collapsed && (
                <ChevronRight
                  className={`h-4 w-4 text-brand-text-secondary shrink-0 transition-transform ${
                    isUserMenuOpen ? "rotate-90" : ""
                  }`}
                  strokeWidth={2}
                />
              )}
            </button>

            {/* User Dropdown Menu */}
            {isUserMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-full min-w-[200px] z-50 rounded-xl border border-brand-border bg-white dark:bg-brand-surface p-1 shadow-lg animate-fade-in font-sans">
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold text-red-650 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4 mr-1" strokeWidth={1.75} />
                  Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Expert Help Card */}
          {!collapsed && (
            <div className="p-4 rounded-2xl bg-[#FAF6EC] dark:bg-amber-950/10 border border-[#EFD9A5]/40 flex flex-col gap-3.5 shadow-xs">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-brand-surface flex items-center justify-center text-[#C79A3B] shrink-0 border border-[#EFD9A5]/50 shadow-2xs">
                  <Gem className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div className="flex flex-col font-sans">
                  <span className="text-xs font-extrabold text-brand-text-primary leading-tight">Need expert help?</span>
                  <span className="text-[10px] text-brand-text-secondary leading-normal mt-1">
                    Connect with a CA for personalized assistance.
                  </span>
                </div>
              </div>
              <button
                onClick={() => window.open("https://www.incometaxindia.gov.in", "_blank")}
                className="w-full py-2.5 px-4 bg-white dark:bg-brand-surface border border-[#EFD9A5] hover:bg-brand-bg text-[#C79A3B] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-2xs hover:scale-98 active:scale-95 cursor-pointer font-sans"
              >
                Talk to a CA
                <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>
          )}

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
