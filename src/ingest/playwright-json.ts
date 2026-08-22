/**
 * Playwright JSON reporter parser.
 * Handles the output format from Playwright's JSON reporter.
 */

export interface ParsedTest {
  name: string;
  filePath: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  durationMs: number;
  errorMessage?: string;
  stackTrace?: string;
  retryCount: number;
}

export interface ParsedTestResults {
  tests: ParsedTest[];
 suites?: string[];
}

/**
 * Normalize a Playwright status to our canonical status.
 */
function normalizeStatus(status: string): 'passed' | 'failed' | 'skipped' | 'timedOut' {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'skipped':
    case 'pending':
      return 'skipped';
    case 'timedOut':
    case 'timeout':
      return 'timedOut';
    default:
      return 'failed';
  }
}

/**
 * Recursively extract tests from Playwright JSON spec/suite structure.
 */
function extractTests(
  specs: Array<Record<string, unknown>>,
  filePath: string,
): ParsedTest[] {
  const tests: ParsedTest[] = [];

  for (const spec of specs) {
    // A spec may have multiple tests (if retries happened)
    const tests_ = spec.tests as Array<Record<string, unknown>> | undefined;
    if (!tests_ || !Array.isArray(tests_)) continue;

    const testName = spec.title as string;
    const fullTestName = filePath ? `${filePath}:${testName}` : testName;

    for (const test of tests_) {
      const results = test.results as Array<Record<string, unknown>> | undefined;
      if (!results || results.length === 0) continue;

      // Use the last result (most recent after retries)
      const lastResult = results[results.length - 1];
      const status = normalizeStatus((lastResult.status as string) || 'failed');
      const duration = (lastResult.duration as number) || 0;

      // Extract error info
      let errorMessage: string | undefined;
      let stackTrace: string | undefined;

      if (lastResult.error) {
        const error = lastResult.error as Record<string, unknown>;
        errorMessage = (error.message as string) || '';
        stackTrace = (error.stack as string) || '';
      }

      // retry_count is results.length - 1 (0 = first attempt, 1 = one retry, etc.)
      const retryCount = results.length - 1;

      tests.push({
        name: fullTestName,
        filePath,
        status,
        durationMs: duration,
        errorMessage,
        stackTrace,
        retryCount,
      });
    }
  }

  return tests;
}

/**
 * Recursively walk Playwright suite structure to find specs.
 */
function walkSuites(
  suites: Array<Record<string, unknown>>,
  parentFilePath: string,
): ParsedTest[] {
  const tests: ParsedTest[] = [];

  for (const suite of suites) {
    // Get file path from suite or inherit from parent
    const suiteFile = (suite.file as string) || parentFilePath;

    // Extract specs from this suite
    const specs = suite.specs as Array<Record<string, unknown>> | undefined;
    if (specs && Array.isArray(specs)) {
      tests.push(...extractTests(specs, suiteFile));
    }

    // Recurse into nested suites
    const nestedSuites = suite.suites as Array<Record<string, unknown>> | undefined;
    if (nestedSuites && Array.isArray(nestedSuites)) {
      tests.push(...walkSuites(nestedSuites, suiteFile));
    }
  }

  return tests;
}

/**
 * Parse Playwright JSON reporter output.
 *
 * Supports two formats:
 * 1. Array of suite objects (from `reporter: 'json'`)
 * 2. Single object with a `suites` property
 */
export function parsePlaywrightJson(content: string): ParsedTestResults {
  const data = JSON.parse(content);

  let allTests: ParsedTest[];

  if (Array.isArray(data)) {
    // Format 1: Array of suites
    allTests = walkSuites(data as Array<Record<string, unknown>>, '');
  } else if (data.suites && Array.isArray(data.suites)) {
    // Format 2: Object with suites property
    allTests = walkSuites(data.suites as Array<Record<string, unknown>>, '');
  } else if (data.specs && Array.isArray(data.specs)) {
    // Format 3: Single suite with specs
    allTests = extractTests(data.specs as Array<Record<string, unknown>>, data.file as string || '');
  } else {
    throw new Error('Unrecognized Playwright JSON format: expected array of suites or object with suites property');
  }

  return {
    tests: allTests,
  };
}
