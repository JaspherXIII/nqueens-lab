import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";
import { execFileSync } from "node:child_process";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

// Only type annotations are removed. No algorithm or timing instrumentation is rewritten.
const root = fileURLToPath(new URL("../", import.meta.url));
const sha256 = text => crypto.createHash("sha256").update(text).digest("hex");
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "strip" })).toString("base64")}`;
const serializableResult = r => ({ elapsed: r.elapsed, nodes: r.nodes, checks: r.checks, backtracks: r.backtracks, solutions: r.solutions, complete: r.complete, events: r.events, samples: r.samples, recordedLimit: r.recordedLimit });

if (!isMainThread) {
  const { solve } = await import(workerData.solveModule);
  const { n, algorithm, timeout, expected } = workerData;
  const execute = phase => {
    parentPort.postMessage({ kind: "started", phase, startedAt: new Date().toISOString() });
    try {
      const result = solve(n, algorithm, { record: false, timeout });
      const status = !result.complete ? "timed_out" : result.solutions !== expected ? "failed" : "success";
      parentPort.postMessage({ kind: "finished", phase, finishedAt: new Date().toISOString(), status,
        error: !result.complete ? "Internal 120-second execution deadline reached; partial count excluded." : result.solutions !== expected ? `Count mismatch: expected ${expected}, received ${result.solutions}` : null,
        result: serializableResult(result) });
    } catch (error) {
      parentPort.postMessage({ kind: "finished", phase, finishedAt: new Date().toISOString(), status: "failed", error: String(error) });
    }
  };
  parentPort.on("message", message => { if (message === "measure") execute("measured"); });
  execute("warmup");
} else {
  const args = process.argv.slice(2);
  const arg = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const output = path.resolve(root, arg("--output", "research-results"));
  const from = Number(arg("--from", 4)), to = Number(arg("--to", 14));
  const repetitions = Number(arg("--repetitions", 10));
  const timeoutSeconds = Number(arg("--timeout-seconds", 120));
  if (fs.existsSync(path.join(output, "benchmark-config.json"))) throw new Error("Output already contains an experiment. Use --output with a new directory; existing research data will not be overwritten.");
  fs.mkdirSync(path.join(output, "source"), { recursive: true });
  const sourcePaths = ["src/algorithms/solve.ts", "src/types.ts", "src/benchmark/experiment.ts"];
  const sources = Object.fromEntries(sourcePaths.map(relative => [relative, fs.readFileSync(path.join(root, relative), "utf8")]));
  for (const [relative, content] of Object.entries(sources)) fs.writeFileSync(path.join(output, "source", path.basename(relative)), content);
  const typesModule = moduleURL(sources["src/types.ts"]);
  const solveModule = moduleURL(sources["src/algorithms/solve.ts"]);
  const experimentModule = moduleURL(sources["src/benchmark/experiment.ts"]).replace(/^data:.*/, () => {
    const js = stripTypeScriptTypes(sources["src/benchmark/experiment.ts"], { mode: "strip" }).replace('"../types"', JSON.stringify(typesModule));
    return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  });
  const { ALGORITHMS, KNOWN } = await import(typesModule);
  const { createExperiment, executeExperiment, summarize, trialCounts, improvementFor } = await import(experimentModule);
  const referenceCounts = {4:2,5:10,6:4,7:40,8:92,9:352,10:724,11:2680,12:14200,13:73712,14:365596};
  for (const [n, count] of Object.entries(referenceCounts)) if (KNOWN[n] !== count) throw new Error(`Application oracle differs from OEIS at N=${n}`);
  const commandOutput = (command, args) => { try { return execFileSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true }).trim(); } catch { return null; } };
  const cpuStart = os.cpus();
  const cpuSnapshot = cpus => cpus.map(cpu => ({ model: cpu.model, observedSpeedMHz: cpu.speed }));
  const settings = {
    runtime: "Node.js worker_threads / V8", nodeVersion: process.version, v8Version: process.versions.v8,
    executable: path.basename(process.execPath), nodeFlags: process.execArgv,
    operatingSystem: { platform: os.platform(), type: os.type(), release: os.release(), version: os.version(), architecture: os.arch() },
    processor: { model: cpuStart[0]?.model ?? "Unavailable", logicalProcessors: cpuStart.length, availableParallelism: os.availableParallelism(), physicalCoreCount: null, physicalCoreCountNote: "Win32_Processor query was denied; physical core count is not inferred from logical processors.", logicalProcessorSnapshot: cpuSnapshot(cpuStart) },
    totalSystemMemoryBytes: os.totalmem(), freeSystemMemoryBytesAtStart: os.freemem(),
    processPriorityAtStart: os.getPriority(), powerPlanAtStart: process.platform === "win32" ? commandOutput("powercfg", ["/getactivescheme"]) : null,
    timezone: "Asia/Shanghai", conditions: {
      execution: "One sequential worker at a time, terminated before the next trial. One full warm-up then one measured solve in the same fresh worker.",
      timing: "Unmodified solver performance.now() elapsed interval; excludes worker startup, module loading, warm-up, source stripping, result serialization, file I/O, visualization and rendering.",
      visualization: false, recordEvents: false, solutionEnumeration: "All solutions, including mirror weights for symmetry; no early first-solution exit.",
      forcedGC: false, gcPolicy: "Default V8 automatic garbage collection; no per-algorithm GC intervention.",
      affinity: "Not pinned; OS chooses logical processor. Priority and power settings are observed, not changed.",
      backgroundLoad: "Shared interactive workstation; other applications were not closed or controlled. No concurrent agent-run tests/builds or browser benchmarks during collection.",
      thermalState: "Not measured or controlled", acBatteryState: "Not measured", processorFrequency: "Dynamic; os.cpus().speed is an observed value, not a guaranteed fixed clock.",
      warmupLimit: "One full warm-up may not stabilize JIT behavior, especially at small N. This design matches the application trial-worker protocol.",
      externalWatchdog: "Each phase has a 120-second watchdog plus 3-second scheduling allowance; worker startup separately limited to 30 seconds. Solver checks deadlines every 1024 nodes.",
      memory: "Unavailable: no reliable isolated per-algorithm peak/allocation measurement is applied. System RAM metadata is not algorithm memory usage.",
    },
    source: {
      gitCommit: commandOutput("git", ["rev-parse", "HEAD"]),
      files: Object.fromEntries(Object.entries(sources).map(([relative, source]) => [relative, { sha256: sha256(source), archivedAt: `source/${path.basename(relative)}` }])),
      runnerSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
      transformation: "Node built-in stripTypeScriptTypes(mode=strip); type erasure only. Application experiment scheduling and aggregation imported with its types-module URL resolved in memory.",
    },
    correctnessReference: { url: "https://oeis.org/A000170/list", sequence: "A000170", counts: referenceCounts, verifiedOn: "2026-11-16", accessNote: "OEIS indexed table retrieved via web search; direct b-file endpoint returned HTTP 403." },
  };
  let experiment = createExperiment({ from, to, repetitions, timeoutPerExecutionSeconds: timeoutSeconds,
    selectedAlgorithms: ALGORITHMS.map(a => a.id),
    executionOrder: "For each N, rotate canonical [conventional, occupancy, bitmask, symmetry] left by (repetition - 1 + N - starting N) modulo 4. Sequential execution. Ten repetitions contain two full cycles plus two additional positions, not complete counterbalancing.",
    warmup: "One full untimed-for-comparison solve per measured trial, same fresh Node worker; warm-up metrics retained separately in raw CSV.",
    source: "Dedicated Node.js research experiment; no browser-generated timings included",
    environment: { runtime: "Node.js", nodeVersion: process.version, v8Version: process.versions.v8, processor: cpuStart[0]?.model ?? "Unavailable", logicalProcessors: cpuStart.length, platform: os.platform(), operatingSystemRelease: os.release(), architecture: os.arch() },
    memory: "Unavailable: no reliable isolated per-algorithm peak measurement" });
  const phases = experiment.trials.flatMap(t => ["warmup", "measured"].map(phase => ({ trialOrder: t.order, phase, n: t.n, algorithm: t.algorithm, repetition: t.repetition,
    status: "pending", startedAt: null, finishedAt: null, elapsed: null, nodes: null, backtracks: null, checks: null, solutions: null, correct: null, error: null })));
  const abort = new AbortController();
  process.on("SIGINT", () => abort.abort());
  process.on("SIGTERM", () => abort.abort());
  const startedWall = performance.now();
  let status = "running";
  const escape = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const writeCSV = (filename, headers, rows) => {
    const text = "\uFEFF" + [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n") + "\r\n";
    fs.writeFileSync(path.join(output, filename), text);
  };
  const snapshot = () => {
    const groups = summarize(experiment);
    writeCSV("benchmark-raw.csv", ["experiment_id", "trial_order", "actual_execution_order", "phase", "n", "algorithm", "repetition", "status", "accepted_for_summary", "elapsed_ms", "nodes", "backtracks", "candidate_checks", "solutions", "expected_solutions", "correct", "started_at_utc", "finished_at_utc", "memory_bytes", "error"], phases.map(p => [experiment.id, p.trialOrder,
      experiment.trials[p.trialOrder - 1].executionOrder, p.phase, p.n, p.algorithm, p.repetition, p.status,
      p.phase === "measured" && p.status === "success" && groups.some(g => g.n === p.n && g.algorithm === p.algorithm),
      p.elapsed, p.nodes, p.backtracks, p.checks, p.solutions, KNOWN[p.n], p.correct, p.startedAt, p.finishedAt, null, p.error]));
    writeCSV("benchmark-summary.csv", ["n", "algorithm", "planned_measured_trials", "successful_measured_trials", "failed_measured_trials", "timed_out_measured_trials", "skipped_or_pending_trials", "status", "median_ms", "min_ms", "max_ms", "population_stddev_ms", "mean_ms", "sample_stddev_ms", "nodes", "backtracks", "candidate_checks", "solutions", "improvement_percent", "speedup_vs_conventional", "baseline_status", "memory_bytes"],
      Array.from({ length: to - from + 1 }, (_, i) => from + i).flatMap(n => ALGORITHMS.map(a => {
        const raw = phases.filter(p => p.phase === "measured" && p.n === n && p.algorithm === a.id);
        const group = groups.find(g => g.n === n && g.algorithm === a.id);
        const baseline = groups.find(g => g.n === n && g.algorithm === "conventional");
        const improvement = group ? improvementFor(group, groups) : null;
        const mean = group ? group.times.reduce((sum, x) => sum + x, 0) / group.times.length : null;
        return [n, a.id, repetitions, raw.filter(p => p.status === "success").length, raw.filter(p => p.status === "failed").length, raw.filter(p => p.status === "timed_out").length,
          raw.filter(p => !["success", "failed", "timed_out"].includes(p.status)).length, group ? "complete_verified" : "incomplete_excluded",
          group?.median, group?.min, group?.max, group?.stddev, mean,
          group && group.stddev !== null ? group.stddev * Math.sqrt(group.times.length / (group.times.length - 1)) : null,
          group?.metrics.nodes, group?.metrics.backtracks, group?.metrics.checks, group?.metrics.solutions,
          improvement?.value, group && baseline && baseline.median > 0 && group.median > 0 ? baseline.median / group.median : null,
          improvement?.value === null ? improvement.label : group ? "Valid same-N conventional median" : "Incomplete group", null];
      })));
    fs.writeFileSync(path.join(output, "benchmark-config.json"), JSON.stringify({ schemaVersion: 1, experimentId: experiment.id, status, experiment, runtimeAndConditions: settings,
      expected: { measuredTrials: (to - from + 1) * ALGORITHMS.length * repetitions, warmupExecutions: (to - from + 1) * ALGORITHMS.length * repetitions, groups: (to - from + 1) * ALGORITHMS.length },
      observed: { phaseStatuses: phases.reduce((c, p) => ({ ...c, [p.status]: (c[p.status] ?? 0) + 1 }), {}), trialCounts: trialCounts(experiment), validGroups: groups.length },
      outputPolicy: "Raw CSV contains a separate warmup and measured row for every planned trial. Only complete verified measured groups enter statistics. Partial elapsed/counters from timed-out executions are diagnostic only.",
      statistics: { median: "Middle pair average for 10 sorted elapsed times", populationStddev: "sqrt(sum((x-mean)^2)/n), matching application aggregation", sampleStddev: "sqrt(sum((x-mean)^2)/(n-1)), additional research summary", improvementPercent: "100 * (conventional median - algorithm median) / conventional median", speedup: "conventional median / algorithm median" },
      wallTimeSeconds: (performance.now() - startedWall) / 1000,
    }, null, 2));
    writeReport(groups);
  };
  const fmt = value => value === null || value === undefined ? "Unavailable" : value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  function writeReport(groups) {
    const measured = phases.filter(p => p.phase === "measured");
    const successful = measured.filter(p => p.status === "success").length;
    const timings = ["| N | Conventional (ms) | Occupancy (ms) | Bitmask (ms) | Symmetry (ms) |", "|---|---:|---:|---:|---:|"];
    const work = ["| N | Algorithm | Nodes | Backtracks | Candidate checks | Solutions |", "|---|---|---:|---:|---:|---:|"];
    const statistics = ["| N | Algorithm | Median ms | Min ms | Max ms | Population SD ms | Improvement | Speedup |", "|---|---|---:|---:|---:|---:|---:|---:|"];
    const growth = ["| N | Conventional growth | Occupancy growth | Bitmask growth | Symmetry growth |", "|---|---:|---:|---:|---:|"];
    for (let n = from; n <= to; n++) {
      timings.push(`| ${n} | ${ALGORITHMS.map(a => fmt(groups.find(g => g.n === n && g.algorithm === a.id)?.median)).join(" | ")} |`);
      growth.push(`| ${n} | ${ALGORITHMS.map(a => { const g = groups.find(g => g.n === n && g.algorithm === a.id), previous = groups.find(g => g.n === n - 1 && g.algorithm === a.id); return g && previous?.median > 0 ? `${fmt(g.median / previous.median)}x` : "Unavailable"; }).join(" | ")} |`);
    }
    for (const g of groups) {
      work.push(`| ${g.n} | ${g.algorithm} | ${fmt(g.metrics.nodes)} | ${fmt(g.metrics.backtracks)} | ${fmt(g.metrics.checks)} | ${fmt(g.metrics.solutions)} |`);
      const baseline = groups.find(b => b.n === g.n && b.algorithm === "conventional");
      statistics.push(`| ${g.n} | ${g.algorithm} | ${fmt(g.median)} | ${fmt(g.min)} | ${fmt(g.max)} | ${fmt(g.stddev)} | ${improvementFor(g, groups).label} | ${baseline?.median > 0 && g.median > 0 ? `${fmt(baseline.median / g.median)}x` : "Unavailable"} |`);
    }
    const largest = groups.filter(g => g.n === to);
    const baseline = largest.find(g => g.algorithm === "conventional");
    const observations = largest.map(g => `- N=${to}, ${g.algorithm}: median ${fmt(g.median)} ms, range ${fmt(g.min)}–${fmt(g.max)} ms, population SD ${fmt(g.stddev)} ms${baseline?.median > 0 ? `; ${fmt((baseline.median - g.median) / baseline.median * 100)}% improvement relative to conventional` : ""}.`);
    const winners = ALGORITHMS.map(a => ({ algorithm: a.id, wins: Array.from({ length: to - from + 1 }, (_, i) => from + i).filter(n => { const row = groups.filter(g => g.n === n); return row.length === 4 && row.find(g => g.algorithm === a.id)?.median === Math.min(...row.map(g => g.median)); }).length }));
    const failures = phases.filter(p => ["failed", "timed_out", "cancelled", "skipped"].includes(p.status));
    const text = `# N-Queens: Optimizing Backtracking Algorithms for Performance and Scalability

