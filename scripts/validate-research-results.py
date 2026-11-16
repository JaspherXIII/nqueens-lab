"""Independently validate saved research CSVs using Python's statistics library."""
import csv
import hashlib
import json
import math
import statistics
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

directory = Path(sys.argv[1] if len(sys.argv) > 1 else "research-results")
config = json.loads((directory / "benchmark-config.json").read_text(encoding="utf-8"))
with (directory / "benchmark-raw.csv").open(encoding="utf-8-sig", newline="") as stream:
    raw = list(csv.DictReader(stream))
with (directory / "benchmark-summary.csv").open(encoding="utf-8-sig", newline="") as stream:
    summary = list(csv.DictReader(stream))

known = {4: 2, 5: 10, 6: 4, 7: 40, 8: 92, 9: 352, 10: 724, 11: 2680, 12: 14200, 13: 73712, 14: 365596}
algorithms = ["conventional", "occupancy", "bitmask", "symmetry"]
settings = config["experiment"]["configuration"]
start, end, repetitions = settings["from"], settings["to"], settings["repetitions"]
expected_trials = (end - start + 1) * 4 * repetitions
errors = []

def check(condition, message):
    if not condition:
        errors.append(message)

def close(actual, expected, label):
    try:
        check(math.isclose(float(actual), expected, rel_tol=1e-9, abs_tol=1e-10), label)
    except (ValueError, TypeError):
        errors.append(label + " (missing or nonnumeric)")

check(len(raw) == 2 * expected_trials, "Raw row completeness")
check(len(summary) == (end - start + 1) * 4, "Summary row completeness")
check(len({(r["trial_order"], r["phase"]) for r in raw}) == len(raw), "Duplicate trial/phase rows")
check(len({(r["n"], r["algorithm"]) for r in summary}) == len(summary), "Duplicate summary groups")
schedule = []
for n in range(start, end + 1):
    for repetition in range(1, repetitions + 1):
        offset = (repetition - 1 + n - start) % 4
        for algorithm in algorithms[offset:] + algorithms[:offset]:
            schedule.append((n, algorithm, repetition))

last_finished = None
for order, (n, algorithm, repetition) in enumerate(schedule, 1):
    phases = [r for r in raw if int(r["trial_order"]) == order]
    check({r["phase"] for r in phases} == {"warmup", "measured"}, f"Phase coverage at order {order}")
    for row in phases:
        check((int(row["n"]), row["algorithm"], int(row["repetition"])) == (n, algorithm, repetition), f"Rotation schedule at order {order}")
        check(row["experiment_id"] == config["experimentId"], "Mixed experiment IDs")
        if row["started_at_utc"]:
            check(row["actual_execution_order"] == str(order), f"Actual execution order at planned trial {order}")
        check(int(row["expected_solutions"]) == known[n], f"Oracle at N={n}")
        check(row["memory_bytes"] == "", "Unmeasured algorithm memory must be blank")
        if row["status"] == "success":
            check(int(row["solutions"]) == known[n] and row["correct"] == "true", f"Incorrect count at order {order}/{row['phase']}")
            check(math.isfinite(float(row["elapsed_ms"])) and float(row["elapsed_ms"]) >= 0, "Invalid elapsed time")
            check(all(int(row[field]) >= 0 for field in ["nodes", "backtracks", "candidate_checks"]), "Invalid operation count")
        if row["phase"] == "warmup":
            check(row["accepted_for_summary"] == "false", "Warm-up included in summary")
        if row["status"] != "success":
            check(row["accepted_for_summary"] == "false", "Invalid trial accepted for summary")
    warmup = next((r for r in phases if r["phase"] == "warmup"), None)
    measured = next((r for r in phases if r["phase"] == "measured"), None)
    if warmup and measured and warmup["finished_at_utc"] and measured["started_at_utc"]:
        check(warmup["status"] == "success", "Measurement started after unsuccessful warm-up")
        check(warmup["finished_at_utc"] <= measured["started_at_utc"], "Measurement overlapped warm-up")
    if warmup and warmup["started_at_utc"] and last_finished:
        check(last_finished <= warmup["started_at_utc"], "Trials overlapped in time")
    if measured and measured["finished_at_utc"]:
        last_finished = measured["finished_at_utc"]

