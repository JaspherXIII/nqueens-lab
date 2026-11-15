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
        ["n", `N = ${n}`],
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
              ? "Median elapsed time · milliseconds"
              : "Actual operations · algorithm-dependent search"}
          </p>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={dataFor(metric)} margin={{ left: 0, right: 7 }}>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="var(--border)"
              />
              <XAxis
                dataKey="n"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={55}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "var(--blue-soft)" }}
                formatter={(value: number) =>
                  metric === "median"
                    ? `${value.toFixed(3)} ms`
                    : value.toLocaleString()
                }
              />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 16 }}
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
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <span className="chart-caption">
            {metric === "median"
              ? "Zero timings can occur below the browser timer resolution."
              : "Hover over a group to compare measured search work."}
          </span>
        </section>
      ))}
      <section className="panel chart-panel full">
        <h3>Scalability across board sizes</h3>
        <p>Median execution time (ms). Run a size range to compare growth.</p>
        <ResponsiveContainer width="100%" height={290}>
          <LineChart data={dataFor("median")}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="n" tick={{ fontSize: 12, fill: "var(--muted)" }} />
            <YAxis width={55} tick={{ fontSize: 11, fill: "var(--muted)" }} />
            <Tooltip
              contentStyle={tooltipStyle}
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
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