## Experiment status

Status: **${status}**. Measured trials verified: **${successful}/${measured.length}**. Valid complete groups: **${groups.length}/${(to - from + 1) * 4}**. Warm-up successes: **${phases.filter(p => p.phase === "warmup" && p.status === "success").length}**. Started: ${experiment.startedAt}. Finished: ${experiment.finishedAt ?? "In progress"}. Timestamps are UTC; presentation timezone is Asia/Shanghai.

This is a single-machine, single-runtime experiment with fixed settings, not an isolated laboratory or multi-device study. Measurements were generated by this runner, never mixed with earlier browser or exploratory Node timings.

## Hardware, software and conditions

- Runtime: Node.js ${process.version}, V8 ${process.versions.v8}, worker_threads; ${os.arch()}.
- OS: ${os.version()} (${os.release()}). Processor: ${cpuStart[0]?.model}; ${cpuStart.length} logical processors; physical core count unavailable (query denied).
- System RAM: ${fmt(os.totalmem() / 2 ** 30)} GiB. This is hardware metadata, not per-algorithm usage.
- Power plan at start: ${settings.powerPlanAtStart ?? "Unavailable"}. OS priority: ${settings.processPriorityAtStart}. No affinity, power, priority or security settings were changed.
- Shared workstation; other user applications, thermals and power-source state were not controlled. No agent-run tests, builds or browser workloads ran concurrently with collection.
- Algorithm memory: **Unavailable**. No isolated peak-memory method was applied.

