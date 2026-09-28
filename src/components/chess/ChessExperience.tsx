"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Chess } from "chess.js";
import type { Move } from "chess.js";
import {
  Bot, Users, Link2, Copy, Check, Share2, Flag, Handshake, Undo2,
  RotateCcw, Plus, Settings as SettingsIcon, Crown, Timer, Volume2,
  VolumeX, X, Loader2, ArrowLeftRight, Swords, Eye, Radio,
} from "lucide-react";
import { AvatarMark } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { ChessBoard, BOARD_THEMES } from "./ChessBoard";
import type { TrackedPiece, MoveTarget } from "./ChessBoard";
import { DIFFICULTIES, findBestMove, evaluateFen } from "./engine";
import type { AiDifficulty } from "./engine";
import { chessSounds, setSoundEnabled } from "./sound";

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */

type Mode = "ai" | "local" | "online";
type Phase = "setup" | "join" | "game";
type Color = "w" | "b";

interface TimeMode {
  id: string;
  label: string;
  base: number; // seconds, 0 = no clock
  inc: number; // increment seconds
}

const TIME_MODES: TimeMode[] = [
  { id: "none", label: "No clock", base: 0, inc: 0 },
  { id: "1+0", label: "1 + 0", base: 60, inc: 0 },
  { id: "3+0", label: "3 + 0", base: 180, inc: 0 },
  { id: "3+2", label: "3 + 2", base: 180, inc: 2 },
  { id: "5+0", label: "5 + 0", base: 300, inc: 0 },
  { id: "10+0", label: "10 + 0", base: 600, inc: 0 },
  { id: "10+5", label: "10 + 5", base: 600, inc: 5 },
  { id: "15+10", label: "15 + 10", base: 900, inc: 10 },
];

interface GameResult {
  kind: "checkmate" | "draw" | "timeout" | "resign";
  winner: Color | null;
  title: string;
  subtitle: string;
  forMe: "win" | "loss" | "draw";
}

interface Toast {
  id: number;
  text: string;
}

interface NetMsg {
  t: string;
  [k: string]: unknown;
}

const FILES = "abcdefgh";
const SAVE_KEY = "humanai-chess-save-v1";

function opp(c: Color): Color {
  return c === "w" ? "b" : "w";
}
function randomId(n = 8): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  for (let i = 0; i < n; i++) s += chars[buf[i] % chars.length];
  return s;
}
function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  if (total < 20000) {
    const d = Math.floor((total % 1000) / 100);
    return `${m}:${String(s).padStart(2, "0")}.${d}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s % 60}s`;
}

/* ---------------- tracked pieces (stable keys → slide animation) ---- */

function initialTracked(): TrackedPiece[] {
  const back: TrackedPiece["type"][] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const out: TrackedPiece[] = [];
  for (let i = 0; i < 8; i++) {
    const f = FILES[i];
    out.push({ key: `w-${back[i]}-${f}`, type: back[i], color: "w", square: `${f}1` });
    out.push({ key: `w-p-${f}`, type: "p", color: "w", square: `${f}2` });
    out.push({ key: `b-${back[i]}-${f}`, type: back[i], color: "b", square: `${f}8` });
    out.push({ key: `b-p-${f}`, type: "p", color: "b", square: `${f}7` });
  }
  return out;
}

