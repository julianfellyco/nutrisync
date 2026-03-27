"use client";

import { useEffect, useState } from "react";
import { api, HealthLog } from "@/lib/api";

interface MacroTarget {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface ProfileData {
  macro_targets: MacroTarget;
  fitness_goal: string;
  current_streak?: number;
}

const DEFAULT_TARGETS: MacroTarget = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min((value / target) * 100, 100);
  const over = value > target;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-ink-2">{label}</span>
        <span className="text-xs font-medium text-ink">
          {Math.round(value)} <span className="text-ink-3 font-normal">/ {target}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: over ? "#E53E3E" : color }}
        />
      </div>
    </div>
  );
}

function fmt(dt: string) {
  return new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ClientDashboard() {
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.logs.list(1, "meal"),
      api.clients.me(),
    ])
      .then(([logPage, client]) => {
        setLogs(logPage.data);
        if (client.profile) setProfile(client.profile as ProfileData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const targets = profile?.macro_targets ?? DEFAULT_TARGETS;

  // Sum today's meals
  const todayMeals = logs.filter((l) => {
    const d = new Date(l.logged_at);
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
  });

  const totals = todayMeals.reduce(
    (acc, l) => {
      const p = l.payload as Record<string, number>;
      return {
        calories: acc.calories + (p.calories ?? 0),
        protein_g: acc.protein_g + (p.protein_g ?? 0),
        carbs_g: acc.carbs_g + (p.carbs_g ?? 0),
        fat_g: acc.fat_g + (p.fat_g ?? 0),
      };
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  const streak = profile?.current_streak ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-4 h-4 rounded-full border-2 border-sage-200 border-t-sage-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-ink">Today</h1>
          <p className="text-xs text-ink-3 mt-0.5">
            {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
            <span className="text-sm">🔥</span>
            <span className="text-xs font-semibold text-amber-700">{streak} day streak</span>
          </div>
        )}
      </div>

      {/* Macro progress */}
      <div className="card mb-6">
        <p className="text-xs font-medium text-ink-3 uppercase tracking-wide mb-4">Nutrition today</p>
        <div className="space-y-4">
          <MacroBar label="Calories" value={totals.calories} target={targets.calories} color="#3D6B4F" />
          <MacroBar label="Protein" value={totals.protein_g} target={targets.protein_g} color="#2B7A77" />
          <MacroBar label="Carbs" value={totals.carbs_g} target={targets.carbs_g} color="#4A90D9" />
          <MacroBar label="Fat" value={totals.fat_g} target={targets.fat_g} color="#C17F24" />
        </div>
        <div className="mt-4 pt-4 border-t border-black/[0.05] text-center">
          <span className="text-2xl font-semibold text-ink">{Math.round(totals.calories)}</span>
          <span className="text-sm text-ink-3 ml-1">/ {targets.calories} kcal</span>
        </div>
      </div>

      {/* Recent meals */}
      <div className="card">
        <p className="text-xs font-medium text-ink-3 uppercase tracking-wide mb-3">Meals logged today</p>
        {todayMeals.length === 0 ? (
          <p className="text-sm text-ink-3 py-4 text-center">No meals logged yet — tap Log meal to start.</p>
        ) : (
          <div className="divide-y divide-black/[0.05]">
            {todayMeals.map((log) => {
              const p = log.payload as Record<string, unknown>;
              return (
                <div key={log.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{String(p.name ?? "Meal")}</p>
                    <p className="text-xs text-ink-3 mt-0.5">{fmt(log.logged_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink">{Math.round(Number(p.calories ?? 0))} kcal</p>
                    <p className="text-xs text-ink-3">{Math.round(Number(p.protein_g ?? 0))}g protein</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
