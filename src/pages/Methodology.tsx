import { ShieldCheck, Square } from "lucide-react";
import { KNOWN } from "../types";
interface Props {
  verifying: boolean;
  running: boolean;
  loading: boolean;
  playing: boolean;
  verification: string;
  verify: () => Promise<void>;
  cancelVerification: () => void;
}
const number = (v: number) => v.toLocaleString();
export default function Methodology({
  verifying,
  running,
  loading,
  playing,
  verification,
  verify,
  cancelVerification,
}: Props) {
  return (
    <>
      <section className="panel prose">
        <span className="eyebrow">MASTER IN INFORMATION TECHNOLOGY</span>
        <h2>
          N-Queens: Optimizing Backtracking Algorithms for Performance and
          Scalability
        </h2>
        <p>
          This Advanced Data Structure and Algorithm Analysis project asks how
          conflict detection and search-space reduction affect runtime and
          scalability while preserving exact solution counts. The objectives are
          to implement four independent methods, establish correctness, measure
          search effort and runtime, and explain the observed differences
          through actual execution.
        </p>
        <div className="phase-grid">
          {[
            "Algorithm development",
            "Correctness verification",
            "Performance testing",
            "Data collection",
            "Performance comparison",
            "Interactive visualization",
          ].map((p, i) => (
            <div key={p}>
              <span>PHASE 0{i + 1}</span>
              <h3>{p}</h3>
              <p>
                {
                  [
                    "Implement independent recursive scan, occupancy-array, bitmask, and first-row symmetry solvers with shared instrumentation definitions.",
                    "Compare all four implementations with known counts for N = 0–14, including odd, even, unsatisfiable, and empty boards.",
                    "Execute sequentially in dedicated workers; each measured trial follows a full warm-up in the same worker.",
                    "Retain complete trial times and search counters; exclude incomplete, failed, timed-out, or cancelled groups.",
                    "Report medians, min–max variability, baseline improvement, and growth across board sizes.",
                    "Replay a bounded prefix of real events and inspect valid solution samples without storing every solution.",
                  ][i]
                }
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="panel prose">
        <div className="panel-heading">
          <div>
            <h2>Correctness is the starting point.</h2>
            <p>
              Automated unit tests cover all four algorithms and N = 0–14. You
              can also run the reference suite in your browser.
            </p>
          </div>
          {verifying ? (
            <button onClick={() => cancelVerification()}>
              <Square size={14} />
              Cancel verification
            </button>
          ) : (
            <button
              className="primary"
              disabled={running || loading || playing}
              onClick={() => void verify()}
            >
              <ShieldCheck size={16} />
              Verify algorithms
            </button>
          )}
        </div>
        {verification && (
          <div className="notice" role="status">
            {verification}
          </div>
        )}
        <div className="reference-grid">
          {Object.entries(KNOWN)
            .filter(([n]) => +n >= 4)
            .map(([n, count]) => (
              <div key={n}>
                <span>N = {n}</span>
                <strong>{number(count)}</strong>
              </div>
            ))}
        </div>
        <p className="small">
          Reference sequence:{" "}
          <a href="https://oeis.org/A000170" target="_blank" rel="noreferrer">
            OEIS A000170
          </a>
          . These values are correctness references, never benchmark
          measurements.
        </p>
      </section>
      <section className="panel prose">
        <h2>Complexity and instrumentation</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Algorithm</th>
                <th>Conservative time bound</th>
                <th>Auxiliary space</th>
                <th>Candidate-check definition</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Conventional</td>
                <td>O(N² · N!)</td>
                <td>O(N)</td>
                <td>One attempted column; may scan several prior queens</td>
              </tr>
              <tr>
                <td>Occupancy array</td>
                <td>O(N · N!)</td>
                <td>O(N)</td>
                <td>One attempted column; up to three occupancy lookups</td>
              </tr>
              <tr>
                <td>Bitmask</td>
                <td>O(N!) search nodes</td>
                <td>O(N)</td>
                <td>One extracted legal position</td>
              </tr>
              <tr>
                <td>Bitmask + symmetry</td>
                <td>O(N!) search nodes</td>
                <td>O(N)</td>
                <td>One extracted legal position, including first-row roots</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Bounds are conservative and assume constant-time fixed-width bit
          operations. All four retain factorial worst-case search growth; lower
          overhead and a constant-factor symmetry reduction improve practical
          performance without changing that growth class. Space excludes
          optional visualization history and samples.
        </p>
        <p>
          <strong>Search nodes:</strong> recursive function entries, including
          the empty root and solution leaves. <strong>Backtracks:</strong>{" "}
          removal of a placed queen after its recursive branch returns,
          including successful branches. <strong>Candidate checks:</strong>{" "}
          attempted columns for scan/array methods and extracted legal bits for
          bitmask methods; these are algorithm-dependent counts, not equivalent
          primitive operations. Symmetry counters report actually executed work,
          not doubled mirror work. Solution totals include mirror weights.
        </p>
      </section>
      <section className="panel prose">
        <h2>Experimental controls & reproducibility</h2>
        <p>
          Use the same browser and device, foreground tab, board sizes,
          algorithm selection, repetition count, and timeout. Record browser
          version, operating system, power profile, and background workload.
          Each trial runs in a fresh worker and completes an untimed full
          warm-up before its timed run. Both executions have the configured
          deadline. Workers run sequentially; keep visualization and other
          CPU-heavy activity paused. Worker startup, warm-up, animation, and
          chart rendering are excluded from the measured interval; timing uses
          performance.now() inside the solver.
        </p>
        <p>
          The default is three trials, N = 8–10, and a ten-second limit per
          execution. Internal deadline checks occur every 1,024 recursive calls;
          the main thread additionally terminates unresponsive workers.
          Cancellation terminates the active worker. A timed-out or cancelled
          result is never reported as a complete count or timing. Fully
          completed groups from an interrupted experiment remain exportable.
          Refreshing clears experiment results; export CSV or JSON to retain
          them.
        </p>
        <p>
          Memory is reported as “Not available”: browser heap APIs are
          unavailable or not reliably attributable to one algorithm. Garbage
          collection, JIT optimization, timer resolution, throttling, and
          thermal effects limit comparability. No controlled research dataset is
          supplied; all charts are explicitly visitor-generated. Exported
          metadata includes configuration, environment, raw trials, timestamp,
          and source.
        </p>
      </section>
    </>
  );
}
