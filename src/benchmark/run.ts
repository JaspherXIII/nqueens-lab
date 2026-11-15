import type { AlgorithmId, SearchResult } from "../types";
import SolverWorker from "../workers/solver.worker?worker";
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
    const worker = new SolverWorker({ name: `nqueens-${algorithm}` });
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new Error("Cancelled"));
    };
    const timer = setTimeout(
      () => {
        cleanup();
        reject(
          new Error(
            `N=${n} ${algorithm}: execution timed out; partial results excluded.`,
          ),
        );
      },
      timeout * (warmup ? 2 : 1) + 3000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => {
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else if (
        !event.data.result ||
        typeof event.data.result.solutions !== "number"
      )
        reject(
          new Error(
            "Worker returned an invalid response. Reset and try again.",
          ),
        );
      else if (!event.data.result.complete)
        reject(
          new Error(
            `N=${n} ${algorithm}: execution timed out; partial results excluded.`,
          ),
        );
      else resolve(event.data.result);
    };
    worker.onerror = (event) => {
      cleanup();
      reject(
        new Error(
          `Worker failed to load or execute ${algorithm} at N=${n}: ${event.message || "the browser blocked the worker module"}. Reload the page to refresh deployed assets; if it persists, check the browser console and worker request.`,
        ),
      );
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(
        new Error("Worker response could not be decoded. Reset and try again."),
      );
    };
    worker.postMessage({ n, algorithm, record, timeout, warmup });
  });
}
export function median(values: number[]) {
  const a = [...values].sort((a, b) => a - b);
  const middle = Math.floor(a.length / 2);
  return a.length % 2 ? a[middle] : (a[middle - 1] + a[middle]) / 2;
}
