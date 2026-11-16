export type AlgorithmId = "conventional" | "occupancy" | "bitmask" | "symmetry";
export interface Metrics {
  nodes: number;
  checks: number;
  backtracks: number;
  solutions: number;
}
export interface SearchEvent extends Metrics {
  type: "place" | "reject" | "remove" | "solution";
  board: number[];
  row: number;
  col: number;
  weight: number;
}
export interface SearchResult extends Metrics {
  elapsed: number;
  events: SearchEvent[];
  samples: number[][];
  recordedLimit: boolean;
  complete: boolean;
}
export interface Trial {
  n: number;
  algorithm: AlgorithmId;
  times: number[];
  median: number;
  min: number;
  max: number;
  stddev: number | null;
  metrics: Metrics;
}
export type TrialStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "skipped";
export interface TrialRecord {
  order: number;
  executionOrder: number | null;
  n: number;
  algorithm: AlgorithmId;
  repetition: number;
  status: TrialStatus;
  elapsed: number | null;
  metrics: Metrics | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}
export interface Experiment {
  id: string;
  status: "running" | "completed" | "completed_with_errors" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  configuration: {
    from: number;
    to: number;
    repetitions: number;
    timeoutPerExecutionSeconds: number;
    selectedAlgorithms: AlgorithmId[];
    executionOrder: string;
    warmup: string;
    source: string;
    environment: Record<string, string | number | null>;
    memory: string;
  };
  trials: TrialRecord[];
}
export const ALGORITHMS: {
  id: AlgorithmId;
  name: string;
  short: string;
  color: string;
  description: string;
}[] = [
  {
    id: "conventional",
    name: "Conventional Backtracking",
    short: "Conventional",
    color: "#94a3b8",
    description:
      "The foundation. Scan previously placed queens before exploring each candidate.",
  },
  {
    id: "occupancy",
    name: "Occupancy-Array Backtracking",
    short: "Occupancy array",
    color: "#2563eb",
    description:
      "Trade repeated scans for constant-time column and diagonal lookups.",
  },
  {
    id: "bitmask",
    name: "Bitmask Backtracking",
    short: "Bitmask",
    color: "#8b5cf6",
    description:
      "Represent the board as bits and extract available positions efficiently.",
  },
  {
    id: "symmetry",
    name: "Bitmask + Symmetry Reduction",
    short: "Bitmask + symmetry",
    color: "#0d9488",
    description:
      "Search one side of the first row and count reflected arrangements.",
  },
];
export const KNOWN: Record<number, number> = {
  0: 1,
  1: 1,
  2: 0,
  3: 0,
  4: 2,
  5: 10,
  6: 4,
  7: 40,
  8: 92,
  9: 352,
  10: 724,
  11: 2680,
  12: 14200,
  13: 73712,
  14: 365596,
};
