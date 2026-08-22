import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseJunitXml } from '../../src/ingest/junit-xml.js';

describe('parseJunitXml', () => {
  it('parses the fixture file correctly', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'junit-results.xml');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = await parseJunitXml(content);

    expect(result.tests.length).toBe(5);
  });

  it('correctly identifies passed tests', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'junit-results.xml');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = await parseJunitXml(content);

    const passed = result.tests.filter((t) => t.status === 'passed');
    expect(passed.length).toBe(2);
  });

  it('correctly identifies failed tests', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'junit-results.xml');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = await parseJunitXml(content);

    const failed = result.tests.filter((t) => t.status === 'failed');
    expect(failed.length).toBe(2);
  });

  it('correctly identifies skipped tests', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'junit-results.xml');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = await parseJunitXml(content);

    const skipped = result.tests.filter((t) => t.status === 'skipped');
    expect(skipped.length).toBe(1);
  });

  it('extracts error messages from failures', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'junit-results.xml');
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const result = await parseJunitXml(content);

    const failedTests = result.tests.filter((t) => t.status === 'failed');
    expect(failedTests[0].errorMessage).toContain('Expected 10.50 to equal 11.00');
    expect(failedTests[1].errorMessage).toContain('Coupon validation failed');
  });

  it('parses inline XML correctly', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="api" tests="2" failures="1" time="1.0">
    <testcase name="should return 200" classname="API" time="0.3">
    </testcase>
    <testcase name="should return 404" classname="API" time="0.2">
      <failure message="Expected 404">Expected 404 but got 200</failure>
    </testcase>
  </testsuite>
</testsuites>`;

    const result = await parseJunitXml(xml);
    expect(result.tests.length).toBe(2);
    expect(result.tests[0].status).toBe('passed');
    expect(result.tests[1].status).toBe('failed');
    expect(result.tests[1].errorMessage).toContain('Expected 404');
  });
});
