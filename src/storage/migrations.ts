/**
 * Database migration system — ensures schema stays up to date across versions.
 * Each migration is a named SQL statement that runs in order.
 */

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * All migrations in order. New migrations are appended at the end.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ci_run_id TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        branch TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        pr_number INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES runs(id),
        test_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('passed','failed','skipped','timedOut')),
        duration_ms INTEGER NOT NULL,
        error_message TEXT,
        stack_trace TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS perf_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES runs(id),
        metric_name TEXT NOT NULL,
        value_ms REAL NOT NULL,
        page_or_endpoint TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS classifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_result_id INTEGER NOT NULL REFERENCES test_results(id),
        error_signature TEXT NOT NULL,
        verdict TEXT NOT NULL CHECK(verdict IN ('flaky','regression','unknown')),
        confidence REAL NOT NULL,
        reasoning TEXT NOT NULL,
        classified_by TEXT NOT NULL CHECK(classified_by IN ('rules','cache','ai','mock')),
        ai_provider TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS config_snapshots (
        run_id INTEGER PRIMARY KEY REFERENCES runs(id),
        config_json TEXT NOT NULL
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_name ON test_results(test_name);
      CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);
      CREATE INDEX IF NOT EXISTS idx_perf_metrics_run_id ON perf_metrics(run_id);
      CREATE INDEX IF NOT EXISTS idx_perf_metrics_name ON perf_metrics(metric_name);
      CREATE INDEX IF NOT EXISTS idx_classifications_test_result ON classifications(test_result_id);
      CREATE INDEX IF NOT EXISTS idx_classifications_signature ON classifications(error_signature);
      CREATE INDEX IF NOT EXISTS idx_runs_branch ON runs(branch);
      CREATE INDEX IF NOT EXISTS idx_runs_ci_id ON runs(ci_run_id);
    `,
  },
  {
    version: 2,
    name: 'baseline-runs',
    sql: `
      CREATE TABLE IF NOT EXISTS baseline_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL UNIQUE REFERENCES runs(id),
        label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
];

/**
 * Get the current schema version from the database.
 * Returns 0 if no migrations have been applied.
 */
export function getCurrentVersion(db: { exec: (sql: string) => unknown[] }): number {
  // Check if schema_migrations table exists
  const tables = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
  ) as Array<{ values: unknown[][] }>;

  if (!tables[0] || tables[0].values.length === 0) {
    return 0;
  }

  const result = db.exec('SELECT MAX(version) FROM schema_migrations') as Array<{ values: unknown[][] }>;
  return (result[0]?.values[0]?.[0] as number) || 0;
}

/**
 * Apply pending migrations to bring the database up to date.
 * Returns the number of migrations applied.
 */
export function applyMigrations(db: { exec: (sql: string) => unknown[] }): number {
  const currentVersion = getCurrentVersion(db);
  let applied = 0;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      db.exec(migration.sql);
      db.exec(
        `INSERT INTO schema_migrations (version, name) VALUES (${migration.version}, '${migration.name}')`,
      );
      applied++;
    }
  }

  return applied;
}