## Methodology and reproducibility

N=${from}–${to}, all four existing algorithms, ${repetitions} measured repetitions per N/algorithm. Each trial uses a fresh worker, one complete warm-up then one measured solve in that same worker; workers never overlap. Each execution has an internal ${timeoutSeconds}-second deadline. A separate phase watchdog allows ${timeoutSeconds} seconds plus 3 seconds of scheduling allowance. Startup has its own 30-second limit.

The runner type-erases the exact application TypeScript with Node's built-in stripper. Algorithm logic, counter definitions and performance.now() instrumentation are unchanged. Source copies and SHA-256 hashes are archived in source/ and benchmark-config.json. Worker startup, warm-up, message serialization, output writes and rendering lie outside the measured solver interval. Main-thread output for a warm-up completes before the worker receives the measured-run command. GC remains V8's normal automatic GC; forced GC and explicit heap sampling are not used.

The application's existing createExperiment, executeExperiment, summarize and improvementFor infrastructure schedules and summarizes these Node results. Per N, algorithm order rotates left by (repetition - 1 + N - starting N) modulo 4 from conventional, occupancy, bitmask, symmetry. Ten repetitions give two full cycles and two extra rotations, so positions are reduced-bias rather than fully counterbalanced. The exact schedule, actual execution order, phase status and timestamps are saved.

