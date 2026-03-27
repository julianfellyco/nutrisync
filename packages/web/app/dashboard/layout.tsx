"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ToastProvider } from "@/components/ui/toast";
import clsx from "clsx";

const NAV = [
  {
    href: "/dashboard",
    label: "Clients",
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z"/>
      </svg>
    ),
  },
  {
    href: "/dashboard/invite",
    label: "Add client",
    icon: (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
      </svg>
    ),
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [name, setName]   = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.auth.me()
      .then((u) => {
        if (u.role !== "consultant") {
          router.replace("/client");
          return;
        }
        setName(u.name);
        setReady(true);
      })
      .catch(() => {
        api.auth.logout();   // clear stale/invalid tokens — prevents redirect loop
        router.replace("/login");
      });
  }, [router]);

  const initials = name
    ? name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "…";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 flex flex-col bg-surface border-r border-black/[0.07]">

        {/* Wordmark */}
        <div className="h-14 flex items-center px-5 border-b border-black/[0.05]">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded bg-sage-500 shrink-0" />
            <span className="text-sm font-semibold tracking-tight text-ink">NutriSync</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {NAV.map((item) => {
            const active = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors",
                  active
                    ? "bg-sage-50 text-sage-600 font-medium"
                    : "text-ink-2 hover:bg-black/[0.04]",
                )}
              >
                <span className={clsx("shrink-0", active ? "text-sage-500" : "text-ink-3")}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-2.5 py-3 border-t border-black/[0.05]">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <div className="w-7 h-7 rounded-full bg-sage-100 flex items-center justify-center text-xs font-semibold text-sage-700 shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-ink truncate">{name || "…"}</p>
              <button
                onClick={() => { api.auth.logout(); router.push("/login"); }}
                className="text-2xs text-ink-3 hover:text-rose-600 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <ToastProvider>
          {ready ? children : (
            <div className="flex items-center justify-center h-full">
              <div className="w-4 h-4 rounded-full border-2 border-sage-200 border-t-sage-500 animate-spin" />
            </div>
          )}
        </ToastProvider>
      </main>
    </div>
  );
}
