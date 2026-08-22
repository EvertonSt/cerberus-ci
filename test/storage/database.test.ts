import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/database.js';

describe('CerberusDB', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-db-test-'));
    dbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new database with schema', async () => {
    const db = await CerberusDB.create(dbPath);
    db.save(); // Save to write to disk
    expect(fs.existsSync(dbPath)).toBe(true);
    db.close();
  });

  it('creates and retrieves a run', async () => {
    const db = await CerberusDB.create(dbPath);
    try {
      const runId = db.createRun({
        ci_run_id: '12345',
        commit_sha: 'abc123',
        branch: 'main',
        triggered_at: '2025-01-01T00:00:00Z',
        pr_number: 42,
      });

      expect(runId).toBeGreaterThan(0);

      const run = db.getRun(runId);
      expect(run).not.toBeNull();
      expect(run!.ci_run_id).toBe('12345');
      expect(run!.commit_sha).toBe('abc123');
      expect(run!.branch).toBe('main');
      expect(run!.pr_number).toBe(42);
    } finally {
      db.close();
    }
  });

  it('finds run by CI run ID', async () => {
    const db = await CerberusDB.create(dbPath);
    try {
      db.createRun({
        ci_run_id: 'ci-999',
        commit_sha: 'def456',
        branch: 'feature',
        triggered_at: '2025-01-01T00:00:00Z',
      });

      const run = db.getRunByCiId('ci-999');
      expect(run).not.toBeNull();
      expect(run!.commit_sha).toBe('def456');
    } finally {
      db.close();
    }
  });

  it('inserts and retrieves test results', async () => {
    const db = await CerberusDB.create(dbPath);
    try {
      const runId = db.createRun({
        ci_run_id: '100',
        commit_sha: 'sha1',
        branch: 'main',
        triggered_at: '2025-01-01T00:00:00Z',
      });

      db.insertTestResult({
        run_id: runId,
        test_name: 'test.spec.ts:1',
        file_path: 'test.spec.ts',
        status: 'passed',
        duration_ms: 150,
      });

      db.insertTestResult({
        run_id: runId,
        test_name: 'test.spec.ts:2',
        file_path: 'test.spec.ts',
        status: 'failed',
        duration_ms: 300,
        error_message: 'Expected 1 to equal 2',
      });

      const results = db.getTestResultsForRun(runId);
      expect(results.length).toBe(2);
      expect(results[0].status).toBe('passed');
      expect(results[1].status).toBe('failed');
      expect(results[1].error_message).toBe('Expected 1 to equal 2');
    } finally {
      db.close();
    }
  });

  it('gets only failed test results', async () => {
    const db = await CerberusDB.create(dbPath);
    try {
      const runId = db.createRun({
        ci_run_id: '200',
        commit_sha: 'sha2',
        branch: 'main',
        triggered_at: '2025-01-01T00:00:00Z',
      });

      db.insertTestResult({
        run_id: runId,
        test_name: 'a.spec.ts',
        file_path: 'a.spec.ts',
        status: 'passed',
        duration_ms: 100,
      });

      db.insertTestResult({
        run_id: runId,
        test_name: 'b.spec.ts',
        file_path: 'b.spec.ts',
        status: 'failed',
        duration_ms: 200,
      });

      db.insertTestResult({
        run_id: runId,
        test_name: 'c.spec.ts',
        file_path: 'c.spec.ts',
        status: 'timedOut',
        duration_ms: 30000,
      });

      const failed = db.getFailedTestResultsForRun(runId);
      expect(failed.length).toBe(2);
    } finally {
      db.close();
    }
  });

  it('inserts and retrieves classifications', async () => {
    const db = await CerberusDB.create(dbPath);
    try {
      const runId = db.createRun({
        ci_run_id: '300',
        commit_sha: 'sha3',
        branch: 'main',
        triggered_at: '2025-01-01T00:00:00Z',
      });

      const testId = db.insertTestResult({
        run_id: runId,
        test_name: 'flaky.spec.ts',
        file_path: 'flaky.spec.ts',
        status: 'failed',
        duration_ms: 500,
        error_message: 'Timeout',
      });

      db.insertClassification({
        test_result_id: testId,
        error_signature: 'abc123',
        verdict: 'flaky',
        confidence: 0.85,
        reasoning: 'Timeout error',
        classified_by: 'rules',
      });

      const classifications = db.getClassificationsForRun(runId);
      expect(classifications.length).toBe(1);
      expect(classifications[0].verdict).toBe('flaky');
      expect(classifications[0].classified_by).toBe('rules');
    } finally {
      db.close();
    }
  });

  it('caches and retrieves classifications', async () => {
    const db = await CerberusDB.create(dbPath);
    try {
      const runId = db.createRun({
        ci_run_id: '400',
        commit_sha: 'sha4',
        branch: 'main',
        triggered_at: '2025-01-01T00:00:00Z',
      });

      const testId = db.insertTestResult({
        run_id: runId,
        test_name: 'cached.spec.ts',
        file_path: 'cached.spec.ts',
        status: 'failed',
        duration_ms: 500,
        error_message: 'Network error',
      });

      db.insertClassification({
        test_result_id: testId,
        error_signature: 'sig123',
        verdict: 'flaky',
        confidence: 0.9,
        reasoning: 'Network issue',
        classified_by: 'ai',
        ai_provider: 'claude:test',
      });

      // Should find cached classification
      const cached = db.getCachedClassification('cached.spec.ts', 'sig123', 30);
      expect(cached).not.toBeNull();
      expect(cached!.verdict).toBe('flaky');
      expect(cached!.ai_provider).toBe('claude:test');

      // Different signature should not match
      const noMatch = db.getCachedClassification('cached.spec.ts', 'different_sig', 30);
      expect(noMatch).toBeNull();
    } finally {
      db.close();
    }
  });

  it('gets test history pattern', async () => {
    const db = await CerberusDB.create(dbPath);
    try {
      const runId1 = db.createRun({
        ci_run_id: '501',
        commit_sha: 'sha1',
        branch: 'main',
        triggered_at: '2025-01-01T00:00:00Z',
      });

      const runId2 = db.createRun({
        ci_run_id: '502',
        commit_sha: 'sha2',
        branch: 'main',
        triggered_at: '2025-01-02T00:00:00Z',
      });

      db.insertTestResult({
        run_id: runId1,
        test_name: 'history.spec.ts',
        file_path: 'history.spec.ts',
        status: 'passed',
        duration_ms: 100,
      });

      db.insertTestResult({
        run_id: runId2,
        test_name: 'history.spec.ts',
        file_path: 'history.spec.ts',
        status: 'failed',
        duration_ms: 200,
      });

      const pattern = db.getTestHistoryPattern('history.spec.ts', 'main', 10);
      expect(pattern).toBe('FP'); // newest first
    } finally {
      db.close();
    }
  });

  it('saves and persists across reopens', async () => {
    let db = await CerberusDB.create(dbPath);
    try {
      db.createRun({
        ci_run_id: '600',
        commit_sha: 'sha6',
        branch: 'main',
        triggered_at: '2025-01-01T00:00:00Z',
      });
      db.save();
    } finally {
      db.close();
    }

    // Reopen the database
    db = await CerberusDB.create(dbPath);
    try {
      const run = db.getRunByCiId('600');
      expect(run).not.toBeNull();
      expect(run!.commit_sha).toBe('sha6');
    } finally {
      db.close();
    }
  });
});
