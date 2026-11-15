import { describe, expect, it } from "vitest";
import { median } from "./run";

describe("benchmark aggregation", () => {
  it("uses the middle measured trial for odd repetitions", () => {
    expect(median([9, 1, 5])).toBe(5);
  });
  it("averages the middle measured trials for even repetitions", () => {
    expect(median([9, 1, 5, 3])).toBe(4);
  });
  it("preserves raw trial ordering for exports", () => {
    const trials = [9, 1, 5];
    median(trials);
    expect(trials).toEqual([9, 1, 5]);
  });
});
