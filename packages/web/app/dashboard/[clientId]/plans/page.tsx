"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, Plan } from "@/lib/api";
import { PlanBuilder } from "@/components/plan-editor/PlanBuilder";

export default function PlansPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [plans, setPlans]   = useState<Plan[]>([]);
  const [active, setActive] = useState<Plan | null>(null);
  const [tab, setTab]       = useState<"meal" | "workout">("meal");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    api.plans.list(clientId).then((data) => {
      setPlans(data);
      const first = data.find((p) => p.plan_type === tab);
      setActive(first ?? null);
    });
  }, [clientId, tab]);

  async function handleSave(plan: Plan) {
    setSaving(true);
    try {
      let updated: Plan;
      if (plan.id) {
        updated = await api.plans.update(plan.id, { content: plan.content });
      } else {
        updated = await api.plans.create({ ...plan, client_id: clientId });
      }
      setActive(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function newPlan() {
    const today = new Date().toISOString().split("T")[0];
    const end   = new Date(Date.now() + 7 * 86400_000).toISOString().split("T")[0];
    setActive({
      id: "",
      client_id: clientId,
      plan_type: tab,
      valid_from: today,
      valid_to: end,
      version: 1,
      content: {
        days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => ({
          id: crypto.randomUUID(),
          label,
          items: [],
        })),
      },
    });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Plans</h1>
        <button
          onClick={newPlan}
          className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 transition"
        >
          + New plan
        </button>
      </div>

      {/* Meal / Workout tabs */}
      <div className="flex gap-2 mb-6">
        {(["meal", "workout"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t ? "bg-green-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)} plan
          </button>
        ))}
      </div>

      {active ? (
        <PlanBuilder
          plan={active}
          onChange={setActive}
          onSave={handleSave}
          saving={saving}
          saved={saved}
        />
      ) : (
        <div className="text-center py-24 text-gray-400">
          <p className="text-lg mb-2">No {tab} plan yet.</p>
          <button onClick={newPlan} className="text-green-600 hover:underline text-sm">
            Create one
          </button>
        </div>
      )}
    </div>
  );
}
