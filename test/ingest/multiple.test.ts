/**
 * Tests for ingesting multiple test result files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ingestMultiple } from '../../src/ingest/index.js';

describe('Multiple File Ingestion', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-multi-'));
    dbPath = path.join(tmpDir, 'data.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ingests multiple Playwright JSON files', async () => {
    const file1 = path.join(tmpDir, 'results1.json');
    const file2 = path.join(tmpDir, 'results2.json');

    fs.writeFileSync(file1, JSON.stringify([{
      specs: [{
        title: 'test A',
        tests: [{ results: [{ status: 'passed', duration: 100 }] }],
      }],
    }]), 'utf-8');

    fs.writeFileSync(file2, JSON.stringify([{
      specs: [{
        title: 'test B',
        tests: [{ results: [{ status: 'failed', duration: 200, error: { message: 'fail' } }] }],
      }],
    }]), 'utf-8');

    const result = await ingestMultiple({
      inputPaths: [file1, file2],
      format: 'playwright-json',
      runId: 'multi-001',
      commitSha: 'sha1',
      branch: 'main',
      dbPath,
    });

    expect(result.testCount).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('ingests multiple JUnit XML files', async () => {
    const file1 = path.join(tmpDir, 'junit1.xml');
    const file2 = path.join(tmpDir, 'junit2.xml');

    fs.writeFileSync(file1, `<?xml version="1.0"?><testsuites><testsuite name="a" tests="1"><testcase name="pass" classname="A" time="0.1"/></testsuite></testsuites>`, 'utf-8');
    fs.writeFileSync(file2, `<?xml version="1.0"?><testsuites><testsuite name="b" tests="1"><testcase name="fail" classname="B" time="0.2"><failure message="err">err</failure></testcase></testsuite></testsuites>`, 'utf-8');

    const result = await ingestMultiple({
      inputPaths: [file1, file2],
      format: 'junit',
      runId: 'multi-002',
      commitSha: 'sha2',
      branch: 'main',
      dbPath,
    });

    expect(result.testCount).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('throws on missing file', async () => {
    await expect(
      ingestMultiple({
        inputPaths: ['/nonexistent/file.json'],
        format: 'playwright-json',
        runId: 'multi-003',
        commitSha: 'sha3',
        branch: 'main',
        dbPath,
      }),
    ).rejects.toThrow('not found');
  });

  it('handles single file (backward compatible)', async () => {
    const file1 = path.join(tmpDir, 'single.json');
    fs.writeFileSync(file1, JSON.stringify([{
      specs: [{
        title: 'solo test',
        tests: [{ results: [{ status: 'passed', duration: 50 }] }],
      }],
    }]), 'utf-8');

    const result = await ingestMultiple({
      inputPaths: [file1],
      format: 'playwright-json',
      runId: 'multi-004',
      commitSha: 'sha4',
      branch: 'main',
      dbPath,
    });

    expect(result.testCount).toBe(1);
    expect(result.passed).toBe(1);
  });

  it('deduplicates test names across files', async () => {
    const file1 = path.join(tmpDir, 'dup1.json');
    const file2 = path.join(tmpDir, 'dup2.json');

    // Same test name in both files — both should be stored (different runs would deduplicate)
    const testJson = JSON.stringify([{
      specs: [{
        title: 'shared test',
        tests: [{ results: [{ status: 'passed', duration: 100 }] }],
      }],
    }]);

    fs.writeFileSync(file1, testJson, 'utf-8');
    fs.writeFileSync(file2, testJson, 'utf-8');

    const result = await ingestMultiple({
      inputPaths: [file1, file2],
      format: 'playwright-json',
      runId: 'multi-005',
      commitSha: 'sha5',
      branch: 'main',
      dbPath,
    });

    // Both tests should be ingested (same name, same run)
    expect(result.testCount).toBe(2);
    expect(result.passed).toBe(2);
  });
});
