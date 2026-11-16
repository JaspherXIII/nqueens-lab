import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Square,
  Sun,
  Timer,
  TrendingUp,
  X,
  Maximize2,
  FastForward,
} from "lucide-react";
import {
  ALGORITHMS,
  KNOWN,
  type AlgorithmId,
  type SearchResult,
  type Experiment,
  type SearchEvent,
} from "./types";
import { runWorker } from "./benchmark/run";
import {
  createExperiment,
  executeExperiment,
  exportExperiment,
  improvementFor,
  summarize,
  trialCounts,
} from "./benchmark/experiment";
import { eventIndexes, jumpIndex, playbackTiming } from "./playback";
import Board from "./components/Board";
import Methodology from "./pages/Methodology";
const ResultCharts = lazy(() => import("./components/ResultCharts"));
type Page = "solver" | "comparison" | "dashboard" | "methodology";
const navigation: { id: Page; label: string }[] = [
  { id: "solver", label: "Solver" },
  { id: "comparison", label: "Comparison" },
  { id: "dashboard", label: "Results" },
  { id: "methodology", label: "Methodology" },
];
const number = (value: number) => value.toLocaleString();
const readPage = (): Page => {
  const hash = location.hash.slice(1);
  const legacy: Record<string, Page> = {
    "slide-1": "solver",
    "slide-2": "solver",
    "slide-3": "solver",
    "slide-4": "methodology",
    "slide-5": "comparison",
    "slide-6": "dashboard",
    "slide-7": "methodology",
    overview: "solver",
    lesson: "solver",
    algorithms: "methodology",
  };
  return (
    navigation.find((item) => item.id === hash)?.id ?? legacy[hash] ?? "solver"
  );
};
export default function App() {
  const [page, setPage] = useState<Page>(readPage),
    [dark, setDark] = useState(
      () => localStorage.getItem("nq-theme") === "dark",
    );
  const stageRef = useRef<HTMLElement | null>(null);
  const [fullscreenError, setFullscreenError] = useState("");
  const [n, setN] = useState(8),
    [algorithm, setAlgorithm] = useState<AlgorithmId>("conventional"),
    [result, setResult] = useState<SearchResult | null>(null),
    [cursor, setCursor] = useState(-1),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(50),
    [loading, setLoading] = useState(false),
    [solverError, setSolverError] = useState(""),
    [sample, setSample] = useState(-1);
  const [fastForward, setFastForward] = useState(false);
  const [jumpType, setJumpType] = useState<SearchEvent["type"]>("solution");
  const timing = playbackTiming(speed, fastForward);
  const jumpEvents = useMemo(
    () => eventIndexes(result?.events ?? [], jumpType),
    [result, jumpType],
  );
  const previousJump = jumpIndex(jumpEvents, cursor, -1);
  const nextJump = jumpIndex(jumpEvents, cursor, 1);
  const solverController = useRef<AbortController | null>(null);
  const [from, setFrom] = useState(8),
    [to, setTo] = useState(10),
    [repeats, setRepeats] = useState(3),
    [timeout, setTimeoutSeconds] = useState(10),
    [selected, setSelected] = useState<AlgorithmId[]>(
      ALGORITHMS.map((a) => a.id),
    ),
    [running, setRunning] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [experiment, setExperiment] = useState<Experiment | null>(null);
  const results = useMemo(
    () => (experiment ? summarize(experiment) : []),
    [experiment],
  );
  const runConfig = experiment?.configuration;
  const counts = useMemo(
    () => (experiment ? trialCounts(experiment) : null),
    [experiment],
  );
  const benchmarkController = useRef<AbortController | null>(null);
  const [verification, setVerification] = useState(""),
    [verifying, setVerifying] = useState(false);
  const verificationController = useRef<AbortController | null>(null);
  useEffect(() => {
    const update = () => {
      setPage(readPage());
      setPlaying(false);
      stageRef.current?.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("nq-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(
    () => () => {
      solverController.current?.abort();
      benchmarkController.current?.abort();
      verificationController.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!playing || !result) return;
    const id = window.setInterval(() => {
      setCursor((c) => Math.min(c + timing.stride, result.events.length - 1));
    }, timing.interval);
    return () => clearInterval(id);
  }, [playing, result, timing.interval, timing.stride]);
  useEffect(() => {
    if (playing && result && cursor >= result.events.length - 1)
      setPlaying(false);
  }, [cursor, result, playing]);
  function seek(position: number) {
    setPlaying(false);
    setSample(-1);
    setCursor(position);
  }
  function navigate(id: Page) {
    location.hash = id;
    setPlaying(false);
    setPage(id);
    stageRef.current?.scrollTo({ top: 0 });
    stageRef.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreenError("");
    } catch {
      setFullscreenError("Fullscreen is unavailable in this browser.");
    }
  }
  function reset() {
    solverController.current?.abort();
    setLoading(false);
    setResult(null);
    setCursor(-1);
    setPlaying(false);
    setSample(-1);
    setFastForward(false);
    setSolverError("");
  }
  async function startSolver() {
    if (result) {
      setSample(-1);
      if (cursor === result.events.length - 1) setCursor(-1);
      setPlaying(true);
      return;
    }
    const controller = new AbortController();
    solverController.current = controller;
    setLoading(true);
    setSolverError("");
    try {
      const r = await runWorker(n, algorithm, true, 30000, controller.signal);
      if (controller.signal.aborted || solverController.current !== controller)
        return;
      if (r.solutions !== KNOWN[n])
        throw new Error(
          "Correctness failure: result differs from the reference count.",
        );
      setResult(r);
      setCursor(-1);
      setPlaying(readPage() === "solver" && !document.hidden);
    } catch (e) {
      if (!controller.signal.aborted) setSolverError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  const event = result?.events[cursor],
    board =
      sample >= 0
        ? (result?.samples[sample] ?? [])
        : (event?.board ?? Array(n).fill(-1)),
    current = sample >= 0 ? result : event;
  async function benchmark() {
    if (!selected.length || from > to) {
      setError("Select at least one algorithm and a valid board-size range.");
      return;
    }
    const controller = new AbortController();
    benchmarkController.current = controller;
    const run = createExperiment({
      from,
      to,
      repetitions: repeats,
      timeoutPerExecutionSeconds: timeout,
      selectedAlgorithms: ALGORITHMS.filter((a) => selected.includes(a.id)).map(
        (a) => a.id,
      ),
      executionOrder:
        "For each N, rotate the selected canonical algorithm list left by (repetition - 1 + N - starting N) modulo algorithm count. Sequential execution; exact order is retained per trial. Complete cycles balance positions; partial cycles are not fully counterbalanced.",
      warmup:
        "One untimed full warm-up in the same fresh worker before each measured execution",
      source: "Visitor-generated browser benchmark",
      environment: {
        userAgent: navigator.userAgent,
        logicalProcessors: navigator.hardwareConcurrency ?? null,
        language: navigator.language,
        platform: navigator.platform,
        timeOrigin: performance.timeOrigin,
        timer: "performance.now(); browser precision and device load apply",
      },
      memory: "Not available: no reliable isolated per-algorithm measurement",
    });
    setRunning(true);
    setError("");
    setExperiment(run);
    try {
      const completed = await executeExperiment(
        run,
        runWorker,
        controller.signal,
        (snapshot) => {
          setExperiment(snapshot);
          const active = snapshot.trials.find((t) => t.status === "running");
          const c = trialCounts(snapshot);
          if (active)
            setProgress(
              `N = ${active.n} · ${ALGORITHMS.find((a) => a.id === active.algorithm)!.short} · trial ${active.repetition}/${repeats} · ${c.success}/${snapshot.trials.length} complete`,
            );
        },
      );
      const c = trialCounts(completed);
      setProgress(
        completed.status === "completed"
          ? `Completed ${c.success} measured trials. All counts verified.`
          : `${c.success}/${completed.trials.length} trials succeeded. Only fully repeated groups are compared.`,
      );
      if (completed.status === "cancelled")
        setError(
          "Cancelled. The trial log and fully repeated groups remain exportable.",
        );
      else if (completed.status === "completed_with_errors")
        setError(
          `${c.failed} failed and ${c.timed_out} timed-out trials. Inspect the trial log for details.`,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }
  async function verify() {
    setVerifying(true);
    setVerification("Starting full correctness suite…");
    const controller = new AbortController();
    verificationController.current = controller;
    try {
      let count = 0;
      for (let size = 0; size <= 14; size++)
        for (const a of ALGORITHMS) {
          setVerification(
            `Checking ${a.short}, N = ${size} · ${count}/60 passed`,
          );
          const r = await runWorker(
            size,
            a.id,
            false,
            120000,
            controller.signal,
          );
          if (r.solutions !== KNOWN[size])
            throw new Error(
              `FAIL: ${a.name}, N=${size}; received ${r.solutions}, expected ${KNOWN[size]}`,
            );
          count++;
        }
      setVerification(
        "60/60 passed. All four algorithms match reference counts for N = 0–14.",
      );
    } catch (e) {
      setVerification((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }
  function download(format: "csv" | "json") {
    if (!experiment) return;
    const content = exportExperiment(experiment, format);
    const url = URL.createObjectURL(
      new Blob([content], {
        type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `nqueens-benchmark.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function playbackControls() {
    return (
      <>
        <div className="playback-toolbar" aria-label="Playback controls">
          <button
            className="primary"
            disabled={loading || running || verifying}
            onClick={() => (playing ? setPlaying(false) : void startSolver())}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
            {loading
              ? "Preparing…"
              : playing
                ? "Pause"
                : result
                  ? "Resume"
                  : "Start visualization"}
          </button>
          <button
            className="icon-button"
            aria-label="Reset visualization"
            title="Reset / cancel computation"
            onClick={reset}
          >
            <RotateCcw size={17} />
          </button>
          <button
            aria-label="Fast-forward playback"
            aria-pressed={fastForward}
            disabled={!result || running || verifying}
            onClick={() => setFastForward((value) => !value)}
          >
            <FastForward size={17} />
            <span>8×</span>
          </button>
        </div>
        <div className="step-controls" aria-label="Recorded event navigation">
          <button
            aria-label="First recorded step"
            title="First recorded step"
            disabled={!result}
            onClick={() => seek(-1)}
          >
            <SkipBack size={16} />
          </button>
          <button
            aria-label="Previous step"
            title="Previous step"
            disabled={!result || cursor < 0}
            onClick={() => seek(cursor - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            {number(cursor + 1)} / {number(result?.events.length ?? 0)}
          </span>
          <button
            aria-label="Next step"
            title="Next step"
            disabled={!result || cursor >= result.events.length - 1}
            onClick={() => seek(cursor + 1)}
          >
            <ChevronRight size={17} />
          </button>
          <button
            aria-label="Last recorded step"
            title="Last recorded step"
            disabled={!result}
            onClick={() => seek((result?.events.length ?? 1) - 1)}
          >
            <SkipForward size={16} />
          </button>
        </div>
        <label className="timeline-label" htmlFor="timeline">
          {sample >= 0
            ? "Playback cursor (solution sample shown)"
            : "Recorded playback progress"}{" "}
          <span>
            {result
              ? (((cursor + 1) / result.events.length) * 100).toFixed(1)
              : "0"}
            %
          </span>
        </label>
        <input
          id="timeline"
          type="range"
          min={-1}
          max={Math.max(0, (result?.events.length ?? 1) - 1)}
          value={cursor}
          disabled={!result}
          aria-label="Recorded playback progress"
          onChange={(e) => seek(+e.target.value)}
        />
        <div className="jump-controls">
          <label>
            Jump to event
            <select
              value={jumpType}
              onChange={(e) =>
                setJumpType(e.target.value as SearchEvent["type"])
              }
            >
              <option value="solution">Discovered solution</option>
              <option value="place">Queen placement</option>
              <option value="remove">Backtrack</option>
              <option value="reject">Rejected candidate</option>
            </select>
          </label>
          <button
            aria-label="Previous significant event"
            disabled={previousJump === null}
            onClick={() => previousJump !== null && seek(previousJump)}
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <button
            aria-label="Next significant event"
            disabled={nextJump === null}
            onClick={() => nextJump !== null && seek(nextJump)}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
        <p className="playback-hint">
          {timing.stride > 1
            ? `Fast playback renders every ${timing.stride}th recorded state; use steps or jumps to inspect individual events.`
            : "Each frame is an actual recorded search event."}{" "}
          Jumps search the recorded prefix only.
        </p>
      </>
    );
  }
  function solver() {
    return (
      <section className="panel solver-panel">
        <div className="panel-heading">
          <div>
            <h2>{ALGORITHMS.find((item) => item.id === algorithm)!.name}</h2>
          </div>
          <span className="tag">
            <span className="dot" />
            {sample >= 0
              ? "Solution sample"
              : playing
                ? "Playing"
                : loading
                  ? "Computing"
                  : "Interactive"}
          </span>
        </div>
        <div className="solver-layout">
          <div className="board-area">
            <Board
              n={n}
              board={board}
              event={sample < 0 ? event : undefined}
              frame={cursor}
              animate={playing && timing.stride === 1 && sample < 0}
              duration={Math.min(300, timing.interval * 0.8)}
            />
            <div className="board-legend">
              <span>
                <i className="legend-dot green" />
                Queen placed
              </span>
              <span>
                <i className="legend-dot red" />
                Conflict detected
              </span>
              <span>
                <i className="legend-dot amber" />
                Backtracking
              </span>
            </div>
          </div>
          <div className="controls-transport">{playbackControls()}</div>
          <div className="solver-controls">
            <label>
              Board size <span>N = {n}</span>
              <select
                value={n}
                disabled={loading || playing}
                onChange={(e) => {
                  reset();
                  setN(+e.target.value);
                }}
              >
                {Array.from({ length: 9 }, (_, i) => (
                  <option key={i} value={i + 4}>
                    {i + 4} × {i + 4} board
                  </option>
                ))}
              </select>
            </label>
            <label>
              Algorithm
              <select
                value={algorithm}
                disabled={loading || playing}
                onChange={(e) => {
                  reset();
                  setAlgorithm(e.target.value as AlgorithmId);
                }}
              >
                {ALGORITHMS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="speed-label">
              <label htmlFor="speed">Playback speed</label>
              <span>
                {speed < 35 ? "Slow" : speed > 75 ? "Fast" : "Balanced"}
              </span>
            </div>
            <input
              id="speed"
              type="range"
              min="1"
              max="100"
              value={speed}
              onChange={(e) => setSpeed(+e.target.value)}
            />
            <p className="playback-hint">
              {Math.round(
                (1000 / timing.interval) * timing.stride,
              ).toLocaleString()}{" "}
              recorded events / second. Higher speeds skip display frames;
              counting is unchanged.
            </p>
            <h3 className="metrics-heading">
              {sample >= 0
                ? "Completed search counters"
                : "Recorded frame counters"}
            </h3>
            <div className="live-metrics">
              {[
                ["Queens placed", board.filter((c) => c >= 0).length],
                [
                  "Recursion depth",
                  board.filter((column) => column >= 0).length,
                ],
                ["Search nodes", current?.nodes ?? 0],
                ["Candidate checks", current?.checks ?? 0],
                ["Backtracks", current?.backtracks ?? 0],
                ["Solutions discovered", current?.solutions ?? 0],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{number(Number(value))}</strong>
                </div>
              ))}
            </div>
            <div
              className="event-status"
              aria-live={playing ? "off" : "polite"}
            >
              <span className="dot" />
              {sample >= 0
                ? `Solution sample ${sample + 1} · completed search counters`
                : event
                  ? `${event.type === "solution" ? "Solution found" : event.type === "place" ? "Queen placed" : event.type === "reject" ? "Candidate rejected" : "Backtracking"}${event.row < n ? ` · row ${event.row + 1}, column ${event.col + 1}` : ""}`
                  : "Ready when you are. Start exploring."}
            </div>
          </div>
        </div>
        {solverError && (
          <div className="alert error" role="alert">
            {solverError}
          </div>
        )}
        {algorithm === "symmetry" && (
          <div className="notice">
            Mirror counting: first-row left-half branches contribute two
            solutions per leaf. The center column on odd boards contributes one.
            Current branch weight: ×{event?.weight ?? 1}.
          </div>
        )}
        {result && (
          <div className="recording-note">
            <div>
              <strong>
                {number(result.solutions)} total solutions · full search
                completed
              </strong>
              <span>
                {result.recordedLimit
                  ? "Playback shows the first 20,000 events; counting was not truncated."
                  : "All search events were recorded."}{" "}
                Solution exploration retains up to 100 valid arrangements.
              </span>
            </div>
            <label>
              Explore solutions
              <select
                aria-label="Explore recorded solutions"
                value={sample}
                onChange={(e) => {
                  setPlaying(false);
                  setSample(+e.target.value);
                }}
              >
                <option value={-1}>Algorithm playback</option>
                {result.samples.map((_, i) => (
                  <option key={i} value={i}>
                    Solution {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>
    );
  }
  function experimentSummary() {
    if (!experiment || !counts) return null;
    return (
      <section className="experiment-summary" aria-label="Experiment status">
        <div>
          <strong>{experiment.status.replaceAll("_", " ")}</strong>
          <p>
            {counts.success} successful · {counts.failed} failed ·{" "}
            {counts.timed_out} timed out · {counts.cancelled} cancelled ·{" "}
            {counts.skipped} skipped · {counts.pending + counts.running}{" "}
            remaining
          </p>
          <p>
            N = {runConfig?.from}–{runConfig?.to} · {runConfig?.repetitions}{" "}
            repetitions · {runConfig?.timeoutPerExecutionSeconds}s per execution
            · rotating order
          </p>
        </div>
        {!results.length && (
          <div className="button-group">
            <button onClick={() => download("csv")}>CSV</button>
            <button onClick={() => download("json")}>JSON</button>
          </div>
        )}
        <details>
          <summary>Trial log, configuration & environment</summary>
          <p>
            Only groups with every configured repetition successful enter charts
            and comparisons. Individual successful timings remain in exports
            even when their group is incomplete.
          </p>
          <pre>{JSON.stringify(runConfig, null, 2)}</pre>
          <ol className="trial-log">
            {experiment.trials.map((t) => (
              <li key={t.order}>
                #{t.order} · N={t.n} · {t.algorithm} · repetition {t.repetition}{" "}
                · <strong>{t.status}</strong>
                {t.elapsed !== null ? ` · ${t.elapsed.toFixed(3)} ms` : ""}
                {t.error ? ` · ${t.error}` : ""}
              </li>
            ))}
          </ol>
        </details>
      </section>
    );
  }
  function table() {
    return (
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h3>Experimental results</h3>
            <p>
              Visitor-generated measurements · median and min–max variability
            </p>
          </div>
          <div className="button-group">
            <button onClick={() => download("csv")}>
              <ArrowDownToLine size={14} />
              CSV
            </button>
            <button onClick={() => download("json")}>
              <ArrowDownToLine size={14} />
              JSON
            </button>
          </div>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Experimental results, scroll horizontally for all columns"
        >
          <table>
            <thead>
              <tr>
                {[
                  "N",
                  "Algorithm",
                  "Median (ms)",
                  "Min–max (ms)",
                  "Nodes",
                  "Backtracks",
                  "Checks",
                  "Solutions",
                  "Improvement",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const improvement = improvementFor(r, results);
                return (
                  <tr key={`${r.n}-${r.algorithm}`}>
                    <td>{r.n}</td>
                    <td>
                      <i
                        className="legend-dot"
                        style={{
                          background: ALGORITHMS.find(
                            (a) => a.id === r.algorithm,
                          )!.color,
                        }}
                      />
                      {ALGORITHMS.find((a) => a.id === r.algorithm)!.short}
                    </td>
                    <td className="mono">{r.median.toFixed(3)}</td>
                    <td className="mono">
                      {r.min.toFixed(3)}–{r.max.toFixed(3)}
                    </td>
                    <td className="mono">
                      {r.stddev === null
                        ? "Unavailable (1 trial)"
                        : r.stddev.toFixed(3)}
                    </td>
                    <td>{number(r.metrics.nodes)}</td>
                    <td>{number(r.metrics.backtracks)}</td>
                    <td>{number(r.metrics.checks)}</td>
                    <td>{number(r.metrics.solutions)}</td>
                    <td
                      className={
                        improvement.value !== null && improvement.value >= 0
                          ? "positive"
                          : ""
                      }
                    >
                      {improvement.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="table-footnote">
          Improvement = (baseline − optimized) / baseline × 100. Negative values
          indicate a slower implementation. Standard deviation describes the
          retained trial population; one trial has no variability estimate. Only
          fully successful repeated groups are included. Scroll the table
          horizontally for all columns. Memory: Not available; browsers do not
          expose reliable per-algorithm heap measurements.
        </p>
      </section>
    );
  }
  const empty = (
    <div className="panel empty-state">
      <TrendingUp size={36} />
      <h3>Your experiment starts here.</h3>
      <p>
        Run a benchmark to turn real computations into useful comparisons.
        <br />
        No sample timings or simulated measurements.
      </p>
      <button className="primary" onClick={() => navigate("comparison")}>
        Configure a benchmark
        <ArrowRight size={16} />
      </button>
    </div>
  );
  const headings: Record<Page, [string, string]> = {
    solver: [
      "Interactive Solver",
      "Choose a board size and algorithm. Run the search, inspect each event, and explore valid solutions.",
    ],
    comparison: [
      "Algorithm Comparison",
      "Configure sequential benchmark trials and compare the four backtracking implementations.",
    ],
    dashboard: [
      "Research Dashboard",
      "Analyze measured execution time, search efficiency, scalability, and optimization gains.",
    ],
    methodology: [
      "Research Methodology",
      "Review the experimental controls, correctness verification, instrumentation, and measurement limits.",
    ],
  };
  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <a
          className="workspace-brand"
          href="#solver"
          onClick={(e) => {
            e.preventDefault();
            navigate("solver");
          }}
        >
          <strong>
            N-QUEENS<span className="brand-dot">.</span>{" "}
            <span className="brand-lab">LAB</span>
          </strong>
          <span>Algorithm research & experimentation</span>
        </a>
        <nav className="primary-navigation" aria-label="Research navigation">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={"#" + item.id}
              aria-current={page === item.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(item.id);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-controls">
          <button
            className="icon-button"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button
            className="icon-button fullscreen-button"
            aria-label="Toggle fullscreen"
            onClick={() => void fullscreen()}
          >
            <Maximize2 size={19} />
          </button>
        </div>
      </header>
      <main
        ref={stageRef}
        className="workspace-stage"
        tabIndex={-1}
        aria-label={headings[page][0]}
      >
        <div className={"workspace-page " + page} key={page}>
          <div className="workspace-heading">
            <h1>{headings[page][0]}</h1>
            <p className="intro">{headings[page][1]}</p>
          </div>
          {fullscreenError && (
            <div className="notice">
              {fullscreenError}
              <button
                aria-label="Dismiss fullscreen message"
                onClick={() => setFullscreenError("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {page === "solver" && solver()}
          {page === "comparison" && (
            <>
              <section className="panel configuration">
                <div className="panel-heading">
                  <div>
                    <h2>Configure your experiment</h2>
                    <p>
                      One full warm-up per measured trial · sequential worker
                      execution with rotating algorithm order
                    </p>
                  </div>
                  <Settings2 size={20} />
                </div>
                <div className="config-grid">
                  <label>
                    Starting board size
                    <select
                      disabled={running}
                      value={from}
                      onChange={(e) => setFrom(+e.target.value)}
                    >
                      {Array.from({ length: 11 }, (_, i) => (
                        <option key={i}>{i + 4}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ending board size
                    <select
                      disabled={running}
                      value={to}
                      onChange={(e) => setTo(+e.target.value)}
                    >
                      {Array.from({ length: 11 }, (_, i) => (
                        <option key={i}>{i + 4}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Repetitions
                    <select
                      disabled={running}
                      value={repeats}
                      onChange={(e) => setRepeats(+e.target.value)}
                    >
                      {[1, 3, 4, 5, 8, 10].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Timeout per execution
                    <select
                      disabled={running}
                      value={timeout}
                      onChange={(e) => setTimeoutSeconds(+e.target.value)}
                    >
                      {[1, 5, 10, 30, 60].map((x) => (
                        <option key={x} value={x}>
                          {x} seconds
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <fieldset disabled={running}>
                  <legend>Algorithms to compare</legend>
                  <div className="checkboxes">
                    {ALGORITHMS.map((a) => (
                      <label key={a.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(a.id)}
                          onChange={(e) =>
                            setSelected((s) =>
                              e.target.checked
                                ? [...s, a.id]
                                : s.filter((x) => x !== a.id),
                            )
                          }
                        />
                        {a.short}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="config-bottom">
                  <span>
                    <ShieldCheck size={15} />
                    Every result is checked against known solution counts.
                  </span>
                  {running ? (
                    <button
                      onClick={() => benchmarkController.current?.abort()}
                    >
                      <Square size={15} />
                      Cancel experiment
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={loading || playing || verifying}
                      onClick={() => void benchmark()}
                    >
                      <Play size={15} />
                      Run benchmark
                    </button>
                  )}
                </div>
                {progress && (
                  <div
                    className={`notice ${running ? "pulsing" : ""}`}
                    role="status"
                  >
                    {running && <Activity size={16} />} {progress}
                  </div>
                )}
                {error && (
                  <div className="alert error" role="alert">
                    {error}
                  </div>
                )}
              </section>
              <div className="notice">
                <Timer size={17} />
                <span>
                  Keep this tab in the foreground and close CPU-heavy apps.
                  These are visitor-generated measurements, not controlled or
                  universally reproducible research results.
                </span>
              </div>
              {experiment && experimentSummary()}
              {results.length ? table() : empty}
            </>
          )}

          {page === "dashboard" && (
            <>
              {experiment && experimentSummary()}
              {results.length ? (
                <>
                  <div className="dashboard-summary">
                    <span className="tag">
                      <Check size={14} />
                      Verified solution counts
                    </span>
                    <span>
                      {results.length} completed groups ·{" "}
                      {results.reduce((a, r) => a + r.times.length, 0)} measured
                      trials
                    </span>
                    <button
                      className="text-button"
                      onClick={() => navigate("comparison")}
                    >
                      Experiment configuration
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <Suspense
                    fallback={
                      <div className="notice">
                        Loading measured-data charts…
                      </div>
                    }
                  >
                    <ResultCharts results={results} />
                  </Suspense>
                  {table()}
                  <section className="panel prose">
                    <h3>Measurement environment</h3>
                    <pre>{JSON.stringify(runConfig, null, 2)}</pre>
                  </section>
                </>
              ) : (
                empty
              )}
              <section className="panel prose">
                <h3>Interpret results with context</h3>
                <p>
                  Browser timings depend on the device, browser engine, JIT
                  compilation, thermal state, and background work. Short
                  runtimes are especially noisy. Min–max ranges expose some
                  trial variability; retain all raw trial times and repeat on a
                  controlled device before drawing research conclusions. Charts
                  use only the measurements from your current experiment.
                </p>
              </section>
            </>
          )}

          {page === "methodology" && (
            <Methodology
              verifying={verifying}
              running={running}
              loading={loading}
              playing={playing}
              verification={verification}
              verify={verify}
              cancelVerification={() => verificationController.current?.abort()}
            />
          )}
        </div>
      </main>
      <footer className="workspace-footer">
        <span>
          <span className="dot" />
          Browser-local computation
        </span>
        <span>
          {running
            ? progress
            : verifying
              ? verification
              : loading
                ? "Computing search events"
                : playing
                  ? "Solver playback active"
                  : "Advanced Data Structure & Algorithm Analysis"}
        </span>
      </footer>
    </div>
  );
}
