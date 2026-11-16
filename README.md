# N-Queens Lab

**N-Queens: Optimizing Backtracking Algorithms for Performance and Scalability** — an MIT (Master in Information Technology) research workspace for Advanced Data Structure and Algorithm Analysis.

React + TypeScript, Vite, Tailwind CSS, Recharts, Lucide React, and Vite-bundled Web Workers. Entirely browser-local; no backend, authentication, keys, or environment variables.

## Run locally

Requires Node.js 22.12+ (22.x), Node.js 24 LTS, or Node.js 26+ and npm.

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run test:worker
npm run preview
```

On PowerShell installations that block npm.ps1, use `npm.cmd` for these commands.

## Features

- Research workspaces for the interactive solver, algorithm comparison, results dashboard, and methodology, using the supplied Bubble Sort reference's blue/slate palette, strong typography, restrained surfaces, and transitions.
- Direct research navigation with responsive light/dark themes, fullscreen mode, browser history, and named deep links (`#solver`, `#comparison`, `#dashboard`, `#methodology`). Prior hashes resolve to the corresponding research workspace.
- N = 4–12 visualization: start, pause/resume, reset/cancel, individual steps, timeline seeking, 8× fast-forward, and jumps to recorded placements, backtracks, rejections, and solutions. Transport controls sit beside the desktop board and directly below it on mobile.
- Sequential N = 4–14 benchmarks with rotating algorithm order, configurable repetitions, deadlines, cancellation, correctness checks, median, min–max and population standard deviation.
- Measured charts for execution time, nodes, backtracks, candidate checks, and scalability; min–max whiskers, numeric size axes, valid baseline improvements and scrollable data tables.
- CSV and JSON exports retain every planned trial, status, raw successful measurements, selected algorithms, planned/actual execution order, configuration, environment, source and timestamps.
- Self-hosted variable Inter typography, keyboard-accessible chart/table scroll regions, touch-sized primary controls, and consistent light/dark themes.
- Research methodology with instrumentation definitions, complexity, experimental controls, and a browser-based correctness suite.
- A prominent responsive board with active-row and candidate emphasis, blue placement indicators, red rejected candidates, and amber queen-removal animations. Motion respects reduced-motion preferences; playback pauses when navigating sections or leaving the browser tab.

## Independent algorithms

1. Conventional recursive backtracking checks each candidate against previous queens.
2. Occupancy-array backtracking checks Boolean column/diagonal arrays.
3. Bitmask backtracking extracts available positions with fixed-width bit operations.
4. Symmetry-reduced bitmask backtracking explores left-half first-row branches with weight two; an odd-board center branch has weight one.

All four implementations live in `src/algorithms/solve.ts`, independent of React. Visualization and benchmarks execute that exact code through `src/workers/solver.worker.ts`. The worker client and timing summaries live in `src/benchmark/`; reusable presentation components in `src/components/`; shared data contracts in `src/types.ts`; application shell and research views in `src/App.tsx`, with the methodology view in `src/pages/`.

## Benchmark methodology

Each measured trial executes in a fresh worker and receives one untimed full warm-up in the same worker. Trials execute sequentially. `performance.now()` measures only solver execution, excluding startup, warm-up, chart rendering, and animation. Recording and enumeration are disabled during benchmarks. Default configuration: N = 8–10, three repetitions, ten seconds per execution. Both warm-up and timed execution have their own deadline.

For each board size, the selected canonical algorithm list rotates left by `(repetition - 1 + N - starting N) % selectedAlgorithmCount`. Complete cycles balance execution positions; partial cycles are not fully counterbalanced. Choose four or eight repetitions for full cycles when comparing all four methods. This reduces fixed-order effects without eliminating device and thermal variability. The log retains both planned order and actual execution order; unstarted trials have no actual execution position.

Nodes count recursive entries, including root and leaves. Backtracks count each queen removal after its recursive branch, including successful branches. Candidate checks count attempted columns in conventional/array implementations and extracted legal positions in bitmask implementations. These counts intentionally describe different units of algorithmic work and must not be equated to primitive constraint checks. Symmetry counters describe actual work; only solution counts receive mirror weights.

Results report median, min/max, population standard deviation, all raw times, and `((baseline - optimized) / baseline) * 100`. Negative improvement means slower execution. A zero-valued conventional baseline is labeled below timer resolution; a missing baseline is labeled unavailable. One trial has no variability estimate. Chart whiskers show observed min–max ranges, not confidence intervals. Correctness is checked before accepting each trial. Only groups with all configured repetitions successful enter tables and charts. Other successful timings remain in the trial log and exports. Timed-out or failed trials have no valid timing and do not stop subsequent scheduled trials; cancellation terminates the active worker and marks unstarted trials skipped. No measurements are fabricated or preloaded.

