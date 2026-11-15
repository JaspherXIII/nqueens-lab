import { describe, it, expect } from "vitest";
import { solve } from "./solve";
import { ALGORITHMS, KNOWN } from "../types";
describe("independent algorithm correctness", () => {
  for (const algorithm of ALGORITHMS)
    for (const [size, count] of Object.entries(KNOWN))
      it(`${algorithm.id}: N=${size} → ${count}`, () => {
        const result = solve(Number(size), algorithm.id, { timeout: 120000 });
        expect(result.complete).toBe(true);
        expect(result.solutions).toBe(count);
      }, 180000);
  it("records real valid solutions with bounded history", () => {
    const r = solve(8, "symmetry", { record: true, eventLimit: 50 });
    expect(r.events).toHaveLength(50);
    expect(r.recordedLimit).toBe(true);
    expect(r.solutions).toBe(92);
    for (const board of r.samples) {
      expect(new Set(board).size).toBe(8);
      for (let i = 0; i < 8; i++)
        for (let j = i + 1; j < 8; j++)
          expect(Math.abs(board[i] - board[j])).not.toBe(j - i);
    }
  });
  it("maintains consistent tree counts for full-search algorithms", () => {
    const a = solve(8, "conventional"),
      b = solve(8, "occupancy"),
      c = solve(8, "bitmask");
    expect(a.nodes).toBe(b.nodes);
    expect(b.nodes).toBe(c.nodes);
    expect(a.checks).toBe(b.checks);
    expect(c.checks).toBe(c.backtracks);
    expect(solve(8, "symmetry").nodes).toBeLessThan(c.nodes);
  });
  it("reports timeout without claiming complete counts", () =>
    expect(solve(14, "conventional", { timeout: -1 }).complete).toBe(false));
  it("rejects unsupported board sizes", () => {
    for (const n of [-1, 15, 4.5, NaN])
      expect(() => solve(n, "bitmask")).toThrow();
  });
});
