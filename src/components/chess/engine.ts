import { Chess, Move } from "chess.js";

export type AiDifficulty =
  | "beginner"
  | "easy"
  | "medium"
  | "hard"
  | "expert"
  | "master";

export interface DifficultyMeta {
  id: AiDifficulty;
  label: string;
  tagline: string;
  /** placeholder rating for flavor */
  rating: number;
}

export const DIFFICULTIES: DifficultyMeta[] = [
  { id: "beginner", label: "Beginner", tagline: "Learning the moves", rating: 400 },
  { id: "easy", label: "Easy", tagline: "Casual and forgiving", rating: 800 },
  { id: "medium", label: "Medium", tagline: "Solid club play", rating: 1200 },
  { id: "hard", label: "Hard", tagline: "Sharp and tactical", rating: 1600 },
  { id: "expert", label: "Expert", tagline: "Deep calculation", rating: 2000 },
  { id: "master", label: "Master", tagline: "Full strength", rating: 2400 },
];

export interface EngineMove {
  from: string;
  to: string;
  promotion?: string;
}

interface SearchOpts {
  maxDepth: number;
  timeMs: number;
  nodeCap: number;
  quiescence: number; // extra capture-only depth (0 = off)
  jitter: number; // cp window around best for candidate pool
  topN: number; // max candidates in pool
  blunderRate: number; // chance of a fully random move
}

/** Tuned per difficulty — higher levels search deeper, longer, cleaner. */
const PRESETS: Record<AiDifficulty, SearchOpts> = {
  beginner: { maxDepth: 1, timeMs: 150, nodeCap: 4_000, quiescence: 0, jitter: 320, topN: 8, blunderRate: 0.22 },
  easy: { maxDepth: 1, timeMs: 300, nodeCap: 12_000, quiescence: 0, jitter: 120, topN: 4, blunderRate: 0.06 },
  medium: { maxDepth: 2, timeMs: 700, nodeCap: 60_000, quiescence: 0, jitter: 40, topN: 3, blunderRate: 0 },
  hard: { maxDepth: 3, timeMs: 1200, nodeCap: 220_000, quiescence: 4, jitter: 15, topN: 2, blunderRate: 0 },
  expert: { maxDepth: 3, timeMs: 2000, nodeCap: 500_000, quiescence: 6, jitter: 0, topN: 1, blunderRate: 0 },
  master: { maxDepth: 3, timeMs: 3200, nodeCap: 900_000, quiescence: 8, jitter: 0, topN: 1, blunderRate: 0 },
};

const VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/* Piece-square tables, white perspective, a8 → h1. */
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

const MATE = 100_000;

function pstIndex(sq: string, color: "w" | "b"): number {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]);
  return color === "w" ? (8 - rank) * 8 + file : (rank - 1) * 8 + file;
}

/** Static evaluation, white-relative centipawns. */
function evaluateBoard(game: Chess): number {
  const board = game.board();
  let score = 0;
  for (const row of board) {
    for (const p of row) {
      if (!p) continue;
      const v = VALUES[p.type] + PST[p.type][pstIndex(p.square, p.color)];
      score += p.color === "w" ? v : -v;
    }
  }
  return score;
}

/** MVV-LVA style ordering score for fast alpha-beta cutoffs. */
function orderScore(m: Move): number {
  let s = 0;
  if (m.captured) s += 10 * (VALUES[m.captured] ?? 0) - (VALUES[m.piece] ?? 0) / 10;
  if (m.promotion) s += (VALUES[m.promotion] ?? 0);
  if (m.san.startsWith("O-O")) s += 30;
  return s;
}

interface SearchState {
  nodes: number;
  deadline: number;
  nodeCap: number;
  stopped: boolean;
  qDepth: number;
}

