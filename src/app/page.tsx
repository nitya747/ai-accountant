import Link from "next/link";
import { ArrowRight, FileText, Calculator, Landmark } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-950 font-sans text-zinc-100 overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
              Corpus
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-emerald-400 hover:to-teal-500 transition-all duration-200"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-24 sm:py-32">
          {/* Ambient Light */}
          <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-30">
            <div className="w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px]" />
          </div>

          <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-white">
              Your Conversational AI for{" "}
              <span className="block mt-2 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-500 bg-clip-text text-transparent">
                Indian Tax & Accounting
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
              Get instant, citation-backed answers to your complex Indian income tax, GST, and investment planning queries. Specialized for AY 2025–26 and AY 2024–25.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/chat"
                className="group flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-base font-semibold text-zinc-950 shadow-md hover:bg-emerald-400 transition-all duration-200"
              >
                Start Chatting
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-16 sm:py-24 border-t border-zinc-900 bg-zinc-900/10">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Smart Financial Advice in Real-Time
              </h2>
              <p className="mt-4 text-zinc-400">
                A custom assistant equipped with deep tax knowledge and calculator tools to ensure legal accuracy.
              </p>
            </div>

            <div className="mx-auto mt-16 max-w-5xl grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Feature 1 */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 backdrop-blur-sm">
                <Calculator className="h-10 w-10 text-emerald-400" />
                <h3 className="mt-4 text-lg font-semibold text-white">Tax Slab Calculator</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Instantly compute tax liability comparing the Old vs New Tax regimes for AY2024-25 and AY2025-26.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 backdrop-blur-sm">
                <FileText className="h-10 w-10 text-emerald-400" />
                <h3 className="mt-4 text-lg font-semibold text-white">Form-16 Parsing</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Upload your Form-16, 26AS, or ITR PDFs. Our AI extracts salary components and TDS details automatically.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 backdrop-blur-sm">
                <Landmark className="h-10 w-10 text-emerald-400" />
                <h3 className="mt-4 text-lg font-semibold text-white">Authoritative Citations</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  No generic AI suggestions. The assistant retrieves exact sections of the Income Tax Act using a hybrid RAG + Neo4j pipeline.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950 py-8 text-center text-sm text-zinc-500">
        <div className="mx-auto max-w-7xl px-4">
          <p>© {new Date().getFullYear()} Corpus. Built for Indian taxpayers.</p>
        </div>
      </footer>
    </div>
  );
}
