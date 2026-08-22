/**
 * cerberus compare — diff two CI runs side-by-side.
 *
 * Shows new failures, resolved failures, status changes, and performance deltas.
 */

import { loadConfig, validateConfig } from '../config/schema.js';
import { CerberusDB } from '../storage/database.js';
import type { RunRow, TestResultRow, PerfMetricRow } from '../storage/database.js';

export interface CompareOptions {
  runId: string;
  otherRunId?: string; // if omitted, auto-select previous run on same branch
  configPath: string;
  json: boolean;
}

export interface TestDiff {
  testName: string;
  filePath: string;
  before: string; // 'passed' | 'failed' | 'skipped' | 'timedOut' | '(new)' | '(removed)'
  after: string;
  beforeDurationMs: number;
  afterDurationMs: number;
  deltaMs: number;
}

export interface PerfDiff {
  metricName: string;
  pageOrEndpoint: string;
  beforeMs: number;
  afterMs: number;
  deltaMs: number;
  deltaPct: number;
}

export interface CompareResult {
  beforeRun: RunRow;
  afterRun: RunRow;
  testDiffs: TestDiff[];
  perfDiffs: PerfDiff[];
  summary: {
    totalBefore: number;
    totalAfter: number;
    newFailures: number;
    resolved: number;
    unchanged: number;
    perfRegressions: number;
    perfImprovements: number;
  };
}

export async function compareRuns(options: CompareOptions): Promise<CompareResult> {
  const config = loadConfig(options.configPath);
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
  }

  const db = await CerberusDB.create(config.storage.db_path);

  try {
    const afterRun = db.getRunByCiId(options.runId);
    if (!afterRun) {
      throw new Error(`Run not found: ${options.runId}`);
    }

    let beforeRun: RunRow;
    if (options.otherRunId) {
      const other = db.getRunByCiId(options.otherRunId);
      if (!other) {
        throw new Error(`Run not found: ${options.otherRunId}`);
      }
      beforeRun = other;
    } else {
      const prev = db.getPreviousRun(afterRun.id);
      if (!prev) {
        throw new Error(
          `No previous run found on branch '${afterRun.branch}' before run ${options.runId}. ` +
            `Use --other-run-id to specify a comparison target.`,
        );
      }
      beforeRun = prev;
    }

    // Get test results for both runs
    const beforeTests = db.getTestResultsForRun(beforeRun.id);
    const afterTests = db.getTestResultsForRun(afterRun.id);

    // Build lookup maps
    const beforeMap = new Map<string, TestResultRow>();
    for (const t of beforeTests) {
      beforeMap.set(t.test_name, t);
    }
    const afterMap = new Map<string, TestResultRow>();
    for (const t of afterTests) {
      afterMap.set(t.test_name, t);
    }

    // Compute test diffs
    const allTestNames = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    const testDiffs: TestDiff[] = [];
    let newFailures = 0;
    let resolved = 0;
    let unchanged = 0;

    for (const name of allTestNames) {
      const before = beforeMap.get(name);
      const after = afterMap.get(name);

      if (!before && after) {
        // New test in after run
        testDiffs.push({
          testName: name,
          filePath: after.file_path,
          before: '(new)',
          after: after.status,
          beforeDurationMs: 0,
          afterDurationMs: after.duration_ms,
          deltaMs: after.duration_ms,
        });
        if (after.status === 'failed' || after.status === 'timedOut') newFailures++;
      } else if (!after) {
        // Removed test
        testDiffs.push({
          testName: name,
          filePath: before.file_path,
          before: before.status,
          after: '(removed)',
          beforeDurationMs: before.duration_ms,
          afterDurationMs: 0,
          deltaMs: -before.duration_ms,
        });
        if (before.status === 'failed' || before.status === 'timedOut') resolved++;
      } else {
        // Test exists in both — only include if status changed or both failed
        const statusChanged = before.status !== after.status;
        const bothFailed =
          (before.status === 'failed' || before.status === 'timedOut') &&
          (after.status === 'failed' || after.status === 'timedOut');

        if (statusChanged || bothFailed) {
          testDiffs.push({
            testName: name,
            filePath: after.file_path,
            before: before.status,
            after: after.status,
            beforeDurationMs: before.duration_ms,
            afterDurationMs: after.duration_ms,
            deltaMs: after.duration_ms - before.duration_ms,
          });

          if (statusChanged) {
            const wasFailing =
              before.status === 'failed' || before.status === 'timedOut';
            const isFailing = after.status === 'failed' || after.status === 'timedOut';
            if (wasFailing && !isFailing) resolved++;
            else if (!wasFailing && isFailing) newFailures++;
          }
        } else {
          unchanged++;
        }
      }
    }

    // Sort: new failures first, then resolved, then changed
    testDiffs.sort((a, b) => {
      const aScore = a.before === '(new)' || a.after === 'failed' || a.after === 'timedOut' ? 0 : 1;
      const bScore = b.before === '(new)' || b.after === 'failed' || b.after === 'timedOut' ? 0 : 1;
      if (aScore !== bScore) return aScore - bScore;
      // Secondary: prefer status changes
      const aChanged = a.before !== a.after ? 0 : 1;
      const bChanged = b.before !== b.after ? 0 : 1;
      return aChanged - bChanged;
    });

    // Compute perf diffs
    const beforePerf = db.getPerfMetricsForRun(beforeRun.id);
    const afterPerf = db.getPerfMetricsForRun(afterRun.id);

    const beforePerfMap = new Map<string, PerfMetricRow[]>();
    for (const m of beforePerf) {
      const existing = beforePerfMap.get(m.metric_name) || [];
      existing.push(m);
      beforePerfMap.set(m.metric_name, existing);
    }

    const perfDiffs: PerfDiff[] = [];
    let perfRegressions = 0;
    let perfImprovements = 0;

    const allMetricNames = new Set([...beforePerfMap.keys(), ...afterPerf.map((m) => m.metric_name)]);
    for (const metricName of allMetricNames) {
      const beforeValues = beforePerfMap.get(metricName);
      const afterValues = afterPerf.filter((m) => m.metric_name === metricName);

      if (!beforeValues || beforeValues.length === 0 || afterValues.length === 0) continue;

      const beforeMs = beforeValues[0].value_ms;
      const afterMs = afterValues[0].value_ms;
      const deltaMs = afterMs - beforeMs;
      const deltaPct = beforeMs > 0 ? (deltaMs / beforeMs) * 100 : 0;

      // Only include if there's a meaningful change (>1%)
      if (Math.abs(deltaPct) > 1) {
        perfDiffs.push({
          metricName,
          pageOrEndpoint: afterValues[0].page_or_endpoint,
          beforeMs,
          afterMs,
          deltaMs,
          deltaPct,
        });

        if (deltaPct > 1) perfRegressions++;
        else if (deltaPct < -1) perfImprovements++;
      }
    }

    // Sort by absolute delta percentage, biggest change first
    perfDiffs.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

    return {
      beforeRun,
      afterRun,
      testDiffs,
      perfDiffs,
      summary: {
        totalBefore: beforeTests.length,
        totalAfter: afterTests.length,
        newFailures,
        resolved,
        unchanged,
        perfRegressions,
        perfImprovements,
      },
    };
  } finally {
    db.close();
  }
}

