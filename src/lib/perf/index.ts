/**
 * Performance Regression Gate — detects performance regressions against a baseline.
 *
 * Uses statistical comparison against a target branch's history.
 */

import * as fs from "node:fs";
import { type CerberusDB } from "../storage/index";
import type { CerberusConfig } from "../config/schema";
import type { PerfMetricRow } from "../storage/index";

/**
 * The fields `checkPerfRegressions` actually reads.
 *
 * A `PerfMetricRow` satisfies this, so callers holding stored rows are
 * unaffected. Metrics that have not been written yet do not - and that is the
 * normal case here, because the regression check runs against the run being
 * ingested. Typing the parameter as the full row forced every one of those
 * call sites to invent an `id`.
 */
export type PerfMetricInput = Pick<
  PerfMetricRow,
  "run_id" | "metric_name" | "value_ms" | "page_or_endpoint"
>;

export interface PerfIngestOptions {
  tracePath: string;
  runId: number;
  db: CerberusDB;
}

export interface PerfMetric {
  metricName: string;
  valueMs: number;
  pageOrEndpoint: string;
}

export interface PerfRegression {
  metricName: string;
  currentValue: number;
  baselineMedian: number;
  deltaPct: number;
  thresholdPct: number;
}

export interface PerfIngestResult {
  metricsCount: number;
  metrics: PerfMetric[];
}

export interface PerfCheckResult {
  regressions: PerfRegression[];
  insufficientHistory: string[];
}

/**
 * Parse a custom JSON perf file: [{ metric_name, value_ms, page_or_endpoint }]
 */
function parseCustomPerfJson(content: string): PerfMetric[] {
  const data: unknown = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error("Expected a JSON array of metric objects");
  }

  return data.map((item: Record<string, unknown>) => ({
    metricName: item.metric_name as string,
    valueMs: item.value_ms as number,
    pageOrEndpoint: (item.page_or_endpoint as string) || "unknown",
  }));
}

/** Narrow an unknown value to a trace that carries a plain timing object. */
function hasTimingRecord(value: unknown): value is { timing: Record<string, unknown> } {
  if (typeof value !== "object" || value === null) return false;
  const timing = (value as Record<string, unknown>).timing;
  return typeof timing === "object" && timing !== null && !Array.isArray(timing);
}

/**
 * Narrow an unknown value to a parsed trace that carries an events array.
 *
 * A trace file is untrusted input. Parsing it as `unknown` and narrowing here
 * keeps the event loop below free of `any` — the alternative, a cast at the
 * call site, is an unchecked promise that the file has the shape we assume.
 */
/** Timing numbers a resource snapshot carries. */
interface TraceTiming {
  load?: number;
  domContentLoaded?: number;
  firstContentfulPaint?: number;
}

/** One event from a parsed trace file. */
interface TraceEvent {
  type?: string;
  pageOrEndpoint?: string;
  snapshot?: { timing?: TraceTiming };
}

function isTraceWithEvents(value: unknown): value is { events: TraceEvent[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).events)
  );
}

/**
 * Parse a Playwright trace file for performance metrics.
 * Extracts page load timing from the trace events.
 */
function parsePlaywrightTrace(content: string): PerfMetric[] {
  const data: unknown = JSON.parse(content);
  const metrics: PerfMetric[] = [];

  // Playwright trace files contain a list of events; we look for
  // 'resource-snapshot' or timing events.
  if (isTraceWithEvents(data)) {
    for (const event of data.events) {
      if (event.type === "resource-snapshot" && event.pageOrEndpoint) {
        // Extract timing from resource snapshots
        const timing = event.snapshot?.timing;
        if (timing) {
          if (timing.load !== undefined) {
            metrics.push({
              metricName: `${event.pageOrEndpoint}_page_load_ms`,
              valueMs: timing.load,
              pageOrEndpoint: event.pageOrEndpoint,
            });
          }
          if (timing.domContentLoaded !== undefined) {
            metrics.push({
              metricName: `${event.pageOrEndpoint}_dom_content_loaded_ms`,
              valueMs: timing.domContentLoaded,
              pageOrEndpoint: event.pageOrEndpoint,
            });
          }
        }
      }
    }
  }

  // Also support a simpler format with direct timing data
  if (hasTimingRecord(data)) {
    for (const [key, value] of Object.entries(data.timing)) {
      if (typeof value === "number") {
        metrics.push({
          metricName: key,
          valueMs: value,
          pageOrEndpoint: "trace",
        });
      }
    }
  }

  return metrics;
}

