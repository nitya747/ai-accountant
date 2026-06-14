import { Sidebar } from "@/components/Sidebar";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}
