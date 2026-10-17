"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  MessageSquarePlus,
  MessagesSquare,
  LayoutDashboard,
  Home,
  Trash2,
  X,
  Bot,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import {
  getTeamSessions,
  getActiveSessionId,
  setActiveSessionId,
  createNewTeamSession,
  deleteTeamSession,
  type TeamSession,
} from "./teamSessions";

export function TeamChatSidebar({
  adminName,
  adminRole,
  onClose,
}: {
  adminName: string;
  adminRole: string;
  onClose?: () => void;
}) {
  const [sessions, setSessions] = useState<TeamSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  function syncSessions() {
    const list = getTeamSessions();
    setSessions(list);
    let curActive = getActiveSessionId();
    if (!curActive && list.length > 0) {
      curActive = list[0].id;
      setActiveSessionId(curActive);
    }
    setActiveId(curActive);
  }

  useEffect(() => {
    syncSessions();
    const handleUpdate = () => syncSessions();
    window.addEventListener("team-sessions-updated", handleUpdate);
    return () => window.removeEventListener("team-sessions-updated", handleUpdate);
  }, []);

  function handleNewChat() {
    createNewTeamSession();
    onClose?.();
  }

  function handleSelect(id: string) {
    setActiveSessionId(id);
    onClose?.();
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    deleteTeamSession(id);
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#070709] border-r border-white/10 relative z-30 shadow-2xl">
      {/* Brand & Workspace Title */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-4">
        <Link href="/admin/team-rema-humi" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent shadow-md shadow-accent/30">
            <span className="h-2 w-2 rounded-full bg-white" />
          </span>
          <div>
            <span className="block text-sm font-bold text-white">
              Human AI <span className="text-accent">Team</span>
            </span>
            <span className="block text-[10px] text-zinc-400">Humi &amp; Rema Workspace</span>
          </div>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X size={17} />
          </button>
        )}
      </div>

      {/* Primary Action: + New Chat */}
      <div className="p-3">
        <button
          onClick={handleNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-hover hover:scale-[1.01] active:scale-95"
        >
          <MessageSquarePlus size={16} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          جلسات العمل السابقة
        </p>

        {sessions.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
            <MessagesSquare size={20} className="mx-auto text-zinc-600 mb-1" />
            <p className="text-xs text-zinc-400">لا توجد محادثات سابقة</p>
            <button
              onClick={handleNewChat}
              className="mt-2 text-[11px] font-semibold text-accent hover:underline"
            >
              ابدأ أول محادثة الآن
            </button>
          </div>
        ) : (
          sessions.map((s) => {
            const isSelected = s.id === activeId;
            return (
              <div
                key={s.id}
                onClick={() => handleSelect(s.id)}
                className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs cursor-pointer transition-all ${
                  isSelected
                    ? "bg-white/[0.08] text-white border border-white/10 font-semibold shadow-sm"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessagesSquare
                    size={14}
                    className={`shrink-0 ${isSelected ? "text-accent" : "text-zinc-500 group-hover:text-zinc-300"}`}
                  />
                  <span className="truncate">{s.title || "محادثة مع الفريق"}</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDelete(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-opacity"
                  title="حذف المحادثة"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Navigation: Back to Admin & Back to App */}
      <div className="border-t border-white/[0.08] p-3 space-y-2 bg-[#020203]">
        {/* Back to Admin */}
        <Link
          href="/admin"
          className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-200 transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
        >
          <LayoutDashboard size={15} className="text-accent" />
          <span>Back to Admin</span>
        </Link>

        {/* Back to App */}
        <Link
          href="/"
          className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-200 transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
        >
          <Home size={15} className="text-zinc-400" />
          <span>Back to App</span>
        </Link>

        {/* User Profile Mini Footer */}
        <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.02] px-2.5 py-1.5 pt-2 border-t border-white/5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-800 text-[11px] font-bold text-white">
            {(adminName[0] ?? "A").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-medium text-zinc-300">{adminName}</span>
            <span className="block text-[9px] uppercase tracking-wide text-accent">{adminRole}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
