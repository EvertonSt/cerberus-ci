/**
 * SQLite storage layer using sql.js (pure JS, no native build needed).
 * Handles database initialization, migrations, and CRUD operations.
 */

import initSqlJs, { type Database } from 'sql.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyMigrations } from './migrations.js';

export interface RunRow {
  id: number;
  ci_run_id: string;
  commit_sha: string;
  branch: string;
  triggered_at: string;
  pr_number: number | null;
  created_at: string;
}

export interface TestResultRow {
  id: number;
  run_id: number;
  test_name: string;
  file_path: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration_ms: number;
  error_message: string | null;
  stack_trace: string | null;
  retry_count: number;
}

export interface PerfMetricRow {
  id: number;
  run_id: number;
  metric_name: string;
  value_ms: number;
  page_or_endpoint: string;
}

export interface ClassificationRow {
  id: number;
  test_result_id: number;
  error_signature: string;
  verdict: 'flaky' | 'regression' | 'unknown';
  confidence: number;
  reasoning: string;
  classified_by: 'rules' | 'cache' | 'ai' | 'mock';
  ai_provider: string | null;
  created_at: string;
}

export interface ConfigSnapshotRow {
  run_id: number;
  config_json: string;
}

export class CerberusDB {
  private _db: Database;
  private dbPath: string;

  private constructor(db: Database, dbPath: string) {
    this._db = db;
    this.dbPath = dbPath;
  }

  static async create(dbPath: string): Promise<CerberusDB> {
    const SQL = await initSqlJs();

    // Ensure the directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let db: Database;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    // Apply migrations
    applyMigrations(db);

    return new CerberusDB(db, dbPath);
  }

  /** Access the raw sql.js database for advanced queries (testing only). */
  getDb(): Database {
    return this._db;
  }

  save(): void {
    const data = this._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  close(): void {
    this.save();
    this._db.close();
  }

  // ── Runs ──────────────────────────────────────────────────

  createRun(params: {
    ci_run_id: string;
    commit_sha: string;
    branch: string;
    triggered_at: string;
    pr_number?: number;
  }): number {
    this._db.run(
      'INSERT INTO runs (ci_run_id, commit_sha, branch, triggered_at, pr_number) VALUES (?, ?, ?, ?, ?)',
      [params.ci_run_id, params.commit_sha, params.branch, params.triggered_at, params.pr_number ?? null],
    );
    return this._db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number;
  }

  getRun(id: number): RunRow | null {
    const result = this._db.exec('SELECT * FROM runs WHERE id = ?', [id]);
    if (!result[0] || result[0].values.length === 0) return null;
    return this.rowToRun(result[0].values[0], result[0].columns);
  }

  getRunByCiId(ciRunId: string): RunRow | null {
    const result = this._db.exec('SELECT * FROM runs WHERE ci_run_id = ?', [ciRunId]);
    if (!result[0] || result[0].values.length === 0) return null;
    return this.rowToRun(result[0].values[0], result[0].columns);
  }

  private rowToRun(values: unknown[], columns: string[]): RunRow {
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row as unknown as RunRow;
  }

  // ── Test Results ──────────────────────────────────────────

  insertTestResult(params: {
    run_id: number;
    test_name: string;
    file_path: string;
    status: 'passed' | 'failed' | 'skipped' | 'timedOut';
    duration_ms: number;
    error_message?: string | null;
    stack_trace?: string | null;
    retry_count?: number;
  }): number {
    this._db.run(
      `INSERT INTO test_results (run_id, test_name, file_path, status, duration_ms, error_message, stack_trace, retry_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.run_id,
        params.test_name,
        params.file_path,
        params.status,
        params.duration_ms,
        params.error_message ?? null,
        params.stack_trace ?? null,
        params.retry_count ?? 0,
      ],
    );
    return this._db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number;
  }

  getTestResultsForRun(runId: number): TestResultRow[] {
    const result = this._db.exec('SELECT * FROM test_results WHERE run_id = ?', [runId]);
    if (!result[0]) return [];
    return result[0].values.map((vals) => this.rowToTestResult(vals, result[0].columns));
  }

  getFailedTestResultsForRun(runId: number): TestResultRow[] {
    const result = this._db.exec(
      "SELECT * FROM test_results WHERE run_id = ? AND status IN ('failed', 'timedOut')",
      [runId],
    );
    if (!result[0]) return [];
    return result[0].values.map((vals) => this.rowToTestResult(vals, result[0].columns));
  }

  private rowToTestResult(values: unknown[], columns: string[]): TestResultRow {
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row as unknown as TestResultRow;
  }

  // ── Performance Metrics ───────────────────────────────────

  insertPerfMetric(params: {
    run_id: number;
    metric_name: string;
    value_ms: number;
    page_or_endpoint: string;
  }): number {
    this._db.run(
      'INSERT INTO perf_metrics (run_id, metric_name, value_ms, page_or_endpoint) VALUES (?, ?, ?, ?)',
      [params.run_id, params.metric_name, params.value_ms, params.page_or_endpoint],
    );
    return this._db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number;
  }

  getPerfMetricsForRun(runId: number): PerfMetricRow[] {
    const result = this._db.exec('SELECT * FROM perf_metrics WHERE run_id = ?', [runId]);
    if (!result[0]) return [];
    return result[0].values.map((vals) => this.rowToPerfMetric(vals, result[0].columns));
  }

  getBaselinePerfMetrics(metricName: string, branch: string, limit: number): PerfMetricRow[] {
    const result = this._db.exec(
      `SELECT pm.* FROM perf_metrics pm
       JOIN runs r ON r.id = pm.run_id
       WHERE pm.metric_name = ? AND r.branch = ?
       ORDER BY r.triggered_at DESC
       LIMIT ?`,
      [metricName, branch, limit],
    );
    if (!result[0]) return [];
    return result[0].values.map((vals) => this.rowToPerfMetric(vals, result[0].columns));
  }

  private rowToPerfMetric(values: unknown[], columns: string[]): PerfMetricRow {
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row as unknown as PerfMetricRow;
  }

  // ── Classifications ───────────────────────────────────────

  insertClassification(params: {
    test_result_id: number;
    error_signature: string;
    verdict: 'flaky' | 'regression' | 'unknown';
    confidence: number;
    reasoning: string;
    classified_by: 'rules' | 'cache' | 'ai' | 'mock';
    ai_provider?: string | null;
  }): number {
    this._db.run(
      `INSERT INTO classifications (test_result_id, error_signature, verdict, confidence, reasoning, classified_by, ai_provider)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.test_result_id,
        params.error_signature,
        params.verdict,
        params.confidence,
        params.reasoning,
        params.classified_by,
        params.ai_provider ?? null,
      ],
    );
    return this._db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number;
  }

