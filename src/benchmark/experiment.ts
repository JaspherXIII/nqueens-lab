import {
  KNOWN,
  type AlgorithmId,
  type Experiment,
  type SearchResult,
  type Trial,
  type TrialRecord,
} from "../types";

export function median(values: number[]) {
  if (!values.length)
    throw new Error("Cannot summarize an empty measurement set.");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function createExperiment(
  configuration: Experiment["configuration"],
): Experiment {
  const {
    from,
    to,
    repetitions,
    selectedAlgorithms,
    timeoutPerExecutionSeconds,
  } = configuration;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 4 ||
    to > 14 ||
    from > to ||
    !Number.isInteger(repetitions) ||
    repetitions < 1 ||
    !selectedAlgorithms.length ||
    new Set(selectedAlgorithms).size !== selectedAlgorithms.length ||
    selectedAlgorithms.some(
      (a) => !["conventional", "occupancy", "bitmask", "symmetry"].includes(a),
    ) ||
    !Number.isFinite(timeoutPerExecutionSeconds) ||
    timeoutPerExecutionSeconds <= 0
  )
    throw new Error(
      "Select at least one algorithm and a valid board-size range, repetition count, and timeout.",
    );
  const trials: TrialRecord[] = [];
  for (let n = from; n <= to; n++)
    for (let repetition = 1; repetition <= repetitions; repetition++) {
      const offset = (repetition - 1 + n - from) % selectedAlgorithms.length;
      const order = [
        ...selectedAlgorithms.slice(offset),
        ...selectedAlgorithms.slice(0, offset),
      ];
      for (const algorithm of order)
        trials.push({
          order: trials.length + 1,
          executionOrder: null,
          n,
          algorithm,
          repetition,
          status: "pending",
          elapsed: null,
          metrics: null,
          startedAt: null,
          finishedAt: null,
          error: null,
        });
    }
  return {
    id: crypto.randomUUID(),
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    configuration: {
      ...configuration,
      selectedAlgorithms: [...selectedAlgorithms],
    },
    trials,
  };
}

export function summarize(experiment: Experiment): Trial[] {
  const groups: Trial[] = [];
  const config = experiment.configuration;
  for (let n = config.from; n <= config.to; n++)
    for (const algorithm of config.selectedAlgorithms) {
      const records = experiment.trials.filter(
        (t) => t.n === n && t.algorithm === algorithm,
      );
      if (
        records.length !== config.repetitions ||
        records.some(
          (t) => t.status !== "success" || t.elapsed === null || !t.metrics,
        )
      )
        continue;
      const times = records.map((t) => t.elapsed!);
      const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
      groups.push({
        n,
        algorithm,
        times,
        median: median(times),
        min: Math.min(...times),
        max: Math.max(...times),
        stddev:
          times.length > 1
            ? Math.sqrt(
                times.reduce((sum, t) => sum + (t - mean) ** 2, 0) /
                  times.length,
              )
            : null,
        metrics: records[0].metrics!,
      });
    }
  return groups;
}

export function improvementFor(row: Trial, results: Trial[]) {
  const baseline = results.find(
    (r) =>
      r.n === row.n &&
      r.algorithm === "conventional" &&
      r.times.length === row.times.length,
  );
  if (!baseline) return { value: null, label: "Baseline unavailable" };
  if (baseline.median === 0)
    return { value: null, label: "Baseline below timer resolution" };
  const value = ((baseline.median - row.median) / baseline.median) * 100;
  return { value, label: `${value.toFixed(1)}%` };
}

