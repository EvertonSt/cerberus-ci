/**
 * `cerberus status --json` is a machine interface: the GitHub Action reads the
 * flaky and regression counts from it. It is tested by SPAWNING the CLI rather
 * than importing a function, because the command lives inline in the
 * commander wiring and because the entry point itself was untested.
 *
 * That second reason is the point. `src/cli/index.ts` read `__dirname`, which
 * does not exist in an ES module, so every command died on startup with
 * "ReferenceError: __dirname is not defined in ES module scope". TypeScript
 * accepted it (a CommonJS ambient type declares it) and the unit tests never
 * noticed, because they import the individual command modules and never the
 * entry point. The GitHub Action was the first thing to actually run it.
 *
 * Spawning is the only test that would have caught that.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { CerberusDB } from "../../src/lib/storage/database";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ENTRY = path.join(REPO_ROOT, "src", "cli", "index.ts");

interface CliResult {
  status: number;
  stdout: string;
}

function runCli(args: string[]): CliResult {
  try {
    const stdout = execFileSync(
      process.execPath,
      [path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs"), ENTRY, ...args],
      { encoding: "utf-8", cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );
    return { status: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? "" };
  }
}

describe("cerberus status --json", () => {
  let tmpDir: string;
  let dbPath: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cerberus-status-"));
    dbPath = path.join(tmpDir, "data.db");
    configPath = path.join(tmpDir, "cerberus.config.yml");

    fs.writeFileSync(
      configPath,
      `ai:\n  provider: mock\nstorage:\n  db_path: ${dbPath}\n`,
      "utf-8",
    );

    const db = await CerberusDB.create(dbPath);
    const runId = db.createRun({
      ci_run_id: "ci-99",
      commit_sha: "abc123",
      branch: "main",
      triggered_at: new Date().toISOString(),
    });

    db.insertTestResult({
      run_id: runId,
      test_name: "a.spec.ts:1",
      file_path: "a.spec.ts",
      status: "passed",
      duration_ms: 10,
    });
    const flakyResult = db.insertTestResult({
      run_id: runId,
      test_name: "b.spec.ts:2",
      file_path: "b.spec.ts",
      status: "failed",
      duration_ms: 20,
      error_message: "network timeout",
    });
    const regressionResult = db.insertTestResult({
      run_id: runId,
      test_name: "c.spec.ts:3",
      file_path: "c.spec.ts",
      status: "failed",
      duration_ms: 30,
      error_message: "expected 1 got 2",
    });

    // Classifications hang off a test result, not off a run.
    db.insertClassification({
      test_result_id: flakyResult,
      error_signature: "network timeout",
      verdict: "flaky",
      confidence: 0.9,
      reasoning: "network",
      classified_by: "mock",
    });
    db.insertClassification({
      test_result_id: regressionResult,
      error_signature: "expected 1 got 2",
      verdict: "regression",
      confidence: 0.95,
      reasoning: "real change",
      classified_by: "mock",
    });

    db.save();
    db.close();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("the CLI entry point starts at all (ES module scope)", () => {
    // The regression this file exists for. `--help` touches the same
    // top-level package.json read that used to throw.
    const result = runCli(["--help"]);
    expect(result.stdout).toContain("Usage: cerberus");
    expect(result.stdout).not.toContain("__dirname is not defined");
  });

  it("reports the version", () => {
    const result = runCli(["--version"]);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("emits the counts the action reads", () => {
    const result = runCli(["status", "--run-id", "ci-99", "--json", "-c", configPath]);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(parsed.runId).toBe("ci-99");
    expect(parsed.commit).toBe("abc123");
    expect(parsed.total).toBe(3);
    expect(parsed.passed).toBe(1);
    expect(parsed.failed).toBe(2);
    expect(parsed.flakyCount).toBe(1);
    expect(parsed.regressionCount).toBe(1);
  });

  it("pretty-prints, so a naive parser that assumes no spaces still has to cope", () => {
    // run.sh greps this output. `JSON.stringify(_, null, 2)` inserts spaces
    // after the colons, and the shell pattern has to allow for that.
    const result = runCli(["status", "--run-id", "ci-99", "--json", "-c", configPath]);
    expect(result.stdout).toMatch(/"flakyCount"\s*:\s*1/);
  });

  it("does not write a second run when only asked for status", async () => {
    // The action used to re-run the whole pipeline under "<run-id>-report"
    // just to get JSON out of it, which duplicated the ingest and wrote a
    // phantom run into the database.
    runCli(["status", "--run-id", "ci-99", "--json", "-c", configPath]);
    runCli(["status", "--run-id", "ci-99", "--json", "-c", configPath]);

    const db = await CerberusDB.create(dbPath);
    try {
      const runs = db.getRecentRuns("main", 50);
      expect(runs).toHaveLength(1);
      expect(runs[0].ci_run_id).toBe("ci-99");
    } finally {
      db.close();
    }
  });

  it("exits non-zero for an unknown run", () => {
    const result = runCli(["status", "--run-id", "nope", "--json", "-c", configPath]);
    expect(result.status).not.toBe(0);
  });
});
