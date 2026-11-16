import { readFile, readdir } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import assert from "node:assert/strict";

// Run the actual production worker bundle with a small Web Worker adapter.
// This checks the built message protocol and warm-up path without a DOM.
const files = await readdir(new URL("../dist/assets/", import.meta.url));
const filename = files.find(
  (name) => name.startsWith("solver.worker-") && name.endsWith(".js"),
);
assert.ok(filename, "Build the application before running this check.");
const bundle = await readFile(
  new URL(`../dist/assets/${filename}`, import.meta.url),
  "utf8",
);
const adapter = `const { parentPort } = require('node:worker_threads');
globalThis.self = { postMessage: message => parentPort.postMessage(message) };
parentPort.on('message', data => self.onmessage({data}));\n`;

async function request(message) {
  const worker = new Worker(adapter + bundle, { eval: true });
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Production worker failed to respond")),
        20000,
      );
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.postMessage(message);
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}

for (const algorithm of ["conventional", "occupancy", "bitmask", "symmetry"]) {
  const response = await request({
    n: 8,
    algorithm,
    record: false,
    timeout: 10000,
    warmup: true,
  });
  assert.equal(response.error, undefined);
  assert.equal(response.result.complete, true);
  assert.equal(response.result.solutions, 92);
  assert.equal(response.result.events.length, 0);
  assert.equal(response.result.samples.length, 0);
  assert.ok(response.result.elapsed > 0);
  console.log(
    `${algorithm}: 92 solutions, ${response.result.nodes} nodes, ${response.result.elapsed.toFixed(3)} ms; production worker protocol passed.`,
  );
  const recorded = await request({
    n: 10,
    algorithm,
    record: true,
    timeout: 10000,
  });
  assert.equal(recorded.result.solutions, 724);
  assert.equal(recorded.result.events.length, 20000);
  assert.equal(recorded.result.recordedLimit, true);
  assert.equal(recorded.result.samples.length, 100);
}
const timeout = await request({
  n: 14,
  algorithm: "conventional",
  record: false,
  timeout: 1,
});
assert.equal(timeout.result.complete, false);
const warmupTimeout = await request({
  n: 14,
  algorithm: "conventional",
  record: false,
  timeout: 1,
  warmup: true,
});
assert.match(warmupTimeout.error, /Warm-up timed out/);
const invalid = await request({
  n: 15,
  algorithm: "bitmask",
  record: false,
  timeout: 10000,
});
assert.match(invalid.error, /Board size/);
console.log(
  "All production workers: event cap, complete counting, execution/warm-up deadlines and invalid-input handling passed.",
);