All solutions are counted, including mirror weights. Each warm-up and measured execution is checked against [OEIS A000170](https://oeis.org/A000170/list) and the application's known counts before acceptance. OEIS's indexed table was retrieved on 2026-11-16; the direct b-file endpoint returned HTTP 403. Failed or incomplete executions never enter valid timing comparisons. Only groups with every configured measured repetition successful enter aggregate statistics. Partial results and missing phases remain explicit in raw CSV.

Reproduce from project root: node scripts/research-benchmark.mjs --output research-results-repeat. Requires Node with stripTypeScriptTypes support (this run used ${process.version}). Refuses to overwrite an existing config. Keep the same source hashes, Node version, hardware, settings and workload for a comparable repetition. Run python scripts/validate-research-results.py research-results for independent CSV/statistical checks.

## Median execution time

${timings.join("\n")}

## Timing variability and baseline improvements

Median is the middle value, or the middle-pair average for an even trial count. Population SD uses divisor n to match the app; sample SD using n-1 is also exported in summary CSV. Ranges are observed minima/maxima, not confidence intervals. Improvement = 100 × (conventional median − algorithm median) / conventional median. Speedup = conventional median / algorithm median. Zero or missing baselines do not produce percentages.

${statistics.join("\n")}

## Search efficiency

Nodes count recursive entries, including root and solution leaves. Backtracks count actual queen removals after recursive branches, including successful branches. Conventional and occupancy candidate checks count attempted columns; bitmask methods count extracted legal positions. Candidate-check counts are **different units**, so lower check totals alone are not evidence of equivalent primitive work. Symmetry counters represent executed branches; only solutions receive mirror weights. Counters must be identical across repetitions within each algorithm/N group.

${work.join("\n")}

## Measured scalability

The following ratios divide median time at N by the same algorithm's median at N−1. They are observed finite-size growth, not theoretical complexity estimates. The smallest sizes are sensitive to timer, JIT and scheduling effects.

${growth.join("\n")}

## Data-supported observations

${observations.join("\n") || "No complete largest-N groups yet."}

Lowest-median board-size counts (ties counted for each tied method): ${winners.map(w => `${w.algorithm}: ${w.wins}`).join("; ")}. These counts summarize only this dataset and do not establish universal superiority. Small-N reversals should be interpreted alongside their absolute sub-millisecond durations and variability.

Conventional, occupancy and ordinary bitmask search enumerate the same valid partial-board tree; occupancy changes conflict-check overhead, and bitmask extracts only available positions. Symmetry prunes mirrored first-row subtrees while preserving full solution totals. Those implementation explanations are distinct from measured runtime evidence. No asymptotic improvement is claimed from this finite range; factorial worst-case search behavior remains.

## Failures, missing measurements and limitations

${failures.length ? failures.map(p => `- Trial ${p.trialOrder}, ${p.phase}, N=${p.n}, ${p.algorithm}: ${p.status}; ${p.error}`).join("\n") : "No failed, timed-out, cancelled or skipped phase has been observed."}

Pending phases: ${phases.filter(p => p.status === "pending").length}. Raw CSV retains warm-ups separately from measured repetitions; summaries exclude warm-ups. Blank measurements are unavailable, not zero. One warm-up does not prove JIT steady state, and fresh-worker results should not be generalized to long-lived warmed processes. Small-N runtimes include fixed setup and instrumentation overhead inside solve(), so they need careful interpretation. Measurements include the application's counters and periodic timeout checks; they do not represent an uninstrumented solver.

CPU scheduling, GC, dynamic frequency, background activity and thermal drift remain possible confounders. Rotation reduces order bias but ten repetitions do not fully balance all four positions. This is one session on one machine; repeated independent sessions and additional devices are needed for broader conclusions. Memory usage was not measured. Data files are checkpointed after phases/trials so partial results survive normal cancellation; an unexpected power/process failure can leave the currently executing phase marked running.

Independent validation results are recorded in validation.json after collection; that validation recomputes statistics from the CSV rather than trusting the runner's aggregates.
`;
    fs.writeFileSync(path.join(output, "benchmark-report.md"), text);
  }

  snapshot();
  let lastN = null;
  const run = (n, algorithm, record, timeout, signal) => new Promise((resolve, reject) => {
    const trial = experiment.trials.find(t => t.status === "running");
    const phaseRows = phases.filter(p => p.trialOrder === trial.order);
    let phase = "warmup", settled = false;
    const worker = new Worker(new URL(import.meta.url), { workerData: { n, algorithm, timeout, expected: KNOWN[n], solveModule }, execArgv: [] });
    let timer;
    const finish = async (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      await worker.terminate();
      const measured = phaseRows.find(p => p.phase === "measured");
      if (measured.status === "pending") { measured.status = "skipped"; measured.error = "Measurement not started because warm-up failed or trial was cancelled."; }
      if (error) reject(error); else resolve(result);
    };
    const fail = (message, failureStatus) => {
      const row = phaseRows.find(p => p.phase === phase);
      Object.assign(row, { status: failureStatus, finishedAt: new Date().toISOString(), error: message });
      void finish(new Error(message));
    };
    const cancel = () => fail("Cancelled", "cancelled");
    const arm = ms => { clearTimeout(timer); timer = setTimeout(() => fail(`${phase} timed out: external worker watchdog; incomplete results excluded.`, "timed_out"), ms); };
    arm(30000);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    worker.on("error", error => fail(`Worker failed: ${error.message}`, "failed"));
    worker.on("exit", code => { if (!settled) fail(`Worker exited unexpectedly with code ${code}`, "failed"); });
    worker.on("message", message => {
      if (settled) return;
      phase = message.phase;
      const row = phaseRows.find(p => p.phase === phase);
      if (message.kind === "started") {
        Object.assign(row, { status: "running", startedAt: message.startedAt });
        arm(timeout + 3000);
      } else if (message.kind === "finished") {
        clearTimeout(timer);
        const r = message.result;
        Object.assign(row, { status: message.status, finishedAt: message.finishedAt, error: message.error,
          elapsed: r?.elapsed ?? null, nodes: r?.nodes ?? null, backtracks: r?.backtracks ?? null, checks: r?.checks ?? null,
          solutions: r?.solutions ?? null, correct: r ? r.complete && r.solutions === KNOWN[n] : null });
        if (message.status !== "success") { void finish(new Error(`${phase}: ${message.error}`)); return; }
        if (r.events.length || r.samples.length) { fail("Recording unexpectedly enabled", "failed"); return; }
        if (phase === "warmup") {
          snapshot();
          phase = "measured";
          arm(30000);
          worker.postMessage("measure");
        } else void finish(null, r);
      }
    });
  });
  try {
    experiment = await executeExperiment(experiment, run, abort.signal, state => {
      experiment = state;
      snapshot();
      const active = state.trials.find(t => t.status === "running");
      if (active && active.n !== lastN) { lastN = active.n; console.log(`Starting N=${lastN}; ${trialCounts(state).success}/${state.trials.length} measured trials verified.`); }
      if (active?.repetition === repetitions) console.log(`N=${active.n} final rotation: ${active.algorithm}`);
    });
    status = experiment.status;
  } catch (error) {
    status = "interrupted_error";
    settings.runnerError = String(error);
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const row of phases) if (row.status === "pending" && status !== "running") { row.status = "skipped"; row.error = "Execution did not start before experiment ended."; }
    const cpuEnd = os.cpus();
    const delta = cpuEnd.map((cpu, i) => Object.fromEntries(Object.entries(cpu.times).map(([key, value]) => [key, value - cpuStart[i].times[key]])));
    const total = delta.reduce((sum, t) => sum + Object.values(t).reduce((sum, value) => sum + value, 0), 0);
    const idle = delta.reduce((sum, t) => sum + t.idle, 0);
    settings.endConditions = { powerPlan: process.platform === "win32" ? commandOutput("powercfg", ["/getactivescheme"]) : null,
      freeSystemMemoryBytes: os.freemem(), logicalProcessorSnapshot: cpuSnapshot(cpuEnd),
      aggregateMachineCpuBusyPercentDuringSession: total > 0 ? 100 * (total - idle) / total : null,
      note: "Aggregate machine CPU activity includes other applications; it is not per-algorithm utilization or memory." };
    snapshot();
    console.log(JSON.stringify({ output, status, measuredCounts: trialCounts(experiment), validGroups: summarize(experiment).length, wallTimeSeconds: (performance.now() - startedWall) / 1000 }, null, 2));
  }
}
