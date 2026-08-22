/**
 * cerberus run — execute the full pipeline in one command.
 * ingest → classify → gate → report
 */

import { loadConfig, validateConfig } from '../config/schema.js';

export interface RunOptions {
  input: string;
  format: string;
  runId: string;
  commit: string;
  branch: string;
  pr?: string;
  repo?: string;
  configPath: string;
  report: boolean;
  json: boolean;
  annotations: boolean;
}

export interface RunResult {
  gatePassed: boolean;
  flakyCount: number;
  regressionCount: number;
  unknownCount: number;
  reportPosted: boolean;
}

export async function runPipeline(options: RunOptions): Promise<RunResult> {
  const config = loadConfig(options.configPath);
  const validation = validateConfig(config);
  for (const w of validation.warnings) {
    if (!options.json) console.warn(`⚠️  Warning: ${w}`);
  }
  if (!validation.valid) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'invalid_config', errors: validation.errors }));
    } else {
      console.error('❌ Configuration errors:');
      for (const e of validation.errors) console.error(`   - ${e}`);
    }
    process.exit(1);
  }

  const log = options.json ? () => {} : console.log;

  // Step 1: Ingest
  log(`\n📥 Ingesting ${options.format} results from ${options.input}...`);
  const { ingestResults } = await import('../ingest/index.js');
  const ingestResult = await ingestResults({
    inputPath: options.input,
    format: options.format as 'junit' | 'playwright-json',
    runId: options.runId,
    commitSha: options.commit,
    branch: options.branch,
    prNumber: options.pr ? parseInt(options.pr, 10) : undefined,
    dbPath: config.storage.db_path,
  });
  log(
    `   ✅ ${ingestResult.testCount} tests (${ingestResult.passed} passed, ${ingestResult.failed} failed, ${ingestResult.skipped} skipped)`,
  );

  // Step 2: Classify
  log('\n🔍 Classifying failures...');
  const { classifyRun } = await import('../classifier/index.js');
  const classifyResult = await classifyRun(options.runId, config);
  log(
    `   ✅ ${classifyResult.total} failures: ${classifyResult.flaky} flaky, ${classifyResult.regression} regressions, ${classifyResult.unknown} unknown`,
  );
  log(`   Provider: ${classifyResult.providerUsed}`);

  // Step 3: Gate
  log('\n🚦 Evaluating gate...');
  const { evaluateGate } = await import('../gate/index.js');
  const gateResult = await evaluateGate(options.runId, config);

  if (gateResult.passed) {
    log('   ✅ Gate: PASSED');
  } else {
    log('   ❌ Gate: FAILED');
    for (const reason of gateResult.reasons) {
      log(`      - ${reason}`);
    }
  }

  // Step 3b: Annotations (GitHub Actions inline feedback)
  if (options.annotations) {
    const { generateAnnotations, formatAnnotationCommands } = await import('../report/annotations.js');
    const annotations = await generateAnnotations(options.runId, config);
    const commands = formatAnnotationCommands(annotations);
    for (const cmd of commands) {
      console.log(cmd); // always use console.log for annotations (not the silent log)
    }
    if (annotations.length > 0) {
      log(`\n📋 Emitted ${annotations.length} annotation(s) for GitHub Actions.`);
    }
  }

  // Step 4: Report (optional)
  let reportPosted = false;
  if (options.report && options.pr && options.repo) {
    log('\n📝 Generating report...');
    const { generateReport } = await import('../report/index.js');
    const reportResult = await generateReport({
      runId: options.runId,
      prNumber: parseInt(options.pr, 10),
      repo: options.repo,
      config,
    });
    reportPosted = reportResult.posted;
    if (reportPosted) {
      log(`   ✅ Report posted to PR #${options.pr}`);
    } else {
      log('   ℹ️  Report generated (not posted — no GitHub token)');
    }
  }

  const result: RunResult = {
    gatePassed: gateResult.passed,
    flakyCount: gateResult.flakyCount,
    regressionCount: gateResult.regressionCount,
    unknownCount: gateResult.unknownCount,
    reportPosted,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  }

  return result;
}
