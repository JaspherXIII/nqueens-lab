import type { SearchEvent } from "../types";
import { Crown, X } from "lucide-react";
export default function Board({
  n,
  board,
  event,
}: {
  n: number;
  board: number[];
  event?: SearchEvent;
}) {
  return (
    <div className="board-frame">
      <div
        className="board"
        role="img"
        aria-label={`${n} by ${n} board with ${board.filter((c) => c >= 0).length} queens`}
        style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
      >
        {Array.from({ length: n * n }, (_, i) => {
          const row = Math.floor(i / n),
            col = i % n,
            queen = board[row] === col,
            rejected =
              event?.type === "reject" &&
              event.row === row &&
              event.col === col;
          const active = event?.row === row;
          const candidate = active && event?.col === col;
          const removed = candidate && event?.type === "remove";
          return (
            <div
              key={i}
              className={`square ${(row + col) % 2 ? "square-dark" : ""} ${rejected ? "rejected" : ""} ${queen ? "occupied" : ""} ${active ? "active-row" : ""} ${candidate ? "active-candidate" : ""}`}
            >
              <span className="coordinate">
                {col === 0
                  ? n - row
                  : row === n - 1
                    ? String.fromCharCode(97 + col)
                    : ""}
              </span>
              {queen && (
                <span className="queen" key={`queen-${row}-${col}`}>
                  <Crown aria-hidden="true" />
                </span>
              )}
              {removed && (
                <span
                  className="queen removed-queen"
                  key={`removed-${row}-${col}`}
                >
                  <Crown aria-hidden="true" />
                </span>
              )}
              {rejected && (
                <span className="conflict">
                  <X aria-hidden="true" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
