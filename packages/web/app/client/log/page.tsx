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

export default function LogMealPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function fillQuick(food: typeof COMMON_FOODS[0]) {
    setName(food.name);
    setCalories(String(food.calories));
    setProtein(String(food.protein_g));
    setCarbs(String(food.carbs_g));
    setFat(String(food.fat_g));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.logs.create("meal", {
        name,
        calories: Number(calories),
        protein_g: Number(protein),
        carbs_g: Number(carbs),
        fat_g: Number(fat),
      });
      setDone(true);
      setTimeout(() => router.push("/client"), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save meal");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-10 h-10 rounded-full bg-sage-100 flex items-center justify-center">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#3D6B4F" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-ink">Meal logged!</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-ink mb-1">Log a meal</h1>
      <p className="text-xs text-ink-3 mb-6">Enter nutrition info manually or pick a quick option below.</p>

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
            <input
              type="number"
              min={0}
              step={0.1}
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              className="input"
              placeholder="0"
            />
          </div>
          <div>
            <label className="label">Carbs (g)</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              className="input"
              placeholder="0"
            />
          </div>
          <div>
            <label className="label">Fat (g)</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              className="input"
              placeholder="0"
            />
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn btn-primary w-full">
          {saving ? "Saving…" : "Save meal"}
        </button>
      </form>
    </div>
  );
}
