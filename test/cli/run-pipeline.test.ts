/**
 * Tests for runPipeline — the full cerberus run command.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runPipeline } from '../../src/cli/run.js';
import { generateDefaultConfig } from '../../src/config/schema.js';

describe('runPipeline', () => {
  let tmpDir: string;
  let configPath: string;
  let fixturePath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-run-test-'));
    configPath = path.join(tmpDir, 'cerberus.config.yml');
    fs.writeFileSync(configPath, generateDefaultConfig());

    // Copy fixture file to tmp dir
    fixturePath = path.join(tmpDir, 'results.json');
    const fixtureSource = path.resolve(__dirname, '../fixtures/playwright-results.json');
    fs.copyFileSync(fixtureSource, fixturePath);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs the full pipeline and returns results', async () => {
    const result = await runPipeline({
      input: fixturePath,
      format: 'playwright-json',
      runId: 'pipeline-test-1',
      commit: 'abc1234',
      branch: 'main',
      configPath,
      report: false,
      json: false,
    });

    expect(result).toHaveProperty('gatePassed');
    expect(result).toHaveProperty('flakyCount');
    expect(result).toHaveProperty('regressionCount');
    expect(result).toHaveProperty('unknownCount');
    expect(typeof result.gatePassed).toBe('boolean');
    expect(typeof result.flakyCount).toBe('number');
  });

  it('returns JSON output when json flag is true', async () => {
    // Capture console.log output
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    try {
      const result = await runPipeline({
        input: fixturePath,
        format: 'playwright-json',
        runId: 'pipeline-test-json',
        commit: 'json123',
        branch: 'main',
        configPath,
        report: false,
        json: true,
      });

      // The result itself should have JSON-compatible properties
      expect(typeof result.gatePassed).toBe('boolean');
      expect(result.reportPosted).toBe(false);

      // Should have printed JSON to console
      const jsonOutput = logs.find((l) => l.includes('"gatePassed"'));
      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput!);
      expect(parsed).toHaveProperty('gatePassed');
    } finally {
      console.log = origLog;
    }
  });

  it('skips report when report flag is false', async () => {
    const result = await runPipeline({
      input: fixturePath,
      format: 'playwright-json',
      runId: 'pipeline-test-no-report',
      commit: 'no-rep',
      branch: 'main',
      configPath,
      report: false,
      json: false,
    });

    expect(result.reportPosted).toBe(false);
  });

  it('handles JUnit XML format', async () => {
    const junitFixture = path.join(tmpDir, 'junit-results.xml');
    const junitSource = path.resolve(__dirname, '../fixtures/junit-results.xml');
    fs.copyFileSync(junitSource, junitFixture);

    const result = await runPipeline({
      input: junitFixture,
      format: 'junit',
      runId: 'pipeline-test-junit',
      commit: 'junit1',
      branch: 'main',
      configPath,
      report: false,
      json: false,
    });

    expect(result).toHaveProperty('gatePassed');
    expect(typeof result.gatePassed).toBe('boolean');
  });

  it('handles --pr and --repo options', async () => {
    const result = await runPipeline({
      input: fixturePath,
      format: 'playwright-json',
      runId: 'pipeline-test-pr',
      commit: 'pr123',
      branch: 'feature/test',
      pr: '99',
      repo: 'test/repo',
      configPath,
      report: true, // will try to post but no GITHUB_TOKEN
      json: false,
    });

    // Should still complete, just not post (no token)
    expect(result).toHaveProperty('gatePassed');
    expect(result.reportPosted).toBe(false); // no GITHUB_TOKEN
  });
});
