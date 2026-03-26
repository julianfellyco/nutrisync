"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

export default function InviteClientPage() {
  const router = useRouter();
  const [email, setEmail]     = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [claimed, setClaimed] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const client = await api.clients.claim(email);
      setClaimed({ name: client.name, email: client.email });
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add client");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-8 py-8 max-w-md">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => router.back()} className="text-ink-3 hover:text-ink transition-colors">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-ink">Add client</h1>
      </div>

      {claimed ? (
        <div className="card p-6 text-center">
          <div className="w-10 h-10 rounded-full bg-sage-100 flex items-center justify-center mx-auto mb-4">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-sage-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-ink">{claimed.name} added</p>
          <p className="text-xs text-ink-3 mt-1 mb-5">{claimed.email}</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => setClaimed(null)} className="btn btn-ghost">Add another</button>
            <Link href="/dashboard" className="btn btn-primary">View clients</Link>
          </div>
        </div>
      ) : (
        <div className="card p-6">
          <p className="text-xs text-ink-3 mb-5 leading-relaxed">
            Enter the email address of a client who has already registered on the NutriSync app.
            They must not be assigned to another consultant.
          </p>

          <form onSubmit={handleClaim} className="space-y-4">
            {error && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2.5">
                {error}
              </p>
            )}

            <div>
              <label className="label">Client email</label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input" placeholder="client@example.com"
                autoFocus
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "Adding…" : "Add client"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
