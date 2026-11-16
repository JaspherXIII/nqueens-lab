import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { solve } from "../algorithms/solve";
import { runWorker } from "./run";

const state = vi.hoisted(() => ({
  worker: null as any,
  constructError: false,
  postError: false,
}));
vi.mock("../workers/solver.worker?worker", () => ({
  default: class {
    onmessage: any;
    onerror: any;
    onmessageerror: any;
    terminate = vi.fn();
    postMessage = vi.fn(() => {
      if (state.postError) throw new Error("post failed");
    });
    constructor() {
      if (state.constructError) throw new Error("blocked constructor");
      state.worker = this;
    }
  },
}));

beforeEach(() => {
  state.worker = null;
  state.constructError = state.postError = false;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

it("accepts a valid response and cleans up worker, watchdog and abort listener once", async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  const promise = runWorker(4, "bitmask", false, 1000, controller.signal, true);
  const r = solve(4, "bitmask");
  state.worker.onmessage({ data: { result: r } });
  await expect(promise).resolves.toEqual(r);
  controller.abort();
  expect(state.worker.terminate).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("cancels before creation and during computation without accepting a late response", async () => {
  const c = new AbortController();
  c.abort();
  await expect(runWorker(4, "bitmask", false, 1000, c.signal)).rejects.toThrow(
    "Cancelled",
  );
  expect(state.worker).toBeNull();
  const active = new AbortController();
  const promise = runWorker(4, "bitmask", false, 1000, active.signal);
  const rejection = expect(promise).rejects.toThrow("Cancelled");
  active.abort();
  state.worker.onmessage({ data: { result: solve(4, "bitmask") } });
  await rejection;
  expect(state.worker.terminate).toHaveBeenCalledTimes(1);
});
it("handles constructor, postMessage, load and decoding errors with cleanup", async () => {
  state.constructError = true;
  await expect(runWorker(4, "bitmask", false, 1000)).rejects.toThrow(
    "Worker failed to load or execute",
  );
  state.constructError = false;
  state.postError = true;
  await expect(runWorker(4, "bitmask", false, 1000)).rejects.toThrow(
    "Worker request failed",
  );
  expect(state.worker.terminate).toHaveBeenCalledOnce();
  state.postError = false;
  let promise = runWorker(4, "bitmask", false, 1000);
  state.worker.onerror({ message: "blocked asset" });
  await expect(promise).rejects.toThrow("blocked asset");
  promise = runWorker(4, "bitmask", false, 1000);
  state.worker.onmessageerror();
  await expect(promise).rejects.toThrow("could not be decoded");
  expect(vi.getTimerCount()).toBe(0);
});
it("rejects malformed, incomplete and timed-out responses; watchdog terminates silent workers", async () => {
  for (const data of [
    null,
    { result: { solutions: 2 } },
    { result: { ...solve(4, "bitmask"), elapsed: NaN } },
  ]) {
    const promise = runWorker(4, "bitmask", false, 1000);
    state.worker.onmessage({ data });
    await expect(promise).rejects.toThrow("invalid response");
  }
  let promise = runWorker(4, "bitmask", false, 1000);
  state.worker.onmessage({
    data: { result: { ...solve(4, "bitmask"), complete: false } },
  });
  await expect(promise).rejects.toThrow("timed out");
  promise = runWorker(4, "bitmask", false, 1000, undefined, true);
  const rejection = expect(promise).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(5000);
  await rejection;
  expect(state.worker.terminate).toHaveBeenCalledOnce();
});
