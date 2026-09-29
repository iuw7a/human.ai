import type { ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import { launchOverlay } from "./overlay";

export interface DesktopStep {
  n: number;
  action: string;
  observation: string;
  ok: boolean;
  at: string;
}

export interface DesktopApproval {
  action: string;
  reason: string;
  requestedAt: string;
}

export interface DesktopSession {
  id: string;
  userId: string;
  goal: string;
  /** Owning chat conversation (one conversation, many tasks). Null for standalone sessions. */
  chatId: string | null;
  /** History length at the start of the current task (step limits are per-task). */
  taskStart: number;
  status: "active" | "done" | "closed";
  history: DesktopStep[];
  pendingApproval: DesktopApproval | null;
  stopFlag: boolean;
  stopToken: string;
  overlay: ChildProcess | null;
  overlayOk: boolean;
  screenW: number;
  screenH: number;
  /** Last known cursor pos (tracked locally to skip a PowerShell spawn per step). */
  cursorX: number;
  cursorY: number;
  consecutiveErrors: number;
  createdAt: number;
  lastActive: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __humanai_desktop_sessions: Map<string, DesktopSession> | undefined;
}

function store(): Map<string, DesktopSession> {
  if (!globalThis.__humanai_desktop_sessions) {
    globalThis.__humanai_desktop_sessions = new Map();
  }
  return globalThis.__humanai_desktop_sessions;
}

const IDLE_TTL_MS = 20 * 60 * 1000;
export const DESKTOP_MAX_STEPS = 25;

function newId(): string {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
  ).replace(/-/g, "").slice(0, 12);
}

export async function createDesktopSession(
  userId: string,
  goal: string,
  port: number,
  chatId?: string
): Promise<DesktopSession> {
  const s: DesktopSession = {
    id: newId(),
    userId,
    goal: goal.slice(0, 2000),
    chatId: chatId ?? null,
    taskStart: 0,
    status: "active",
    history: [],
    pendingApproval: null,
    stopFlag: false,
    stopToken: randomBytes(16).toString("hex"),
    overlay: null,
    overlayOk: false,
    screenW: 0,
    screenH: 0,
    cursorX: -1,
    cursorY: -1,
    consecutiveErrors: 0,
    createdAt: Date.now(),
    lastActive: Date.now(),
  };
  try {
    s.overlay = launchOverlay(port, s.id, s.stopToken);
    s.overlayOk = true;
  } catch {
    s.overlayOk = false;
  }
  store().set(s.id, s);
  return s;
}

export function getDesktopSession(id: string, userId: string): DesktopSession | null {
  const s = store().get(id);
  if (!s || s.userId !== userId || s.status === "closed") return null;
  s.lastActive = Date.now();
  return s;
}

/** Live session bound to a chat conversation (for follow-up tasks in the same chat). */
export function getDesktopSessionByChat(chatId: string, userId: string): DesktopSession | null {
  for (const s of store().values()) {
    if (s.chatId === chatId && s.userId === userId && s.status !== "closed") {
      s.lastActive = Date.now();
      return s;
    }
  }
  return null;
}

/** Steps taken in the current task (limits are per-task, not per-session). */
export function desktopTaskSteps(s: DesktopSession): number {
  return s.history.length - (s.taskStart ?? 0);
}

/**
 * Point a chat-bound session at a new follow-up task.
 * Desktop state/history persist; step budget restarts; stale approvals clear.
 */
export function retargetDesktopSession(id: string, userId: string, goal: string): DesktopSession | null {
  const s = store().get(id);
  if (!s || s.userId !== userId || s.status === "closed") return null;
  s.goal = goal.slice(0, 2000);
  s.status = "active";
  s.stopFlag = false;
  s.pendingApproval = null;
  s.consecutiveErrors = 0;
  if (s.history.length > 8) s.history = s.history.slice(-8);
  s.taskStart = s.history.length;
  s.lastActive = Date.now();
  return s;
}

export function getDesktopSessionByToken(id: string, token: string): DesktopSession | null {
  const s = store().get(id);
  if (!s || s.stopToken !== token || s.status === "closed") return null;
  return s;
}

export async function closeDesktopSession(id: string, userId: string): Promise<boolean> {
  const s = store().get(id);
  if (!s || s.userId !== userId) return false;
  await destroyDesktopSession(s);
  return true;
}

export async function destroyDesktopSession(s: DesktopSession): Promise<void> {
  store().delete(s.id);
  s.status = "closed";
  s.stopFlag = true;
  try {
    s.overlay?.kill();
  } catch {
    // already gone
  }
  s.overlay = null;
}

declare global {
  // eslint-disable-next-line no-var
  var __humanai_desktop_sweeper: unknown;
}
if (!globalThis.__humanai_desktop_sweeper) {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const s of store().values()) {
      if (now - s.lastActive > IDLE_TTL_MS) {
        void destroyDesktopSession(s);
      }
    }
  }, 60_000);
  const t = timer as unknown as { unref?: () => void };
  if (typeof t.unref === "function") t.unref();
  globalThis.__humanai_desktop_sweeper = true;
}
