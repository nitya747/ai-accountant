import Link from "next/link";
import { ArrowRight, FileText, Calculator, Landmark } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 bg-brand-bg font-sans text-brand-text-primary overflow-x-hidden min-h-screen">
      {/* Header */}
      <header className="border-b border-brand-border bg-brand-surface/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-brand-teal-700 dark:text-brand-teal-600">
              Corpus
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-semibold text-brand-text-secondary hover:text-brand-text-primary transition-colors">
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-brand-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-teal-700 active:scale-98 transition-all duration-200"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-24 sm:py-32">
          {/* Subtle Ambient Light */}
          <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-30">
            <div className="w-[400px] h-[400px] rounded-full bg-brand-teal-100/30 blur-[100px]" />
          </div>

          <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center space-y-6">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-brand-text-primary">
              Your Conversational AI{" "}
              <span className="block mt-2 text-brand-teal-700 dark:text-brand-teal-600">
                Tax Accountant
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-brand-text-secondary font-sans">
              Get instant, citation-backed answers to your complex Indian income tax, GST, and investment planning queries. Specialized for AY 2025–26 and AY 2024–25.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/chat"
                className="group flex items-center gap-2 rounded-xl bg-brand-teal-600 px-6 py-3.5 text-base font-semibold text-white shadow-md hover:bg-brand-teal-700 active:scale-98 transition-all duration-200 cursor-pointer"
              >
                Start Tax Workspace
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-16 sm:py-24 border-t border-brand-border bg-brand-surface/40">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center space-y-3">
              <h2 className="text-3xl font-bold tracking-tight text-brand-text-primary sm:text-4xl">
                Smart Financial Advice in Real-Time
              </h2>
              <p className="text-brand-text-secondary">
                A custom assistant equipped with deep tax knowledge and calculator tools to ensure legal accuracy.
              </p>
            </div>

            <div className="mx-auto mt-16 max-w-5xl grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Feature 1 */}
              <div className="rounded-xl border border-brand-border bg-white dark:bg-brand-surface p-6 shadow-xs hover:shadow-md transition-all">
                <Calculator className="h-10 w-10 text-brand-teal-750 dark:text-brand-teal-600" strokeWidth={1.5} />
                <h3 className="mt-4 text-lg font-bold text-brand-text-primary font-sans">Tax Slab Calculator</h3>
                <p className="mt-2 text-sm text-brand-text-secondary leading-relaxed font-sans">
                  Instantly compute tax liability comparing the Old vs New Tax regimes for AY2024-25 and AY2025-26.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="rounded-xl border border-brand-border bg-white dark:bg-brand-surface p-6 shadow-xs hover:shadow-md transition-all">
                <FileText className="h-10 w-10 text-brand-teal-750 dark:text-brand-teal-600" strokeWidth={1.5} />
                <h3 className="mt-4 text-lg font-bold text-brand-text-primary font-sans">Form-16 Parsing</h3>
                <p className="mt-2 text-sm text-brand-text-secondary leading-relaxed font-sans">
                  Upload your Form-16, 26AS, or ITR PDFs. Our AI extracts salary components and TDS details automatically.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="rounded-xl border border-brand-border bg-white dark:bg-brand-surface p-6 shadow-xs hover:shadow-md transition-all">
                <Landmark className="h-10 w-10 text-brand-teal-750 dark:text-brand-teal-600" strokeWidth={1.5} />
                <h3 className="mt-4 text-lg font-bold text-brand-text-primary font-sans">Authoritative Citations</h3>
                <p className="mt-2 text-sm text-brand-text-secondary leading-relaxed font-sans">
                  No generic AI suggestions. The assistant retrieves exact sections of the Income Tax Act using a hybrid RAG + Neo4j pipeline.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-brand-border bg-brand-surface py-8 text-center text-sm text-brand-text-secondary">
        <div className="mx-auto max-w-7xl px-4">
          <p>© {new Date().getFullYear()} Corpus. Built for Indian taxpayers.</p>
        </div>
      </footer>
    </div>
  );
}
