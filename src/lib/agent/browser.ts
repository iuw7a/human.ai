import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface AgentStep {
  n: number;
  action: string;
  detail?: string;
  observation: string;
  ok: boolean;
  at: string;
}

export interface PendingApproval {
  tool: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>;
  reason: string;
  requestedAt: string;
}

export interface AgentSession {
  id: string;
  userId: string;
  goal: string;
  browser: Browser;
  context: BrowserContext;
  status: "active" | "done" | "closed";
  history: AgentStep[];
  pendingApproval: PendingApproval | null;
  consecutiveErrors: number;
  refMap: Map<string, number>;
  createdAt: number;
  lastActive: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __humanai_agent_sessions: Map<string, AgentSession> | undefined;
  // eslint-disable-next-line no-var
  var __humanai_agent_browser: Browser | null | undefined;
  // eslint-disable-next-line no-var
  var __humanai_agent_browser_users: number | undefined;
}
function sessions(): Map<string, AgentSession> {
  if (!globalThis.__humanai_agent_sessions) {
    globalThis.__humanai_agent_sessions = new Map();
  }
  return globalThis.__humanai_agent_sessions;
}

const IDLE_TTL_MS = 20 * 60 * 1000;
const MAX_STEPS = 25;
const ACTION_TIMEOUT = 20_000;

function newId(): string {
  return (
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)) .replace(/-/g, "").slice(0, 12)
  );
}

async function getBrowser(): Promise<Browser> {
  if (globalThis.__humanai_agent_browser && globalThis.__humanai_agent_browser.isConnected()) {
    return globalThis.__humanai_agent_browser;
  }
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  globalThis.__humanai_agent_browser = browser;
  browser.on("disconnected", () => {
    globalThis.__humanai_agent_browser = null;
  });
  return browser;
}

function browserUsers(delta: number): number {
  globalThis.__humanai_agent_browser_users = Math.max(
    0,
    (globalThis.__humanai_agent_browser_users ?? 0) + delta
  );
  return globalThis.__humanai_agent_browser_users;
}

/** Create an isolated session (own incognito context) for a user. */
export async function createSession(userId: string, goal: string): Promise<AgentSession> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 HumanAI-Agent/1.0",
    locale: "en-US",
  });
  const page = await context.newPage();
  void page;
  const session: AgentSession = {
    id: newId(),
    userId,
    goal: goal.slice(0, 2000),
    browser,
    context,
    status: "active",
    history: [],
    pendingApproval: null,
    consecutiveErrors: 0,
    refMap: new Map(),
    createdAt: Date.now(),
    lastActive: Date.now(),
  };
  sessions().set(session.id, session);
  browserUsers(1);
  return session;
}

export function getSession(id: string, userId: string): AgentSession | null {
  const s = sessions().get(id);
  if (!s || s.userId !== userId || s.status === "closed") return null;
  s.lastActive = Date.now();
  return s;
}

export async function closeSession(id: string, userId: string): Promise<boolean> {
  const s = sessions().get(id);
  if (!s || s.userId !== userId) return false;
  await destroySession(s);
  return true;
}

async function destroySession(s: AgentSession) {
  sessions().delete(s.id);
  s.status = "closed";
  try {
    await s.context.close();
  } catch {
    // already closed
  }
  if (browserUsers(-1) === 0 && globalThis.__humanai_agent_browser) {
    try {
      await globalThis.__humanai_agent_browser.close();
    } catch {
      // ignore
    }
    globalThis.__humanai_agent_browser = null;
  }
}

// Idle sweeper (single instance).
declare global {
  // eslint-disable-next-line no-var
  var __humanai_agent_sweeper: unknown;
}
if (!globalThis.__humanai_agent_sweeper) {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const s of sessions().values()) {
      if (now - s.lastActive > IDLE_TTL_MS) {
        void destroySession(s);
      }
    }
  }, 60_000);
  const t = timer as unknown as { unref?: () => void };
  if (typeof t.unref === "function") t.unref();
  globalThis.__humanai_agent_sweeper = true;
}

export function activePage(s: AgentSession): Page {
  const pages = s.context.pages();
  return pages[pages.length - 1] ?? s.context.pages()[0];
}

export interface PageState {
  url: string;
  title: string;
  snapshot: string;
  tabs: { index: number; url: string; title: string; active: boolean }[];
}

