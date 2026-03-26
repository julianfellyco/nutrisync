"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError, Client, ClientProfileUpdate } from "@/lib/api";

const GOALS = [
  { value: "gain_muscle",     label: "Gain muscle" },
  { value: "lose_weight",     label: "Lose weight" },
  { value: "maintain",        label: "Maintain weight" },
  { value: "general_wellness", label: "General wellness" },
  { value: "endurance",       label: "Endurance" },
];

const RESTRICTIONS = [
  "gluten-free", "dairy-free", "vegan", "vegetarian",
  "keto", "paleo", "nut-free", "halal", "kosher",
];

export default function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();

  const [client, setClient]       = useState<Client | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  const [goal, setGoal]               = useState("");
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [calories, setCalories]       = useState("");
  const [protein, setProtein]         = useState("");
  const [carbs, setCarbs]             = useState("");
  const [fat, setFat]                 = useState("");
  const [dob, setDob]                 = useState("");
  const [height, setHeight]           = useState("");
  const [weight, setWeight]           = useState("");

  useEffect(() => {
    api.clients.get(clientId)
      .then((c) => {
        setClient(c);
        const p = c.profile;
        if (!p) return;
        setGoal(p.fitness_goal ?? "");
        setRestrictions(p.dietary_restrictions ?? []);
        setCalories(String(p.macro_targets?.calories ?? ""));
        setProtein(String(p.macro_targets?.protein_g ?? ""));
        setCarbs(String(p.macro_targets?.carbs_g ?? ""));
        setFat(String(p.macro_targets?.fat_g ?? ""));
        setDob(p.dob ?? "");
        setHeight(String(p.height_cm ?? ""));
        setWeight(String(p.weight_kg ?? ""));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clientId]);

  function toggleRestriction(r: string) {
    setRestrictions((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const body: ClientProfileUpdate = {
      fitness_goal:         goal || undefined,
      dietary_restrictions: restrictions,
      macro_targets: (calories || protein || carbs || fat) ? {
        calories:  parseFloat(calories) || 0,
        protein_g: parseFloat(protein)  || 0,
        carbs_g:   parseFloat(carbs)    || 0,
        fat_g:     parseFloat(fat)      || 0,
      } : undefined,
      dob:       dob || undefined,
      height_cm: height ? parseFloat(height) : undefined,
      weight_kg: weight ? parseFloat(weight) : undefined,
    };
    try {
      const updated = await api.clients.update(clientId, body);
      setClient(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-4 h-4 rounded-full border-2 border-sage-100 border-t-sage-500 animate-spin" />
    </div>
  );

  return (
    <div className="px-8 py-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => router.back()} className="text-ink-3 hover:text-ink transition-colors">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-semibold text-ink leading-tight">Edit profile</h1>
          {client && <p className="text-xs text-ink-3">{client.name} · {client.email}</p>}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2.5">{error}</p>
        )}
        {saved && (
          <p className="text-xs text-sage-600 bg-sage-50 border border-sage-100 rounded px-3 py-2.5">Saved.</p>
        )}

        {/* Body */}
        <Section title="Body stats">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date of birth" type="date"   value={dob}    onChange={setDob} />
            <Field label="Height (cm)"   type="number" value={height} onChange={setHeight} placeholder="178" />
            <Field label="Weight (kg)"   type="number" value={weight} onChange={setWeight} placeholder="75.0" />
          </div>
        </Section>

        {/* Goal */}
        <Section title="Fitness goal">
          <div className="flex flex-wrap gap-1.5">
            {GOALS.map((g) => (
              <button
                key={g.value} type="button"
                onClick={() => setGoal(g.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  goal === g.value
                    ? "bg-sage-500 text-white border-sage-500"
                    : "border-black/10 text-ink-2 hover:border-sage-300 bg-white"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Restrictions */}
        <Section title="Dietary restrictions">
          <div className="flex flex-wrap gap-1.5">
            {RESTRICTIONS.map((r) => (
              <button
                key={r} type="button"
                onClick={() => toggleRestriction(r)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  restrictions.includes(r)
                    ? "bg-amber-500 text-white border-amber-500"
                    : "border-black/10 text-ink-2 hover:border-amber-300 bg-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </Section>

        {/* Macros */}
        <Section title="Daily macro targets">
          <div className="grid grid-cols-4 gap-3">
            <Field label="Calories"  type="number" value={calories} onChange={setCalories} placeholder="2500" />
            <Field label="Protein g" type="number" value={protein}  onChange={setProtein}  placeholder="150" />
            <Field label="Carbs g"   type="number" value={carbs}    onChange={setCarbs}    placeholder="250" />
            <Field label="Fat g"     type="number" value={fat}      onChange={setFat}      placeholder="80" />
          </div>
        </Section>

        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">{title}</p>
      {children}
    </div>
  );
}

function Field({
  label, type, value, onChange, placeholder,
}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </div>
  );
}
