"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import clsx from "clsx";

const NAV = [
  {
    href: "/client",
    label: "Dashboard",
    icon: (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
      </svg>
    ),
  },
  {
    href: "/client/log",
    label: "Log meal",
    icon: (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
      </svg>
    ),
  },
  {
    href: "/client/chat",
    label: "AI Nutritionist",
    icon: (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
    ),
  },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [name, setName]   = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.auth.me()
      .then((u) => {
        if (u.role !== "client") {
          api.auth.logout();
          router.replace("/login");
          return;
        }
        setName(u.name);
        setReady(true);
      })
      .catch(() => {
        api.auth.logout();
        router.replace("/login");
      });
  }, [router]);

  const initials = name
    ? name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "…";

  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 flex flex-col bg-surface border-r border-black/[0.07]">
        <div className="h-14 flex items-center px-5 border-b border-black/[0.05]">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded bg-sage-500 shrink-0" />
            <span className="text-sm font-semibold tracking-tight text-ink">NutriSync</span>
          </div>
        </div>

        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {NAV.map((item) => {
            const active = item.href === "/client"
              ? pathname === "/client"
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

      <main className="flex-1 min-w-0 overflow-y-auto">
        {ready ? children : (
          <div className="flex items-center justify-center h-full">
            <div className="w-4 h-4 rounded-full border-2 border-sage-200 border-t-sage-500 animate-spin" />
          </div>
        )}
      </main>
    </div>
  );
}
