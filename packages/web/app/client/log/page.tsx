"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

const COMMON_FOODS = [
  { name: "Chicken breast (100g)", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
  { name: "White rice (100g)", calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 },
  { name: "Egg (1 large)", calories: 72, protein_g: 6, carbs_g: 0.4, fat_g: 5 },
  { name: "Banana (medium)", calories: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3 },
  { name: "Greek yogurt (150g)", calories: 89, protein_g: 15, carbs_g: 6, fat_g: 0.7 },
  { name: "Oats (40g dry)", calories: 148, protein_g: 5.4, carbs_g: 26, fat_g: 2.6 },
];

interface OptimisticEntry {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  pending: boolean;  // true while API call is in-flight
  failed: boolean;
}

export default function LogMealPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Optimistic entries shown immediately after submit
  const [entries, setEntries] = useState<OptimisticEntry[]>([]);

  function fillQuick(food: typeof COMMON_FOODS[0]) {
    setName(food.name);
    setCalories(String(food.calories));
    setProtein(String(food.protein_g));
    setCarbs(String(food.carbs_g));
    setFat(String(food.fat_g));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const entry: OptimisticEntry = {
      name,
      calories: Number(calories),
      protein_g: Number(protein),
      carbs_g: Number(carbs),
      fat_g: Number(fat),
      pending: true,
      failed: false,
    };

    // Optimistic update — show immediately
    setEntries((prev) => [entry, ...prev]);
    setName(""); setCalories(""); setProtein(""); setCarbs(""); setFat("");

    try {
      await api.logs.create("meal", {
        name: entry.name,
        calories: entry.calories,
        protein_g: entry.protein_g,
        carbs_g: entry.carbs_g,
        fat_g: entry.fat_g,
      });
      // Mark as confirmed
      setEntries((prev) =>
        prev.map((e) => (e === entry ? { ...e, pending: false } : e))
      );
    } catch (err) {
      // Rollback — mark as failed
      setEntries((prev) =>
        prev.map((e) => (e === entry ? { ...e, pending: false, failed: true } : e))
      );
      setError(err instanceof ApiError ? err.message : "Failed to save meal");
    }
  }

  const totalCalories = entries
    .filter((e) => !e.failed)
    .reduce((sum, e) => sum + e.calories, 0);

  return (
    <div className="p-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-ink">Log a meal</h1>
        {entries.length > 0 && (
          <button onClick={() => router.push("/client")} className="text-xs text-sage-600 hover:underline">
            Done ({Math.round(totalCalories)} kcal logged)
          </button>
        )}
      </div>
      <p className="text-xs text-ink-3 mb-6">Enter nutrition info manually or pick a quick option below.</p>

      {/* Optimistic entry list */}
      {entries.length > 0 && (
        <div className="mb-6 space-y-2">
          {entries.map((e, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-all ${
                e.failed
                  ? "bg-rose-50 border-rose-200 text-rose-700"
                  : e.pending
                  ? "bg-surface border-black/[0.07] text-ink-3"
                  : "bg-sage-50 border-sage-200 text-ink"
              }`}
            >
              <span className="font-medium">{e.name}</span>
              <span className="flex items-center gap-2 text-xs">
                {Math.round(e.calories)} kcal
                {e.pending && <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />}
                {e.failed && <span title="Save failed">⚠</span>}
                {!e.pending && !e.failed && <span className="text-sage-500">✓</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quick picks */}
      <div className="mb-6">
        <p className="text-xs font-medium text-ink-3 uppercase tracking-wide mb-2">Quick add</p>
        <div className="flex flex-wrap gap-2">
          {COMMON_FOODS.map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => fillQuick(f)}
              className="text-xs px-2.5 py-1.5 rounded-full bg-surface border border-black/[0.08] text-ink-2 hover:border-sage-300 hover:text-sage-600 transition-colors"
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 rounded px-3 py-2 border border-rose-200">{error}</p>
        )}

        <div>
          <label className="label">Meal name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. Grilled chicken salad"
            autoFocus
          />
        </div>

        <div>
          <label className="label">Calories (kcal)</label>
          <input
            type="number"
            required
            min={0}
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            className="input"
            placeholder="350"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Protein (g)</label>
            <input type="number" min={0} step={0.1} value={protein}
              onChange={(e) => setProtein(e.target.value)} className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Carbs (g)</label>
            <input type="number" min={0} step={0.1} value={carbs}
              onChange={(e) => setCarbs(e.target.value)} className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Fat (g)</label>
            <input type="number" min={0} step={0.1} value={fat}
              onChange={(e) => setFat(e.target.value)} className="input" placeholder="0" />
          </div>
        </div>

        <button type="submit" className="btn btn-primary w-full">
          Add meal
        </button>
      </form>
    </div>
  );
}
