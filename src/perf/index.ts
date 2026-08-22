/**
 * Performance Regression Gate — detects performance regressions against a baseline.
 * 
 * Uses statistical comparison against a target branch's history.
 */

import * as fs from 'node:fs';
import { CerberusDB } from '../storage/index.js';
import type { CerberusConfig } from '../config/schema.js';
import type { PerfMetricRow } from '../storage/index.js';

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
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error('Expected a JSON array of metric objects');
  }

  return data.map((item: Record<string, unknown>) => ({
    metricName: item.metric_name as string,
    valueMs: item.value_ms as number,
    pageOrEndpoint: (item.page_or_endpoint as string) || 'unknown',
  }));
}

/**
 * Parse a Playwright trace file for performance metrics.
 * Extracts page load timing from the trace events.
 */
function parsePlaywrightTrace(content: string): PerfMetric[] {
  const data = JSON.parse(content);
  const metrics: PerfMetric[] = [];

  // Playwright trace files contain a list of events
  // We look for 'resource-snapshot' or timing events
  if (data.events && Array.isArray(data.events)) {
    for (const event of data.events) {
      if (event.type === 'resource-snapshot' && event.pageOrEndpoint) {
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
  if (data.timing && typeof data.timing === 'object') {
    for (const [key, value] of Object.entries(data.timing)) {
      if (typeof value === 'number') {
        metrics.push({
          metricName: key,
          valueMs: value,
          pageOrEndpoint: 'trace',
        });
      }
    }
  }

  return metrics;
}

/**
 * Ingest performance metrics from a trace or custom JSON file.
 */
export async function ingestPerfMetrics(options: PerfIngestOptions): Promise<PerfIngestResult> {
  const content = fs.readFileSync(options.tracePath, 'utf-8');

  // Detect format based on file extension
  const isJson = options.tracePath.endsWith('.json');
  const isTrace = options.tracePath.endsWith('.trace');

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
  currentMetrics: PerfMetricRow[],
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
    const baselineMedian =
      baselineValues.length % 2 !== 0
        ? baselineValues[mid]
        : (baselineValues[mid - 1] + baselineValues[mid]) / 2;

    // Get threshold for this metric (or use default)
    const thresholdPct =
      config.perf.thresholds[metricName] ?? config.perf.threshold_pct;

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
