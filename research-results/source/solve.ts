import type { AlgorithmId, SearchEvent, SearchResult, Metrics } from "../types";
export function solve(
  n: number,
  algorithm: AlgorithmId,
  options: {
    record?: boolean;
    timeout?: number;
    eventLimit?: number;
    sampleLimit?: number;
  } = {},
): SearchResult {
  if (!Number.isInteger(n) || n < 0 || n > 14)
    throw new Error("Board size must be an integer from 0 to 14.");
  const started = performance.now(),
    deadline = started + (options.timeout ?? 30000);
  const m: Metrics = { nodes: 0, checks: 0, backtracks: 0, solutions: 0 };
  const board = Array<number>(n).fill(-1),
    events: SearchEvent[] = [],
    samples: number[][] = [];
  const limit = options.eventLimit ?? 20000;
  let recordedLimit = false;
  function emit(
    type: SearchEvent["type"],
    row: number,
    col: number,
    weight = 1,
  ) {
    if (!options.record) return;
    if (events.length >= limit) {
      recordedLimit = true;
      return;
    }
    events.push({ ...m, type, row, col, weight, board: [...board] });
  }
  function enter() {
    m.nodes++;
    if ((m.nodes & 1023) === 0 && performance.now() > deadline)
      throw new Error("TIMEOUT");
  }
  function found(weight: number) {
    m.solutions += weight;
    if (options.record && samples.length < (options.sampleLimit ?? 100)) {
      samples.push([...board]);
      if (weight === 2 && samples.length < (options.sampleLimit ?? 100))
        samples.push(board.map((c) => n - 1 - c));
    }
    emit("solution", n, -1, weight);
  }
  function conventional(row: number) {
    enter();
    if (row === n) {
      found(1);
      return;
    }
    for (let col = 0; col < n; col++) {
      m.checks++;
      let safe = true;
      for (let previous = 0; previous < row; previous++)
        if (
          board[previous] === col ||
          Math.abs(board[previous] - col) === row - previous
        ) {
          safe = false;
          break;
        }
      if (!safe) {
        emit("reject", row, col);
        continue;
      }
      board[row] = col;
      emit("place", row, col);
      conventional(row + 1);
      board[row] = -1;
      m.backtracks++;
      emit("remove", row, col);
    }
  }
  function occupancy() {
    const columns = Array<boolean>(n).fill(false),
      down = Array<boolean>(2 * n + 1).fill(false),
      up = Array<boolean>(2 * n + 1).fill(false);
    function visit(row: number) {
      enter();
      if (row === n) {
        found(1);
        return;
      }
      for (let col = 0; col < n; col++) {
        m.checks++;
        const d = row - col + n,
          u = row + col;
        if (columns[col] || down[d] || up[u]) {
          emit("reject", row, col);
          continue;
        }
        columns[col] = down[d] = up[u] = true;
        board[row] = col;
        emit("place", row, col);
        visit(row + 1);
        columns[col] = down[d] = up[u] = false;
        board[row] = -1;
        m.backtracks++;
        emit("remove", row, col);
      }
    }
    visit(0);
  }
  const mask = (1 << n) - 1;
  function bitmask(row: number, columns: number, left: number, right: number) {
    enter();
    if (row === n) {
      found(1);
      return;
    }
    let available = mask & ~(columns | left | right);
    while (available) {
      const bit = available & -available;
      available ^= bit;
      m.checks++;
      const col = 31 - Math.clz32(bit);
      board[row] = col;
      emit("place", row, col);
      bitmask(
        row + 1,
        columns | bit,
        ((left | bit) << 1) & mask,
        (right | bit) >>> 1,
      );
      board[row] = -1;
      m.backtracks++;
      emit("remove", row, col);
    }
  }
  function symmetry() {
    function visit(
      row: number,
      columns: number,
      left: number,
      right: number,
      weight: number,
    ) {
      enter();
      if (row === n) {
        found(weight);
        return;
      }
      let available = mask & ~(columns | left | right);
      while (available) {
        const bit = available & -available;
        available ^= bit;
        m.checks++;
        const col = 31 - Math.clz32(bit);
        board[row] = col;
        emit("place", row, col, weight);
        visit(
          row + 1,
          columns | bit,
          ((left | bit) << 1) & mask,
          (right | bit) >>> 1,
          weight,
        );
        board[row] = -1;
        m.backtracks++;
        emit("remove", row, col, weight);
      }
    }
    enter();
    if (n === 0) {
      found(1);
      return;
    }
    for (let col = 0; col < Math.ceil(n / 2); col++) {
      const bit = 1 << col,
        weight = col < Math.floor(n / 2) ? 2 : 1;
      m.checks++;
      board[0] = col;
      emit("place", 0, col, weight);
      visit(1, bit, (bit << 1) & mask, bit >>> 1, weight);
      board[0] = -1;
      m.backtracks++;
      emit("remove", 0, col, weight);
    }
  }
  let complete = true;
  try {
    switch (algorithm) {
      case "conventional":
        conventional(0);
        break;
      case "occupancy":
        occupancy();
        break;
      case "bitmask":
        bitmask(0, 0, 0, 0);
        break;
      case "symmetry":
        symmetry();
        break;
      default:
        throw new Error("Unknown algorithm");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "TIMEOUT") complete = false;
    else throw error;
  }
  return {
    ...m,
    elapsed: performance.now() - started,
    events,
    samples,
    recordedLimit,
    complete,
  };
}
