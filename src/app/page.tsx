import Link from "next/link";
import { ArrowRight, FileText, Calculator, Landmark } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-brand-bg font-sans text-brand-text-primary">
      {/* Header */}
      <header className="shrink-0 border-b border-brand-border bg-brand-surface/80 backdrop-blur-md z-50">
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

      <main className="flex-1 overflow-y-auto snap-y snap-mandatory scroll-smooth">
        {/* Hero Section */}
        <section className="relative min-h-full snap-start flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 py-12 lg:py-0 text-center">
          {/* Subtle Ambient Light */}
          <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-30">
            <div className="w-[500px] h-[500px] rounded-full bg-brand-teal-100/30 blur-[120px]" />
          </div>

          <div className="mx-auto max-w-4xl space-y-8 animate-scale-in">
            {/* Tagline / Badge */}
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-teal-100/50 dark:bg-brand-teal-700/10 px-4 py-1.5 text-xs font-semibold text-brand-teal-700 dark:text-brand-teal-600">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-teal-600 animate-pulse" />
              Specialized for AY 2025–26 & AY 2024–25
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-brand-text-primary leading-[1.15] max-w-3xl mx-auto">
              Your Conversational AI{" "}
              <span className="block mt-2 text-brand-teal-700 dark:text-brand-teal-600">
                Tax Accountant
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg sm:text-xl text-brand-text-secondary leading-relaxed font-sans">
              Get instant, citation-backed answers to your complex Indian income tax, GST, and investment planning queries.
            </p>
            <div className="flex items-center justify-center gap-x-6 pt-4">
              <Link
                href="/chat"
                className="group flex items-center gap-2 rounded-xl bg-brand-teal-600 px-7 py-4 text-base font-semibold text-white shadow-md hover:bg-brand-teal-700 hover:-translate-y-[2px] active:scale-98 transition-all duration-200 ease-out cursor-pointer"
              >
                Start Tax Workspace
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="relative min-h-full snap-start flex flex-col justify-between border-t border-brand-border bg-brand-surface/40 pt-16 pb-8 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl w-full flex-1 flex flex-col justify-center py-8">
            <div className="mx-auto max-w-3xl text-center space-y-4">
              <h2 className="text-3xl font-extrabold tracking-tight text-brand-text-primary sm:text-4xl">
                Smart Financial Advice in Real-Time
              </h2>
              <p className="text-base sm:text-lg text-brand-text-secondary max-w-2xl mx-auto">
                A custom assistant equipped with deep tax knowledge and calculator tools to ensure legal accuracy.
              </p>
            </div>

            <div className="mx-auto mt-12 lg:mt-16 max-w-5xl grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 w-full">
              {/* Feature 1 */}
              <div className="group rounded-xl border border-brand-border bg-white dark:bg-brand-surface p-8 shadow-xs hover:shadow-md hover:-translate-y-[2px] transition-all duration-200 ease-out">
                <div className="w-12 h-12 rounded-xl bg-brand-teal-100 dark:bg-brand-teal-700/10 flex items-center justify-center text-brand-teal-700 dark:text-brand-teal-600 transition-colors group-hover:bg-brand-teal-600 group-hover:text-white">
                  <Calculator className="h-6 w-6" strokeWidth={2} />
                </div>
                <h3 className="mt-5 text-lg font-bold text-brand-text-primary font-sans">Tax Slab Calculator</h3>
                <p className="mt-3 text-sm text-brand-text-secondary leading-relaxed font-sans">
                  Instantly compute tax liability comparing the Old vs New Tax regimes for AY2024-25 and AY2025-26.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="group rounded-xl border border-brand-border bg-white dark:bg-brand-surface p-8 shadow-xs hover:shadow-md hover:-translate-y-[2px] transition-all duration-200 ease-out">
                <div className="w-12 h-12 rounded-xl bg-brand-teal-100 dark:bg-brand-teal-700/10 flex items-center justify-center text-brand-teal-700 dark:text-brand-teal-600 transition-colors group-hover:bg-brand-teal-600 group-hover:text-white">
                  <FileText className="h-6 w-6" strokeWidth={2} />
                </div>
                <h3 className="mt-5 text-lg font-bold text-brand-text-primary font-sans">Form-16 Parsing</h3>
                <p className="mt-3 text-sm text-brand-text-secondary leading-relaxed font-sans">
                  Upload your Form-16, 26AS, or ITR PDFs. Our AI extracts salary components and TDS details automatically.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="group rounded-xl border border-brand-border bg-white dark:bg-brand-surface p-8 shadow-xs hover:shadow-md hover:-translate-y-[2px] transition-all duration-200 ease-out">
                <div className="w-12 h-12 rounded-xl bg-brand-teal-100 dark:bg-brand-teal-700/10 flex items-center justify-center text-brand-teal-700 dark:text-brand-teal-600 transition-colors group-hover:bg-brand-teal-600 group-hover:text-white">
                  <Landmark className="h-6 w-6" strokeWidth={2} />
                </div>
                <h3 className="mt-5 text-lg font-bold text-brand-text-primary font-sans">Authoritative Citations</h3>
                <p className="mt-3 text-sm text-brand-text-secondary leading-relaxed font-sans">
                  No generic AI suggestions. The assistant retrieves exact sections of the Income Tax Act using a hybrid RAG + Neo4j pipeline.
                </p>
              </div>
            </div>
          </div>

          <footer className="border-t border-brand-border/60 bg-transparent py-6 text-center text-xs sm:text-sm text-brand-text-secondary w-full shrink-0">
            <p>© {new Date().getFullYear()} Corpus. Built for Indian taxpayers.</p>
          </footer>
        </section>
      </main>
    </div>
  );
}
