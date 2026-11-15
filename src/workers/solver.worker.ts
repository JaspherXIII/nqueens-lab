import { solve } from "../algorithms/solve";
self.onmessage = (event) => {
  try {
    const { n, algorithm, record, timeout, warmup } = event.data;
    if (warmup && !solve(n, algorithm, { timeout }).complete)
      throw new Error("Warm-up timed out; no measurement recorded.");
    self.postMessage({ result: solve(n, algorithm, { record, timeout }) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
