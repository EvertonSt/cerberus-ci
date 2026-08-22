/**
 * Tests for GitHub Actions annotations — formatAnnotationCommands, formatAnnotationSummary.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/index.js';
import { generateAnnotations, formatAnnotationCommands, formatAnnotationSummary } from '../../src/report/annotations.js';
import { generateDefaultConfig, type CerberusConfig } from '../../src/config/schema.js';

describe('formatAnnotationCommands', () => {
  it('formats error annotations correctly', () => {
    const annotations = [
      { level: 'error' as const, file: 'tests/auth.spec.ts', message: 'Cerberus: REGRESSION in auth.spec.ts:10 — assertion failure' },
    ];
    const commands = formatAnnotationCommands(annotations);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain('::error');
    expect(commands[0]).toContain('file=tests/auth.spec.ts');
    expect(commands[0]).toContain('Cerberus%3A REGRESSION');
  });

  it('formats warning annotations correctly', () => {
    const annotations = [
      { level: 'warning' as const, file: 'tests/checkout.spec.ts', message: 'Cerberus: FLAKY test checkout.spec.ts:42 — timeout' },
    ];
    const commands = formatAnnotationCommands(annotations);
    expect(commands[0]).toContain('::warning');
  });

  it('formats notice annotations correctly', () => {
    const annotations = [
      { level: 'notice' as const, file: 'performance', message: 'Cerberus: Insufficient baseline history' },
    ];
    const commands = formatAnnotationCommands(annotations);
    expect(commands[0]).toContain('::notice');
  });

  it('escapes special characters in message', () => {
    const annotations = [
      { level: 'error' as const, file: 'test.ts', message: 'Error: 50% regression: something' },
    ];
    const commands = formatAnnotationCommands(annotations);
    // Colons and percent signs should be escaped
    expect(commands[0]).toContain('%3A');
    expect(commands[0]).toContain('%25');
  });

  it('handles multiple annotations', () => {
    const annotations = [
      { level: 'error' as const, file: 'a.ts', message: 'error 1' },
      { level: 'warning' as const, file: 'b.ts', message: 'warning 1' },
      { level: 'notice' as const, file: 'c.ts', message: 'notice 1' },
    ];
    const commands = formatAnnotationCommands(annotations);
    expect(commands).toHaveLength(3);
    expect(commands[0]).toContain('::error');
    expect(commands[1]).toContain('::warning');
    expect(commands[2]).toContain('::notice');
  });

  it('returns empty array for no annotations', () => {
    expect(formatAnnotationCommands([])).toEqual([]);
  });
});

describe('formatAnnotationSummary', () => {
  it('returns empty string for no annotations', () => {
    expect(formatAnnotationSummary([])).toBe('');
  });

  it('formats mixed annotations with counts', () => {
    const annotations = [
      { level: 'error' as const, file: 'a.ts', message: 'regression' },
      { level: 'warning' as const, file: 'b.ts', message: 'flaky' },
      { level: 'notice' as const, file: 'c.ts', message: 'notice' },
    ];
    const summary = formatAnnotationSummary(annotations);
    expect(summary).toContain('GitHub Actions Annotations');
    expect(summary).toContain('❌');
    expect(summary).toContain('⚠️');
    expect(summary).toContain('ℹ️');
    expect(summary).toContain('1 error(s), 1 warning(s), 1 notice(s)');
  });

  it('formats error-only annotations', () => {
    const annotations = [
      { level: 'error' as const, file: 'test.ts', message: 'big problem' },
    ];
    const summary = formatAnnotationSummary(annotations);
    expect(summary).toContain('1 error(s), 0 warning(s), 0 notice(s)');
  });
});

describe('generateAnnotations', () => {
  let tmpDir: string;
  let configPath: string;
  let db: CerberusDB;
  let config: CerberusConfig;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-annot-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    configPath = path.join(tmpDir, 'cerberus.config.yml');

    const defaultConfig = generateDefaultConfig();
    fs.writeFileSync(configPath, defaultConfig.replace('.cerberus/data.db', dbPath));

    config = {
      ai: { provider: 'mock', model: 'mock', base_url: null, api_key_env: null },
      classifier: { consecutive_failures_threshold: 3, history_depth: 5, cache_ttl_days: 30 },
      perf: { baseline_branch: 'main', baseline_runs: 10, threshold_pct: 20, thresholds: {}, exclude: [] },
      gate: { fail_on_regression: true, fail_on_unknown: false, fail_on_perf_regression: true, max_new_flaky_tests: 3 },
      storage: { db_path: dbPath },
    } as CerberusConfig;

    db = await CerberusDB.create(dbPath);

    // Create a run with test results
    const runId = db.createRun({
      ci_run_id: 'annot-run-1',
      commit_sha: 'abc123',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    // Add test results
    const test1 = db.insertTestResult({
      run_id: runId,
      test_name: 'auth.spec.ts:10',
      file_path: 'tests/auth.spec.ts',
      status: 'failed',
      duration_ms: 2000,
      error_message: 'assertion failure',
    });

    const test2 = db.insertTestResult({
      run_id: runId,
      test_name: 'checkout.spec.ts:42',
      file_path: 'tests/checkout.spec.ts',
      status: 'failed',
      duration_ms: 5000,
      error_message: 'timeout',
    });

    db.insertTestResult({
      run_id: runId,
      test_name: 'login.spec.ts:15',
      file_path: 'tests/login.spec.ts',
      status: 'passed',
      duration_ms: 1000,
    });

    // Add classifications
    db.insertClassification({
      test_result_id: test1,
      error_signature: 'sig1',
      verdict: 'regression',
      confidence: 0.95,
      reasoning: 'Assertion failure with clear mismatch',
      classified_by: 'rules',
    });

    db.insertClassification({
      test_result_id: test2,
      error_signature: 'sig2',
      verdict: 'flaky',
      confidence: 0.8,
      reasoning: 'Navigation timeout with mixed history',
      classified_by: 'ai',
      ai_provider: 'mock',
    });

    db.save();
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates error annotation for regression', async () => {
    const annotations = await generateAnnotations('annot-run-1', config);
    const errors = annotations.filter((a) => a.level === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain('REGRESSION');
    expect(errors[0].file).toBe('tests/auth.spec.ts');
  });

  it('generates warning annotation for flaky test', async () => {
    const annotations = await generateAnnotations('annot-run-1', config);
    const warnings = annotations.filter((a) => a.level === 'warning');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].message).toContain('FLAKY');
    expect(warnings[0].file).toBe('tests/checkout.spec.ts');
  });

  it('includes reasoning in annotation message', async () => {
    const annotations = await generateAnnotations('annot-run-1', config);
    const regression = annotations.find((a) => a.message.includes('REGRESSION'));
    expect(regression).toBeDefined();
    expect(regression!.message).toContain('Assertion failure');
  });

  it('returns annotations ready for GH Actions output', async () => {
    const annotations = await generateAnnotations('annot-run-1', config);
    const commands = formatAnnotationCommands(annotations);
    for (const cmd of commands) {
      expect(cmd).toMatch(/^::(error|warning|notice)/);
    }
  });

  it('throws for non-existent run', async () => {
    await expect(
      generateAnnotations('nonexistent', config),
    ).rejects.toThrow('Run not found');
  });
});
