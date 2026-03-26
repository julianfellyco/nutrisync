"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Client } from "@/lib/api";

export default function ClientListPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    api.clients.list()
      .then(setClients)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  if (error) return (
    <div className="p-10 text-sm text-rose-600">{error}</div>
  );

  if (clients.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-6">
      <div className="w-12 h-12 rounded-xl bg-sage-50 flex items-center justify-center mb-4">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-sage-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z"/>
        </svg>
      </div>
      <p className="text-sm font-medium text-ink mb-1">No clients yet</p>
      <p className="text-xs text-ink-3 mb-5 max-w-xs">Add a client by email after they've registered on the NutriSync mobile app.</p>
      <Link href="/dashboard/invite" className="btn btn-primary">Add first client</Link>
    </div>
  );

  return (
    <div className="px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-ink">Clients</h1>
          <p className="text-xs text-ink-3 mt-0.5">{clients.length} assigned</p>
        </div>
        <Link href="/dashboard/invite" className="btn btn-ghost">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          Add client
        </Link>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/[0.06]">
              <th className="text-left px-4 py-2.5 text-2xs font-medium uppercase tracking-widest text-ink-3 w-[40%]">Client</th>
              <th className="text-left px-4 py-2.5 text-2xs font-medium uppercase tracking-widest text-ink-3 hidden sm:table-cell">Goal</th>
              <th className="text-left px-4 py-2.5 text-2xs font-medium uppercase tracking-widest text-ink-3 hidden md:table-cell">Restrictions</th>
              <th className="px-4 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {clients.map((c, i) => (
              <tr
                key={c.id}
                className={`group hover:bg-black/[0.02] transition-colors ${i !== 0 ? "border-t border-black/[0.04]" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} />
                    <div>
                      <p className="text-sm font-medium text-ink leading-tight">{c.name}</p>
                      <p className="text-xs text-ink-3">{c.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {c.profile?.fitness_goal ? (
                    <span className="tag bg-sage-50 text-sage-600">
                      {c.profile.fitness_goal.replace(/_/g, " ")}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-4">—</span>
                  )}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {c.profile?.dietary_restrictions?.length
                      ? c.profile.dietary_restrictions.slice(0, 2).map((r) => (
                          <span key={r} className="tag bg-amber-50 text-amber-600">{r}</span>
                        ))
                      : <span className="text-xs text-ink-4">none</span>
                    }
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/${c.id}`}
                    className="text-xs text-ink-3 hover:text-sage-600 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = ["bg-sage-100 text-sage-700", "bg-amber-100 text-amber-700", "bg-sky-100 text-sky-700", "bg-rose-100 text-rose-700"];
  const color  = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-xs font-semibold shrink-0`}>
      {initials}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-4 h-4 rounded-full border-2 border-sage-100 border-t-sage-500 animate-spin" />
    </div>
  );
}
