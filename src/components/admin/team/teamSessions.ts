"use client";

export interface ChatMessage {
  id: string;
  sender: "admin" | "humi" | "rema" | "system";
  text: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  timestamp: number;
}

export interface TeamSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

const SESSIONS_STORAGE_KEY = "human_ai_team_sessions_v2";
const ACTIVE_SESSION_KEY = "human_ai_team_active_session_id_v2";

export const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "init-humi",
    sender: "humi",
    text: "أهلاً بك يا أدمن في غرفة القيادة المشتركة. أنا هومي (Humi)، كبير مهندسي الذكاء الاصطناعي لمنصة Human AI. أنا هنا لمساعدتك في كل ما يتعلق بالمعمارية، النماذج، السرعة الفائقة، وتحليل البيانات. يمكنك استدعائي في أي وقت بكتابة @humi أو الحديث بشكل عام.",
    timestamp: Date.now() - 4000,
  },
  {
    id: "init-rema",
    sender: "rema",
    text: "وأهلاً بك من طرفي أيضاً! ✨ أنا ريما (Rema)، مديرة الإبداع والتسويق الرقمي والفيروسي لـ Human AI. جاهزة لصياغة أقوى الحملات، وكتابة منشورات يومية استثنائية وغير مكررة للترويج للمنصة (usehuman.de). يمكنك الضغط على زر 'Create me a new post' أو استدعائي بكتابة @rema لنبدأ فوراً!",
    timestamp: Date.now() - 2000,
  },
];

export function getTeamSessions(): TeamSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTeamSessions(sessions: TeamSession[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    window.dispatchEvent(new CustomEvent("team-sessions-updated"));
  } catch {
    // ignore
  }
}

export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function setActiveSessionId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_SESSION_KEY, id);
  window.dispatchEvent(new CustomEvent("team-sessions-updated"));
}

export function createNewTeamSession(initialTitle?: string): TeamSession {
  const newSession: TeamSession = {
    id: "session-" + Date.now(),
    title: initialTitle ?? "New Chat with Team",
    updatedAt: Date.now(),
    messages: [...INITIAL_MESSAGES],
  };

  const existing = getTeamSessions();
  const updated = [newSession, ...existing];
  saveTeamSessions(updated);
  setActiveSessionId(newSession.id);
  return newSession;
}

export function deleteTeamSession(id: string): void {
  const existing = getTeamSessions();
  const filtered = existing.filter((s) => s.id !== id);
  saveTeamSessions(filtered);
  const activeId = getActiveSessionId();
  if (activeId === id) {
    if (filtered.length > 0) {
      setActiveSessionId(filtered[0].id);
    } else {
      createNewTeamSession();
    }
  }
}
