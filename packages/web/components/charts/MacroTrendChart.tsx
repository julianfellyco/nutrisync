"use client";

import { useMemo } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { HealthLog } from "@/lib/api";

interface Props { logs: HealthLog[] }

export function MacroTrendChart({ logs }: Props) {
  const data = useMemo(() => {
    // Group meal logs by calendar day, sum macros
    const byDay = new Map<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number; count: number }>();

    for (const log of logs) {
      const day = format(startOfDay(parseISO(log.logged_at)), "MMM d");
      const p = log.payload as Record<string, number>;
      const existing = byDay.get(day) ?? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, count: 0 };
      byDay.set(day, {
        calories:  existing.calories  + (p.calories  ?? 0),
        protein_g: existing.protein_g + (p.protein_g ?? 0),
        carbs_g:   existing.carbs_g   + (p.carbs_g   ?? 0),
        fat_g:     existing.fat_g     + (p.fat_g     ?? 0),
        count:     existing.count + 1,
      });
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, ...v }));
  }, [logs]);

  if (data.length === 0) return <Empty />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          {[
            { id: "cal", color: "#4CAF50" },
            { id: "pro", color: "#2196F3" },
            { id: "carb", color: "#FF9800" },
            { id: "fat", color: "#F44336" },
          ].map(({ id, color }) => (
            <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Area type="monotone" dataKey="calories"  stroke="#4CAF50" fill="url(#cal)"  name="Calories"  />
        <Area type="monotone" dataKey="protein_g" stroke="#2196F3" fill="url(#pro)"  name="Protein g" />
        <Area type="monotone" dataKey="carbs_g"   stroke="#FF9800" fill="url(#carb)" name="Carbs g"   />
        <Area type="monotone" dataKey="fat_g"     stroke="#F44336" fill="url(#fat)"  name="Fat g"     />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Empty() {
  return <p className="text-sm text-gray-400 text-center py-16">No meal data in this period.</p>;
}
