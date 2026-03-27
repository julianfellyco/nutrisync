"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, Client, HealthLog } from "@/lib/api";
import { useClientWebSocket } from "@/lib/ws";
import { MacroTrendChart } from "@/components/charts/MacroTrendChart";
import { ActivityHeatmap }  from "@/components/charts/ActivityHeatmap";
import { WeightProgressLine } from "@/components/charts/WeightProgressLine";
import { InsightsFeed } from "@/components/insights/InsightsFeed";

const MACRO_COLORS: Record<string, string> = {
  calories:  "text-sage-500",
  protein_g: "text-sky-600",
  carbs_g:   "text-amber-600",
  fat_g:     "text-rose-600",
};
const MACRO_LABELS: Record<string, { label: string; unit: string }> = {
  calories:  { label: "Calories",  unit: "kcal" },
  protein_g: { label: "Protein",   unit: "g" },
  carbs_g:   { label: "Carbs",     unit: "g" },
  fat_g:     { label: "Fat",       unit: "g" },
};

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  const [client, setClient]   = useState<Client | null>(null);
  const [logs, setLogs]       = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLogs = useCallback(async () => {
    const page = await api.logs.forClient(clientId, 30);
    setLogs(page.data);
    setLastUpdated(new Date());
  }, [clientId]);

  useEffect(() => {
    Promise.all([
      api.clients.get(clientId).then(setClient),
      fetchLogs(),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId, fetchLogs]);

  const connected = useClientWebSocket(clientId, (event) => {
    if (event.event === "new_log") fetchLogs();
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-4 h-4 rounded-full border-2 border-sage-100 border-t-sage-500 animate-spin" />
    </div>
  );
  if (!client) return <div className="p-10 text-sm text-rose-600">Client not found.</div>;

  const mealLogs      = logs.filter((l) => l.log_type === "meal");
  const activityLogs  = logs.filter((l) => l.log_type === "activity");
  const biometricLogs = logs.filter((l) => l.log_type === "biometric");
  const targets = client.profile?.macro_targets;
  const streak  = client.profile?.current_streak ?? 0;
  const longest = client.profile?.longest_streak ?? 0;

  return (
    <div className="px-8 py-8 space-y-7">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-ink-3 hover:text-ink transition-colors mt-0.5"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold text-ink">{client.name}</h1>
              {connected && <span className="dot-live" title="Live connection" />}
            </div>
            {lastUpdated && (
              <p className="text-2xs text-ink-4 mt-0.5">
                Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <p className="text-xs text-ink-3 mt-0.5">
              {client.profile?.fitness_goal?.replace(/_/g, " ") ?? "No goal set"}
              {client.profile?.dietary_restrictions?.length
                ? ` · ${client.profile.dietary_restrictions.join(", ")}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/${clientId}/plans`}   className="btn btn-ghost">Plans</Link>
          <Link href={`/dashboard/${clientId}/profile`} className="btn btn-ghost">Profile</Link>
          <Link href={`/dashboard/${clientId}/chat`}    className="btn btn-primary">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            AI Chat
          </Link>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {targets && Object.entries(MACRO_LABELS).map(([key, meta]) => (
          <div key={key} className="card px-4 py-4">
            <p className={`text-2xl font-semibold tracking-tight ${MACRO_COLORS[key]}`}>
              {(targets as Record<string, number>)[key] ?? "—"}
            </p>
            <p className="text-xs text-ink-3 mt-1">{meta.label} / day</p>
          </div>
        ))}
        <StreakCard streak={streak} longest={longest} />
        <StatCard label="Meals logged" value={String(mealLogs.length)} />
      </div>

      {/* ── Proactive Insights ── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-semibold text-ink">Health Insights</h2>
          <span className="tag bg-sage-50 text-sage-600">AI-generated · 30 days</span>
        </div>
        <InsightsFeed clientId={clientId} />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Macros" subtitle="30-day trend">
          <MacroTrendChart logs={mealLogs} />
        </ChartCard>
        <ChartCard title="Weight" subtitle="30-day progress">
          <WeightProgressLine logs={biometricLogs} />
        </ChartCard>
      </div>

      <ChartCard title="Activity" subtitle="Steps & workouts · last 30 days">
        <ActivityHeatmap logs={activityLogs} />
      </ChartCard>
    </div>
  );
}

function StreakCard({ streak, longest }: { streak: number; longest: number }) {
  return (
    <div className="card px-4 py-4 col-span-2 sm:col-span-1">
      <div className="flex items-baseline gap-1">
        <p className="text-2xl font-semibold tracking-tight text-amber-600">{streak}</p>
        <span className="text-lg">🔥</span>
      </div>
      <p className="text-xs text-ink-3 mt-1">
        Day streak
        {longest > 0 && <span className="ml-1 text-ink-4">· best {longest}</span>}
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-4">
      <p className="text-2xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="text-xs text-ink-3 mt-1">{label}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <span className="text-xs text-ink-3">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