  getCachedClassification(
    testName: string,
    errorSignature: string,
    ttlDays: number,
  ): ClassificationRow | null {
    const result = this._db.exec(
      `SELECT c.* FROM classifications c
       JOIN test_results tr ON tr.id = c.test_result_id
       WHERE tr.test_name = ? AND c.error_signature = ?
         AND c.created_at >= datetime('now', ?)
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [testName, errorSignature, `-${ttlDays} days`],
    );
    if (!result[0] || result[0].values.length === 0) return null;
    return this.rowToClassification(result[0].values[0], result[0].columns);
  }

  getClassificationsForRun(runId: number): ClassificationRow[] {
    const result = this._db.exec(
      `SELECT c.* FROM classifications c
       JOIN test_results tr ON tr.id = c.test_result_id
       WHERE tr.run_id = ?`,
      [runId],
    );
    if (!result[0]) return [];
    return result[0].values.map((vals) => this.rowToClassification(vals, result[0].columns));
  }

  private rowToClassification(values: unknown[], columns: string[]): ClassificationRow {
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row as unknown as ClassificationRow;
  }

  // ── Config Snapshots ──────────────────────────────────────

  saveConfigSnapshot(runId: number, configJson: string): void {
    this._db.run(
      'INSERT OR REPLACE INTO config_snapshots (run_id, config_json) VALUES (?, ?)',
      [runId, configJson],
    );
  }

  // ── History Queries ───────────────────────────────────────

  /**
   * Get pass/fail history pattern for a test on a branch (newest→oldest).
   * Returns a string like "PPPFPFP" where P=pass, F=fail.
   */
  getTestHistoryPattern(testName: string, branch: string, depth: number): string {
    const result = this._db.exec(
      `SELECT tr.status FROM test_results tr
       JOIN runs r ON r.id = tr.run_id
       WHERE tr.test_name = ? AND r.branch = ?
       ORDER BY r.triggered_at DESC
       LIMIT ?`,
      [testName, branch, depth],
    );
    if (!result[0]) return '';
    return result[0].values
      .map((vals) => {
        const status = vals[0] as string;
        return status === 'passed' ? 'P' : 'F';
      })
      .join('');
  }

  /**
   * Get the last N runs for a branch (ordered newest first).
   */
  getRecentRuns(branch: string, limit: number): RunRow[] {
    const result = this._db.exec(
      'SELECT * FROM runs WHERE branch = ? ORDER BY triggered_at DESC LIMIT ?',
      [branch, limit],
    );
    if (!result[0]) return [];
    return result[0].values.map((vals) => this.rowToRun(vals, result[0].columns));
  }

  /**
   * Get a previous run for the same branch as a given run.
   */
  getPreviousRun(runId: number): RunRow | null {
    const currentRun = this.getRun(runId);
    if (!currentRun) return null;

    const result = this._db.exec(
      `SELECT * FROM runs WHERE branch = ? AND triggered_at < ?
       ORDER BY triggered_at DESC LIMIT 1`,
      [currentRun.branch, currentRun.triggered_at],
    );
    if (!result[0] || result[0].values.length === 0) return null;
    return this.rowToRun(result[0].values[0], result[0].columns);
  }

  // ── Baselines ──────────────────────────────────────────

  /** Mark a run as a performance baseline. */
  setBaseline(runId: number, label?: string): number {
    this._db.run(
      'INSERT OR REPLACE INTO baseline_runs (run_id, label) VALUES (?, ?)',
      [runId, label ?? null],
    );
    return this._db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number;
  }

  /** Remove a run from baselines. */
  clearBaseline(runId: number): void {
    this._db.run('DELETE FROM baseline_runs WHERE run_id = ?', [runId]);
  }

  /** Clear all baselines. */
  clearAllBaselines(): void {
    this._db.run('DELETE FROM baseline_runs');
  }

  /** Check if a metric has manual baseline data. */
  hasManualBaselineForMetric(metricName: string): boolean {
    const result = this._db.exec(
      `SELECT 1 FROM perf_metrics pm
       JOIN baseline_runs br ON br.run_id = pm.run_id
       WHERE pm.metric_name = ?
       LIMIT 1`,
      [metricName],
    );
    return !!(result[0] && result[0].values.length > 0);
  }

  /** Check if a run is a baseline. */
  isBaseline(runId: number): boolean {
    const result = this._db.exec('SELECT 1 FROM baseline_runs WHERE run_id = ?', [runId]);
    return !!(result[0] && result[0].values.length > 0);
  }

  /** Get all baseline runs with their details. */
  getBaselineRuns(): Array<{ run: RunRow; label: string | null; created_at: string }> {
    const result = this._db.exec(
      `SELECT r.*, br.label, br.created_at as baseline_created_at
       FROM baseline_runs br
       JOIN runs r ON r.id = br.run_id
       ORDER BY br.created_at DESC`,
    );
    if (!result[0]) return [];
    return result[0].values.map((vals) => {
      const run = this.rowToRun(vals, result[0].columns);
      // Find label and created_at from the columns
      const cols = result[0].columns;
      const labelIdx = cols.indexOf('label');
      const baselineIdx = cols.indexOf('baseline_created_at');
      return {
        run,
        label: labelIdx >= 0 ? (vals[labelIdx] as string) : null,
        created_at: baselineIdx >= 0 ? (vals[baselineIdx] as string) : '',
      };
    });
  }

  /**
   * Get perf metrics from baseline runs for a metric name.
   * If manual baselines exist, use only those.
   * Otherwise, fall back to recent runs on the given branch.
   */
  getBaselineMetrics(metricName: string, fallbackBranch: string, limit: number): PerfMetricRow[] {
    // First check for manually-set baselines
    const baselineResult = this._db.exec(
      `SELECT pm.* FROM perf_metrics pm
       JOIN baseline_runs br ON br.run_id = pm.run_id
       WHERE pm.metric_name = ?
       ORDER BY pm.id`,
      [metricName],
    );

    if (baselineResult[0] && baselineResult[0].values.length > 0) {
      return baselineResult[0].values.map((vals) =>
        this.rowToPerfMetric(vals, baselineResult[0].columns),
      );
    }

    // Fall back to recent runs on the fallback branch
    return this.getBaselinePerfMetrics(metricName, fallbackBranch, limit);
  }
}
