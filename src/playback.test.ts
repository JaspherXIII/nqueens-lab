import { expect, it } from "vitest";
import { eventIndexes, jumpIndex, playbackTiming } from "./playback";
import { solve } from "./algorithms/solve";

it("jumps strictly forward and backward through real placements, removals and solutions", () => {
  const { events } = solve(4, "conventional", { record: true });
  for (const type of ["place", "remove", "solution", "reject"] as const) {
    const indexes = eventIndexes(events, type);
    expect(indexes.length).toBeGreaterThan(1);
    expect(jumpIndex(indexes, -1, 1)).toBe(indexes[0]);
    expect(jumpIndex(indexes, indexes[0], 1)).toBe(indexes[1]);
    expect(jumpIndex(indexes, indexes[1], -1)).toBe(indexes[0]);
    expect(jumpIndex(indexes, indexes[0], -1)).toBeNull();
    expect(jumpIndex(indexes, events.length, 1)).toBeNull();
    expect(jumpIndex(indexes, events.length, -1)).toBe(indexes.at(-1));
    expect(indexes.every((index) => events[index].type === type)).toBe(true);
  }
  expect(jumpIndex([], 100, 1)).toBeNull();
});
it("keeps slow playback contiguous and accelerates large histories without changing them", () => {
  expect(playbackTiming(1).stride).toBe(1);
  expect(playbackTiming(50).stride).toBe(1);
  const fast = playbackTiming(100);
  expect((20000 / fast.stride) * fast.interval).toBeLessThan(15000);
  expect(playbackTiming(100, true).stride).toBe(fast.stride * 8);
  expect(fast.interval).toBeGreaterThanOrEqual(40);
});
