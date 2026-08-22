/**
 * cerberus history — view pass/fail trends for a specific test over time.
 */

import { loadConfig, validateConfig } from '../config/schema.js';
import { CerberusDB } from '../storage/database.js';

export interface HistoryOptions {
  testName: string;
  branch?: string;
  depth: number;
  configPath: string;
  json: boolean;
}

export interface HistoryEntry {
  runId: string;
  commitSha: string;
  status: string;
  durationMs: number;
  timestamp: string;
}

export interface HistoryResult {
  testName: string;
  branch: string;
  pattern: string;
  entries: HistoryEntry[];
  flakyScore: number; // 0-1, how flaky is this test?
}

export async function getTestHistory(options: HistoryOptions): Promise<HistoryResult> {
  const config = loadConfig(options.configPath);
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
  }

  const db = await CerberusDB.create(config.storage.db_path);

  try {
    const branch = options.branch || 'main';
    const pattern = db.getTestHistoryPattern(options.testName, branch, options.depth);

    // Get detailed entries
    const result = db.getDb().exec(
      `SELECT r.ci_run_id, r.commit_sha, tr.status, tr.duration_ms, r.triggered_at
       FROM test_results tr
       JOIN runs r ON r.id = tr.run_id
       WHERE tr.test_name = ? AND r.branch = ?
       ORDER BY r.triggered_at DESC
       LIMIT ?`,
      [options.testName, branch, options.depth],
    );

    const entries: HistoryEntry[] = [];
    if (result[0]) {
      for (const vals of result[0].values) {
        entries.push({
          runId: vals[0] as string,
          commitSha: (vals[1] as string).substring(0, 7),
          status: vals[2] as string,
          durationMs: vals[3] as number,
          timestamp: vals[4] as string,
        });
      }
    }

    // Compute flaky score: ratio of state changes in the pattern
    let stateChanges = 0;
    for (let i = 1; i < pattern.length; i++) {
      if (pattern[i] !== pattern[i - 1]) stateChanges++;
    }
    const flakyScore = pattern.length > 1 ? stateChanges / (pattern.length - 1) : 0;

    return {
      testName: options.testName,
      branch,
      pattern,
      entries,
      flakyScore,
    };
  } finally {
    db.close();
  }
}
