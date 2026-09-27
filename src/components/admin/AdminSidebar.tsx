"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Megaphone,
  Mail,
  FolderOpen,
  Boxes,
  KeyRound,
  Bell,
  MessageSquareWarning,
  ScrollText,
  ShieldCheck,
  Inbox,
  FileText,
  Flag,
  Wrench,
  Activity,
  LifeBuoy,
  Settings,
  Menu,
  X,
  LogOut,
  Home,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const SECTIONS: { title: string; items: { href: string; label: string; icon: React.ElementType }[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/system", label: "System", icon: Activity },
      { href: "/admin/logs", label: "Audit Logs", icon: ScrollText },
      { href: "/admin/security", label: "Security", icon: ShieldCheck },
    ],
  },
  {
    title: "Users",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
      { href: "/admin/api-keys", label: "API Keys", icon: KeyRound },
      { href: "/admin/files", label: "Files", icon: FolderOpen },
      { href: "/admin/feedback", label: "Feedback", icon: MessageSquareWarning },
      { href: "/admin/support", label: "Support", icon: LifeBuoy },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/admin/ads", label: "Ads", icon: Megaphone },
      { href: "/admin/announcements", label: "Announcements", icon: Bell },
      { href: "/admin/notifications", label: "Notifications", icon: Inbox },
      { href: "/admin/emails", label: "Emails", icon: Mail },
      { href: "/admin/pages", label: "Pages", icon: FileText },
    ],
  },
  {
    title: "Platform",
    items: [
      { href: "/admin/models", label: "Models", icon: Boxes },
      { href: "/admin/feature-flags", label: "Feature Flags", icon: Flag },
      { href: "/admin/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function AdminSidebar({
  adminName,
  adminRole,
}: {
  adminName: string;
  adminRole: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const supabase = createClient();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const body = (
    <div className="flex h-full flex-col bg-ink-900">
      <div className="flex items-center justify-between px-4 pt-5">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
            <span className="h-2 w-2 rounded-full bg-white" />
          </span>
          <span className="text-sm font-semibold text-white">
            Human AI <span className="text-accent">Admin</span>
          </span>
        </Link>
        <button className="btn-ghost p-1.5 lg:hidden" onClick={() => setOpen(false)} aria-label="Close">
          <X size={17} />
        </button>
      </div>

      <nav className="mt-4 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
              {s.title}
            </p>
            <div className="space-y-0.5">
              {s.items.map((item) => {
                const active =
                  item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`nav-link !py-1.5 text-[13px] ${active ? "nav-link-active" : ""}`}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-800 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-700 text-xs font-semibold text-white">
            {(adminName[0] ?? "?").toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-zinc-200">{adminName}</span>
            <span className="block text-[11px] uppercase tracking-wide text-accent">{adminRole}</span>
          </span>
        </div>
        <div className="mt-1 flex gap-1">
          <Link href="/" className="btn-ghost flex-1 text-xs">
            <Home size={14} /> App
          </Link>
          <button onClick={logout} className="btn-ghost flex-1 text-xs">
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        className="btn-ghost fixed left-3 top-3 z-40 border border-ink-700 bg-ink-900 p-2 lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open admin menu"
      >
        <Menu size={18} />
      </button>
      <aside className="hidden w-60 shrink-0 border-r border-ink-800 lg:block">{body}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900">{body}</aside>
        </div>
      )}
    </>
  );
}
