/**
 * Test result ingestion — parses JUnit XML or Playwright JSON and writes to SQLite.
 */

import * as fs from "node:fs";
import { CerberusDB } from "../storage/index";
import { parsePlaywrightJson } from "./playwright-json";
import { parseJunitXml } from "./junit-xml";
import type { ParsedTest } from "./playwright-json";

export interface IngestOptions {
  inputPath: string;
  format: "junit" | "playwright-json";
  runId: string;
  commitSha: string;
  branch: string;
  prNumber?: number;
  dbPath: string;
}

export interface IngestMultipleOptions {
  inputPaths: string[];
  format: "junit" | "playwright-json";
  runId: string;
  commitSha: string;
  branch: string;
  prNumber?: number;
  dbPath: string;
}

export interface IngestResult {
  testCount: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
}

async function parseFile(
  inputPath: string,
  format: "junit" | "playwright-json",
): Promise<ParsedTest[]> {
  const fileContent = fs.readFileSync(inputPath, "utf-8");

  switch (format) {
    case "playwright-json":
      return parsePlaywrightJson(fileContent).tests;
    case "junit": {
      const result = await parseJunitXml(fileContent);
      return result.tests;
    }
    default:
      // Same as the provider case: the switch is exhaustive over the type,
      // but the value is read from a YAML config at runtime.
      const rawFormat: string = format;
      throw new Error(`Unsupported format: ${rawFormat}`);
  }
}

export async function ingestResults(options: IngestOptions): Promise<IngestResult> {
  return ingestMultiple({
    ...options,
    inputPaths: [options.inputPath],
  });
}

export async function ingestMultiple(options: IngestMultipleOptions): Promise<IngestResult> {
  // Parse all files first (fail fast on bad input)
  const allTests: ParsedTest[] = [];
  for (const inputPath of options.inputPaths) {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    const tests = await parseFile(inputPath, options.format);
    allTests.push(...tests);
  }

  const db = await CerberusDB.create(options.dbPath);

  try {
    // Create the run record
    const runId = db.createRun({
      ci_run_id: options.runId,
      commit_sha: options.commitSha,
      branch: options.branch,
      triggered_at: new Date().toISOString(),
      pr_number: options.prNumber,
    });

    // Insert test results
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let timedOut = 0;

    for (const test of allTests) {
      db.insertTestResult({
        run_id: runId,
        test_name: test.name,
        file_path: test.filePath,
        status: test.status,
        duration_ms: test.durationMs,
        error_message: test.errorMessage ?? null,
        stack_trace: test.stackTrace ?? null,
        retry_count: test.retryCount ?? 0,
      });

      switch (test.status) {
        case "passed":
          passed++;
          break;
        case "failed":
          failed++;
          break;
        case "skipped":
          skipped++;
          break;
        case "timedOut":
          timedOut++;
          break;
      }
    }

    db.save();

    return {
      testCount: allTests.length,
      passed,
      failed,
      skipped,
      timedOut,
    };
  } finally {
    db.close();
  }
}
