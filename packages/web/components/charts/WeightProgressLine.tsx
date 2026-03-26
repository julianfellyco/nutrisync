"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { HealthLog } from "@/lib/api";

interface Props { logs: HealthLog[] }

export function WeightProgressLine({ logs }: Props) {
  const data = useMemo(() =>
    logs
      .filter((l) => (l.payload as Record<string, unknown>).weight_kg != null)
      .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
      .map((l) => ({
        date:   format(parseISO(l.logged_at), "MMM d"),
        weight: (l.payload as Record<string, number>).weight_kg,
      })),
    [logs],
  );

  if (data.length === 0) return <Empty />;

  const first = data[0].weight;
  const last  = data[data.length - 1].weight;
  const delta = (last - first).toFixed(1);
  const isDown = last < first;

  return (
    <div>
      <p className={`text-sm font-medium mb-3 ${isDown ? "text-green-600" : "text-orange-500"}`}>
        {isDown ? "▼" : "▲"} {Math.abs(Number(delta))} kg over period
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} unit=" kg" />
          <Tooltip formatter={(v: number) => [`${v} kg`, "Weight"]} />
          <ReferenceLine y={first} stroke="#ccc" strokeDasharray="4 2" />
          <Line
            type="monotone" dataKey="weight"
            stroke="#4CAF50" strokeWidth={2}
            dot={{ r: 3, fill: "#4CAF50" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-gray-400 text-center py-16">No weight data in this period.</p>;
}
