/**
 * Tests for report markdown generation — verifies the structure and content
 * of the quality report that gets posted as a PR comment.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/database.js';
import { generateReport } from '../../src/report/index.js';
import { DEFAULT_CONFIG } from '../../src/config/schema.js';
import type { CerberusConfig } from '../../src/config/schema.js';

describe('Report Markdown Generation', () => {
  let tmpDir: string;
  let dbPath: string;
  let config: CerberusConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-report-'));
    dbPath = path.join(tmpDir, 'data.db');
    config = {
      ...DEFAULT_CONFIG,
      ai: { ...DEFAULT_CONFIG.ai, provider: 'mock' },
      storage: { db_path: dbPath },
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function setupRun(classifications: Array<{ name: string; verdict: 'flaky' | 'regression' | 'unknown' }>) {
    const db = await CerberusDB.create(dbPath);
    const runId = db.createRun({
      ci_run_id: 'report-test',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
      pr_number: 1,
    });

    for (let i = 0; i < classifications.length; i++) {
      const testId = db.insertTestResult({
        run_id: runId,
        test_name: classifications[i].name,
        file_path: classifications[i].name,
        status: 'failed',
        duration_ms: 100,
        error_message: `Error ${i}`,
      });

      db.insertClassification({
        test_result_id: testId,
        error_signature: `sig-${i}`,
        verdict: classifications[i].verdict,
        confidence: 0.8,
        reasoning: `Test ${i}`,
        classified_by: 'rules',
      });
    }

    db.save();
    db.close();
  }

  it('generates report with PASS gate when no regressions', async () => {
    await setupRun([
      { name: 'a.spec.ts:1', verdict: 'flaky' },
      { name: 'b.spec.ts:1', verdict: 'flaky' },
    ]);

    const result = await generateReport({
      runId: 'report-test',
      prNumber: 1,
      repo: 'test/repo',
      config,
    });

    expect(result.markdown).toContain('✅ PASSED');
    expect(result.markdown).toContain('2 flaky');
    expect(result.markdown).toContain('0 regressions');
    expect(result.posted).toBe(false);
  });

  it('generates report with FAIL gate when regressions exist', async () => {
    await setupRun([
      { name: 'a.spec.ts:1', verdict: 'regression' },
    ]);

    const result = await generateReport({
      runId: 'report-test',
      prNumber: 1,
      repo: 'test/repo',
      config,
    });

    expect(result.markdown).toContain('❌ FAILED');
    expect(result.markdown).toContain('1 regression');
  });

  it('includes cerberus comment marker for deduplication', async () => {
    await setupRun([{ name: 'x.spec.ts:1', verdict: 'flaky' }]);

    const result = await generateReport({
      runId: 'report-test',
      prNumber: 1,
      repo: 'test/repo',
      config,
    });

    // Should contain the marker at both start and end
    const markers = result.markdown.split('<!-- cerberus-quality-gate -->');
    expect(markers.length).toBe(3); // before, between, after
  });

  it('includes provider attribution', async () => {
    await setupRun([{ name: 'x.spec.ts:1', verdict: 'flaky' }]);

    const result = await generateReport({
      runId: 'report-test',
      prNumber: 1,
      repo: 'test/repo',
      config,
    });

    expect(result.markdown).toContain('Classified using:');
  });

  it('includes AI Analysis section', async () => {
    await setupRun([{ name: 'x.spec.ts:1', verdict: 'flaky' }]);

    const result = await generateReport({
      runId: 'report-test',
      prNumber: 1,
      repo: 'test/repo',
      config,
    });

    expect(result.markdown).toContain('AI Analysis');
    expect(result.markdown).toContain('<details>');
  });

  it('reports no issues when all tests pass', async () => {
    const db = await CerberusDB.create(dbPath);
    db.createRun({
      ci_run_id: 'clean-run',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
      pr_number: 1,
    });
    db.save();
    db.close();

    const result = await generateReport({
      runId: 'clean-run',
      prNumber: 1,
      repo: 'test/repo',
      config,
    });

    expect(result.markdown).toContain('✅ PASSED');
    expect(result.markdown).toContain('0 flaky');
    expect(result.markdown).toContain('0 regressions');
  });

  it('handles unknown verdicts in report', async () => {
    await setupRun([
      { name: 'unknown.spec.ts:1', verdict: 'unknown' },
    ]);

    const result = await generateReport({
      runId: 'report-test',
      prNumber: 1,
      repo: 'test/repo',
      config,
    });

    expect(result.markdown).toContain('1');
    expect(result.markdown).toContain('unknown');
  });

  it('throws on non-existent run', async () => {
    await expect(
      generateReport({
        runId: 'nonexistent',
        prNumber: 1,
        repo: 'test/repo',
        config,
      }),
    ).rejects.toThrow('Run not found');
  });
});
