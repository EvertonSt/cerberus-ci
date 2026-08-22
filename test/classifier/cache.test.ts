/**
 * Tests for error signature normalization and verdict cache behavior.
 * These prove the cache actually works to avoid redundant AI calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/database.js';
import { classifyRun } from '../../src/classifier/index.js';
import { DEFAULT_CONFIG } from '../../src/config/schema.js';
import type { CerberusConfig } from '../../src/config/schema.js';

describe('Error Signature & Verdict Cache', () => {
  let tmpDir: string;
  let dbPath: string;
  let config: CerberusConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-cache-'));
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

  it('same error in two runs uses cache on second run', async () => {
    // First run — classify the error (AI/mock will classify it)
    const db1 = await CerberusDB.create(dbPath);
    const runId1 = db1.createRun({
      ci_run_id: 'cache-test-1',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });
    db1.insertTestResult({
      run_id: runId1,
      test_name: 'cached.spec.ts:1',
      file_path: 'cached.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'ECONNRESET: connection reset by peer',
    });
    db1.save();
    db1.close();

    const result1 = await classifyRun('cache-test-1', config);
    expect(result1.total).toBe(1);

    // Verify AI/mock was used (not cache)
    const db2 = await CerberusDB.create(dbPath);
    const run1 = db2.getRunByCiId('cache-test-1')!;
    const class1 = db2.getClassificationsForRun(run1.id);
    expect(class1[0].classified_by).not.toBe('cache');
    db2.close();

    // Second run — same test, same error
    const db3 = await CerberusDB.create(dbPath);
    const runId2 = db3.createRun({
      ci_run_id: 'cache-test-2',
      commit_sha: 'sha2',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });
    db3.insertTestResult({
      run_id: runId2,
      test_name: 'cached.spec.ts:1',
      file_path: 'cached.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'ECONNRESET: connection reset by peer',
    });
    db3.save();
    db3.close();

    const result2 = await classifyRun('cache-test-2', config);
    expect(result2.total).toBe(1);

    // Verify cache was used
    const db4 = await CerberusDB.create(dbPath);
    const run2 = db4.getRunByCiId('cache-test-2')!;
    const class2 = db4.getClassificationsForRun(run2.id);
    expect(class2[0].classified_by).toBe('cache');
    db4.close();
  });

  it('different error messages produce different signatures', async () => {
    const db = await CerberusDB.create(dbPath);

    const runId1 = db.createRun({
      ci_run_id: 'diff-1',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });
    db.insertTestResult({
      run_id: runId1,
      test_name: 'test.spec.ts:1',
      file_path: 'test.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'Expected 5 to equal 10',
    });

    const runId2 = db.createRun({
      ci_run_id: 'diff-2',
      commit_sha: 'sha2',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });
    db.insertTestResult({
      run_id: runId2,
      test_name: 'test.spec.ts:1',
      file_path: 'test.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'Expected 5 to equal 20',
    });

    db.save();
    db.close();

    // Classify both runs
    await classifyRun('diff-1', config);
    await classifyRun('diff-2', config);

    // The two runs should have different signatures
    const db2 = await CerberusDB.create(dbPath);
    const r1 = db2.getRunByCiId('diff-1')!;
    const r2 = db2.getRunByCiId('diff-2')!;
    const c1 = db2.getClassificationsForRun(r1.id);
    const c2 = db2.getClassificationsForRun(r2.id);

    expect(c1[0].error_signature).not.toBe(c2[0].error_signature);
    db2.close();
  });

  it('same error with different line numbers produces same signature', async () => {
    const db = await CerberusDB.create(dbPath);

    const runId1 = db.createRun({
      ci_run_id: 'line-1',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });
    db.insertTestResult({
      run_id: runId1,
      test_name: 'test.spec.ts:1',
      file_path: 'test.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'AssertionError',
      stack_trace: 'at checkout.spec.ts:42:10\nat runner.ts:100:5',
    });

    const runId2 = db.createRun({
      ci_run_id: 'line-2',
      commit_sha: 'sha2',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });
    db.insertTestResult({
      run_id: runId2,
      test_name: 'test.spec.ts:1',
      file_path: 'test.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'AssertionError',
      stack_trace: 'at checkout.spec.ts:58:3\nat runner.ts:100:5',
    });

    db.save();
    db.close();

    await classifyRun('line-1', config);
    await classifyRun('line-2', config);

    const db2 = await CerberusDB.create(dbPath);
    const r1 = db2.getRunByCiId('line-1')!;
    const r2 = db2.getRunByCiId('line-2')!;
    const c1 = db2.getClassificationsForRun(r1.id);
    const c2 = db2.getClassificationsForRun(r2.id);

    // Same error with different line numbers should produce same signature
    expect(c1[0].error_signature).toBe(c2[0].error_signature);
    db2.close();
  });

  it('cache respects TTL (expired cache is not used)', async () => {
    const configShortTTL = {
      ...config,
      classifier: { ...config.classifier, cache_ttl_days: 1 }, // 1 day TTL
    };

    // First run — classify normally
    const db1 = await CerberusDB.create(dbPath);
    const runId1 = db1.createRun({
      ci_run_id: 'ttl-1',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });
    db1.insertTestResult({
      run_id: runId1,
      test_name: 'ttl.spec.ts:1',
      file_path: 'ttl.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'Something failed',
    });
    db1.save();
    db1.close();

    await classifyRun('ttl-1', configShortTTL);

    // Backdate the classification's created_at to 10 days ago
    // so it will be expired by the 1-day TTL
    const dbBackdate = await CerberusDB.create(dbPath);
    dbBackdate.getDb().run(
      `UPDATE classifications SET created_at = datetime('now', '-10 days') WHERE id = (SELECT c.id FROM classifications c JOIN test_results tr ON tr.id = c.test_result_id WHERE tr.test_name = 'ttl.spec.ts:1' LIMIT 1)`
    );
    dbBackdate.save();
    dbBackdate.close();

    // Second run with same error — cache should be expired
    const db2 = await CerberusDB.create(dbPath);
    const runId2 = db2.createRun({
      ci_run_id: 'ttl-2',
      commit_sha: 'sha2',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });
    db2.insertTestResult({
      run_id: runId2,
      test_name: 'ttl.spec.ts:1',
      file_path: 'ttl.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'Something failed',
    });
    db2.save();
    db2.close();

    await classifyRun('ttl-2', configShortTTL);

    // With expired cache, AI/mock should classify again (not cache)
    const db3 = await CerberusDB.create(dbPath);
    const run2 = db3.getRunByCiId('ttl-2')!;
    const class2 = db3.getClassificationsForRun(run2.id);
    expect(class2[0].classified_by).not.toBe('cache');
    db3.close();
  });

  it('different test names with same error get separate cache entries', async () => {
    const db = await CerberusDB.create(dbPath);

    const runId = db.createRun({
      ci_run_id: 'sep-cache-1',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    // Same error message, different test names
    db.insertTestResult({
      run_id: runId,
      test_name: 'testA.spec.ts:1',
      file_path: 'testA.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'Network error',
    });
    db.insertTestResult({
      run_id: runId,
      test_name: 'testB.spec.ts:1',
      file_path: 'testB.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'Network error',
    });

    db.save();
    db.close();

    await classifyRun('sep-cache-1', config);

    // Check that each test got its own classification
    const db2 = await CerberusDB.create(dbPath);
    const run = db2.getRunByCiId('sep-cache-1')!;
    const classes = db2.getClassificationsForRun(run.id);
    expect(classes.length).toBe(2);

    // Same error signature (same error message)
    expect(classes[0].error_signature).toBe(classes[1].error_signature);
    db2.close();
  });
});