function replayTracked(moves: Move[]): TrackedPiece[] {
  const pieces = initialTracked();
  const at = (sq: string) => pieces.find((p) => p.square === sq);
  for (const m of moves) {
    const moving = at(m.from);
    if (!moving) continue;
    if (m.flags.includes("e")) {
      const capSq = `${m.to[0]}${m.from[1]}`;
      const idx = pieces.findIndex((p) => p.square === capSq && p.color !== m.color);
      if (idx >= 0) pieces.splice(idx, 1);
    } else if (m.captured) {
      const idx = pieces.findIndex((p) => p.square === m.to && p.color !== m.color);
      if (idx >= 0) pieces.splice(idx, 1);
    }
    moving.square = m.to;
    if (m.promotion) moving.type = m.promotion as TrackedPiece["type"];
    const rank = m.color === "w" ? "1" : "8";
    if (m.flags.includes("k")) {
      const rook = at(`h${rank}`);
      if (rook) rook.square = `f${rank}`;
    }
    if (m.flags.includes("q")) {
      const rook = at(`a${rank}`);
      if (rook) rook.square = `d${rank}`;
    }
  }
  return pieces;
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function capturedLists(pieces: TrackedPiece[]): { byWhite: TrackedPiece["type"][]; byBlack: TrackedPiece["type"][]; diff: number } {
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const onBoard = { w: { ...start }, b: { ...start } };
  let wMat = 0;
  let bMat = 0;
  for (const p of pieces) {
    if (p.type === "k") continue;
    onBoard[p.color][p.type]--;
    if (p.color === "w") wMat += PIECE_VALUES[p.type];
    else bMat += PIECE_VALUES[p.type];
  }
  const order: TrackedPiece["type"][] = ["q", "r", "b", "n", "p"];
  const byWhite: TrackedPiece["type"][] = [];
  const byBlack: TrackedPiece["type"][] = [];
  for (const t of order) {
    for (let i = 0; i < onBoard.b[t]; i++) byWhite.push(t);
    for (let i = 0; i < onBoard.w[t]; i++) byBlack.push(t);
  }
  return { byWhite, byBlack, diff: wMat - bMat };
}

const MINI_GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between py-1.5 text-left"
      role="switch"
      aria-checked={on}
      aria-label={label}
    >
      <span className="text-[13.5px] text-zinc-300">{label}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-ink-700"}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

function Seg<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl border border-ink-700 bg-ink-850 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
            value === o.id ? "bg-ink-700 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="chess-modal-in relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-[0_32px_100px_rgba(0,0,0,0.7)]">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main experience                                                     */
/* ------------------------------------------------------------------ */

export function ChessExperience({ user }: { user: User | null }) {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const userName = user?.user_metadata?.name || user?.email?.split("@")[0] || "You";
  const userInitial = (userName[0] ?? "?").toUpperCase();

  /* setup selections */
  const [phase, setPhase] = useState<Phase>("setup");
  const [setupMode, setSetupMode] = useState<"ai" | "local" | "online">("ai");
  const [aiLevel, setAiLevel] = useState<AiDifficulty>("medium");
  const [colorPick, setColorPick] = useState<"w" | "b" | "random">("random");
  const [timeId, setTimeId] = useState("10+0");
  const [themeId, setThemeId] = useState("graphite");
  const [soundOn, setSoundOn] = useState(true);
  const [animOn, setAnimOn] = useState(true);
  const [coordsOn, setCoordsOn] = useState(true);
  const [hlOn, setHlOn] = useState(true);
  const [clockShow, setClockShow] = useState(true);
  const [pieceStyle, setPieceStyle] = useState<"classic" | "bold" | "flat">("classic");
  const [savedGame, setSavedGame] = useState<string | null>(null);

  /* live game */
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [moves, setMoves] = useState<Move[]>([]);
  const [fens, setFens] = useState<string[]>([gameRef.current.fen()]);
  const [mode, setMode] = useState<Mode>("ai");
  const [humanColor, setHumanColor] = useState<Color>("w");
  const [activeTimeMode, setActiveTimeMode] = useState<TimeMode>(TIME_MODES[5]);
  const [clocks, setClocks] = useState({ w: 600_000, b: 600_000 });
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [overDismissed, setOverDismissed] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [captureFx, setCaptureFx] = useState<{ square: string; key: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; desc: string; action: () => void; danger?: boolean } | null>(null);

  /* online */
  const [gameId, setGameId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [peerName, setPeerName] = useState<string | null>(null);
  const [peerHere, setPeerHere] = useState(false);
  const [connState, setConnState] = useState<"idle" | "connecting" | "waiting" | "live" | "error">("idle");
  const [connError, setConnError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [guestName, setGuestName] = useState(userName);
  const [drawOffer, setDrawOffer] = useState<{ from: string; ply: number } | null>(null);
  const [undoReq, setUndoReq] = useState<{ from: string; ply: number } | null>(null);
  const [rematchReq, setRematchReq] = useState(false);

  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const clocksRef = useRef(clocks);
  const movesRef = useRef<Move[]>([]);
  const resultRef = useRef<GameResult | null>(null);
  const rtRef = useRef({ mode: "ai" as Mode, myColor: "w" as Color, isHost: false, gameId: null as string | null });
  const genRef = useRef(0);
  const thinkingRef = useRef(false);
  const peerHereRef = useRef(false);
  const phaseRef = useRef<Phase>("setup");
  const peerNameRef = useRef<string | null>(null);
  const clockSnaps = useRef<{ w: number; b: number }[]>([]);
  const toastId = useRef(0);
  const historyEndRef = useRef<HTMLDivElement>(null);

  clocksRef.current = clocks;
  movesRef.current = moves;
  resultRef.current = result;
  rtRef.current = { mode, myColor: humanColor, isHost, gameId };

  const theme = BOARD_THEMES.find((t) => t.id === themeId) ?? BOARD_THEMES[0];
  const livePly = moves.length;
  const shownPly = viewPly ?? livePly;
  const viewFen = fens[shownPly] ?? fen;
  const viewing = viewPly !== null && viewPly !== livePly;
  const clockOn = activeTimeMode.base > 0;

  const viewGame = useMemo(() => {
    try {
      return new Chess(viewFen);
    } catch {
      return new Chess();
    }
  }, [viewFen]);
  const turn: Color = useMemo(() => {
    try {
      return new Chess(fen).turn();
    } catch {
      return "w";
    }
  }, [fen]);

  const shownPieces = useMemo(() => replayTracked(moves.slice(0, shownPly)), [moves, shownPly]);
  const { byWhite, byBlack, diff } = useMemo(() => capturedLists(shownPieces), [shownPieces]);
  const checkSquare = useMemo(() => {
    if (!viewGame.isCheck()) return null;
    const sq = shownPieces.find((p) => p.type === "k" && p.color === viewGame.turn());
    return sq?.square ?? null;
  }, [viewGame, shownPieces]);

  const lastMove = moves.length > 0 && shownPly === livePly
    ? { from: moves[moves.length - 1].from, to: moves[moves.length - 1].to }
    : shownPly > 0 && moves[shownPly - 1]
      ? { from: moves[shownPly - 1].from, to: moves[shownPly - 1].to }
      : null;

  const orientation: Color = useMemo(() => {
    const base: Color = mode === "local" ? "w" : humanColor;
    return flipped ? opp(base) : base;
  }, [mode, humanColor, flipped]);

  /* ------------------------------ helpers ------------------------- */

  function toast(text: string) {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }

  function copyText(text: string, okMsg: string) {
    const done = () => {
      toast(okMsg);
      chessSounds.notify();
    };
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      } else fallbackCopy(text, done);
    } catch {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text: string, done: () => void) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch {
      toast("Copy failed — select the link manually.");
    }
  }

  function persist(sans: { from: string; to: string; promotion?: string }[], clocksVal: { w: number; b: number }, cfg: { mode: Mode; aiLevel: AiDifficulty; humanColor: Color; timeId: string; startedAt: number }) {
    if (cfg.mode === "online") return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...cfg, sans, clocks: clocksVal, updatedAt: Date.now() }));
    } catch {
      // storage optional
    }
  }
  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
  }

  /* --------------------------- game control ------------------------ */

  const newGame = useCallback((cfg: {
    mode: Mode; humanColor: Color; timeMode: TimeMode; aiLevel: AiDifficulty;
    sans?: { from: string; to: string; promotion?: string }[];
    clocksVal?: { w: number; b: number }; startedAtVal?: number; keepPhase?: boolean;
  }) => {
    genRef.current++;
    gameRef.current = new Chess();
    clockSnaps.current = [];
    const sans = cfg.sans ?? [];
    const applied: Move[] = [];
    const fensList = [gameRef.current.fen()];
    for (const s of sans) {
      try {
        const m = gameRef.current.move({ from: s.from, to: s.to, promotion: s.promotion });
        applied.push(m);
        fensList.push(gameRef.current.fen());
        clockSnaps.current.push({ w: cfg.timeMode.base * 1000, b: cfg.timeMode.base * 1000 });
      } catch {
        break;
      }
    }
    setMode(cfg.mode);
    setHumanColor(cfg.humanColor);
    setActiveTimeMode(cfg.timeMode);
    setAiLevel(cfg.aiLevel);
    setMoves(applied);
    setFens(fensList);
    setFen(gameRef.current.fen());
    const cv = cfg.clocksVal ?? { w: cfg.timeMode.base * 1000, b: cfg.timeMode.base * 1000 };
    setClocks(cv);
    clocksRef.current = cv;
    setSelected(null);
    setPromo(null);
    setThinking(false);
    thinkingRef.current = false;
    setResult(null);
    resultRef.current = null;
    setOverDismissed(false);
    setViewPly(null);
    setCaptureFx(null);
    setStartedAt(cfg.startedAtVal ?? Date.now());
    setDrawOffer(null);
    setUndoReq(null);
    setRematchReq(false);
    if (!cfg.keepPhase) setPhase("game");
    if (sans.length === 0) clearSave();
  }, []);

  function leaveChannel() {
    try {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
      }
    } catch {
      // ignore
    }
    channelRef.current = null;
  }

  function startAiGame(opts?: { swap?: boolean; cont?: string }) {
    let hc: Color = colorPick === "random" ? (Math.random() < 0.5 ? "w" : "b") : colorPick;
    if (opts?.swap) hc = opp(humanColor);
    const tm = TIME_MODES.find((t) => t.id === timeId) ?? TIME_MODES[5];
    if (opts?.cont) {
      try {
        const s = JSON.parse(opts.cont) as {
          mode: Mode; aiLevel: AiDifficulty; humanColor: Color; timeId: string;
          sans: { from: string; to: string; promotion?: string }[]; clocks: { w: number; b: number }; startedAt: number;
        };
        const tmc = TIME_MODES.find((t) => t.id === s.timeId) ?? tm;
        newGame({ mode: s.mode, humanColor: s.humanColor, timeMode: tmc, aiLevel: s.aiLevel, sans: s.sans, clocksVal: s.clocks, startedAtVal: s.startedAt });
        setAiLevel(s.aiLevel);
        setTimeId(s.timeId);
        setColorPick("random");
        toast("Game restored — your move.");
        return;
      } catch {
        // fall through to fresh game
      }
    }
    leaveChannel();
    setGameId(null);
    setIsHost(false);
    setPeerName(null);
    newGame({ mode: "ai", humanColor: hc, timeMode: tm, aiLevel });
    toast(hc === "w" ? "You play White — your move." : "Human AI opens as White.");
  }

  function startLocalGame(swap = false) {
    const tm = TIME_MODES.find((t) => t.id === timeId) ?? TIME_MODES[5];
    leaveChannel();
    setGameId(null);
    setIsHost(false);
    setPeerName(null);
    newGame({ mode: "local", humanColor: swap ? opp(humanColor) : "w", timeMode: tm, aiLevel });
    toast("Pass-and-play — White to move.");
  }

  /* ------------------------------ moves ---------------------------- */

  function endStatus(g: Chess): { winner: Color | null; subtitle: string; kind: GameResult["kind"] } | null {
    if (g.isCheckmate()) return { winner: opp(g.turn()), subtitle: "Checkmate", kind: "checkmate" };
    if (g.isStalemate()) return { winner: null, subtitle: "Stalemate", kind: "draw" };
    if (g.isInsufficientMaterial()) return { winner: null, subtitle: "Insufficient material", kind: "draw" };
    if (g.isThreefoldRepetition()) return { winner: null, subtitle: "Threefold repetition", kind: "draw" };
    if (g.isDraw()) return { winner: null, subtitle: "Fifty-move rule", kind: "draw" };
    return null;
  }

  function titleFor(winner: Color | null, subtitle: string, kind: GameResult["kind"]): { title: string; forMe: GameResult["forMe"] } {    const r = rtRef.current;
    if (winner === null) return { title: "DRAW", forMe: "draw" };
    if (r.mode === "ai") {
      return winner === r.myColor ? { title: "YOU WIN", forMe: "win" } : { title: "HUMAN AI WINS", forMe: "loss" };
    }
    if (r.mode === "local") {
      return { title: winner === "w" ? "WHITE WINS" : "BLACK WINS", forMe: "draw" };
    }
    return winner === r.myColor ? { title: "YOU WIN", forMe: "win" } : { title: `${(peerNameRef.current ?? "Opponent").toUpperCase().slice(0, 18)} WINS`, forMe: "loss" };
  }
  peerNameRef.current = peerName;

  function finishGame(winner: Color | null, subtitle: string, kind: GameResult["kind"]) {
    const { title, forMe } = titleFor(winner, subtitle, kind);
    const res: GameResult = { kind, winner, title, subtitle, forMe };
    resultRef.current = res;
    setResult(res);
    setThinking(false);
    thinkingRef.current = false;
    setOverDismissed(false);
    clearSave();
    if (forMe === "win") chessSounds.win();
    else if (forMe === "loss") chessSounds.lose();
    else chessSounds.draw();
  }

  function applyMoveCore(from: string, to: string, promotion: string | undefined, origin: "mine" | "peer" | "ai" | "local") {
    const g = gameRef.current;
    let m: Move;
    try {
      m = g.move({ from, to, promotion });
    } catch {
      if (origin === "mine" || origin === "local") {
        chessSounds.illegal();
        toast("Illegal move.");
      }
      return null;
    }
    // clock increment for the mover
    const tm = activeTimeModeRef.current;
    setClocks((prev) => {
      const next = { ...prev };
      if (tm.base > 0 && tm.inc > 0) next[m.color] = prev[m.color] + tm.inc * 1000;
      clocksRef.current = next;
      return next;
    });
    clockSnaps.current.push({ ...clocksRef.current });

    const nextMoves = gameRef.current.history({ verbose: true });
    movesRef.current = nextMoves;
    setMoves(nextMoves);
    setFens((f) => [...f, g.fen()]);
    setFen(g.fen());
    setSelected(null);
    setPromo(null);
    setViewPly(null);
    if (m.captured || m.flags.includes("e")) {
      setCaptureFx({ square: to, key: nextMoves.length });
      chessSounds.capture();
    } else if (m.san.includes("O-O")) {
      chessSounds.castle();
    } else {
      chessSounds.move();
    }

    const r = rtRef.current;
    if (r.mode !== "online") {
      persist(nextMoves.map((x) => ({ from: x.from, to: x.to, promotion: x.promotion })), clocksRef.current, {
        mode: r.mode, aiLevel: aiLevelRef.current, humanColor: r.myColor, timeId: activeTimeModeRef.current.id, startedAt: startedAtRef.current,
      });
    } else if (origin === "mine") {
      sendNet({ t: "move", from, to, promotion, ply: nextMoves.length });
    }

    const end = endStatus(g);
    if (end) {
      finishGame(end.winner, end.subtitle, end.kind);
    } else if (g.isCheck()) {
      chessSounds.check();
    }
    return m;
  }
  const activeTimeModeRef = useRef(activeTimeMode);
  activeTimeModeRef.current = activeTimeMode;
  const aiLevelRef = useRef(aiLevel);
  aiLevelRef.current = aiLevel;
  const startedAtRef = useRef(startedAt);
  startedAtRef.current = startedAt;

  /* board interaction */
  function myTurn(): boolean {
    if (phase !== "game" || result || viewing) return false;
    if (mode === "ai") return turn === humanColor && !thinking;
    if (mode === "local") return true;
    return turn === humanColor && peerHere;
  }

  function legalTargets(sq: string): MoveTarget[] {
    try {
      return gameRef.current.moves({ square: sq as never, verbose: true }).map((m) => ({
        square: m.to,
        capture: Boolean(m.captured) || m.flags.includes("e"),
      }));
    } catch {
      return [];
    }
  }

  function onSquare(sq: string) {
    if (!myTurn()) return;
    const g = gameRef.current;
    if (selected) {
      if (sq === selected) {
        setSelected(null);
        return;
      }
      const cands = g.moves({ square: selected as never, verbose: true }).filter((m) => m.to === sq);
      if (cands.length > 0) {
        if (cands.some((m) => m.promotion)) {
          setPromo({ from: selected, to: sq });
          chessSounds.select();
          return;
        }
        applyMoveCore(selected, sq, undefined, mode === "ai" ? "mine" : mode === "local" ? "local" : "mine");
        return;
      }
    }
    const piece = g.get(sq as never);
    if (piece && piece.color === g.turn() && (mode !== "ai" || g.turn() === humanColor) && (mode !== "online" || g.turn() === humanColor)) {
      setSelected(sq);
      chessSounds.select();
    } else if (selected) {
      setSelected(null);
    }
  }

  const selectable = useMemo(() => {
    if (!myTurn()) return [];
    const t = turn;
    return shownPieces.filter((p) => p.color === t).map((p) => p.square);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownPieces, turn, phase, result, thinking, mode, humanColor, peerHere, viewing]);
  const targets: MoveTarget[] = useMemo(
    () => (selected && myTurn() ? legalTargets(selected) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, fen, phase, result, thinking]
  );

  /* ------------------------------- AI ------------------------------ */

  useEffect(() => {
    if (phase !== "game" || mode !== "ai" || result || thinkingRef.current) return;
    if (gameRef.current.turn() !== humanColor) {
      thinkingRef.current = true;
      setThinking(true);
      const gen = ++genRef.current;
      const lvl = aiLevelRef.current;
      const t = setTimeout(() => {
        try {
          const mv = findBestMove(gameRef.current.fen(), lvl);
          if (genRef.current !== gen || resultRef.current) return;
          applyMoveCore(mv.from, mv.to, mv.promotion, "ai");
        } catch {
          if (genRef.current === gen) toast("Human AI failed to move — try again.");
        } finally {
          if (genRef.current === gen) {
            thinkingRef.current = false;
            setThinking(false);
          }
        }
      }, 450 + Math.random() * 550);
      return () => {
        clearTimeout(t);
        thinkingRef.current = false;
        setThinking(false);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, phase, mode, result, humanColor, aiLevel]);

  /* ------------------------------ clock ---------------------------- */

  useEffect(() => {
    if (phase !== "game" || !clockOn || result) return;
    const id = setInterval(() => {
      if (resultRef.current) return;
      const side = gameRef.current.turn();
      const next = { ...clocksRef.current, [side]: Math.max(0, clocksRef.current[side] - 100) };
      clocksRef.current = next;
      setClocks(next);
      if (next[side] <= 0) {
        finishGame(opp(side), "Time", "timeout");
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clockOn, result]);

  useEffect(() => {
    if (phase !== "game" || result) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase, result]);

  useEffect(() => {
    if (viewing) return;
    historyEndRef.current?.scrollIntoView({ behavior: animOn ? "smooth" : "auto", block: "nearest" });
  }, [moves.length, viewing, animOn]);

  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  /* saved game */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { sans?: unknown[] };
        if (Array.isArray(s.sans) && s.sans.length > 0) setSavedGame(raw);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* guest entry via ?game= */
  useEffect(() => {
    const gid = searchParams.get("game");
    if (gid && phase === "setup" && !gameId) {
      setGameId(gid);
      setPhase("join");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* --------------------------- networking --------------------------- */

  function sendNet(msg: NetMsg) {
    try {
      const ch = channelRef.current;
      if (!ch) return;
      void ch.send({ type: "broadcast", event: "game", payload: msg });
    } catch {
      // realtime best-effort
    }
  }

  function teardownNet() {
    leaveChannel();
    setGameId(null);
    setIsHost(false);
    setPeerName(null);
    setPeerHere(false);
    setConnState("idle");
    setConnError(null);
    setInviteOpen(false);
  }

  function openChannel(gid: string, role: "host" | "guest", displayName: string, onWelcome?: () => void): boolean {
    if (!supabase) {
      setConnState("error");
      setConnError("Realtime is not configured in this browser session.");
      return false;
    }
    try {
      leaveChannel();
      setConnState(role === "host" ? "waiting" : "connecting");
      const ch = supabase.channel(`chess-game-${gid}`, { config: { broadcast: { self: false }, presence: { key: `${role}-${randomId(4)}` } } });
      channelRef.current = ch;
      ch.on("broadcast", { event: "game" }, ({ payload }) => handleNet(payload as NetMsg));
      ch.on("presence", { event: "sync" }, () => {
        try {
          const state = ch.presenceState() as Record<string, { role?: string; name?: string }[]>;
          const others = Object.values(state).flat().filter((p) => p.role !== role);
          const here = others.length > 0;
          setPeerHere(here);
          const nm = others[0]?.name;
          if (nm && role === "host") setPeerName(nm);
          if (here && role === "host") {
            setConnState("live");
            setInviteOpen(false);
          }
        } catch {
          // ignore
        }
      });
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          try {
            void ch.track({ name: displayName, role });
          } catch {
            // ignore
          }
          if (role === "guest") {
            sendNet({ t: "hello", name: displayName });
            setTimeout(() => {
              if (rtRef.current.mode === "online" && !peerHereRef.current && phaseRef.current === "join") {
                setConnState("error");
                setConnError("No host answered — the link may be expired or the host left.");
              }
            }, 9000);
          }
          onWelcome?.();
        } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
          setConnState("error");
          setConnError("Could not reach the live server. Check your connection and try again.");
        }
      });
      return true;
    } catch {
      setConnState("error");
      setConnError("Could not open a live channel.");
      return false;
    }
  }
  peerHereRef.current = peerHere;
  phaseRef.current = phase;

  function handleNet(msg: NetMsg) {
    const r = rtRef.current;
    if (r.mode !== "online" || r.gameId === null) return;
    const g = gameRef.current;
    switch (msg.t) {
      case "hello": {
        if (!r.isHost) return;
        const nm = String(msg.name ?? "Guest");
        setPeerName(nm);
        setPeerHere(true);
        setConnState("live");
        setInviteOpen(false);
        sendNet({
          t: "welcome", hostName: userName, hostColor: rtRef.current.myColor, timeId: activeTimeModeRef.current.id,
          sans: movesRef.current.map((m) => ({ from: m.from, to: m.to, promotion: m.promotion })),
          clocks: { ...clocksRef.current },
        });
        setPhase("game");
        toast(`${nm} joined — White to move.`);
        chessSounds.notify();
        break;
      }
      case "welcome": {
        if (r.isHost) return;
        const tm = TIME_MODES.find((t) => t.id === String(msg.timeId ?? "10+0")) ?? TIME_MODES[5];
        const hc = msg.hostColor === "w" || msg.hostColor === "b" ? (msg.hostColor as Color) : "w";
        rtRef.current.myColor = opp(hc);
        setHumanColor(opp(hc));
        setPeerName(String(msg.hostName ?? "Host"));
        setPeerHere(true);
        setConnState("live");
        loadSync(
          (msg.sans as { from: string; to: string; promotion?: string }[]) ?? [],
          (msg.clocks as { w: number; b: number } | undefined) ?? undefined,
          tm
        );
        setPhase("game");
        toast("Connected — game on.");
        chessSounds.notify();
        break;
      }
      case "move": {
        const ply = Number(msg.ply ?? 0);
        if (ply !== movesRef.current.length + 1) {
          sendNet({ t: "sync-req" });
          return;
        }
        const m = applyMoveCore(String(msg.from), String(msg.to), (msg.promotion as string | undefined) ?? undefined, "peer");
        if (!m) sendNet({ t: "sync-req" });
        break;
      }
      case "sync-req": {
        if (!r.isHost) return;
        sendNet({
          t: "sync", sans: movesRef.current.map((m) => ({ from: m.from, to: m.to, promotion: m.promotion })),
          clocks: { ...clocksRef.current },
        });
        break;
      }
      case "sync": {
        loadSync(
          (msg.sans as { from: string; to: string; promotion?: string }[]) ?? [],
          (msg.clocks as { w: number; b: number } | undefined) ?? undefined,
          activeTimeModeRef.current
        );
        break;
      }
      case "resign": {
        if (resultRef.current) return;
        finishGame(r.myColor, "Resignation", "resign");
        toast("Opponent resigned.");
        break;
      }
      case "draw-offer": {
        if (resultRef.current) return;
        if (Number(msg.ply ?? -1) !== movesRef.current.length) return;
        setDrawOffer({ from: String(msg.name ?? peerNameRef.current ?? "Opponent"), ply: Number(msg.ply) });
        chessSounds.notify();
        break;
      }
      case "draw-response": {
        if (msg.accept && !resultRef.current) {
          finishGame(null, "Draw by agreement", "draw");
        } else if (!msg.accept) {
          toast("Draw offer declined.");
        }
        break;
      }
      case "undo-request": {
        if (resultRef.current) return;
        if (Number(msg.ply ?? -1) !== movesRef.current.length) return;
        setUndoReq({ from: String(msg.name ?? peerNameRef.current ?? "Opponent"), ply: Number(msg.ply) });
        chessSounds.notify();
        break;
      }
      case "undo-response": {
        if (msg.accept) {
          undoLastPly();
          toast("Undo accepted.");
        } else {
          toast("Undo request declined.");
        }
        break;
      }
      case "rematch-offer": {
        if (!resultRef.current) return;
        setRematchReq(true);
        chessSounds.notify();
        break;
      }
      case "rematch-response": {
        if (msg.accept) {
          beginOnlineRematch();
        } else {
          toast("Rematch declined.");
        }
        break;
      }
      default:
        break;
    }
  }

  function loadSync(sans: { from: string; to: string; promotion?: string }[], clocksVal: { w: number; b: number } | undefined, tm: TimeMode) {
    const r = rtRef.current;
    newGame({
      mode: "online", humanColor: r.myColor, timeMode: tm, aiLevel: aiLevelRef.current,
      sans, clocksVal: clocksVal ?? { w: tm.base * 1000, b: tm.base * 1000 },
      startedAtVal: Date.now(), keepPhase: true,
    });
  }

  function createInvite() {
    const gid = randomId(8);
    const hc: Color = colorPick === "random" ? (Math.random() < 0.5 ? "w" : "b") : colorPick;
    const tm = TIME_MODES.find((t) => t.id === timeId) ?? TIME_MODES[5];
    setGameId(gid);
    setIsHost(true);
    setHumanColor(hc);
    setActiveTimeMode(tm);
    setMode("online");
    rtRef.current = { mode: "online", myColor: hc, isHost: true, gameId: gid };
    newGame({ mode: "online", humanColor: hc, timeMode: tm, aiLevel, keepPhase: true });
    const link = `${window.location.origin}/chess?game=${gid}`;
    setInviteLink(link);
    setInviteOpen(true);
    if (openChannel(gid, "host", userName)) {
      copyText(link, "Invite link copied — send it to your friend.");
    }
  }

  function joinAsGuest() {
    if (!gameId) return;
    const name = guestName.trim().slice(0, 24) || "Guest";
    setIsHost(false);
    setMode("online");
    rtRef.current = { mode: "online", myColor: "b", isHost: false, gameId };
    openChannel(gameId, "guest", name);
  }

  function beginOnlineRematch() {
    const r = rtRef.current;
    const tm = activeTimeModeRef.current;
    newGame({ mode: "online", humanColor: opp(r.myColor), timeMode: tm, aiLevel: aiLevelRef.current, keepPhase: true });
    setRematchReq(false);
    toast("Rematch — colors swapped.");
  }

  /* ------------------------- control actions ------------------------ */

  /** Re-derive React state from the engine (source of truth). Keeps refs
   *  synchronous so back-to-back undos in the same tick stay consistent. */
  function syncFromGame() {
    const g = gameRef.current;
    const hist = g.history({ verbose: true });
    const fg = new Chess();
    const fl = [fg.fen()];
    for (const m of hist) {
      try {
        fg.move({ from: m.from, to: m.to, promotion: m.promotion });
        fl.push(fg.fen());
      } catch {
        break;
      }
    }
    movesRef.current = hist;
    setMoves(hist);
    setFens(fl);
    setFen(g.fen());
    setViewPly(null);
  }

  function undoLastPly() {
    const undone = gameRef.current.undo();
    if (!undone) return;
    clockSnaps.current.pop();
    const snap = clockSnaps.current[clockSnaps.current.length - 1];
    syncFromGame();
    if (snap) {
      clocksRef.current = { ...snap };
      setClocks({ ...snap });
    }
    if (resultRef.current) {
      resultRef.current = null;
      setResult(null);
    }
    chessSounds.move();
  }

  function handleUndo() {
    if (result || moves.length === 0) return;
    if (mode === "ai") {
      if (thinkingRef.current) return;
      // roll back the round: AI's reply plus the player's move
      undoLastPly();
      if (movesRef.current.length > 0 && gameRef.current.turn() !== humanColor) {
        undoLastPly();
      }
      toast("Move taken back.");
    } else if (mode === "local") {
      undoLastPly();
    } else {
      if (!peerHere) {
        toast("Opponent is not connected.");
        return;
      }
      sendNet({ t: "undo-request", name: userName, ply: movesRef.current.length });
      toast("Undo requested — waiting for opponent.");
    }
  }

  function handleResign() {
    if (result) return;
    const r = rtRef.current;
    const loser: Color = r.mode === "local" ? turn : r.myColor;
    if (r.mode === "online") sendNet({ t: "resign" });
    finishGame(opp(loser), "Resignation", "resign");
  }

  function handleDrawOffer() {
    if (result) return;
    if (mode === "ai") {
      const aiColor = opp(humanColor);
      const score = evaluateFen(fen) * (aiColor === "w" ? 1 : -1);
      if (score < -250) {
        finishGame(null, "Draw by agreement", "draw");
        toast("Human AI accepts the draw.");
      } else {
        toast("Human AI declines the draw — it likes its position.");
        chessSounds.illegal();
      }
    } else if (mode === "local") {
      setConfirm({
        title: "Agree a draw?",
        desc: "Both players must agree. End this game as a draw?",
        action: () => finishGame(null, "Draw by agreement", "draw"),
      });
    } else {
      if (!peerHere) {
        toast("Opponent is not connected.");
        return;
      }
      sendNet({ t: "draw-offer", name: userName, ply: movesRef.current.length });
      toast("Draw offered — waiting for opponent.");
    }
  }

  function handleRematch() {
    if (mode === "online") {
      if (rematchReq) {
        sendNet({ t: "rematch-response", accept: true });
        beginOnlineRematch();
      } else {
        sendNet({ t: "rematch-offer" });
        toast("Rematch offered — waiting for opponent.");
      }
      return;
    }
    const tm = activeTimeModeRef.current;
    if (mode === "ai") {
      newGame({ mode, humanColor: opp(humanColor), timeMode: tm, aiLevel });
      toast("Rematch — colors swapped.");
    } else {
      startLocalGame(true);
    }
  }

  function shareGame() {
    try {
      const pgn = gameRef.current.pgn();
      copyText(`${result?.title ?? "Human AI Chess"} — ${result?.subtitle ?? ""}\n${pgn}\nPlayed on Human AI Chess`, "Game copied — share it anywhere.");
    } catch {
      toast("Nothing to share yet.");
    }
  }

  /* ------------------------------ render ---------------------------- */

  const aiMeta = DIFFICULTIES.find((d) => d.id === aiLevel)!;
  const isMyTurn = myTurn();
  const topIsActive = phase === "game" && !result && turn !== orientation;
  const bottomIsActive = phase === "game" && !result && turn === orientation;

  const topName = mode === "ai" ? "Human AI" : mode === "local" ? (orientation === "w" ? "Black" : "White") : (peerName ?? "Opponent");
  const bottomName = mode === "ai" ? userName : mode === "local" ? (orientation === "w" ? "White" : "Black") : `${userName} (You)`;
  const topSub = mode === "ai" ? `${aiMeta.label} · ${aiMeta.rating}` : mode === "local" ? "Pass-and-play" : isHost ? "Host" : "Guest";
  const bottomSub = mode === "ai" ? (humanColor === "w" ? "White · You" : "Black · You") : mode === "local" ? "To move" : `${humanColor === "w" ? "White" : "Black"} · You`;

  function CapturedRow({ list, align = "left" }: { list: TrackedPiece["type"][]; align?: "left" | "right" }) {
    if (list.length === 0) return <span className="text-[11px] text-zinc-600">—</span>;
    return (
      <span className={`flex flex-wrap gap-px ${align === "right" ? "justify-end" : ""}`} aria-label="Captured pieces">
        {list.map((t, i) => (
          <span key={i} className="text-[17px] leading-none text-zinc-300" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
            {MINI_GLYPH[t]}
          </span>
        ))}
      </span>
    );
  }

  function PlayerBar({ name, sub, color, active, avatar, captured, advantage }: {
    name: string; sub: string; color: Color; active: boolean; avatar: React.ReactNode;
    captured: TrackedPiece["type"][]; advantage: number;
  }) {
    const clockMs = clocks[color];
    const low = clockOn && clockMs < 20000 && active && !result;
    return (
      <div className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all duration-300 ${active ? "border-accent/50 bg-ink-900 shadow-[0_0_24px_rgba(229,72,77,0.12)]" : "border-ink-700/60 bg-ink-900/60"}`}>
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-[14px] font-semibold text-white">{name}</p>
            {advantage > 0 && <span className="font-mono text-[11px] text-emerald-400">+{advantage}</span>}
          </div>
          <p className="truncate text-[11.5px] text-zinc-500">{sub}</p>
          <div className="mt-1"><CapturedRow list={captured} /></div>
        </div>
        {clockOn && clockShow && (
          <div className={`rounded-xl border px-2.5 py-1.5 font-mono text-[15px] font-semibold tabular-nums ${active ? "border-accent/40 bg-black text-white" : "border-ink-700 bg-black/50 text-zinc-400"} ${low ? "chess-clock-low border-accent text-accent" : ""}`}>
            <Timer size={12} className="mr-1.5 inline -mt-0.5 opacity-60" />
            {formatClock(clockMs)}
          </div>
        )}
      </div>
    );
  }

  /* move history pairs */
  const pairs: { n: number; w?: Move; b?: Move; wi: number; bi: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ n: i / 2 + 1, w: moves[i], b: moves[i + 1], wi: i + 1, bi: i + 2 });
  }

  return (
    <div className="h-full overflow-y-auto bg-black">
      <div className="mx-auto w-full max-w-[1380px] px-3 py-5 sm:px-5 sm:py-7">
        {/* header */}
        <header className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
            <Crown size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-semibold tracking-tight text-white">Human AI Chess</h1>
            <p className="truncate text-[12.5px] text-zinc-500">Think like a human. Play like a machine.</p>
          </div>
          {phase === "game" && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setSettingsOpen(true)} className="btn-ghost p-2" title="Board settings" aria-label="Board settings">
                <SettingsIcon size={17} />
              </button>
              <button
                onClick={() => {
                  if (moves.length > 0 && !result) {
                    setConfirm({ title: "Leave this game?", desc: "Start a new game? The current position will be lost unless it is saved.", action: () => { teardownNet(); setPhase("setup"); } });
                  } else {
                    teardownNet();
                    setPhase("setup");
                  }
                }}
                className="btn-ghost hidden p-2 sm:block"
                title="New game"
                aria-label="New game"
              >
                <Plus size={17} />
              </button>
            </div>
          )}
        </header>

        {phase === "setup" && (
          <SetupView
            setupMode={setupMode} setSetupMode={setSetupMode}
            aiLevel={aiLevel} setAiLevel={setAiLevel}
            colorPick={colorPick} setColorPick={setColorPick}
            timeId={timeId} setTimeId={setTimeId}
            themeId={themeId} setThemeId={setThemeId}
            soundOn={soundOn} setSoundOn={setSoundOn}
            animOn={animOn} setAnimOn={setAnimOn}
            coordsOn={coordsOn} setCoordsOn={setCoordsOn}
            hlOn={hlOn} setHlOn={setHlOn}
            clockShow={clockShow} setClockShow={setClockShow}
            pieceStyle={pieceStyle} setPieceStyle={setPieceStyle}
            savedGame={savedGame}
            onStartAi={() => startAiGame()}
            onStartLocal={() => startLocalGame()}
            onInvite={() => createInvite()}
            onContinue={() => savedGame && startAiGame({ cont: savedGame })}
          />
        )}

        {phase === "join" && (
          <div className="mx-auto w-full max-w-md">
            <div className="card chess-fade-up p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
                  <Link2 size={19} />
                </span>
                <div>
                  <h2 className="text-[17px] font-semibold text-white">You&apos;re invited</h2>
                  <p className="font-mono text-[12px] text-zinc-500">Game {gameId}</p>
                </div>
              </div>
              {connState === "error" ? (
                <div className="mt-5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-[13.5px] text-red-200">
                  {connError ?? "Connection failed."}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => { setPhase("setup"); setGameId(null); setConnState("idle"); }} className="btn-ghost border border-ink-700 text-[13px]">
                      Back to setup
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <label className="label mt-5" htmlFor="guest-name">Your display name</label>
                  <input
                    id="guest-name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    maxLength={24}
                    placeholder="e.g. Abdul"
                    className="input"
                  />
                  <button
                    onClick={joinAsGuest}
                    disabled={connState === "connecting" || connState === "live"}
                    className="btn-primary mt-4 w-full py-2.5"
                  >
                    {connState === "connecting" || connState === "live" ? (
                      <><Loader2 size={15} className="animate-spin" /> Joining…</>
                    ) : (
                      <><Swords size={15} /> Join match</>
                    )}
                  </button>
                  <p className="mt-3 text-center text-[12px] text-zinc-500">
                    {connState === "connecting" ? "Contacting the host…" : "Your name is only shared with the host of this match."}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {phase === "game" && (
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[290px_minmax(0,1fr)_320px] lg:items-start">
            {/* board column */}
            <div className="order-1 min-w-0 lg:order-2">
              <div className="mx-auto w-full max-w-[660px]">
                <PlayerBar
                  name={topName} sub={topSub} color={opp(orientation)} active={topIsActive}
                  avatar={mode === "ai"
                    ? <span className={`relative ${thinking ? "chess-thinking-ring" : ""} rounded-full`}><AvatarMark size={36} /></span>
                    : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[13px] font-semibold text-white">{(topName[0] ?? "?").toUpperCase()}</span>}
                  captured={orientation === "w" ? byBlack : byWhite}
                  advantage={orientation === "w" ? Math.max(0, -diff) : Math.max(0, diff)}
                />
                {mode === "ai" && thinking && (
                  <p className="mt-2 flex items-center gap-2 text-[12.5px] text-zinc-400" aria-live="polite">
                    <span className="flex items-center gap-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" />
                    </span>
                    Human AI is thinking…
                  </p>
                )}
                <div className="mt-2.5">
                  <ChessBoard
                    pieces={shownPieces}
                    orientation={orientation}
                    selectable={selectable}
                    selected={selected}
                    targets={targets}
                    lastMove={hlOn ? lastMove : null}
                    checkSquare={checkSquare}
                    captureFx={captureFx}
                    interactive={myTurn()}
                    animations={animOn}
                    showCoords={coordsOn}
                    highlightMoves={hlOn}
                    pieceStyle={pieceStyle}
                    theme={theme}
                    onSquare={onSquare}
                  />
                </div>
                <div className="mt-2.5">
                  <PlayerBar
                    name={bottomName} sub={bottomSub} color={orientation} active={bottomIsActive}
                    avatar={mode === "ai"
                      ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white">{userInitial}</span>
                      : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[13px] font-semibold text-white">{(bottomName[0] ?? "?").toUpperCase()}</span>}
                    captured={orientation === "w" ? byWhite : byBlack}
                    advantage={orientation === "w" ? Math.max(0, diff) : Math.max(0, -diff)}
                  />
                </div>
                {viewing && (
                  <button
                    onClick={() => setViewPly(null)}
                    className="btn-primary mt-3 w-full py-2 text-[13.5px]"
                  >
                    <Eye size={15} /> Back to live position
                  </button>
                )}
              </div>
            </div>

            {/* left column */}
            <div className="order-2 min-w-0 space-y-4 lg:order-1">
              <div className="card p-4">
                <p className="label">Match</p>
                <div className="space-y-2 text-[13.5px]">
                  <Row k="Mode" v={mode === "ai" ? "vs Human AI" : mode === "local" ? "Pass-and-play" : isHost ? "Online · host" : "Online · guest"} />
                  <Row k="Clock" v={clockOn ? activeTimeMode.label : "Off"} />
                  <Row k="Moves" v={String(Math.ceil(moves.length / 2))} />
                  <Row k="Duration" v={formatDuration(Math.max(0, nowTick - startedAt))} />
                  {mode === "online" && (
                    <Row k="Opponent" v={peerName ?? "…"} accent={!peerHere} />
                  )}
                </div>
                {mode === "ai" && (
                  <div className="mt-4 border-t border-ink-700/70 pt-3">
                    <p className="label">AI difficulty</p>
                    <DifficultySelect value={aiLevel} onChange={setAiLevel} compact />
                  </div>
                )}
              </div>
              {mode === "online" && (
                <div className="card p-4">
                  <p className="label">Invite</p>
                  <p className="break-all font-mono text-[12px] text-zinc-400">{inviteLink || `${typeof window !== "undefined" ? window.location.origin : ""}/chess?game=${gameId}`}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => copyText(inviteLink || `${window.location.origin}/chess?game=${gameId}`, "Invite link copied.")}
                      className="btn-ghost flex-1 border border-ink-700 text-[13px]"
                    >
                      <Copy size={14} /> Copy
                    </button>
                    <button
                      onClick={() => {
                        const link = inviteLink || `${window.location.origin}/chess?game=${gameId}`;
                        const data = { title: "Human AI Chess", text: "Join my private chess match", url: link };
                        if (navigator.share) {
                          navigator.share(data).catch(() => copyText(link, "Invite link copied."));
                        } else copyText(link, "Invite link copied.");
                      }}
                      className="btn-ghost flex-1 border border-ink-700 text-[13px]"
                    >
                      <Share2 size={14} /> Share
                    </button>
                  </div>
                  {!peerHere && !result && (
                    <p className="mt-3 flex items-center gap-2 text-[12.5px] text-zinc-500">
                      <Radio size={13} className="animate-pulse text-accent" /> Waiting for your opponent…
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* right column */}
            <div className="order-3 min-w-0 space-y-4">
              <div className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Moves</p>
                  {moves.length > 0 && (
                    <span className="font-mono text-[11px] text-zinc-600">{moves.length} ply</span>
                  )}
                </div>
                {moves.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-zinc-500">
                    {mode === "ai" && humanColor === "b" ? "Human AI opens the game…" : "White to move."}
                  </p>
                ) : (
                  <div className="chess-moves max-h-[300px] overflow-y-auto pr-1 lg:max-h-[380px]">
                    {pairs.map((p) => (
                      <div key={p.n} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-1 rounded-lg px-1 py-0.5 odd:bg-white/[0.02]">
                        <span className="font-mono text-[12px] text-zinc-600">{p.n}.</span>
                        {([
                          { m: p.w, ply: p.wi },
                          { m: p.b, ply: p.bi },
                        ] as { m?: Move; ply: number }[]).map(({ m, ply }, i) => (
                          <span key={i}>
                            {m ? (
                              <button
                                onClick={() => setViewPly(ply === livePly && viewing ? null : ply)}
                                className={`w-full rounded-md px-2 py-1 text-left font-mono text-[13px] transition-colors ${
                                  shownPly === ply ? "bg-accent/20 text-white" : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                                } ${ply === livePly && !viewing ? "chess-latest-move" : ""}`}
                              >
                                {m.san}
                              </button>
                            ) : <span />}
                          </span>
                        ))}
                      </div>
                    ))}
                    <div ref={historyEndRef} />
                  </div>
                )}
              </div>

              <div className="card p-3">
                <div className="grid grid-cols-4 gap-1.5">
                  <CtlBtn icon={<Plus size={16} />} label="New" onClick={() => {
                    if (moves.length > 0 && !result) {
                      setConfirm({ title: "Leave this game?", desc: "The current position will be lost unless it is saved.", action: () => { teardownNet(); setPhase("setup"); } });
                    } else { teardownNet(); setPhase("setup"); }
                  }} />
                  <CtlBtn icon={<RotateCcw size={16} />} label="Restart" disabled={moves.length === 0} onClick={() => {
                    setConfirm({
                      title: "Restart game?", desc: "Reset the board to the starting position?",
                      action: () => {
                        if (mode === "online") { toast("Online games use Rematch after the game ends."); return; }
                        if (mode === "ai") startAiGame(); else startLocalGame();
                      },
                    });
                  }} />
                  <CtlBtn icon={<Undo2 size={16} />} label="Undo" disabled={moves.length === 0 || !!result || (mode === "ai" && thinking)} onClick={handleUndo} />
                  <CtlBtn icon={<ArrowLeftRight size={16} />} label="Flip" onClick={() => setFlipped((f) => !f)} />
                  <CtlBtn icon={<Flag size={16} />} label="Resign" danger disabled={!!result} onClick={() => {
                    setConfirm({ title: "Resign?", desc: "Concede this game?", danger: true, action: handleResign });
                  }} />
                  <CtlBtn icon={<Handshake size={16} />} label="Draw" disabled={!!result} onClick={handleDrawOffer} />
                  <CtlBtn icon={<Share2 size={16} />} label="Share" disabled={moves.length === 0} onClick={shareGame} />
                  <CtlBtn icon={<SettingsIcon size={16} />} label="Setup" onClick={() => setSettingsOpen(true)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* toasts */}
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
          {toasts.map((t) => (
            <div key={t.id} className="chess-toast pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-ink-800/95 px-4 py-2.5 text-[13px] text-zinc-100 shadow-2xl backdrop-blur">
              <Check size={14} className="shrink-0 text-emerald-400" />
              {t.text}
            </div>
          ))}
        </div>

        {/* invite / waiting modal (host) */}
        {inviteOpen && phase === "setup" && (
          <Modal onClose={() => { setInviteOpen(false); teardownNet(); }}>
            <div className="p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
                  {connState === "live" ? <Check size={19} /> : <Loader2 size={19} className="animate-spin" />}
                </span>
                <div>
                  <h2 className="text-[16px] font-semibold text-white">Private match created</h2>
                  <p className="font-mono text-[12px] text-zinc-500">Game {gameId}</p>
                </div>
              </div>
              <label className="label mt-5">Invite link</label>
              <div className="flex gap-2">
                <input readOnly value={inviteLink} onFocus={(e) => e.target.select()} className="input font-mono text-[12px]" />
                <button onClick={() => copyText(inviteLink, "Invite link copied.")} className="btn-primary shrink-0 px-3" title="Copy link" aria-label="Copy link">
                  <Copy size={15} />
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    const data = { title: "Human AI Chess", text: "Join my private chess match", url: inviteLink };
                    if (navigator.share) navigator.share(data).catch(() => copyText(inviteLink, "Invite link copied."));
                    else copyText(inviteLink, "Invite link copied.");
                  }}
                  className="btn-ghost flex-1 border border-ink-700 text-[13px]"
                >
                  <Share2 size={14} /> Share…
                </button>
                <button onClick={() => { setInviteOpen(false); teardownNet(); }} className="btn-ghost flex-1 border border-ink-700 text-[13px]">
                  <X size={14} /> Cancel
                </button>
              </div>
              <p className="mt-4 flex items-center justify-center gap-2 text-[13px] text-zinc-400">
                <span className="flex items-center gap-1">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
                Waiting for your opponent…
              </p>
            </div>
          </Modal>
        )}

        {/* promotion */}
        {promo && (
          <Modal>
            <div className="p-6 text-center">
              <h2 className="text-[16px] font-semibold text-white">Promote to</h2>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {(["q", "r", "b", "n"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => applyMoveCore(promo.from, promo.to, t, mode === "local" ? "local" : "mine")}
                    className="rounded-xl border border-ink-700 bg-ink-850 py-3 text-4xl transition-colors hover:border-accent/50 hover:bg-ink-800"
                    aria-label={`Promote to ${t}`}
                  >
                    <span className={turn === "w" ? "text-zinc-100" : "text-black"} style={{ textShadow: turn === "w" ? "0 0 3px #000, 0 2px 4px rgba(0,0,0,0.9)" : "0 0 3px rgba(255,255,255,0.5)" }}>
                      {turn === "w" ? { q: "♕", r: "♖", b: "♗", n: "♘" }[t] : { q: "♛", r: "♜", b: "♝", n: "♞" }[t]}
                    </span>
                  </button>
                ))}
              </div>
              <button onClick={() => setPromo(null)} className="btn-ghost mt-4 w-full text-[13px]">Cancel</button>
            </div>
          </Modal>
        )}

        {/* confirm */}
        {confirm && (
          <Modal onClose={() => setConfirm(null)}>
            <div className="p-6">
              <h2 className="text-[16px] font-semibold text-white">{confirm.title}</h2>
              <p className="mt-1.5 text-[13.5px] leading-6 text-zinc-400">{confirm.desc}</p>
              <div className="mt-5 flex gap-2">
                <button onClick={() => setConfirm(null)} className="btn-ghost flex-1 border border-ink-700">Cancel</button>
                <button
                  onClick={() => { const a = confirm.action; setConfirm(null); a(); }}
                  className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors ${confirm.danger ? "bg-accent hover:bg-accent-hover" : "bg-ink-700 hover:bg-ink-600"}`}
                >
                  Confirm
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* incoming draw offer */}
        {drawOffer && !result && (
          <Modal>
            <div className="p-6 text-center">
              <Handshake size={26} className="mx-auto text-accent" />
              <h2 className="mt-2 text-[16px] font-semibold text-white">{drawOffer.from} offers a draw</h2>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => {
                    if (drawOffer.ply !== movesRef.current.length) { setDrawOffer(null); toast("Position changed — offer expired."); return; }
                    sendNet({ t: "draw-response", accept: true });
                    setDrawOffer(null);
                    finishGame(null, "Draw by agreement", "draw");
                  }}
                  className="btn-primary flex-1"
                >
                  Accept
                </button>
                <button
                  onClick={() => { sendNet({ t: "draw-response", accept: false }); setDrawOffer(null); }}
                  className="btn-ghost flex-1 border border-ink-700"
                >
                  Decline
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* incoming undo request */}
        {undoReq && !result && (
          <Modal>
            <div className="p-6 text-center">
              <Undo2 size={26} className="mx-auto text-accent" />
              <h2 className="mt-2 text-[16px] font-semibold text-white">{undoReq.from} requests undo</h2>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => {
                    if (undoReq.ply !== movesRef.current.length) { setUndoReq(null); toast("Position changed — request expired."); return; }
                    sendNet({ t: "undo-response", accept: true });
                    setUndoReq(null);
                    undoLastPly();
                  }}
                  className="btn-primary flex-1"
                >
                  Accept
                </button>
                <button
                  onClick={() => { sendNet({ t: "undo-response", accept: false }); setUndoReq(null); }}
                  className="btn-ghost flex-1 border border-ink-700"
                >
                  Decline
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* incoming rematch */}
        {rematchReq && result && (
          <Modal>
            <div className="p-6 text-center">
              <Swords size={26} className="mx-auto text-accent" />
              <h2 className="mt-2 text-[16px] font-semibold text-white">{peerName ?? "Opponent"} wants a rematch</h2>
              <div className="mt-5 flex gap-2">
                <button onClick={handleRematch} className="btn-primary flex-1">Accept</button>
                <button onClick={() => { sendNet({ t: "rematch-response", accept: false }); setRematchReq(false); }} className="btn-ghost flex-1 border border-ink-700">
                  Decline
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* game over */}
        {result && !overDismissed && (
          <Modal>
            <div className="chess-result-glow p-6 text-center sm:p-8">
              <Crown size={30} className={`mx-auto ${result.forMe === "win" ? "text-amber-300" : result.forMe === "loss" ? "text-zinc-500" : "text-zinc-300"}`} />
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{result.subtitle}</p>
              <h2 className="chess-result-title mt-1 text-[30px] font-black tracking-tight text-white">{result.title}</h2>
              <div className="mx-auto mt-5 grid max-w-xs grid-cols-3 gap-2 text-center">
                <Stat label="Moves" value={String(Math.ceil(moves.length / 2))} />
                <Stat label="Time" value={formatDuration(Math.max(0, Date.now() - startedAt))} />
                <Stat label="Captured" value={String(byWhite.length + byBlack.length)} />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button onClick={handleRematch} className="btn-primary py-2.5">
                  <Swords size={15} /> Rematch
                </button>
                <button onClick={() => { teardownNet(); setPhase("setup"); }} className="btn-ghost border border-ink-700 py-2.5">
                  <Plus size={15} /> New game
                </button>
                <button onClick={() => { setOverDismissed(true); setViewPly(0); }} className="btn-ghost border border-ink-700 py-2.5">
                  <Eye size={15} /> Review
                </button>
                <button onClick={shareGame} className="btn-ghost border border-ink-700 py-2.5">
                  <Share2 size={15} /> Share
                </button>
              </div>
              <button onClick={() => { setOverDismissed(true); setViewPly(null); }} className="btn-ghost mt-2 w-full text-[13px]">
                <X size={15} /> Dismiss
              </button>
            </div>
          </Modal>
        )}
        {result && overDismissed && !viewing && (
          <div className="pointer-events-none fixed bottom-5 left-1/2 z-[55] -translate-x-1/2">
            <button onClick={() => setOverDismissed(false)} className="btn-primary pointer-events-auto shadow-2xl">
              <Crown size={15} /> View result
            </button>
          </div>
        )}
        {result && viewing && (
          <div className="pointer-events-none fixed bottom-5 left-1/2 z-[55] -translate-x-1/2">
            <button onClick={() => setViewPly(null)} className="btn-primary pointer-events-auto shadow-2xl">
              <Eye size={15} /> Back to live
            </button>
          </div>
        )}

        {/* settings */}
        {settingsOpen && (
          <Modal onClose={() => setSettingsOpen(false)}>
            <div className="max-h-[85vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-white">Board settings</h2>
                <button onClick={() => setSettingsOpen(false)} className="btn-ghost p-1.5" aria-label="Close settings">
                  <X size={16} />
                </button>
              </div>
              <p className="label mt-5">Board theme</p>
              <div className="grid grid-cols-4 gap-2">
                {BOARD_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setThemeId(t.id)}
                    className={`overflow-hidden rounded-xl border-2 transition-all ${themeId === t.id ? "border-accent" : "border-transparent hover:border-ink-600"}`}
                    title={t.name}
                  >
                    <span className="grid grid-cols-2" style={{ aspectRatio: "2/1" }}>
                      <span style={{ background: t.light }} />
                      <span style={{ background: t.dark }} />
                    </span>
                    <span className="block bg-ink-850 py-1 text-center text-[10.5px] text-zinc-400">{t.name}</span>
                  </button>
                ))}
              </div>
              <p className="label mt-5">Piece style</p>
              <Seg value={pieceStyle} onChange={setPieceStyle} options={[
                { id: "classic", label: "Classic" },
                { id: "bold", label: "Bold" },
                { id: "flat", label: "Flat" },
              ]} />
              <div className="mt-4 divide-y divide-ink-800">
                <Toggle label="Coordinates" on={coordsOn} onChange={setCoordsOn} />
                <Toggle label="Highlight moves" on={hlOn} onChange={setHlOn} />
                <Toggle label="Animations" on={animOn} onChange={setAnimOn} />
                <Toggle label="Sound" on={soundOn} onChange={setSoundOn} />
                <Toggle label="Show clock" on={clockShow} onChange={setClockShow} />
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{k}</span>
      <span className={`font-medium ${accent ? "text-amber-300" : "text-zinc-100"}`}>{v}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 px-2 py-2.5">
      <p className="font-mono text-[15px] font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}

function CtlBtn({ icon, label, onClick, disabled, danger }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-xl border border-ink-700 bg-ink-850 py-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        danger ? "text-red-400 hover:border-accent/50 hover:text-red-300" : "text-zinc-300 hover:border-ink-600 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Setup view                                                          */
/* ------------------------------------------------------------------ */

function SetupView(props: {
  setupMode: "ai" | "local" | "online"; setSetupMode: (v: "ai" | "local" | "online") => void;
  aiLevel: AiDifficulty; setAiLevel: (v: AiDifficulty) => void;
  colorPick: "w" | "b" | "random"; setColorPick: (v: "w" | "b" | "random") => void;
  timeId: string; setTimeId: (v: string) => void;
  themeId: string; setThemeId: (v: string) => void;
  soundOn: boolean; setSoundOn: (v: boolean) => void;
  animOn: boolean; setAnimOn: (v: boolean) => void;
  coordsOn: boolean; setCoordsOn: (v: boolean) => void;
  hlOn: boolean; setHlOn: (v: boolean) => void;
  clockShow: boolean; setClockShow: (v: boolean) => void;
  pieceStyle: "classic" | "bold" | "flat"; setPieceStyle: (v: "classic" | "bold" | "flat") => void;
  savedGame: string | null;
  onStartAi: () => void; onStartLocal: () => void; onInvite: () => void; onContinue: () => void;
}) {
  const p = props;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="chess-fade-up card overflow-hidden">
        <div className="border-b border-ink-700/70 px-5 py-4 sm:px-6">
          <h2 className="text-[16px] font-semibold text-white">Start a game</h2>
          <p className="mt-0.5 text-[13px] text-zinc-500">Choose your opponent and your settings.</p>
        </div>
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="grid grid-cols-3 gap-2">
            <ModeCard active={p.setupMode === "ai"} onClick={() => p.setSetupMode("ai")} icon={<Bot size={19} />} title="Human AI" desc="Play the engine" />
            <ModeCard active={p.setupMode === "local"} onClick={() => p.setSetupMode("local")} icon={<Users size={19} />} title="Friend" desc="Same device" />
            <ModeCard active={p.setupMode === "online"} onClick={() => p.setSetupMode("online")} icon={<Link2 size={19} />} title="Invite" desc="Private link" />
          </div>

          {p.setupMode === "ai" && (
            <div className="chess-fade-up">
              <p className="label">AI difficulty</p>
              <DifficultySelect value={p.aiLevel} onChange={p.setAiLevel} />
            </div>
          )}

          {p.setupMode !== "local" && (
            <div>
              <p className="label">Play as</p>
              <Seg value={p.colorPick} onChange={p.setColorPick} options={[
                { id: "w", label: "♔ White" },
                { id: "random", label: "Random" },
                { id: "b", label: "♚ Black" },
              ]} />
            </div>
          )}

          <div>
            <p className="label">Time control</p>
            <div className="flex flex-wrap gap-1.5">
              {TIME_MODES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => p.setTimeId(t.id)}
                  className={`rounded-full border px-3.5 py-1.5 font-mono text-[12.5px] transition-colors ${
                    p.timeId === t.id ? "border-accent/60 bg-accent/15 text-white" : "border-ink-700 text-zinc-400 hover:border-ink-600 hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label">Board theme</p>
            <div className="grid grid-cols-4 gap-2">
              {BOARD_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => p.setThemeId(t.id)}
                  className={`overflow-hidden rounded-xl border-2 transition-all ${p.themeId === t.id ? "border-accent" : "border-transparent hover:border-ink-600"}`}
                  title={t.name}
                >
                  <span className="grid grid-cols-2" style={{ aspectRatio: "2/1" }}>
                    <span style={{ background: t.light }} />
                    <span style={{ background: t.dark }} />
                  </span>
                  <span className="block bg-ink-850 py-1 text-center text-[10.5px] text-zinc-400">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-x-6 sm:grid-cols-2">
            <Toggle label="Sound effects" on={p.soundOn} onChange={p.setSoundOn} />
            <Toggle label="Animations" on={p.animOn} onChange={p.setAnimOn} />
            <Toggle label="Coordinates" on={p.coordsOn} onChange={p.setCoordsOn} />
            <Toggle label="Move highlights" on={p.hlOn} onChange={p.setHlOn} />
          </div>

          {p.setupMode === "ai" && (
            <button onClick={p.onStartAi} className="btn-primary chess-start-glow w-full py-3 text-[15px]">
              <Bot size={17} /> Play vs Human AI
            </button>
          )}
          {p.setupMode === "local" && (
            <button onClick={p.onStartLocal} className="btn-primary chess-start-glow w-full py-3 text-[15px]">
              <Users size={17} /> Start pass-and-play
            </button>
          )}
          {p.setupMode === "online" && (
            <div>
              <button onClick={p.onInvite} className="btn-primary chess-start-glow w-full py-3 text-[15px]">
                <Link2 size={17} /> Invite a friend
              </button>
              <p className="mt-2 text-center text-[12px] text-zinc-500">You&apos;ll get a private link. The match starts when your friend joins.</p>
            </div>
          )}
          {p.savedGame && (
            <button onClick={p.onContinue} className="btn-ghost w-full border border-ink-700 py-2.5 text-[14px]">
              <Eye size={15} /> Continue saved game
            </button>
          )}
        </div>
      </div>
      <p className="mt-4 flex items-center justify-center gap-2 text-[12px] text-zinc-600">
        {props.soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
        Full rules — castling, en passant, promotion, draws and clocks included.
      </p>
    </div>
  );
}

function ModeCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-3 text-left transition-all sm:p-4 ${
        active ? "border-accent/60 bg-accent/[0.08] shadow-[0_0_28px_rgba(229,72,77,0.12)]" : "border-ink-700 bg-ink-850 hover:border-ink-600"
      }`}
    >
      <span className={active ? "text-accent" : "text-zinc-400"}>{icon}</span>
      <p className={`mt-2 text-[14px] font-semibold ${active ? "text-white" : "text-zinc-300"}`}>{title}</p>
      <p className="mt-0.5 hidden text-[12px] text-zinc-500 sm:block">{desc}</p>
    </button>
  );
}

export function DifficultySelect({ value, onChange, compact }: { value: AiDifficulty; onChange: (v: AiDifficulty) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = DIFFICULTIES.find((d) => d.id === value)!;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-2.5 text-left transition-colors hover:border-ink-600"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Bot size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-white">{current.label}</span>
          {!compact && <span className="block truncate text-[12px] text-zinc-500">{current.tagline} · ~{current.rating}</span>}
        </span>
        <span className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="animate-menu-in absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-ink-800 shadow-2xl" role="listbox">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                onClick={() => { onChange(d.id); setOpen(false); }}
                className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${d.id === value ? "bg-accent/15" : "hover:bg-white/[0.05]"}`}
                role="option"
                aria-selected={d.id === value}
              >
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-[14px] font-medium text-white">
                    {d.label}
                    {d.id === value && <Check size={14} className="text-accent" />}
                  </span>
                  <span className="block text-[12px] text-zinc-500">{d.tagline} · ~{d.rating}</span>
                </span>
                <span className="flex gap-[3px]" aria-hidden="true">
                  {DIFFICULTIES.map((x, i) => (
                    <span
                      key={x.id}
                      className={`h-4 w-1 rounded-full ${i <= DIFFICULTIES.indexOf(d) ? "bg-accent" : "bg-ink-700"}`}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
