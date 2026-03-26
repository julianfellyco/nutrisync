"use client";

import { useMemo } from "react";
import { format, parseISO, subDays, eachDayOfInterval } from "date-fns";
import { HealthLog } from "@/lib/api";

interface Props { logs: HealthLog[] }

// GitHub-style 30-day activity heatmap based on step counts
export function ActivityHeatmap({ logs }: Props) {
  const { days, max } = useMemo(() => {
    const today    = new Date();
    const allDays  = eachDayOfInterval({ start: subDays(today, 29), end: today });
    const stepsByDay = new Map<string, number>();

    for (const log of logs) {
      const key   = format(parseISO(log.logged_at), "yyyy-MM-dd");
      const steps = (log.payload as Record<string, number>).steps ?? 0;
      stepsByDay.set(key, (stepsByDay.get(key) ?? 0) + steps);
    }

    const days = allDays.map((d) => ({
      date:  format(d, "yyyy-MM-dd"),
      label: format(d, "MMM d"),
      steps: stepsByDay.get(format(d, "yyyy-MM-dd")) ?? 0,
    }));

    const max = Math.max(...days.map((d) => d.steps), 1);
    return { days, max };
  }, [logs]);

  function colorForSteps(steps: number) {
    const ratio = steps / max;
    if (ratio === 0)   return "bg-gray-100";
    if (ratio < 0.25)  return "bg-green-100";
    if (ratio < 0.5)   return "bg-green-300";
    if (ratio < 0.75)  return "bg-green-500";
    return "bg-green-700";
  }

  // Split into 5-day columns for a compact grid
  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div>
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.label}: ${day.steps.toLocaleString()} steps`}
                className={`w-7 h-7 rounded-sm ${colorForSteps(day.steps)} cursor-default`}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 mt-3 text-xs text-gray-400">
        <span>Less</span>
        {["bg-gray-100", "bg-green-100", "bg-green-300", "bg-green-500", "bg-green-700"].map((c) => (
          <div key={c} className={`w-4 h-4 rounded-sm ${c}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
