"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChatPage() {
  const router = useRouter();

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const res = await fetch("/api/sessions");
        if (res.ok) {
          const sessions = await res.json();
          if (sessions && sessions.length > 0) {
            router.replace(`/chat/${sessions[0].id}`);
            return;
          }
        }

        const createRes = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Chat" }),
        });

        if (createRes.ok) {
          const newSession = await createRes.json();
          router.replace(`/chat/${newSession.id}`);
        }
      } catch (err) {
        console.error("Failed to redirect:", err);
      }
    };

    handleRedirect();
  }, [router]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-brand-bg text-brand-text-secondary font-sans">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-teal-600 border-t-transparent" />
        <p className="text-sm">Setting up your session...</p>
      </div>
    </div>
  );
}
