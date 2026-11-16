import type { AlgorithmId, SearchResult } from "../types";
import SolverWorker from "../workers/solver.worker?worker";
export { median } from "./experiment";
export function runWorker(
  n: number,
  algorithm: AlgorithmId,
  record: boolean,
  timeout: number,
  signal?: AbortSignal,
  warmup = false,
): Promise<SearchResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Cancelled"));
      return;
    }
    // Vite owns the worker entry in development and emits a separate hashed
    // worker asset in production; never resolve a source .ts URL at runtime.
    let worker: Worker;
    try {
      worker = new SolverWorker({ name: `nqueens-${algorithm}` });
    } catch (error) {
      reject(
        new Error(
          `Worker failed to load or execute ${algorithm} at N=${n}: ${error instanceof Error ? error.message : String(error)}. Reload and retry.`,
        ),
      );
      return;
    }
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish(new Error("Cancelled"));
    };
    const finish = (error?: Error, result?: SearchResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(
      () => {
        finish(
          new Error(
            `N=${n} ${algorithm}: execution timed out; partial results excluded.`,
          ),
        );
      },
      timeout * (warmup ? 2 : 1) + 3000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => {
      if (event.data?.error) finish(new Error(event.data.error));
      else if (
        !event.data?.result ||
        !["solutions", "nodes", "checks", "backtracks", "elapsed"].every(
          (key) =>
            Number.isFinite(event.data.result[key]) &&
            event.data.result[key] >= 0,
        ) ||
        !Array.isArray(event.data.result.events) ||
        !Array.isArray(event.data.result.samples) ||
        typeof event.data.result.complete !== "boolean"
      )
        finish(
          new Error(
            "Worker returned an invalid response. Reset and try again.",
          ),
        );
      else if (!event.data.result.complete)
        finish(
          new Error(
            `N=${n} ${algorithm}: execution timed out; partial results excluded.`,
          ),
        );
      else finish(undefined, event.data.result);
    };
    worker.onerror = (event) => {
      finish(
        new Error(
          `Worker failed to load or execute ${algorithm} at N=${n}: ${event.message || "the browser blocked the worker module"}. Reload the page to refresh deployed assets; if it persists, check the browser console and worker request.`,
        ),
      );
    };
    worker.onmessageerror = () => {
      finish(
        new Error("Worker response could not be decoded. Reset and try again."),
      );
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage({ n, algorithm, record, timeout, warmup });
    } catch (error) {
      finish(
        new Error(
          `Worker request failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  });
}
