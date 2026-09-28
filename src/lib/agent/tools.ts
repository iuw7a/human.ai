export interface AgentToolDef {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: Record<string, any>;
}

const str = { type: "string" };

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: "navigate",
    description: "Navigate the active tab to a URL. Use for opening websites.",
    parameters: { type: "object", properties: { url: { ...str, description: "Full http(s) URL" } }, required: ["url"] },
  },
  {
    name: "click",
    description: "Click an element by its snapshot ref, e.g. r3.",
    parameters: { type: "object", properties: { ref: { ...str, description: "Element ref from snapshot" } }, required: ["ref"] },
  },
  {
    name: "type",
    description: "Click an input/textarea by ref and type text into it. Set submit true to press Enter afterwards.",
    parameters: {
      type: "object",
      properties: {
        ref: { ...str },
        text: { ...str, description: "Text to type" },
        submit: { type: "boolean", description: "Press Enter after typing" },
      },
      required: ["ref", "text"],
    },
  },
  {
    name: "press",
    description: "Press a keyboard key, e.g. Enter, Escape, Tab, ArrowDown.",
    parameters: { type: "object", properties: { key: { ...str } }, required: ["key"] },
  },
  {
    name: "scroll",
    description: "Scroll the page up/down, or scroll a specific element into view by ref.",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down"] },
        amount: { type: "number", description: "Pixels, 100-4000" },
        ref: { ...str, description: "Optional element ref to scroll into view" },
      },
    },
  },
  { name: "back", description: "Go back in history.", parameters: { type: "object", properties: {} } },
  { name: "forward", description: "Go forward in history.", parameters: { type: "object", properties: {} } },
  {
    name: "wait",
    description: "Wait: either a fixed time (ms, max 10000) or until text appears.",
    parameters: { type: "object", properties: { ms: { type: "number" }, text: { ...str } } },
  },
  { name: "snapshot", description: "Re-read the structured page state.", parameters: { type: "object", properties: {} } },
  { name: "screenshot", description: "Take a screenshot for visual understanding.", parameters: { type: "object", properties: {} } },
  {
    name: "new_tab",
    description: "Open a new tab, optionally with a URL.",
    parameters: { type: "object", properties: { url: { ...str } } },
  },
  {
    name: "switch_tab",
    description: "Switch to another open tab by index.",
    parameters: { type: "object", properties: { index: { type: "number" } }, required: ["index"] },
  },
  {
    name: "close_tab",
    description: "Close a tab by index.",
    parameters: { type: "object", properties: { index: { type: "number" } } },
  },
  { name: "list_tabs", description: "List open tab indexes.", parameters: { type: "object", properties: {} } },
  {
    name: "request_approval",
    description:
      "STOP and ask the human for approval BEFORE sensitive actions: purchases, deleting data, sending messages/emails, submitting important forms, account changes, logins, or anything irreversible. Describe exactly what you intend to do.",
    parameters: {
      type: "object",
      properties: {
        action: { ...str, description: "Exact action awaiting approval" },
        reason: { ...str, description: "Why it is sensitive" },
      },
      required: ["action", "reason"],
    },
  },
  {
    name: "finish",
    description: "End the task with a summary of what was accomplished.",
    parameters: { type: "object", properties: { summary: { ...str } }, required: ["summary"] },
  },
];

export const AGENT_SYSTEM_PROMPT = `You are the Human AI Computer Use Agent. You control a real Chromium browser to accomplish the user's goal, one action at a time.

RULES
- You receive structured page state (URL, title, accessibility snapshot with [ref=rN] element refs, open tabs) after every action. Use refs for click/type/scroll — never guess coordinates.
- Prefer DOM interaction (click/type/press) over scrolling. Take screenshots only when you need visual confirmation.
- Act on every turn: you already receive a fresh snapshot with each observation — do NOT call snapshot twice in a row. If the snapshot shows what you need, interact immediately.
- If an action fails, read the new page state, try ONE safe alternative (different ref, scroll into view first, wait for text), and explain briefly. Never repeat the exact same failing action more than twice.
- NEVER perform sensitive actions without calling request_approval first: purchases, payments, deleting data, sending messages or emails, submitting forms with personal data, logins, account or security changes, or anything irreversible. Wait for the human's decision.
- Do not enter credentials or personal data unless the user explicitly provided them in the goal.
- When the goal is complete, call finish with a concise summary including key facts observed (e.g. the page title).
- Keep responses short: either one tool call per turn, or finish. Explain failures instead of looping forever.`;
