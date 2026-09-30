export type AIStatus =
  | "idle"
  | "thinking"
  | "searching"
  | "generating"
  | "listening"
  | "speaking"
  | "working"
  | "completed";

export const STATUS_LABEL: Record<AIStatus, string> = {
  idle: "Human AI",
  thinking: "Thinking...",
  searching: "Searching the web...",
  generating: "Generating...",
  listening: "Listening...",
  speaking: "Speaking...",
  working: "Working on your task...",
  completed: "Done",
};

export function isActiveStatus(s: AIStatus): boolean {
  return s !== "idle" && s !== "completed";
}