function quiesce(game: Chess, alpha: number, beta: number, depth: number, st: SearchState): number {
  const color: "w" | "b" = game.turn();
  const sign = color === "w" ? 1 : -1;
  const standPat = sign * evaluateBoard(game);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  if (depth <= 0) return alpha;

  const captures = game
    .moves({ verbose: true })
    .filter((m) => m.captured || m.promotion)
    .sort((a, b) => orderScore(b) - orderScore(a));
  for (const m of captures) {
    if ((st.nodes & 2047) === 0 && (Date.now() > st.deadline || st.nodes > st.nodeCap)) {
      st.stopped = true;
      return alpha;
    }
    game.move(m);
    st.nodes++;
    const score = -quiesce(game, -beta, -alpha, depth - 1, st);
    game.undo();
    if (st.stopped) return alpha;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function alphaBeta(game: Chess, depth: number, alpha: number, beta: number, st: SearchState): number {
  if ((st.nodes & 2047) === 0 && (Date.now() > st.deadline || st.nodes > st.nodeCap)) {
    st.stopped = true;
    return alpha;
  }
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) {
    if (game.isCheck()) return -MATE - depth; // mated — prefer slower mates
    return 0;
  }
  if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) {
    return 0;
  }
  if (depth <= 0) {
    if (st.qDepth > 0) return quiesce(game, alpha, beta, st.qDepth, st);
    const color: "w" | "b" = game.turn();
    return (color === "w" ? 1 : -1) * evaluateBoard(game);
  }
  moves.sort((a, b) => orderScore(b) - orderScore(a));
  for (const m of moves) {
    game.move(m);
    st.nodes++;
    const score = -alphaBeta(game, depth - 1, -beta, -alpha, st);
    game.undo();
    if (st.stopped) return alpha;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/**
 * Find the AI move for the side to move. Synchronous — call inside a
 * setTimeout so the thinking indicator can paint first.
 */
export function findBestMove(fen: string, difficulty: AiDifficulty): EngineMove {
  const preset = PRESETS[difficulty];
  const game = new Chess(fen);
  const legal = game.moves({ verbose: true });
  if (legal.length === 0) throw new Error("No legal moves.");
  if (legal.length === 1) {
    const m = legal[0];
    return { from: m.from, to: m.to, promotion: m.promotion };
  }
  if (Math.random() < preset.blunderRate) {
    const m = legal[Math.floor(Math.random() * legal.length)];
    return { from: m.from, to: m.to, promotion: m.promotion };
  }

  const st: SearchState = {
    nodes: 0,
    deadline: Date.now() + preset.timeMs,
    nodeCap: preset.nodeCap,
    stopped: false,
    qDepth: preset.quiescence,
  };

  let best: EngineMove = { from: legal[0].from, to: legal[0].to, promotion: legal[0].promotion };
  let scored: { move: Move; score: number }[] = [];

  for (let depth = 1; depth <= preset.maxDepth; depth++) {
    const ordered = [...legal].sort((a, b) => orderScore(b) - orderScore(a));
    const round: { move: Move; score: number }[] = [];
    let alpha = -Infinity;
    for (const m of ordered) {
      game.move(m);
      st.nodes++;
      const score = -alphaBeta(game, depth - 1, -Infinity, -alpha, st);
      game.undo();
      if (st.stopped) break;
      round.push({ move: m, score });
      if (score > alpha) {
        alpha = score;
        best = { from: m.from, to: m.to, promotion: m.promotion };
      }
    }
    if (st.stopped) break;
    scored = round.sort((a, b) => b.score - a.score);
    if (scored.length > 0 && scored[0].score > MATE - 1000) break; // found mate
    if (Date.now() > st.deadline) break;
  }

  if (scored.length === 0) return best;
  const top = scored[0].score;
  const pool = scored
    .filter((s) => top - s.score <= preset.jitter)
    .slice(0, Math.max(1, preset.topN));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { from: pick.move.from, to: pick.move.to, promotion: pick.move.promotion };
}

/** Score from White's perspective for draw decisions / display. */
export function evaluateFen(fen: string): number {
  return evaluateBoard(new Chess(fen));
}
