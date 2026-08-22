/**
 * JUnit XML parser — parses generic JUnit XML test result files.
 * Works with output from Jest, Cypress, pytest, and other frameworks.
 */

import { parseStringPromise } from 'xml2js';
import type { ParsedTest, ParsedTestResults } from './playwright-json.js';

interface JUnitTestsuite {
  $?: { name?: string; tests?: string; failures?: string };
  testcase?: Array<{
    $: { name: string; classname?: string; time?: string };
    failure?: [{ _: string; $: { message?: string; type?: string } }];
    error?: [{ _: string; $: { message?: string; type?: string } }];
    skipped?: [Record<string, unknown>];
    system_out?: [string];
  }>;
}

interface JUnitRoot {
  testsuites?: { testsuite?: JUnitTestsuite[] };
  testsuite?: JUnitTestsuite;
}

/**
 * Normalize a status from JUnit XML to our canonical status.
 */
function normalizeStatus(hasFailure: boolean, hasError: boolean, hasSkipped: boolean): 'passed' | 'failed' | 'skipped' | 'timedOut' {
  if (hasSkipped) return 'skipped';
  if (hasError) {
    // Check if it's a timeout
    return 'timedOut';
  }
  if (hasFailure) return 'failed';
  return 'passed';
}

/**
 * Parse a JUnit XML string into our normalized test results.
 */
export async function parseJunitXml(content: string): Promise<ParsedTestResults> {
  const result = await parseStringPromise(content, {
    explicitArray: false,
    emptyTag: undefined,
  });

  const root = result as JUnitRoot;
  const tests: ParsedTest[] = [];

  // Handle both <testsuites> wrapper and direct <testsuite>
  let suites: JUnitTestsuite[];
  if (root.testsuites?.testsuite) {
    suites = Array.isArray(root.testsuites.testsuite)
      ? root.testsuites.testsuite
      : [root.testsuites.testsuite];
  } else if (root.testsuite) {
    suites = Array.isArray(root.testsuite) ? root.testsuite : [root.testsuite];
  } else {
    return { tests: [] };
  }

  for (const suite of suites) {
    const suiteName = suite.$?.name || 'unknown';
    const testcases = Array.isArray(suite.testcase) ? suite.testcase : suite.testcase ? [suite.testcase] : [];

    for (const tc of testcases) {
      const name = tc.$.name;
      const className = tc.$.classname || suiteName;
      const time = parseFloat(tc.$.time || '0') * 1000; // Convert seconds to ms

      const hasFailure = !!tc.failure;
      const hasError = !!tc.error;
      const hasSkipped = !!tc.skipped;

      const status = normalizeStatus(hasFailure, hasError, hasSkipped);

      // Extract error message
      let errorMessage: string | undefined;
      let stackTrace: string | undefined;

      if (hasFailure && tc.failure) {
        const failure = Array.isArray(tc.failure) ? tc.failure[0] : tc.failure;
        errorMessage = failure.$.message || (typeof failure._ === 'string' ? failure._ : '');
        stackTrace = typeof failure._ === 'string' ? failure._ : '';
      }

      if (hasError && tc.error) {
        const error = Array.isArray(tc.error) ? tc.error[0] : tc.error;
        errorMessage = error.$.message || (typeof error._ === 'string' ? error._ : '');
        stackTrace = typeof error._ === 'string' ? error._ : '';
      }

      tests.push({
        name: `${className} > ${name}`,
        filePath: className,
        status,
        durationMs: Math.round(time),
        errorMessage,
        stackTrace,
        retryCount: 0, // JUnit XML doesn't typically track retries
      });
    }
  }

  return { tests };
}
