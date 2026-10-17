"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  MessageSquarePlus,
  MessagesSquare,
  User,
  Settings,
  Brain,
  LayoutGrid,
  AudioLines,
  Hammer,
  Image as ImageIcon,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Pencil,
  Trash2,
  ChevronUp,
  FolderCode,
  Sparkles,
  Rocket,
  ExternalLink,
} from "lucide-react";
import { Logo } from "./Logo";
import { PlanBadge } from "./PlanBadge";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface ChatItem {
  id: string;
  title: string | null;
  model_id: string;
  updated_at: string;
}

export interface BuildProjectItem {
  id: string;
  title: string;
  brief?: string;
  status?: string;
  updated_at?: string;
}

/** Core navigation lives here; tools and explorables moved to /platform. */
const NAV = [
  { href: "/platform", label: "Platform", icon: LayoutGrid },
  { href: "/images", label: "Images", icon: ImageIcon },
  { href: "/text2voice", label: "Text2Voice", icon: AudioLines },
  { href: "/build", label: "Build", icon: Hammer },
];

const USER_MENU = [
  { href: "/account", label: "Account", icon: Settings },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/memory", label: "Memory", icon: Brain },
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
  buildProjects: initialProjects = [],
  dbError = false,
}: {
  user: SupabaseUser | null;
  chats: ChatItem[];
  buildProjects?: BuildProjectItem[];
  dbError?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState(initialChats);
  const [projects, setProjects] = useState(initialProjects);
  const [sidebarTab, setSidebarTab] = useState<"chats" | "build">("chats");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setChats(initialChats), [initialChats]);
  useEffect(() => setProjects(initialProjects), [initialProjects]);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => setMenuOpen(false), [pathname]);

  // Automatically switch tab based on current route
  useEffect(() => {
    if (pathname?.startsWith("/build")) {
      setSidebarTab("build");
    }
  }, [pathname]);

  // Auto-collapse the sidebar on desktop for the chat/landing surfaces.
  useEffect(() => {
    if (pathname === "/" || pathname?.startsWith("/chat")) {
      setCollapsed(true);
    } else {
      setCollapsed(false);
    }
  }, [pathname]);

  // Live sidebar: single realtime subscription on the user's chats and build_projects.
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "build_projects",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as BuildProjectItem;
            setProjects((ps) => (ps.some((p) => p.id === row.id) ? ps : [row, ...ps]));
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as BuildProjectItem;
            setProjects((ps) => ps.map((p) => (p.id === row.id ? { ...p, ...row } : p)));
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string };
            setProjects((ps) => ps.filter((p) => p.id !== old.id));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /** New chats live at /chat/new (id flips to /chat/[id] on first send). */
  async function newChatId() {
    setOpen(false);
    router.push("/chat/new");
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

  async function deleteProject(id: string) {
    if (!confirm("Delete this build project and its files?")) return;
    setProjects((ps) => ps.filter((p) => p.id !== id));
    await fetch(`/api/build/projects/${id}`, { method: "DELETE" }).catch(() => {});
    if (pathname?.includes(id)) router.push("/build/chat/new");
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

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? projects.filter((p) => (p.title || p.id).toLowerCase().includes(q) || (p.brief || "").toLowerCase().includes(q))
      : projects;
    const groups = new Map<string, BuildProjectItem[]>();
    for (const p of list) {
      const g = groupLabel(p.updated_at || new Date().toISOString());
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(p);
    }
    return groups;
  }, [projects, query]);

  const userName = user?.user_metadata?.name ?? "Human AI user";
  const userInitial = (user?.user_metadata?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  const newChatButton = (
    <button
      onClick={() => void newChatId()}
      title="New chat (Ctrl+K)"
      className={
        collapsed
          ? "flex h-10 w-10 items-center justify-center rounded-xl bg-[#6b1519] text-white shadow-lg shadow-[#6b1519]/25 transition-colors hover:bg-[#8a1c20]"
          : "flex w-full items-center gap-2.5 rounded-xl bg-[#6b1519] px-3 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#6b1519]/25 transition-colors hover:bg-[#8a1c20]"
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
      {/* Switcher: AI Chats vs Build Projects */}
      <div className="mb-2 flex items-center gap-1 rounded-xl bg-ink-850 p-1">
        <button
          onClick={() => setSidebarTab("chats")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            sidebarTab === "chats"
              ? "bg-ink-700 text-white shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <MessagesSquare size={13} />
          <span>Chats</span>
          <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] text-zinc-300">
            {chats.length}
          </span>
        </button>
        <button
          onClick={() => setSidebarTab("build")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
            sidebarTab === "build"
              ? "bg-[#6b1519]/20 text-[#9a2228] ring-1 ring-[#6b1519]/30 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Hammer size={13} />
          <span>Build</span>
          <span className="rounded-full bg-[#6b1519]/20 px-1.5 py-0.2 text-[10px] text-[#9a2228]">
            {projects.length}
          </span>
        </button>
      </div>

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
          placeholder={sidebarTab === "chats" ? "Search chats…" : "Search projects…"}
          className="w-full rounded-lg border border-ink-700 bg-ink-850 py-1.5 pl-8 pr-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-ink-600 focus:outline-none"
        />
      </div>

      {sidebarTab === "chats" ? (
        /* Regular Chats List */
        <>
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
        </>
      ) : (
        /* Build Projects History List */
        <>
          <div className="mb-2 px-1">
            <Link
              href="/build/chat/new"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#6b1519]/20 bg-[#6b1519]/10 py-1.5 text-xs font-semibold text-[#9a2228] hover:bg-[#6b1519]/20"
            >
              <Sparkles size={13} />
              <span>New Build Chat</span>
            </Link>
          </div>
          {filteredProjects.size === 0 && (
            <p className="px-3 py-4 text-center text-xs text-zinc-500">
              {query ? "No projects match your search." : "No build projects yet."}
            </p>
          )}
          {Array.from(filteredProjects.entries()).map(([group, items]) => (
            <div key={group} className="pt-1">
              <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                {group}
              </p>
              <div className="space-y-1">
                {items.map((p) => {
                  const active = pathname?.includes(p.id);
                  const userUrl = user
                    ? `/build/${user.id}/${encodeURIComponent(user.email ?? "user")}/${p.id}/`
                    : `/build/chat/new/${p.id}`;

                  return (
                    <div
                      key={p.id}
                      className={`group relative rounded-lg border border-white/[0.04] p-2 transition-all ${
                        active ? "bg-[#6b1519]/10 border-[#6b1519]/30" : "bg-ink-850 hover:bg-ink-800"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-red-500" />
                      )}
                      <div className="flex items-center justify-between gap-1">
                        <Link
                          href={`/build/chat/new/${p.id}`}
                          className={`min-w-0 flex-1 truncate text-xs font-medium ${
                            active ? "text-white" : "text-zinc-200 group-hover:text-[#9a2228]"
                          }`}
                          title={`Chat ID: ${p.id}`}
                        >
                          {p.title || "Untitled site"}
                        </Link>
                        <button
                          onClick={() => void deleteProject(p.id)}
                          className="hidden shrink-0 rounded p-1 text-zinc-500 hover:bg-red-500/20 hover:text-red-400 group-hover:block"
                          title="Delete project"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-zinc-500">
                        <span className="truncate">id: {p.id.slice(0, 8)}...</span>
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/build/chat/new/${p.id}`}
                            className="text-zinc-400 hover:text-white"
                            title="Open Chat"
                          >
                            chat
                          </Link>
                          <span>&bull;</span>
                          <Link
                            href={userUrl}
                            className="text-red-400 hover:text-red-300"
                            title="Open Project Details"
                          >
                            manage ↗
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
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
            <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-zinc-100">
              <span className="truncate">{userName}</span>
              <PlanBadge compact />
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
                  href="/images"
                  className={`nav-link ${isActive("/images") ? "nav-link-active" : ""}`}
                >
                  <ImageIcon size={18} />
                  Images
                </Link>
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
