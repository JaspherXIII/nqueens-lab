import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  ErrorBar,
} from "recharts";
import { ALGORITHMS, type Trial } from "../types";

export default function ResultCharts({ results }: { results: Trial[] }) {
  const sizes = [...new Set(results.map((r) => r.n))].sort((a, b) => a - b);
  const algorithms = ALGORITHMS.filter((a) =>
    results.some((r) => r.algorithm === a.id),
  );
  const dataFor = (metric: "median" | "nodes" | "backtracks" | "checks") =>
    sizes.map((n) =>
      Object.fromEntries([
        ["n", n],
        ...algorithms.map((a) => {
          const r = results.find((r) => r.n === n && r.algorithm === a.id);
          return [
            a.id,
            r
              ? metric === "median"
                ? r.median
                : r.metrics[metric]
              : undefined,
          ];
        }),
        ...algorithms.map((a) => {
          const r = results.find((r) => r.n === n && r.algorithm === a.id);
          return [
            `${a.id}Range`,
            // Recharts 2 keys caps by geometry: a zero-length whisker produces
            // duplicate cap keys. No whisker is needed for identical values;
            // retain the real zero range in the tooltip, table and export.
            r && r.times.length > 1 && r.max > r.min
              ? [r.median - r.min, r.max - r.median]
              : undefined,
          ];
        }),
      ]),
    );
  const tooltipStyle = {
    background: "var(--panel)",
    borderColor: "var(--border)",
    borderRadius: 8,
    color: "var(--ink)",
    fontSize: 12,
  };
  return (
    <div className="chart-grid">
      {(["median", "nodes", "backtracks", "checks"] as const).map((metric) => (
        <section className="panel chart-panel" key={metric}>
          <h3>
            {
              {
                median: "Execution time",
                nodes: "Search nodes explored",
                backtracks: "Backtracking operations",
                checks: "Candidate positions checked",
              }[metric]
            }
          </h3>
          <p>
            {metric === "median"
              ? "Median elapsed time · milliseconds · whiskers show min–max"
              : "Actual operations · algorithm-dependent search"}
          </p>
          <div
            className="chart-scroll"
            role="region"
            tabIndex={0}
            aria-label={`${metric} chart, scroll horizontally for all board sizes`}
          >
            <div style={{ minWidth: Math.max(300, sizes.length * 90) }}>
              <ResponsiveContainer width="100%" height={310}>
                <BarChart data={dataFor(metric)} margin={{ left: 0, right: 7 }}>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                  />
                  <XAxis
                    dataKey="n"
                    tickFormatter={(value) => `N=${value}`}
                    tick={{ fontSize: 12, fill: "var(--muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    width={55}
                    tickFormatter={(value) =>
                      Intl.NumberFormat("en", { notation: "compact" }).format(
                        value,
                      )
                    }
                    tick={{ fontSize: 12, fill: "var(--muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "var(--blue-soft)" }}
                    labelFormatter={(value) => `Board size N=${value}`}
                    formatter={(value: number, name: string, item) =>
                      metric === "median"
                        ? (() => {
                            const algorithm = algorithms.find(
                              (a) => a.short === name,
                            );
                            const r = results.find(
                              (r) =>
                                r.n === item.payload.n &&
                                r.algorithm === algorithm?.id,
                            );
                            return `${value.toFixed(3)} ms${r ? ` (min ${r.min.toFixed(3)}, max ${r.max.toFixed(3)}; ${r.times.length} trials)` : ""}`;
                          })()
                        : value.toLocaleString()
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                    iconType="circle"
                    iconSize={7}
                  />
                  {algorithms.map((a) => (
                    <Bar
                      key={a.id}
                      name={a.short}
                      dataKey={a.id}
                      fill={a.color}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={42}
                      isAnimationActive={false}
                    >
                      {metric === "median" && (
                        <ErrorBar
                          dataKey={`${a.id}Range`}
                          width={4}
                          stroke="var(--ink)"
                        />
                      )}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <span className="chart-caption">
            {metric === "median"
              ? "Whiskers show non-zero observed ranges, not confidence intervals. One-trial groups have no variability estimate. Zero can mean below timer resolution."
              : metric === "checks"
                ? "Scan/array counts attempted columns; bitmask counts extracted legal positions. These are different work units."
                : "Only fully successful repeated groups. Symmetry reports executed work, without doubling mirror work."}
          </span>
        </section>
      ))}
      <section className="panel chart-panel full">
        <h3>Scalability across board sizes</h3>
        <p>
          Median execution time (ms), min–max whiskers. Numeric board-size axis;
          missing groups remain gaps.
        </p>
        <div
          className="chart-scroll"
          role="region"
          tabIndex={0}
          aria-label="Scalability chart, scroll horizontally for all board sizes"
        >
          <div style={{ minWidth: Math.max(300, sizes.length * 80) }}>
            <ResponsiveContainer width="100%" height={330}>
              <LineChart data={dataFor("median")}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="n"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  ticks={sizes}
                  allowDecimals={false}
                  tickFormatter={(value) => `N=${value}`}
                  tick={{ fontSize: 12, fill: "var(--muted)" }}
                />
                <YAxis
                  width={55}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(value) => `Board size N=${value}`}
                  formatter={(value: number) => `${value.toFixed(3)} ms`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                  iconType="circle"
                  iconSize={7}
                />
                {algorithms.map((a) => (
                  <Line
                    key={a.id}
                    name={a.short}
                    dataKey={a.id}
                    stroke={a.color}
                    connectNulls={false}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                  >
                    <ErrorBar
                      dataKey={`${a.id}Range`}
                      width={4}
                      stroke={a.color}
                    />
                  </Line>
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <span className="chart-caption">
          Scroll charts horizontally on smaller screens. Exact measurements,
          variability, and baseline improvements are available in the results
          table.
        </span>
      </section>
    </div>
  );
}