/**
 * Format compare result as a human-readable table.
 */
export function formatCompareText(result: CompareResult): string {
  const lines: string[] = [];

  lines.push('🐕‍🦺 Cerberus Run Comparison');
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`  BEFORE: ${result.beforeRun.ci_run_id} (${result.beforeRun.commit_sha.substring(0, 7)}) @ ${result.beforeRun.triggered_at}`);
  lines.push(`  AFTER:  ${result.afterRun.ci_run_id} (${result.afterRun.commit_sha.substring(0, 7)}) @ ${result.afterRun.triggered_at}`);
  lines.push('');

  // Summary
  const { summary } = result;
  lines.push('  Summary:');
  lines.push(`    Tests: ${summary.totalBefore} → ${summary.totalAfter}`);

  if (summary.newFailures > 0) {
    lines.push(`    🔴 New failures:     ${summary.newFailures}`);
  }
  if (summary.resolved > 0) {
    lines.push(`    🟢 Resolved:         ${summary.resolved}`);
  }
  lines.push(`    ⚪ Unchanged:        ${summary.unchanged}`);

  if (summary.perfRegressions > 0) {
    lines.push(`    📈 Perf regressions:  ${summary.perfRegressions}`);
  }
  if (summary.perfImprovements > 0) {
    lines.push(`    📉 Perf improved:     ${summary.perfImprovements}`);
  }
  lines.push('');

  // Test diffs
  if (result.testDiffs.length > 0) {
    lines.push('  Test Changes:');
    lines.push('  ' + '─'.repeat(56));

    for (const diff of result.testDiffs) {
      const statusIcon = (s: string) => {
        if (s === 'passed') return '✅';
        if (s === 'failed') return '❌';
        if (s === 'timedOut') return '⏱️';
        if (s === 'skipped') return '⏭️';
        if (s === '(new)') return '🆕';
        if (s === '(removed)') return '🗑️';
        return '❓';
      };

      const deltaStr =
        diff.deltaMs !== 0
          ? ` (${diff.deltaMs > 0 ? '+' : ''}${diff.deltaMs}ms)`
          : '';

      if (diff.before === '(new)') {
        lines.push(`    🆕 ${diff.testName} — ${statusIcon(diff.after)} ${diff.after}${deltaStr}`);
      } else if (diff.after === '(removed)') {
        lines.push(`    🗑️  ${diff.testName} — ${statusIcon(diff.before)} ${diff.before} → removed`);
      } else if (diff.before !== diff.after) {
        lines.push(
          `    ${statusIcon(diff.before)} → ${statusIcon(diff.after)} ${diff.testName} — ${diff.before} → ${diff.after}${deltaStr}`,
        );
      } else {
        // Same status but both failed — show duration change
        lines.push(
          `    ${statusIcon(diff.before)} ${diff.testName} — ${diff.before}${deltaStr}`,
        );
      }
    }
    lines.push('');
  } else {
    lines.push('  No test changes detected.');
    lines.push('');
  }

  // Perf diffs
  if (result.perfDiffs.length > 0) {
    lines.push('  Performance Changes:');
    lines.push('  ' + '─'.repeat(56));

    for (const diff of result.perfDiffs) {
      const icon = diff.deltaPct > 5 ? '🔴' : diff.deltaPct > 1 ? '🟡' : '🟢';
      const sign = diff.deltaPct > 0 ? '+' : '';
      lines.push(
        `    ${icon} ${diff.metricName}: ${diff.beforeMs.toFixed(0)}ms → ${diff.afterMs.toFixed(0)}ms (${sign}${diff.deltaPct.toFixed(1)}%)`,
      );
    }
    lines.push('');
  }

  // Gate verdict
  const hasNewFailures = summary.newFailures > 0;
  const hasPerfRegressions = summary.perfRegressions > 0;

  if (hasNewFailures || hasPerfRegressions) {
    lines.push('  ❌ Comparison shows regressions.');
  } else if (summary.resolved > 0 || summary.perfImprovements > 0) {
    lines.push('  ✅ Comparison shows improvements.');
  } else {
    lines.push('  ✅ No significant changes detected.');
  }
  lines.push('');

  return lines.join('\n');
}
