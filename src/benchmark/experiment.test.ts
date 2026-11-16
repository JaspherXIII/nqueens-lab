import { describe, expect, it, vi } from "vitest";
import {
  createExperiment,
  executeExperiment,
  exportExperiment,
  improvementFor,
  median,
  summarize,
  trialCounts,
} from "./experiment";
import { solve } from "../algorithms/solve";
import type { Experiment } from "../types";

function config(
  overrides: Partial<Experiment["configuration"]> = {},
): Experiment["configuration"] {
  return {
    from: 4,
    to: 4,
    repetitions: 4,
    timeoutPerExecutionSeconds: 1,
    selectedAlgorithms: ["conventional", "occupancy", "bitmask", "symmetry"],
    executionOrder: "Rotate left by repetition - 1 + size offset",
    warmup: "One full warm-up",
    source: "Visitor-generated browser benchmark",
    environment: { userAgent: 'Browser, "quoted"\nnext line', processors: 8 },
    memory: "Not available",
    ...overrides,
  };
}

// Parse quoted CSV including embedded commas, CRLF, and escaped quotes.
function parseCSV(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  const input = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (c === "\r" && input[i + 1] === "\n" && !quoted) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

describe("reproducible experiments", () => {
  it("rotates all algorithms across repetitions and offsets the next board size", () => {
    const e = createExperiment(config({ to: 5 }));
    const orders = Array.from({ length: 4 }, (_, i) =>
      e.trials
        .filter((t) => t.n === 4 && t.repetition === i + 1)
        .map((t) => t.algorithm),
    );
    expect(orders).toEqual([
      ["conventional", "occupancy", "bitmask", "symmetry"],
      ["occupancy", "bitmask", "symmetry", "conventional"],
      ["bitmask", "symmetry", "conventional", "occupancy"],
      ["symmetry", "conventional", "occupancy", "bitmask"],
    ]);
    expect(
      e.trials
        .filter((t) => t.n === 5 && t.repetition === 1)
        .map((t) => t.algorithm),
    ).toEqual(orders[1]);
    expect(e.trials.map((t) => t.order)).toEqual(
      Array.from({ length: 32 }, (_, i) => i + 1),
    );
    expect(e.trials.every((t) => t.elapsed === null)).toBe(true);
  });
  it("awaits workers sequentially with the same deadline, recording off and warm-up on", async () => {
    const e = createExperiment(config());
    let active = 0,
      maximum = 0;
    const runner = vi.fn(async (n, a, record, timeout, signal, warmup) => {
      maximum = Math.max(maximum, ++active);
      expect([record, timeout, warmup]).toEqual([false, 1000, true]);
      expect(signal).toBeInstanceOf(AbortSignal);
      await Promise.resolve();
      active--;
      return {
        ...solve(n, a),
        elapsed: e.trials.find((t) => t.status === "running")!.repetition,
      };
    });
    const snapshots: Experiment[] = [];
    await executeExperiment(
      e,
      runner,
      new AbortController().signal,
      (snapshot) => snapshots.push(snapshot),
    );
    expect(maximum).toBe(1);
    expect(e.status).toBe("completed");
    expect(trialCounts(e).success).toBe(16);
    expect(runner.mock.calls.map((c) => c[1])).toEqual(
      e.trials.map((t) => t.algorithm),
    );
    expect(snapshots[0].trials[0].status).toBe("running");
    for (const group of summarize(e)) {
      expect(group.times).toEqual([1, 2, 3, 4]);
      expect([group.min, group.median, group.max]).toEqual([1, 2.5, 4]);
      expect(group.stddev).toBeCloseTo(Math.sqrt(1.25));
    }
  });
  it("retains timeouts, invalid counts and successes but excludes incomplete groups", async () => {
    const e = createExperiment(config({ repetitions: 2 }));
    let calls = 0;
    await executeExperiment(
      e,
      async (n, a) => {
        calls++;
        if (a === "occupancy" && calls < 5)
          throw new Error('Warm-up timed out, "no measurement"\nretry');
        if (a === "symmetry") return { ...solve(n, a), solutions: 999 };
        return { ...solve(n, a), elapsed: 0 };
      },
      new AbortController().signal,
      () => {},
    );
    expect(trialCounts(e)).toMatchObject({
      success: 5,
      failed: 2,
      timed_out: 1,
    });
    expect(e.status).toBe("completed_with_errors");
    expect(summarize(e).map((r) => r.algorithm)).toEqual([
      "conventional",
      "bitmask",
    ]);
    expect(
      e.trials
        .filter((t) => t.status !== "success")
        .every((t) => t.elapsed === null && t.metrics === null),
    ).toBe(true);
    const json = JSON.parse(exportExperiment(e, "json"));
    expect(json.trials).toHaveLength(8);
    expect(json.results).toHaveLength(2);
    expect(json.configuration.selectedAlgorithms).toHaveLength(4);
    const csv = parseCSV(exportExperiment(e, "csv"));
    expect(csv).toHaveLength(9);
    expect(csv.every((row) => row.length === csv[0].length)).toBe(true);
    const index = (name: string) => csv[0].indexOf(name);
    const failed = csv
      .slice(1)
      .find((r) => r[index("trial_status")] === "timed_out")!;
    expect(failed[index("elapsed_ms")]).toBe("");
    expect(failed[index("error")]).toBe(
      'Warm-up timed out, "no measurement"\nretry',
    );
    expect(JSON.parse(failed[index("environment")])).toEqual(
      e.configuration.environment,
    );
    expect(csv[1][index("elapsed_ms")]).toBe("0");
  });
  it("cancels the active trial, marks unstarted trials skipped and retains prior groups", async () => {
    const controller = new AbortController();
    const e = createExperiment(config({ repetitions: 1 }));
    let calls = 0;
    await executeExperiment(
      e,
      async (n, a) => {
        if (++calls === 2) {
          controller.abort();
          throw new Error("Cancelled");
        }
        return solve(n, a);
      },
      controller.signal,
      () => {},
    );
    expect(e.status).toBe("cancelled");
    expect(trialCounts(e)).toMatchObject({
      success: 1,
      cancelled: 1,
      skipped: 2,
    });
    expect(e.trials.map((t) => t.executionOrder)).toEqual([1, 2, null, null]);
    expect(summarize(e)).toHaveLength(1);
    expect(summarize(e)[0].stddev).toBeNull();
    expect(parseCSV(exportExperiment(e, "csv"))).toHaveLength(5);
    const preCancelled = createExperiment(config());
    const runner = vi.fn();
    await executeExperiment(preCancelled, runner, controller.signal, () => {});
    expect(runner).not.toHaveBeenCalled();
    expect(trialCounts(preCancelled).skipped).toBe(16);
  });
  it("distinguishes absent and zero baselines and permits negative improvements", async () => {
    const e = createExperiment(
      config({
        repetitions: 1,
        selectedAlgorithms: ["conventional", "bitmask"],
      }),
    );
    await executeExperiment(
      e,
      async (n, a) => ({
        ...solve(n, a),
        elapsed: a === "conventional" ? 10 : 12,
      }),
      new AbortController().signal,
      () => {},
    );
    const rows = summarize(e),
      row = rows[1];
    expect(improvementFor(row, rows).value).toBe(-20);
    expect(improvementFor(row, [row]).label).toBe("Baseline unavailable");
    expect(improvementFor(row, [{ ...rows[0], median: 0 }, row]).label).toBe(
      "Baseline below timer resolution",
    );
    expect(improvementFor({ ...row, median: 5 }, rows).value).toBe(50);
    expect(() => median([])).toThrow();
    expect(() =>
      createExperiment(config({ selectedAlgorithms: [] })),
    ).toThrow();
  });
});
