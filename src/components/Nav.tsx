"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const TABS = [
  { href: "/", label: "Home", icon: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/browse", label: "Browse", icon: "M4 5h16v14H4zM4 9h16M9 5v14" },
  { href: "/search", label: "Search", icon: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4" },
  { href: "/for-you", label: "For you", icon: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" },
  { href: "/favorites", label: "My lists", icon: "M6 3h12v18l-6-4-6 4z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Nav({ unread }: { unread: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-night-line bg-night/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            Watchlist
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.filter((t) => t.href !== "/search").map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-full px-3 py-1.5 text-sm ${isActive(t.href) ? "bg-night-raised text-paper" : "text-paper-muted hover:text-paper"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <form
            className="ml-auto hidden md:block"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
            }}
          >
            <input
              className="input w-64 rounded-full py-1.5 text-sm"
              placeholder="Search all your services"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search"
            />
          </form>
          <Link href="/alerts" className="relative ml-auto text-paper-muted hover:text-paper md:ml-0" aria-label={`Alerts, ${unread} new`}>
            <Icon d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0" />
            {unread > 0 && (
              <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-flare px-1 text-[10px] font-bold text-night">
                {unread}
              </span>
            )}
          </Link>
          <Link href="/settings" className="text-paper-muted hover:text-paper" aria-label="Settings">
            <Icon d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.8 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.8-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.8H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 002.8-1.2V3a2 2 0 114 0v.1a1.7 1.7 0 002.8 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.8H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1.1z" />
          </Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-night-line bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive(t.href) ? "text-marquee" : "text-paper-muted"}`}
            >
              <Icon d={t.icon} />
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