/**
 * Ingest performance metrics from a trace or custom JSON file.
 */
// `require-await`: async because the interface contract returns a Promise and
// a real provider performs network IO here. Dropping `async` would make the
// signature lie and force every caller to wrap the result themselves.
// eslint-disable-next-line @typescript-eslint/require-await
export async function ingestPerfMetrics(options: PerfIngestOptions): Promise<PerfIngestResult> {
  const content = fs.readFileSync(options.tracePath, "utf-8");

  // Detect format based on file extension
  const isJson = options.tracePath.endsWith(".json");
  const isTrace = options.tracePath.endsWith(".trace");

  let metrics: PerfMetric[];
  if (isTrace) {
    metrics = parsePlaywrightTrace(content);
  } else if (isJson) {
    // Try custom format first, fall back to Playwright trace format
    try {
      metrics = parseCustomPerfJson(content);
    } catch {
      metrics = parsePlaywrightTrace(content);
    }
  } else {
    throw new Error(`Unsupported trace file format: ${options.tracePath}`);
  }

  // Store metrics in the database
  for (const metric of metrics) {
    options.db.insertPerfMetric({
      run_id: options.runId,
      metric_name: metric.metricName,
      value_ms: metric.valueMs,
      page_or_endpoint: metric.pageOrEndpoint,
    });
  }

  return {
    metricsCount: metrics.length,
    metrics,
  };
}

/**
 * Check for performance regressions against the baseline branch.
 */
export function checkPerfRegressions(
  currentMetrics: PerfMetricInput[],
  db: CerberusDB,
  config: CerberusConfig,
): PerfCheckResult {
  const regressions: PerfRegression[] = [];
  const insufficientHistory: string[] = [];
  const excludeSet = new Set(config.perf.exclude);

  // Get unique metric names from current run
  const metricNames = [...new Set(currentMetrics.map((m) => m.metric_name))];

  for (const metricName of metricNames) {
    // Skip excluded metrics
    if (excludeSet.has(metricName)) continue;

    const currentValues = currentMetrics
      .filter((m) => m.metric_name === metricName)
      .map((m) => m.value_ms);

    const currentValue = currentValues[0]; // Use first value if multiple
    if (currentValue === undefined) continue;

    // Get baseline values — prefers manually-set baselines, falls back to branch history
    const baselineMetrics = db.getBaselineMetrics(
      metricName,
      config.perf.baseline_branch,
      config.perf.baseline_runs,
    );

    // Manual baselines are explicit user intent — trust even 1 value.
    // Auto-detected baselines need ≥3 for statistical significance.
    const isManualBaseline = db.hasManualBaselineForMetric(metricName);
    const minBaselineCount = isManualBaseline ? 1 : 3;

    if (baselineMetrics.length < minBaselineCount) {
      // Not enough history to make a statistical comparison
      insufficientHistory.push(metricName);
      continue;
    }

    // Compute median of baseline
    const baselineValues = baselineMetrics.map((m) => m.value_ms).sort((a, b) => a - b);
    const mid = Math.floor(baselineValues.length / 2);
    // The caller has already established that a baseline exists, so the two
    // middle elements are present. Saying so once, here, keeps the narrowing
    // local instead of propagating `| undefined` into the comparison below.
    const baselineMedian =
      baselineValues.length % 2 !== 0
        ? baselineValues[mid]!
        : (baselineValues[mid - 1]! + baselineValues[mid]!) / 2;

    // Get threshold for this metric (or use default)
    const thresholdPct = config.perf.thresholds[metricName] ?? config.perf.threshold_pct;

    // Check for regression
    const deltaPct = ((currentValue - baselineMedian) / baselineMedian) * 100;

    if (deltaPct > thresholdPct) {
      regressions.push({
        metricName,
        currentValue,
        baselineMedian,
        deltaPct,
        thresholdPct,
      });
    }
  }

  return {
    regressions,
    insufficientHistory,
  };
}
