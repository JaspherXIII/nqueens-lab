import { readFile, readdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import assert from 'node:assert/strict';

// Run the actual production worker bundle with a small Web Worker adapter.
// This checks the built message protocol and warm-up path without a DOM.
const files = await readdir(new URL('../dist/assets/', import.meta.url));
const filename = files.find(name => name.startsWith('solver.worker-') && name.endsWith('.js'));
assert.ok(filename, 'Build the application before running this check.');
const bundle = await readFile(new URL(`../dist/assets/${filename}`, import.meta.url), 'utf8');
const adapter = `const { parentPort } = require('node:worker_threads');
globalThis.self = { postMessage: message => parentPort.postMessage(message) };
parentPort.on('message', data => self.onmessage({data}));\n`;

for (const algorithm of ['conventional', 'occupancy', 'bitmask', 'symmetry']) {
  const worker = new Worker(adapter + bundle, { eval: true });
  const response = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.postMessage({ n: 8, algorithm, record: false, timeout: 10000, warmup: true });
  });
  await worker.terminate();
  assert.equal(response.error, undefined);
  assert.equal(response.result.complete, true);
  assert.equal(response.result.solutions, 92);
  assert.equal(response.result.events.length, 0);
  assert.equal(response.result.samples.length, 0);
  assert.ok(response.result.elapsed > 0);
  console.log(`${algorithm}: 92 solutions, ${response.result.nodes} nodes, ${response.result.elapsed.toFixed(3)} ms; production worker protocol passed.`);
}
