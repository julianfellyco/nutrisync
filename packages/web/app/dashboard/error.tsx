"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (error.message?.toLowerCase().includes("not authenticated") ||
        error.message?.toLowerCase().includes("unauthorized")) {
      router.replace("/login");
    }
  }, [error, router]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-6">
      <p className="text-sm font-medium text-ink mb-1">Something went wrong</p>
      <p className="text-xs text-ink-3 mb-6 max-w-xs">{error.message}</p>
      <div className="flex gap-2">
        <button onClick={reset} className="btn btn-primary">Try again</button>
        <button onClick={() => router.push("/dashboard")} className="btn btn-ghost">
          Back to clients
        </button>
      </div>
    </div>
  );
}