complete_groups = 0
for row in summary:
    n, algorithm = int(row["n"]), row["algorithm"]
    records = [r for r in raw if r["phase"] == "measured" and int(r["n"]) == n and r["algorithm"] == algorithm]
    successful = [r for r in records if r["status"] == "success"]
    check(int(row["planned_measured_trials"]) == repetitions, "Wrong planned repetitions")
    check(int(row["successful_measured_trials"]) == len(successful), "Wrong success count")
    for status, field in [("failed", "failed_measured_trials"), ("timed_out", "timed_out_measured_trials")]:
        check(int(row[field]) == sum(r["status"] == status for r in records), f"Wrong {status} count")
    if len(successful) != repetitions:
        check(row["status"] == "incomplete_excluded" and row["median_ms"] == "", "Incomplete group summarized")
        continue
    complete_groups += 1
    check(row["status"] == "complete_verified", "Complete group mislabeled")
    check(all(r["accepted_for_summary"] == "true" for r in successful), "Complete group not accepted")
    times = [float(r["elapsed_ms"]) for r in successful]
    for field, expected in [("median_ms", statistics.median(times)), ("min_ms", min(times)), ("max_ms", max(times)),
                            ("population_stddev_ms", statistics.pstdev(times)), ("mean_ms", statistics.mean(times)),
                            ("sample_stddev_ms", statistics.stdev(times))]:
        close(row[field], expected, f"{field}, N={n}, {algorithm}")
    for raw_field, summary_field in [("nodes", "nodes"), ("backtracks", "backtracks"), ("candidate_checks", "candidate_checks"), ("solutions", "solutions")]:
        values = {int(r[raw_field]) for r in successful}
        check(len(values) == 1 and int(row[summary_field]) in values, f"Nondeterministic/mismatched {raw_field}: N={n}, {algorithm}")
    check(row["memory_bytes"] == "", "Summary memory must be unavailable")
    baseline_records = [r for r in raw if r["phase"] == "measured" and int(r["n"]) == n and r["algorithm"] == "conventional" and r["status"] == "success"]
    if len(baseline_records) == repetitions:
        baseline = statistics.median(float(r["elapsed_ms"]) for r in baseline_records)
        med = statistics.median(times)
        if baseline > 0:
            close(row["improvement_percent"], (baseline - med) / baseline * 100, "Improvement formula")
        if baseline > 0 and med > 0:
            close(row["speedup_vs_conventional"], baseline / med, "Speedup formula")

for n in range(start, end + 1):
    full_tree = [r for r in summary if int(r["n"]) == n and r["algorithm"] in algorithms[:3] and r["status"] == "complete_verified"]
    if len(full_tree) == 3:
        check(len({r["nodes"] for r in full_tree}) == 1, f"Full-tree node disagreement at N={n}")
        check(len({r["backtracks"] for r in full_tree}) == 1, f"Full-tree backtrack disagreement at N={n}")

for relative, source in config["runtimeAndConditions"]["source"]["files"].items():
    digest = hashlib.sha256((directory / source["archivedAt"]).read_bytes()).hexdigest()
    check(digest == source["sha256"], f"Archived source hash: {relative}")

measured_status = Counter(r["status"] for r in raw if r["phase"] == "measured")
warmup_status = Counter(r["status"] for r in raw if r["phase"] == "warmup")
complete = measured_status["success"] == expected_trials and warmup_status["success"] == expected_trials and complete_groups == (end - start + 1) * 4
result = {
    "validatedAtUTC": datetime.now(timezone.utc).isoformat(), "validator": "Independent Python csv/statistics/math/hashlib; no application aggregation code imported",
    "pythonVersion": sys.version,
    "validatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "integrityPassed": not errors, "experimentComplete": complete, "rawRows": len(raw), "summaryRows": len(summary),
    "measuredStatuses": dict(measured_status), "warmupStatuses": dict(warmup_status), "completeGroups": complete_groups,
    "checks": ["row/group completeness", "unique identifiers", "rotating schedule", "phase/trial timestamp sequencing", "OEIS counts for all successful phases", "within-group deterministic counters", "full-tree node/backtrack agreement", "median/min/max/mean/population and sample SD", "baseline percentages and speedups", "warm-up/incomplete exclusion", "unavailable memory left blank", "archived source SHA-256"],
    "errors": errors,
}
(directory / "validation.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
sys.exit(0 if not errors and complete else 1)
