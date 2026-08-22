/**
 * GitHub Actions Annotations — generate ::error/::warning commands
 * so failures appear inline on the PR Files tab.
 *
 * Format: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-a-warning-message
 *
 *   ::error file={name},line={line},col={col}::{message}
 *   ::warning file={name},line={line},col={col}::{message}
 *   ::notice file={name},line={line},col={col}::{message}
 */

import { CerberusDB } from '../storage/index.js';
import type { CerberusConfig } from '../config/schema.js';
import { checkPerfRegressions } from '../perf/index.js';

export interface Annotation {
  level: 'error' | 'warning' | 'notice';
  file: string;
  message: string;
}

/**
 * Generate all annotations for a run.
 *
 * - Regressions → error
 * - Flaky tests → warning
 * - Unknown verdicts → warning
 * - Performance regressions → error
 * - Insufficient perf history → notice
 */
export async function generateAnnotations(
  runId: string,
  config: CerberusConfig,
): Promise<Annotation[]> {
  const db = await CerberusDB.create(config.storage.db_path);

  try {
    const run = db.getRunByCiId(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const classifications = db.getClassificationsForRun(run.id);
    const testResults = db.getTestResultsForRun(run.id);
    const annotations: Annotation[] = [];

    // Build test result lookup by id
    const testMap = new Map<number, (typeof testResults)[0]>();
    for (const t of testResults) {
      testMap.set(t.id, t);
    }

    // Generate annotations from classifications
    for (const c of classifications) {
      const test = testMap.get(c.test_result_id);
      if (!test) continue;

      const file = test.file_path;
      const testName = test.test_name;

      switch (c.verdict) {
        case 'regression':
          annotations.push({
            level: 'error',
            file,
            message: `Cerberus: REGRESSION in ${testName} — ${c.reasoning}`,
          });
          break;

        case 'flaky':
          annotations.push({
            level: 'warning',
            file,
            message: `Cerberus: FLAKY test ${testName} — ${c.reasoning}`,
          });
          break;

        case 'unknown':
          annotations.push({
            level: 'warning',
            file,
            message: `Cerberus: UNKNOWN verdict for ${testName} — ${c.reasoning}`,
          });
          break;
      }
    }

    // Generate annotations from performance regressions
    if (config.gate.fail_on_perf_regression) {
      const perfMetrics = db.getPerfMetricsForRun(run.id);
      if (perfMetrics.length > 0) {
        const perfResult = checkPerfRegressions(perfMetrics, db, config);

        for (const reg of perfResult.regressions) {
          annotations.push({
            level: 'error',
            file: 'performance',
            message: `Cerberus: PERF REGRESSION — ${reg.metricName}: ${reg.currentValue.toFixed(0)}ms vs baseline ${reg.baselineMedian.toFixed(0)}ms (+${reg.deltaPct.toFixed(1)}%, threshold: ${reg.thresholdPct}%)`,
          });
        }

        for (const metric of perfResult.insufficientHistory) {
          annotations.push({
            level: 'notice',
            file: 'performance',
            message: `Cerberus: Insufficient baseline history for ${metric} — cannot evaluate performance`,
          });
        }
      }
    }

    return annotations;
  } finally {
    db.close();
  }
}

/**
 * Format annotations as GitHub Actions workflow commands.
 *
 * Each line is one command, ready to print to stdout.
 * Lines that contain special characters are escaped automatically.
 */
export function formatAnnotationCommands(annotations: Annotation[]): string[] {
  return annotations.map((a) => {
    // Escape colons and percent signs in the message (GH Actions requirement)
    const escapedMessage = a.message.replace(/%/g, '%25').replace(/:/g, '%3A');
    const fileParam = a.file ? `file=${a.file}` : '';
    return `::${a.level} ${fileParam}::${escapedMessage}`;
  });
}

/**
 * Format annotations as a human-readable summary for non-GH-Actions environments.
 */
export function formatAnnotationSummary(annotations: Annotation[]): string {
  if (annotations.length === 0) return '';

  const errors = annotations.filter((a) => a.level === 'error');
  const warnings = annotations.filter((a) => a.level === 'warning');
  const notices = annotations.filter((a) => a.level === 'notice');

  const lines: string[] = [];
  lines.push('📋 GitHub Actions Annotations:');
  lines.push('');

  for (const a of annotations) {
    const icon = a.level === 'error' ? '❌' : a.level === 'warning' ? '⚠️' : 'ℹ️';
    lines.push(`  ${icon} [${a.file}] ${a.message}`);
  }

  lines.push('');
  lines.push(
    `  ${errors.length} error(s), ${warnings.length} warning(s), ${notices.length} notice(s)`,
  );

  return lines.join('\n');
}
