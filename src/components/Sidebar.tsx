"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  MessageSquarePlus,
  MessagesSquare,
  Puzzle,
  LibraryBig,
  Plug,
  Crown,
  Bot,
  Monitor,
  User,
  Settings,
  Brain,
  LayoutGrid,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Pencil,
  Trash2,
  ChevronUp,
} from "lucide-react";
import { Logo } from "./Logo";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface ChatItem {
  id: string;
  title: string | null;
  model_id: string;
  updated_at: string;
}

/** Workspace-only navigation. Account-level pages live in the user menu. */
const NAV = [
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/desktop", label: "Desktop", icon: Monitor },
  { href: "/plugins", label: "Plugins", icon: Puzzle },
  { href: "/library", label: "Library", icon: LibraryBig },
  { href: "/mcp", label: "MCP Servers", icon: Plug },
  { href: "/chess", label: "Chess", icon: Crown },
];

const USER_MENU = [
  { href: "/account", label: "Account", icon: Settings },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/platform", label: "Platform", icon: LayoutGrid },
];

function groupLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 8) return "Previous 7 days";
  if (diffDays < 31) return "Previous 30 days";
  return "Older";
}

export function Sidebar({
  user,
  chats: initialChats,
  dbError = false,
}: {
  user: SupabaseUser | null;
  chats: ChatItem[];
  dbError?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState(initialChats);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setChats(initialChats), [initialChats]);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => setMenuOpen(false), [pathname]);

  // Live sidebar: single realtime subscription on the user's chats.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`sidebar-chats-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chats",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as ChatItem;
            setChats((cs) => (cs.some((c) => c.id === row.id) ? cs : [row, ...cs]));
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as ChatItem;
            setChats((cs) =>
              cs.map((c) => (c.id === row.id ? { ...c, ...row } : c))
            );
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string };
            setChats((cs) => cs.filter((c) => c.id !== old.id));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /** Create a REAL persistent chat record, then navigate to it. */
  async function newChatId() {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
        : Math.random().toString(36).slice(2, 14);
    setOpen(false);
    if (user) {
      const row = {
        id,
        user_id: user.id,
        model_id: DEFAULT_MODEL_ID,
        title: "New Chat",
        updated_at: new Date().toISOString(),
      };
      setChats((cs) => [row, ...cs]);
      const { error } = await supabase.from("chats").insert({
        id,
        user_id: user.id,
        model_id: DEFAULT_MODEL_ID,
        title: "New Chat",
      });
      if (error) {
        setChats((cs) => cs.filter((c) => c.id !== id));
      }
      router.refresh();
    }
    router.push(`/chat/${id}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        void newChatId();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function renameChat(id: string) {
    const title = editTitle.trim().slice(0, 80);
    setEditingId(null);
    if (!title) return;
    setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
    await supabase.from("chats").update({ title }).eq("id", id);
    router.refresh();
  }

  async function deleteChat(id: string) {
    if (!confirm("Delete this chat and all its messages?")) return;
    setChats((cs) => cs.filter((c) => c.id !== id));
    await supabase.from("messages").delete().eq("chat_id", id);
    await supabase.from("chats").delete().eq("id", id);
    if (pathname?.includes(id)) router.push("/");
    router.refresh();
  }

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? chats.filter((c) => (c.title || "New Chat").toLowerCase().includes(q))
      : chats;
    const groups = new Map<string, ChatItem[]>();
    for (const c of list) {
      const g = groupLabel(c.updated_at);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(c);
    }
    return groups;
  }, [chats, query]);

  const userName = user?.user_metadata?.name ?? "Human AI user";
  const userInitial = (user?.user_metadata?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  const newChatButton = (
    <button
      onClick={() => void newChatId()}
      title="New chat (Ctrl+K)"
      className={
        collapsed
          ? "flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white shadow-lg shadow-accent/25 transition-colors hover:bg-accent-hover"
          : "flex w-full items-center gap-2.5 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/25 transition-colors hover:bg-accent-hover"
      }
    >
      <MessageSquarePlus size={17} />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">New Chat</span>
          <kbd className="rounded-md bg-black/25 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white/85">
            Ctrl K
          </kbd>
        </>
      )}
    </button>
  );

  const navList = (
    <div className="space-y-0.5">
      {NAV.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={`nav-link relative ${active ? "nav-link-active" : ""} ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            {active && !collapsed && (
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
            )}
            <item.icon size={18} />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </div>
  );

  const chatList = !collapsed && (
    <div className="pt-1">
      <p className="px-3 pb-1.5 pt-2 text-xs font-medium text-zinc-500">Chats</p>
      {dbError && (
        <p className="mx-1 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-5 text-amber-200">
          Chat history unavailable — database tables missing. Run{" "}
          <code className="font-mono">supabase/schema.sql</code> in the Supabase
          SQL editor once.
        </p>
      )}
      <div className="relative px-0 pb-2">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats…"
          className="w-full rounded-lg border border-ink-700 bg-ink-850 py-1.5 pl-8 pr-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-ink-600 focus:outline-none"
        />
      </div>
      {filtered.size === 0 && (
        <p className="px-3 py-4 text-center text-xs text-zinc-500">
          {query ? "No chats match your search." : "No chats yet."}
        </p>
      )}
      {Array.from(filtered.entries()).map(([group, items]) => (
        <div key={group} className="pt-1">
          <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
            {group}
          </p>
          <div className="space-y-px">
            {items.map((c) => {
              const active = pathname?.includes(c.id);
              const editing = editingId === c.id;
              return (
                <div
                  key={c.id}
                  className={`group relative flex items-center rounded-lg transition-colors ${
                    active ? "bg-ink-800" : "hover:bg-ink-850"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
                  )}
                  {editing ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void renameChat(c.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => void renameChat(c.id)}
                      className="mx-1 my-0.5 w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-[13px] text-zinc-100 focus:outline-none"
                    />
                  ) : (
                    <>
                      <Link
                        href={`/chat/${c.id}`}
                        className={`min-w-0 flex-1 truncate py-1.5 pl-4 pr-1 text-[13px] ${
                          active ? "font-medium text-white" : "text-zinc-400"
                        }`}
                      >
                        {c.title || "New Chat"}
                      </Link>
                      <span className="hidden shrink-0 items-center pr-1 group-hover:flex">
                        <button
                          onClick={() => {
                            setEditTitle(c.title || "");
                            setEditingId(c.id);
                          }}
                          className="rounded-md p-1.5 text-zinc-500 hover:bg-ink-700 hover:text-zinc-200"
                          aria-label="Rename chat"
                          title="Rename"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => void deleteChat(c.id)}
                          className="rounded-md p-1.5 text-zinc-500 hover:bg-accent/15 hover:text-accent"
                          aria-label="Delete chat"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const userCard = user ? (
    collapsed ? (
      <div className="flex justify-center p-2">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title={user.email ?? "Account menu"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-700 text-xs font-semibold text-white transition-transform hover:scale-105"
        >
          {userInitial}
        </button>
      </div>
    ) : (
      <div className="relative p-3">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-ink-800"
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-semibold text-white">
            {userInitial}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-900 bg-emerald-500" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-zinc-100">
              {userName}
            </span>
            <span className="block truncate text-xs text-zinc-500">{user.email}</span>
          </span>
          <ChevronUp
            size={15}
            className={`shrink-0 text-zinc-500 transition-transform duration-200 ${menuOpen ? "" : "rotate-180"}`}
          />
        </button>
      </div>
    )
  ) : (
    !collapsed && (
      <div className="space-y-2 p-3">
        <Link href="/login" className="btn-ghost w-full border border-ink-700">
          Log in
        </Link>
        <Link href="/signup" className="btn-primary w-full">
          Sign up
        </Link>
      </div>
    )
  );

  /** Dark premium user menu: Account, Profile, Memory, Platform + separated Logout. */
  const userMenu = menuOpen && user && (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
      <div
        role="menu"
        className={`absolute z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#141417] shadow-2xl shadow-black/60 animate-menu-in ${
          collapsed
            ? "bottom-2 left-full ml-3 w-60"
            : "inset-x-3 bottom-full mb-2"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
            {userInitial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">
              {userName}
            </span>
            <span className="block truncate text-xs text-zinc-400">{user.email}</span>
          </span>
        </div>
        <div className="p-1.5">
          {USER_MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <item.icon size={16} className="text-zinc-500" />
              {item.label}
            </Link>
          ))}
        </div>
        <div className="border-t border-white/10 p-1.5">
          <button
            onClick={handleLogout}
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-accent/15 hover:text-red-300"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>
    </>
  );

  const body = (
    <div className={`relative flex h-full flex-col bg-ink-900 ${collapsed ? "items-center" : ""}`}>
      <div
        className={`flex items-center ${collapsed ? "justify-center px-0 pt-4" : "justify-between px-4 pt-4"}`}
      >
        {!collapsed && <Logo />}
        <button
          className="btn-ghost hidden p-2 lg:block"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <button
          className="btn-ghost p-2 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <div className={`${collapsed ? "px-2 pt-4" : "px-3 pt-4"}`}>{newChatButton}</div>

      {user ? (
        <>
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-3 py-1">
            {chatList}
          </div>
          <nav className="border-t border-ink-800 px-3 py-2">{navList}</nav>
        </>
      ) : (
        <nav className={`mt-2 flex-1 overflow-y-auto py-2 ${collapsed ? "w-full px-2" : "px-3"}`}>
            {!collapsed ? (
              <>
                <Link
                  href="/platform/about"
                  className={`nav-link ${isActive("/platform") ? "nav-link-active" : ""}`}
                >
                  <LayoutGrid size={18} />
                  About
                </Link>
                <Link
                  href="/terms"
                  className={`nav-link ${isActive("/terms") ? "nav-link-active" : ""}`}
                >
                  <MessagesSquare size={18} />
                  Terms
                </Link>
              </>
            ) : (
              <div className="space-y-0.5">
                <Link href="/platform/about" title="About" className="nav-link justify-center px-0">
                  <LayoutGrid size={18} />
                </Link>
                <Link href="/terms" title="Terms" className="nav-link justify-center px-0">
                  <MessagesSquare size={18} />
                </Link>
              </div>
            )}
          </nav>
        )}

      <div className={`relative border-t border-ink-800 ${collapsed ? "w-full" : ""}`}>
        {userCard}
        {userMenu}
      </div>
    </div>
  );

  return (
    <>
      <button
        className="btn-ghost fixed left-3 top-3 z-40 border border-ink-700 bg-ink-900 p-2 shadow-sm lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>
      <aside
        className={`relative hidden shrink-0 border-r border-ink-800 transition-all duration-200 lg:block ${
          collapsed ? "w-16" : "w-72"
        }`}
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px] bg-gradient-to-b from-accent via-accent to-accent-muted" />
        {body}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900 shadow-2xl">
            <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px] bg-gradient-to-b from-accent via-accent to-accent-muted" />
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
