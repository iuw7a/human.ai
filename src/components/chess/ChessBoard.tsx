"use client";

export interface TrackedPiece {
  key: string;
  type: "p" | "n" | "b" | "r" | "q" | "k";
  color: "w" | "b";
  square: string;
}

export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: "graphite", name: "Graphite", light: "#c7cbd3", dark: "#54575f" },
  { id: "midnight", name: "Midnight", light: "#8b95a5", dark: "#2c313a" },
  { id: "forest", name: "Forest", light: "#e6e1cd", dark: "#4d7a5b" },
  { id: "crimson", name: "Crimson", light: "#ddd6d2", dark: "#7e2f35" },
];

const GLYPHS: Record<"w" | "b", Record<TrackedPiece["type"], string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

const FILES = "abcdefgh";

function squareToXY(sq: string, orientation: "w" | "b"): { col: number; row: number } {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]);
  if (orientation === "w") return { col: f, row: 8 - r };
  return { col: 7 - f, row: r - 1 };
}

export interface MoveTarget {
  square: string;
  capture: boolean;
}

interface ChessBoardProps {
  pieces: TrackedPiece[];
  orientation: "w" | "b";
  selectable: string[];
  selected: string | null;
  targets: MoveTarget[];
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  captureFx: { square: string; key: number } | null;
  interactive: boolean;
  animations: boolean;
  showCoords: boolean;
  highlightMoves: boolean;
  pieceStyle: "classic" | "bold" | "flat";
  theme: BoardTheme;
  onSquare: (sq: string) => void;
}

export function ChessBoard(props: ChessBoardProps) {
  const {
    pieces, orientation, selectable, selected, targets, lastMove,
    checkSquare, captureFx, interactive, animations, showCoords,
    highlightMoves, pieceStyle, theme, onSquare,
  } = props;

  const targetMap = new Map<string, MoveTarget>(targets.map((t) => [t.square, t]));
  const squares: string[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const f = orientation === "w" ? col : 7 - col;
      const r = orientation === "w" ? 8 - row : row + 1;
      squares.push(`${FILES[f]}${r}`);
    }
  }

  return (
    <div
      className="chess-board-wrap relative aspect-square w-full select-none overflow-hidden rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.65),0_4px_20px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
      style={{ containerType: "inline-size" }}
    >
      {/* squares */}
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
        {squares.map((sq) => {
          const { col, row } = squareToXY(sq, orientation);
          const isLight = (col + row) % 2 === 0;
          const isSel = selected === sq;
          const isLast = highlightMoves && lastMove && (lastMove.from === sq || lastMove.to === sq);
          const isCheck = checkSquare === sq;
          const target = targetMap.get(sq);
          const clickable = interactive && (selectable.includes(sq) || target !== undefined);
          const showFile = showCoords && row === 7;
          const showRank = showCoords && col === 0;
          return (
            <div
              key={sq}
              onClick={() => onSquare(sq)}
              className={`relative ${clickable ? "cursor-pointer" : ""} ${interactive && clickable ? "hover:brightness-[1.12]" : ""} transition-[filter] duration-150`}
              style={{ background: isLight ? theme.light : theme.dark }}
            >
              {isLast && <span className="absolute inset-0 bg-accent/25" />}
              {isSel && (
                <span className="absolute inset-0 bg-accent/40 shadow-[inset_0_0_0_3px_rgba(229,72,77,0.9)]" />
              )}
              {isCheck && <span className="chess-check-glow absolute inset-0" />}
              {target && !target.capture && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="h-[26%] w-[26%] rounded-full bg-black/30 shadow-[0_0_0_2px_rgba(255,255,255,0.12)]" />
                </span>
              )}
              {target && target.capture && (
                <span className="absolute inset-[3%] rounded-full border-[3px] border-accent/80" />
              )}
              {showFile && (
                <span
                  className="absolute bottom-[2%] right-[4%] font-mono leading-none"
                  style={{ fontSize: "3.2cqw", color: isLight ? theme.dark : theme.light, opacity: 0.85 }}
                >
                  {sq[0]}
                </span>
              )}
              {showRank && (
                <span
                  className="absolute left-[4%] top-[3%] font-mono leading-none"
                  style={{ fontSize: "3.2cqw", color: isLight ? theme.dark : theme.light, opacity: 0.85 }}
                >
                  {sq[1]}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* capture shockwave */}
      {captureFx && animations && (
        <CaptureRing key={captureFx.key} square={captureFx.square} orientation={orientation} />
      )}

      {/* pieces */}
      <div className="pointer-events-none absolute inset-0">
        {pieces.map((p) => {
          const { col, row } = squareToXY(p.square, orientation);
          return (
            <span
              key={p.key}
              className={`chess-piece chess-piece-${p.color} chess-style-${pieceStyle} absolute flex items-center justify-center ${
                animations ? "chess-piece-anim" : ""
              }`}
              style={{ left: `${col * 12.5}%`, top: `${row * 12.5}%`, width: "12.5%", height: "12.5%", fontSize: "9.2cqw" }}
            >
              {GLYPHS[p.color][p.type]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CaptureRing({ square, orientation }: { square: string; orientation: "w" | "b" }) {
  const { col, row } = squareToXY(square, orientation);
  return (
    <span
      className="chess-capture-ring pointer-events-none absolute"
      style={{ left: `${col * 12.5}%`, top: `${row * 12.5}%`, width: "12.5%", height: "12.5%" }}
    />
  );
}