JSON schema version 2 includes the experiment ID/status/timestamps, configuration, complete `trials` log, status counts and valid group `results`. CSV has one header and one equal-width row per planned trial, with repeated experiment metadata and summaries where available. It uses UTF-8 with BOM, CRLF and quoted/escaped values for Excel and Google Sheets. Unavailable measurements are blank in CSV and null in JSON; genuine measured zero remains zero. Export before refreshing, including after cancellation or when no group completed successfully.

## Correctness tests

`npm test` checks all four implementations against known counts for N = 0–14 (60 cases), plus valid arrangements, N=10 truncation without lost counts, real event snapshots, sequential rotating schedules, summary calculations, CSV/JSON fidelity, failure/cancellation retention, worker lifecycle errors and binary-search event jumps (79 tests total). The full suite includes N = 14 conventional backtracking and can take a little time. The Methodology view runs the 60 reference-count checks in workers. After a production build, `npm run test:worker` exercises the actual bundle, warm-up/counting-only paths, all four event caps, real execution and warm-up deadlines, and invalid inputs through a Node worker adapter.

Expected counts N = 4–14: 2, 10, 4, 40, 92, 352, 724, 2680, 14200, 73712, 365596. Reference: https://oeis.org/A000170 . Reference values are test oracles, never benchmark results.

`npm run test:browser` builds and runs 28 Playwright checks (14 each against Vite development and production preview). Coverage includes the original worker/solver/navigation suite, real benchmark charts, rotating-order exports, individual steps/jumps/timeline/fast-forward, truncation, cancellation, resetting a silent worker, blocked-worker recovery, simulated timeout logs, and all workspaces at 1440, 1024, 768, 390 and 320 pixels. It runs the complete 60-case correctness suite inside each browser environment. Populated charts and light/dark solution boards are captured at 1440, 768 and 390 pixels; screenshots live in ignored `test-results/`. Automated local browser verification does not verify an unchanged Vercel deployment or replace testing on physical mobile devices.

Browser tests use an installed Google Chrome (`channel: 'chrome'`) in headless mode. They start and stop their own local development and preview servers. Run them separately from manual local servers, or let the configuration reuse matching servers. Vercel deployment does not run or require browser tests.

Worker entries use Vite's `?worker` integration to resolve both development modules and production bundles. Errors remain visible and actionable, and reset/retry works after a blocked worker request is restored. The originally reported worker failure was not reproduced in a clean initial development run; the redesign hardens loading and tests failure recovery explicitly.

## Limitations and controls

- JavaScript uses 32-bit bitwise arithmetic; this lab limits computation to N ≤ 14 and visualization to N ≤ 12.
- Playback records only the first 20,000 real events, plus at most 100 valid solution arrangements (including reflected arrangements). Full counting continues beyond those caps. The UI explicitly distinguishes completed solution totals from playback-frame counters.
- High-speed playback renders sampled recorded snapshots and explicitly states the stride; individual steps and significant-event jumps inspect the unchanged recording. At speed 100 a capped history plays in about 11 seconds, or about 1.4 seconds with 8× fast-forward, subject to browser scheduling. Placement/removal duration follows the single-event playback interval; sampled playback and manual seeking use snapshots rather than inventing intermediate animation. Conflicts highlight both the rejected candidate and its attacking queens.
- A solver timeout returns an explicitly incomplete status; the worker client rejects it. Internal deadlines are checked every 1,024 nodes. The main thread has a termination watchdog with startup allowance, and cancellation immediately terminates the worker.
- Memory is “Not available”; no reliable cross-browser measurement isolates one algorithm's memory. Optional history is excluded from stated O(N) solver auxiliary space.
- Device load, JIT, garbage collection, timer resolution, background-tab throttling, and thermals affect results. Keep the tab foregrounded, pause visualization, close CPU-heavy apps, use consistent settings and multiple repetitions, and record OS/browser/power details for controlled research. Only one kind of workload can be started from the UI while another is active.
- Conservative time bounds are O(N² · N!) for scanning, O(N · N!) for arrays, and O(N!) search nodes for bitmasks. All retain factorial worst-case growth; symmetry provides a practical constant-factor reduction.
- Experiment data stays in the current session; export before refreshing. Theme preference is saved locally. No data leaves the device.

## Deploy to Vercel through GitHub

1. Create a GitHub repository and commit this source, including `package-lock.json`.
2. Import the repository in Vercel; choose the **Vite** preset.
3. Build command: `npm run build`. Output directory: `dist`. Install command: `npm install`.
4. Deploy. No environment variables are needed. `vercel.json` supports direct navigation and navigation uses URL hashes (`/#solver`, `/#comparison`, `/#dashboard`, `/#methodology`).

`npm run build` produces a standalone static `dist/` with the bundled worker. Other static hosts also work when served from the domain root. This project does not require a hosting service at runtime.
