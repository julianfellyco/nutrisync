"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Insight {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  action: string;
  metric?: Record<string, unknown>;
}

const SEV_STYLES = {
  critical: { bg: "bg-rose-50",   border: "border-rose-200",  text: "text-rose-700",  dot: "bg-rose-500",  label: "Critical" },
  warning:  { bg: "bg-amber-50",  border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500", label: "Warning"  },
  info:     { bg: "bg-sky-50",    border: "border-sky-200",   text: "text-sky-700",   dot: "bg-sky-400",   label: "Info"     },
};

export function InsightsFeed({ clientId }: { clientId: string }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    api.insights.list(clientId)
      .then((data) => setInsights(data.insights ?? []))
      .catch(() => setInsights([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-ink-3 py-2">
      <div className="w-3 h-3 rounded-full border-2 border-ink-4 border-t-ink-3 animate-spin" />
      Analysing health data…
    </div>
  );

  if (insights.length === 0) return (
    <div className="flex items-center gap-2 text-xs text-ink-3 py-2">
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-sage-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
      No issues detected — client is on track.
    </div>
  );

  // Sort: critical → warning → info
  const sorted = [...insights].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="space-y-2">
      {sorted.map((ins) => {
        const s = SEV_STYLES[ins.severity];
        return (
          <div
            key={ins.id}
            className={`rounded-lg border p-4 ${s.bg} ${s.border}`}
          >
            <div className="flex items-start gap-3">
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className={`text-xs font-semibold ${s.text}`}>{ins.title}</p>
                  <span className={`tag ${s.bg} ${s.text} border ${s.border}`}>
                    {s.label}
                  </span>
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">{ins.body}</p>
                {ins.metric && <MetricPill metric={ins.metric} severity={ins.severity} />}
                <p className="text-xs text-ink-3 mt-1.5 italic">
                  Suggested action: {ins.action}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricPill({
  metric,
  severity,
}: {
  metric: Record<string, unknown>;
  severity: Insight["severity"];
}) {
  const s = SEV_STYLES[severity];
  const entries = Object.entries(metric).filter(([k]) => !["unit"].includes(k));
  const unit = (metric.unit as string) ?? "";

  if ("value" in metric && "target" in metric) {
    const pct = Math.round(((metric.value as number) / (metric.target as number)) * 100);
    return (
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 max-w-[140px] h-1.5 bg-black/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${s.dot}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className={`text-2xs font-medium ${s.text}`}>
          {metric.value as number}{unit} / {metric.target as number}{unit} ({pct}%)
        </span>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <span key={k} className={`text-2xs px-1.5 py-0.5 rounded ${s.bg} ${s.text} border ${s.border}`}>
          {k.replace(/_/g, " ")}: <strong>{String(v)}</strong>
        </span>
      ))}
    </div>
  );
}
