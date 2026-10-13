"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid,
  KeyRound,
  FileText,
  Info,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "../Logo";

const LINKS = [
  { href: "/platform", label: "Overview", icon: LayoutGrid },
  { href: "/platform/api", label: "API Keys", icon: KeyRound },
  { href: "/platform/api/docs", label: "Docs", icon: FileText },
  { href: "/platform/about", label: "About", icon: Info },
];

/** Platform-only sidebar: static links, zero data fetching per navigation. */
function PlatformNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col bg-ink-900">
      <div className="flex items-center px-4 pt-5">
        <Logo />
      </div>
      <p className="px-4 pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
        Platform
      </p>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {LINKS.map((item) => {
          const active =
            item.href === "/platform" ? pathname === "/platform" : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`nav-link relative ${active ? "nav-link-active" : ""}`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
              )}
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-ink-800 p-3">
        <Link href="/" className="btn-ghost w-full text-[13px]">
          ← Back to chat
        </Link>
        <Link href="/login" className="mt-1.5 block text-center text-xs text-zinc-500 hover:text-white">
          Log in
        </Link>
      </div>
    </div>
  );
}

/**
 * Standalone shell for /platform — deliberately different from the chat
 * experience: platform sidebar instead of chat history, no per-navigation
 * data fetching, instant transitions.
 */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden bg-black">
      <button
        className="btn-ghost fixed left-3 top-3 z-40 border border-ink-700 bg-ink-900 p-2 shadow-sm lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>
      <aside className="relative hidden w-60 shrink-0 border-r border-ink-800 lg:block">
        <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px] bg-gradient-to-b from-accent via-accent to-accent-muted" />
        <PlatformNav />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900 shadow-2xl">
            <div className="flex justify-end p-2">
              <button className="btn-ghost p-2" onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <div className="h-[calc(100%-52px)]">
              <PlatformNav onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