type Runner = (
  n: number,
  algorithm: AlgorithmId,
  record: boolean,
  timeout: number,
  signal?: AbortSignal,
  warmup?: boolean,
) => Promise<SearchResult>;
// Only one worker is awaited at a time. Rendering and worker startup stay outside solver timing.
export async function executeExperiment(
  experiment: Experiment,
  runner: Runner,
  signal: AbortSignal,
  update: (e: Experiment) => void,
) {
  const publish = () =>
    update({ ...experiment, trials: experiment.trials.map((t) => ({ ...t })) });
  let executionOrder = 0;
  for (const trial of experiment.trials) {
    if (signal.aborted) break;
    trial.executionOrder = ++executionOrder;
    trial.status = "running";
    trial.startedAt = new Date().toISOString();
    publish();
    try {
      const result = await runner(
        trial.n,
        trial.algorithm,
        false,
        experiment.configuration.timeoutPerExecutionSeconds * 1000,
        signal,
        true,
      );
      if (signal.aborted) throw new Error("Cancelled");
      if (!result.complete) throw new Error("Execution timed out");
      if (result.solutions !== KNOWN[trial.n])
        throw new Error(
          `Correctness failure: expected ${KNOWN[trial.n]}, received ${result.solutions}.`,
        );
      if (!Number.isFinite(result.elapsed) || result.elapsed < 0)
        throw new Error("Invalid elapsed measurement.");
      trial.status = "success";
      trial.elapsed = result.elapsed;
      trial.metrics = {
        nodes: result.nodes,
        checks: result.checks,
        backtracks: result.backtracks,
        solutions: result.solutions,
      };
    } catch (error) {
      trial.error = error instanceof Error ? error.message : String(error);
      trial.status = signal.aborted
        ? "cancelled"
        : /timed out|timeout/i.test(trial.error)
          ? "timed_out"
          : "failed";
    }
    trial.finishedAt = new Date().toISOString();
    publish();
  }
  for (const trial of experiment.trials)
    if (trial.status === "pending") {
      trial.status = "skipped";
      trial.error = "Experiment cancelled before this trial started.";
    }
  experiment.status = signal.aborted
    ? "cancelled"
    : experiment.trials.some((t) => t.status !== "success")
      ? "completed_with_errors"
      : "completed";
  experiment.finishedAt = new Date().toISOString();
  publish();
  return experiment;
}

export function trialCounts(experiment: Experiment) {
  return experiment.trials.reduce(
    (counts, t) => ({ ...counts, [t.status]: counts[t.status] + 1 }),
    {
      pending: 0,
      running: 0,
      success: 0,
      failed: 0,
      timed_out: 0,
      cancelled: 0,
      skipped: 0,
    },
  );
}

export function exportExperiment(
  experiment: Experiment,
  format: "csv" | "json",
) {
  const results = summarize(experiment);
  const exportedAt = new Date().toISOString();
  if (format === "json")
    return JSON.stringify(
      {
        schemaVersion: 2,
        ...experiment,
        exportedAt,
        counts: trialCounts(experiment),
        results,
      },
      null,
      2,
    );
  const headers = [
    "experiment_id",
    "experiment_status",
    "experiment_started_at",
    "experiment_finished_at",
    "exported_at",
    "from_n",
    "to_n",
    "repetitions",
    "timeout_seconds",
    "selected_algorithms",
    "execution_order_policy",
    "warmup",
    "source",
    "environment",
    "memory",
    "planned_order",
    "execution_order",
    "n",
    "algorithm",
    "repetition",
    "trial_status",
    "trial_started_at",
    "trial_finished_at",
    "error",
    "elapsed_ms",
    "nodes",
    "backtracks",
    "candidate_checks",
    "solutions",
    "included_in_comparison",
    "median_ms",
    "min_ms",
    "max_ms",
    "stddev_ms",
    "trial_times_ms",
    "improvement_percent",
    "baseline_status",
  ];
  const c = experiment.configuration;
  const rows = experiment.trials.map((t) => {
    const group = results.find(
      (r) => r.n === t.n && r.algorithm === t.algorithm,
    );
    const improvement = group ? improvementFor(group, results) : null;
    return [
      experiment.id,
      experiment.status,
      experiment.startedAt,
      experiment.finishedAt,
      exportedAt,
      c.from,
      c.to,
      c.repetitions,
      c.timeoutPerExecutionSeconds,
      JSON.stringify(c.selectedAlgorithms),
      c.executionOrder,
      c.warmup,
      c.source,
      JSON.stringify(c.environment),
      c.memory,
      t.order,
      t.executionOrder,
      t.n,
      t.algorithm,
      t.repetition,
      t.status,
      t.startedAt,
      t.finishedAt,
      t.error,
      t.elapsed,
      t.metrics?.nodes,
      t.metrics?.backtracks,
      t.metrics?.checks,
      t.metrics?.solutions,
      Boolean(group),
      group?.median,
      group?.min,
      group?.max,
      group?.stddev,
      group ? JSON.stringify(group.times) : null,
      improvement?.value,
      improvement?.value === null
        ? improvement.label
        : group
          ? "Valid conventional baseline"
          : "Incomplete group",
    ];
  });
  // RFC 4180: one header, equal-width records, escaped quotes, CRLF. BOM helps Excel detect UTF-8.
  const escape = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")
  );
}
