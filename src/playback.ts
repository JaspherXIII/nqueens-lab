import type { SearchEvent } from "./types";
export function playbackTiming(speed: number, fastForward = false) {
  return {
    interval: Math.max(40, 520 - speed * 5),
    stride:
      (speed > 75 ? Math.max(1, Math.round(2 ** ((speed - 75) / 4))) : 1) *
      (fastForward ? 8 : 1),
  };
}
export function eventIndexes(events: SearchEvent[], type: SearchEvent["type"]) {
  return events.flatMap((event, index) => (event.type === type ? [index] : []));
}
export function jumpIndex(
  indexes: number[],
  cursor: number,
  direction: -1 | 1,
): number | null {
  let low = 0,
    high = indexes.length;
  // Upper bound forward; lower bound backward. Never jump to the current event.
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (
      indexes[middle] < cursor ||
      (direction === 1 && indexes[middle] === cursor)
    )
      low = middle + 1;
    else high = middle;
  }
  return indexes[direction === 1 ? low : low - 1] ?? null;
}