/** Structured page state: accessibility tree (DOM-based, capped) + tabs. */
export async function pageState(s: AgentSession): Promise<PageState> {
  const page = activePage(s);
  const url = page.url();
  let title = "";
  try {
    title = await page.title();
  } catch {
    title = "";
  }
  let snapshot = "(page not ready)";
  try {
    const cdp = await s.context.newCDPSession(page);
    const { nodes } = await cdp.send("Accessibility.getFullAXTree", {});
    s.refMap.clear();
    snapshot = serializeAX(nodes ?? [], s) || "(empty page)";
    snapshot = snapshot.slice(0, 6000);
  } catch {
    snapshot = "(snapshot unavailable)";
  }
  const tabs: PageState["tabs"] = [];
  const pages = s.context.pages();
  for (let i = 0; i < pages.length; i++) {
    let t = "";
    try {
      t = await pages[i].title();
    } catch {
      t = "";
    }
    tabs.push({ index: i, url: pages[i].url(), title: t, active: pages[i] === page });
  }
  return { url, title, snapshot, tabs };
}

interface AXNode {
  nodeId: string | number;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: string };
  childIds?: (string | number)[];
}

function axName(n: AXNode): string {
  const v = n.name?.value;
  return typeof v === "string" ? v.trim().slice(0, 80) : "";
}

function axRole(n: AXNode): string {
  const v = n.role?.value;
  return typeof v === "string" ? v : "unknown";
}

function serializeAX(nodes: AXNode[], s: AgentSession): string {
  const byId = new Map<string, AXNode>(nodes.map((n) => [String(n.nodeId), n]));
  const childrenOf = new Map<string, (string | number)[]>();
  const hasParent = new Set<string>();
  for (const n of nodes) {
    for (const c of n.childIds ?? []) {
      hasParent.add(String(c));
      const arr = childrenOf.get(String(n.nodeId)) ?? [];
      arr.push(c);
      childrenOf.set(String(n.nodeId), arr);
    }
  }
  const roots = nodes.filter((n) => !hasParent.has(String(n.nodeId)));
  const lines: string[] = [];
  let counter = 0;
  const budget = { n: 0 };
  const walk = (node: AXNode, depth: number): void => {
    if (depth > 5 || budget.n > 90) return;
    const role = axRole(node);
    const kids: AXNode[] = [];
    for (const id of childrenOf.get(String(node.nodeId)) ?? []) {
      const k = byId.get(String(id));
      if (k) kids.push(k);
    }
    if (role === "StaticText" || role === "InlineTextBox" || role === "none" || role === "generic") {
      // Text fragments bloat the tree (often one node per character) — descend silently.
      for (const k of kids) walk(k, depth);
      return;
    }
    const name = axName(node);
    const interactive = /button|link|textbox|checkbox|radio|combobox|menuitem|tab|search|spinbutton|slider|switch|heading|image/i.test(role);
    if ((interactive || name) && node.nodeId !== undefined && node.nodeId !== null) {
      counter++;
      const ref = "r" + counter;
      s.refMap.set(ref, Number(node.nodeId));
      budget.n++;
      const rawVal = typeof node.value?.value === "string" ? node.value.value.trim().slice(0, 60) : "";
      const valSuffix = rawVal && /textbox|search|combobox/i.test(role) ? ` (current value: "${rawVal}")` : "";
      lines.push("  ".repeat(Math.min(depth, 4)) + "- " + role + (name ? ' "' + name + '"' : "") + valSuffix + " [ref=" + ref + "]");
      for (const k of kids) walk(k, depth + 1);
    } else {
      for (const k of kids) walk(k, depth);
    }
  };
  for (const r of roots.slice(0, 3)) walk(r, 0);
  return lines.join("\n");
}

