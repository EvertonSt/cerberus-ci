import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parsePlaywrightJson } from '../../src/ingest/playwright-json.js';

describe('parsePlaywrightJson', () => {
  it('parses the fixture file correctly', () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'playwright-results.json');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = parsePlaywrightJson(content);

    expect(result.tests.length).toBe(8); // 3 + 3 + 2
  });

  it('correctly identifies passed tests', () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'playwright-results.json');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = parsePlaywrightJson(content);

    const passed = result.tests.filter((t) => t.status === 'passed');
    expect(passed.length).toBe(5);
  });

  it('correctly identifies failed tests', () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'playwright-results.json');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = parsePlaywrightJson(content);

    const failed = result.tests.filter((t) => t.status === 'failed');
    expect(failed.length).toBe(2);
  });

  it('correctly identifies skipped tests', () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'playwright-results.json');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = parsePlaywrightJson(content);

    const skipped = result.tests.filter((t) => t.status === 'skipped');
    expect(skipped.length).toBe(1);
  });

  it('detects retry count for retried tests', () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'playwright-results.json');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = parsePlaywrightJson(content);

    // The "should handle payment timeout" test has 2 results (failed then passed)
    const timeoutTest = result.tests.find((t) =>
      t.name.includes('payment timeout'),
    );
    expect(timeoutTest).toBeDefined();
    expect(timeoutTest!.retryCount).toBe(1); // One retry
  });

  it('extracts error messages', () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'playwright-results.json');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = parsePlaywrightJson(content);

    const failedTests = result.tests.filter((t) => t.status === 'failed');
    for (const test of failedTests) {
      expect(test.errorMessage).toBeDefined();
      expect(test.errorMessage!.length).toBeGreaterThan(0);
    }
  });

  it('parses inline JSON correctly', () => {
    const json = JSON.stringify([
      {
        specs: [
          {
            title: 'test A',
            tests: [
              {
                results: [
                  {
                    status: 'passed',
                    duration: 100,
                    error: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const result = parsePlaywrightJson(json);
    expect(result.tests.length).toBe(1);
    expect(result.tests[0].status).toBe('passed');
    expect(result.tests[0].durationMs).toBe(100);
  });
});
