"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (localStorage.getItem("access_token")) router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.auth.login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[340px]">

        {/* Logo */}
        <div className="mb-10 text-center">
          <span className="inline-block w-9 h-9 rounded-lg bg-sage-500 mb-4" />
          <h1 className="text-xl font-semibold text-ink">NutriSync</h1>
          <p className="text-xs text-ink-3 mt-1">Consultant Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 rounded px-3 py-2.5 border border-rose-200">
              {error}
            </p>
          )}

          <div>
            <label className="label">Email</label>
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input" placeholder="you@clinic.com"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password" required value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input" placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary w-full mt-2">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-ink-3 mt-6">
          No account?{" "}
          <Link href="/register" className="text-sage-500 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