/** Resolve our ref to a clickable center point via CDP. */
async function refPoint(s: AgentSession, ref: string): Promise<{ x: number; y: number }> {
  const backendId = s.refMap.get(ref);
  if (!backendId) throw new Error('Unknown element ref "' + ref + '". Take a fresh snapshot first.');
  const page = activePage(s);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cdp: any = await s.context.newCDPSession(page);
  const resolved = await cdp.send("DOM.resolveNode", { backendNodeId: backendId });
  const objectId = resolved && resolved.object && resolved.object.objectId;
  if (!objectId) throw new Error("Element is not attached to the DOM anymore.");
  try {
    await cdp.send("DOM.scrollIntoViewIfNeeded", { objectId });
  } catch (e) {
    // not scrollable - continue
  }
  const box = await cdp.send("DOM.getBoxModel", { objectId });
  const quad = (box && box.model && box.model.content) as unknown;
  const nums = Array.isArray(quad) ? (quad as unknown[]).filter((v): v is number => typeof v === "number") : [];
  if (nums.length < 8) throw new Error("Element has no visible box.");
  const xs = [nums[0], nums[2], nums[4], nums[6]];
  const ys = [nums[1], nums[3], nums[5], nums[7]];
  return {
    x: (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2,
    y: (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2,
  };
}

export async function screenshot(s: AgentSession): Promise<string | null> {
  try {
    const buf = await activePage(s).screenshot({ type: "jpeg", quality: 55 });
    return buf.toString("base64");
  } catch {
    return null;
  }
}

export interface ToolResult {
  ok: boolean;
  observation: string;
}

/** Execute one browser tool. Never includes secrets in observations. */
export async function executeBrowserTool(
  s: AgentSession,
  tool: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>
): Promise<ToolResult> {
  const page = activePage(s);
  page.setDefaultTimeout(ACTION_TIMEOUT);
  try {
    switch (tool) {
      case "navigate": {
        const url = String(args.url ?? "").slice(0, 2000);
        if (!/^https?:\/\//i.test(url)) return { ok: false, observation: "Invalid URL (must start with http:// or https://)." };
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        return { ok: true, observation: `Navigated to ${url}.` };
      }
      case "click": {
        const ref = String(args.ref ?? "");
        const pt = await refPoint(s, ref);
        await page.mouse.click(pt.x, pt.y, { delay: 30 });
        return { ok: true, observation: `Clicked element [ref=${ref}].` };
      }
      case "type": {
        const ref = String(args.ref ?? "");
        const text = String(args.text ?? "").slice(0, 4000);
        const pt = await refPoint(s, ref);
        await page.mouse.click(pt.x, pt.y, { delay: 30 });
        const cdp = await s.context.newCDPSession(page);
        await cdp.send("Input.insertText", { text });
        if (args.submit) await page.keyboard.press("Enter");
        return { ok: true, observation: `Typed ${text.length} chars into [ref=${ref}]${args.submit ? " and submitted" : ""}.` };
      }
      case "press": {
        const key = String(args.key ?? "Enter").slice(0, 32);
        await page.keyboard.press(key as never, { delay: 20 });
        return { ok: true, observation: `Pressed key ${key}.` };
      }
      case "scroll": {
        const dir = String(args.direction ?? "down");
        const amount = Math.min(4000, Math.max(100, Number(args.amount ?? 700) || 700));
        if (args.ref) {
          const pt = await refPoint(s, String(args.ref));
          await page.mouse.move(pt.x, pt.y);
          return { ok: true, observation: `Scrolled element [ref=${args.ref}] into view.` };
        }
        await page.mouse.wheel(0, dir === "up" ? -amount : amount);
        return { ok: true, observation: `Scrolled ${dir} by ${amount}px.` };
      }
      case "back": {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
        return { ok: true, observation: "Went back." };
      }
      case "forward": {
        await page.goForward({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
        return { ok: true, observation: "Went forward." };
      }
      case "wait": {
        if (args.text) {
          await page.getByText(String(args.text).slice(0, 200)).first().waitFor({ timeout: 15000 });
          return { ok: true, observation: `Text appeared: "${String(args.text).slice(0, 80)}".` };
        }
        const ms = Math.min(10000, Math.max(500, Number(args.ms ?? 2000) || 2000));
        await page.waitForTimeout(ms);
        return { ok: true, observation: `Waited ${ms}ms.` };
      }
      case "snapshot":
        return { ok: true, observation: "Snapshot refreshed (see page state)." };
      case "screenshot":
        return { ok: true, observation: "Screenshot captured (see preview)." };
      case "new_tab": {
        const p = await s.context.newPage();
        if (args.url && /^https?:\/\//i.test(String(args.url))) {
          await p.goto(String(args.url), { waitUntil: "domcontentloaded", timeout: 30000 });
        }
        await p.bringToFront();
        return { ok: true, observation: `Opened new tab${args.url ? ` at ${args.url}` : ""}.` };
      }
      case "switch_tab": {
        const pages = s.context.pages();
        const i = Number(args.index ?? 0);
        if (!Number.isInteger(i) || i < 0 || i >= pages.length) {
          return { ok: false, observation: `Invalid tab index. Open tabs: 0..${pages.length - 1}.` };
        }
        await pages[i].bringToFront();
        return { ok: true, observation: `Switched to tab ${i}.` };
      }
      case "close_tab": {
        const pages = s.context.pages();
        const i = Number(args.index ?? pages.length - 1);
        if (pages.length <= 1) return { ok: false, observation: "Cannot close the last tab." };
        if (!Number.isInteger(i) || i < 0 || i >= pages.length) {
          return { ok: false, observation: `Invalid tab index. Open tabs: 0..${pages.length - 1}.` };
        }
        await pages[i].close();
        return { ok: true, observation: `Closed tab ${i}.` };
      }
      case "list_tabs": {
        const pages = s.context.pages();
        return { ok: true, observation: `Open tabs: ${pages.map((_, i) => i).join(", ") || "none"}.` };
      }
      default:
        return { ok: false, observation: `Unknown tool: ${tool}.` };
    }
  } catch (e) {
    return { ok: false, observation: `Action failed: ${e instanceof Error ? e.message.slice(0, 300) : "unknown error"}` };
  }
}

export { MAX_STEPS };
