"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("registered") === "true") {
      setSuccess("Account created successfully! Please sign in.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        throw new Error(res.error);
      }

      router.push("/chat");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-brand-border bg-white dark:bg-brand-surface p-8 shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-brand-teal-700 dark:text-brand-teal-600">
            Corpus
          </h2>
          <p className="mt-2 text-sm text-brand-text-secondary font-sans">
            Sign in to your tax workspace
          </p>
        </div>

        {success && (
          <div className="rounded-xl bg-brand-teal-100/50 border border-brand-teal-600/30 p-3 text-sm text-brand-teal-700 text-center font-semibold">
            {success}
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-650 text-center font-semibold">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 font-sans">
            <div>
              <label htmlFor="email-address" className="block text-sm font-semibold text-brand-text-primary">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-brand-text-primary placeholder-brand-text-secondary/60 shadow-xs focus:border-brand-teal-600 focus:outline-none focus:ring-1 focus:ring-brand-teal-600 sm:text-sm"
                placeholder="name@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-brand-text-primary">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-brand-text-primary placeholder-brand-text-secondary/60 shadow-xs focus:border-brand-teal-600 focus:outline-none focus:ring-1 focus:ring-brand-teal-600 sm:text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-lg bg-brand-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-teal-700 focus:outline-none focus:ring-2 focus:ring-brand-teal-600 focus:ring-offset-2 focus:ring-offset-brand-bg transition-all duration-200 disabled:opacity-50 active:scale-98 cursor-pointer"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        <div className="text-center text-sm text-brand-text-secondary font-sans">
          Don't have an account?{" "}
          <Link href="/register" className="font-semibold text-brand-teal-700 hover:text-brand-teal-650 transition-colors">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <div className="text-brand-text-secondary font-sans">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
