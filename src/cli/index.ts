#!/usr/bin/env node

/**
 * Cerberus CI — CLI entrypoint
 * AI-powered test-health and performance-regression gate for CI pipelines.
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateDefaultConfig, loadConfig, validateConfig } from '../config/schema.js';
import type { CerberusConfig } from '../config/schema.js';

// Global verbose flag (set via --verbose)

/**
 * Load config with validation. Prints warnings and exits on errors.
 */
function loadValidConfig(configPath: string): CerberusConfig {
  const config = loadConfig(configPath);
  const result = validateConfig(config);

  for (const warning of result.warnings) {
    console.warn(`⚠️  Warning: ${warning}`);
  }

  if (!result.valid) {
    console.error('❌ Configuration errors:');
    for (const error of result.errors) {
      console.error(`   - ${error}`);
    }
    process.exit(1);
  }

  return config;
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as { version: string };

const program = new Command();

program
  .name('cerberus')
  .description(
    'AI-powered test-health and performance-regression gate for CI pipelines.\n' +
      'The three-headed dog that guards your CI gate.\n\n' +
      'Quick start:\n' +
      '  cerberus init                    # Create cerberus.config.yml\n' +
      '  cerberus ingest -i results.json  # Ingest test results\n' +
      '  cerberus classify --run-id 123   # Classify failures\n' +
      '  cerberus gate --run-id 123       # Check pass/fail\n' +
      '  cerberus report --run-id 123     # Generate PR comment',
  )
  .version(pkg.version)
  .option('--verbose', 'Enable verbose output');



// ── cerberus init ──────────────────────────────────────────────
program
  .command('init')
  .description('Initialize cerberus.config.yml in the current directory')
  .option('-f, --force', 'Overwrite existing config file')
  .action((options: { force: boolean }) => {
    const configPath = path.resolve('cerberus.config.yml');

    if (fs.existsSync(configPath) && !options.force) {
      console.log(
        'cerberus.config.yml already exists. Use --force to overwrite.',
      );
      process.exit(1);
    }

    const content = generateDefaultConfig();
    fs.writeFileSync(configPath, content, 'utf-8');
    console.log('✅ Created cerberus.config.yml with sensible defaults.');
    console.log('   Edit this file to configure your AI provider and thresholds.');
  });

// ── cerberus ingest ────────────────────────────────────────────
program
  .command('ingest')
  .description('Ingest test results from JUnit XML or Playwright JSON')
  .requiredOption('-i, --input <paths>', 'Path(s) to test result file(s), comma-separated')
  .requiredOption('-f, --format <format>', 'Test result format: junit | playwright-json')
  .requiredOption('--run-id <id>', 'CI run identifier')
  .requiredOption('--commit <sha>', 'Git commit SHA')
  .requiredOption('--branch <name>', 'Git branch name')
  .option('--pr <number>', 'Pull request number')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const config = loadValidConfig(options.config);
    const inputPaths = options.input.split(',').map((p: string) => p.trim());
    console.log(`Ingesting ${options.format} results from ${inputPaths.length} file(s)...`);

    // Dynamic import to avoid loading SQLite unless needed
    const { ingestMultiple } = await import('../ingest/index.js');
    const result = await ingestMultiple({
      inputPaths,
      format: options.format as 'junit' | 'playwright-json',
      runId: options.runId,
      commitSha: options.commit,
      branch: options.branch,
      prNumber: options.pr ? parseInt(options.pr, 10) : undefined,
      dbPath: config.storage.db_path,
    });

    console.log(`✅ Ingested ${result.testCount} test results (${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped).`);
  });

// ── cerberus classify ──────────────────────────────────────────
program
  .command('classify')
  .description('Classify failed tests as flaky or regression')
  .requiredOption('--run-id <id>', 'CI run identifier')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const config = loadValidConfig(options.config);
    console.log(`Classifying failed tests for run ${options.runId}...`);

    const { classifyRun } = await import('../classifier/index.js');
    const result = await classifyRun(options.runId, config);

    console.log(
      `✅ Classified ${result.total} failures: ${result.flaky} flaky, ${result.regression} regressions, ${result.unknown} unknown.`,
    );
    console.log(`   Using: ${result.providerUsed}`);
  });

// ── cerberus gate ──────────────────────────────────────────────
program
  .command('gate')
  .description('Determine if the CI gate passes or fails')
  .requiredOption('--run-id <id>', 'CI run identifier')
  .option('--annotations', 'Output GitHub Actions annotations (::error/::warning) for inline PR feedback')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const config = loadValidConfig(options.config);
    console.log(`Evaluating gate for run ${options.runId}...`);

    const { evaluateGate } = await import('../gate/index.js');
    const result = await evaluateGate(options.runId, config);

    if (result.passed) {
      console.log('✅ Gate: PASSED');
    } else {
      console.log('❌ Gate: FAILED');
      for (const reason of result.reasons) {
        console.log(`   - ${reason}`);
      }
    }

    // Emit GitHub Actions annotations if requested
    if (options.annotations) {
      const { generateAnnotations, formatAnnotationCommands } = await import('../report/annotations.js');
      const annotations = await generateAnnotations(options.runId, config);
      const commands = formatAnnotationCommands(annotations);
      for (const cmd of commands) {
        console.log(cmd);
      }
      if (annotations.length > 0) {
        console.log(`\n📋 Emitted ${annotations.length} annotation(s) for GitHub Actions.`);
      }
    }

    process.exit(result.passed ? 0 : 1);
  });

// ── cerberus report ────────────────────────────────────────────
program
  .command('report')
  .description('Generate quality report and post as PR comment')
  .requiredOption('--run-id <id>', 'CI run identifier')
  .requiredOption('--pr <number>', 'Pull request number')
  .requiredOption('--repo <owner/repo>', 'GitHub repository (owner/repo)')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const config = loadValidConfig(options.config);
    console.log(`Generating report for run ${options.runId}, PR #${options.pr}...`);

    const { generateReport } = await import('../report/index.js');
    const result = await generateReport({
      runId: options.runId,
      prNumber: parseInt(options.pr, 10),
      repo: options.repo,
      config,
    });

    if (result.posted) {
      console.log(`✅ Report posted to PR #${options.pr}: ${result.commentUrl}`);
    } else {
      console.log(`✅ Report generated (not posted — no GitHub token):`);
      console.log(result.markdown);
    }
  });

// ── cerberus run (full pipeline) ──────────────────────────────
program
  .command('run')
  .description('Run the full pipeline: ingest → classify → gate → report')
  .requiredOption('-i, --input <path>', 'Path to test result file')
  .requiredOption('-f, --format <format>', 'Test result format: junit | playwright-json')
  .requiredOption('--run-id <id>', 'CI run identifier')
  .requiredOption('--commit <sha>', 'Git commit SHA')
  .requiredOption('--branch <name>', 'Git branch name')
  .option('--pr <number>', 'Pull request number')
  .option('--repo <owner/repo>', 'GitHub repository (owner/repo)')
  .option('--no-report', 'Skip report generation')
  .option('--annotations', 'Output GitHub Actions annotations (::error/::warning) for inline PR feedback')
  .option('--json', 'Output results as JSON (for CI scripts)')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const { runPipeline } = await import('./run.js');
    const result = await runPipeline({
      input: options.input,
      format: options.format,
      runId: options.runId,
      commit: options.commit,
      branch: options.branch,
      pr: options.pr,
      repo: options.repo,
      configPath: options.config,
      report: options.report !== false,
      json: options.json || false,
      annotations: options.annotations || false,
    });

    if (!options.json) {
      console.log('\n' + '═'.repeat(50));
      if (result.gatePassed) {
        console.log('🐕‍🦺 Cerberus: All gates passed!');
      } else {
        console.log('🐕‍🦺 Cerberus: Gate FAILED');
      }
      console.log('═'.repeat(50));
    }

    process.exit(result.gatePassed ? 0 : 1);
  });

// ── cerberus trends ───────────────────────────────────────────
program
  .command('trends')
  .description('Analyze flaky test trends across runs')
  .option('--branch <name>', 'Branch to analyze (default: main)', 'main')
  .option('-n, --depth <count>', 'Number of recent runs to analyze', '50')
  .option('--json', 'Output as JSON')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const { getTrends } = await import('./trends.js');
    try {
      const result = await getTrends({
        branch: options.branch,
        depth: parseInt(options.depth, 10),
        configPath: options.config,
        json: options.json || false,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n🐕‍🦺 Flaky Test Trends — ${result.branch}`);
      console.log('═'.repeat(50));
      console.log(`  Total runs analyzed: ${result.totalRuns}`);
      console.log(`  Overall fail rate: ${(result.overallFailRate * 100).toFixed(1)}%`);
      console.log(`  Unique tests tracked: ${result.tests.length}`);

      if (result.worstTests.length > 0) {
        console.log('\n  🔴 Worst tests (by fail rate):');
        for (const t of result.worstTests) {
          const trendIcon = t.trend === 'worsening' ? '📈' : t.trend === 'improving' ? '📉' : '➡️';
          console.log(
            `    ${trendIcon} ${t.testName} — ${(t.failRate * 100).toFixed(0)}% fail rate (${t.failCount}/${t.totalRuns})`,
          );
        }
      }

      if (result.worseningTests.length > 0) {
        console.log(`\n  ⚠️  ${result.worseningTests.length} test(s) getting worse:`);
        for (const t of result.worseningTests) {
          console.log(`    - ${t.testName} (recent: ${(t.recentFailRate * 100).toFixed(0)}% vs overall: ${(t.failRate * 100).toFixed(0)}%)`);
        }
      }

      if (result.improvingTests.length > 0) {
        console.log(`\n  ✅ ${result.improvingTests.length} test(s) improving:`);
        for (const t of result.improvingTests) {
          console.log(`    - ${t.testName} (recent: ${(t.recentFailRate * 100).toFixed(0)}% vs overall: ${(t.failRate * 100).toFixed(0)}%)`);
        }
      }

      if (result.tests.length === 0) {
        console.log('\n  No test data found for this branch. Run cerberus ingest first.');
      }

      console.log('');
    } catch (err) {
      console.error(`❌ ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── cerberus history ──────────────────────────────────────────
program
  .command('history')
  .description('Show pass/fail history for a specific test')
  .requiredOption('--test <name>', 'Full test name (e.g. checkout.spec.ts:42)')
  .option('--branch <name>', 'Branch to check (default: main)', 'main')
  .option('-n, --depth <count>', 'Number of recent runs to show', '20')
  .option('--json', 'Output as JSON')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const { getTestHistory } = await import('./history.js');
    try {
      const result = await getTestHistory({
        testName: options.test,
        branch: options.branch,
        depth: parseInt(options.depth, 10),
        configPath: options.config,
        json: options.json || false,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n🐕‍🦺 History for: ${result.testName}`);
      console.log('─'.repeat(50));
      console.log(`  Branch: ${result.branch}`);
      console.log(`  Pattern (newest first): ${result.pattern || '(no data)'}`);

      if (result.pattern) {
        const passCount = result.pattern.split('').filter((c) => c === 'P').length;
        const failCount = result.pattern.split('').filter((c) => c === 'F').length;
        const passRate = ((passCount / result.pattern.length) * 100).toFixed(0);
        console.log(`  Pass rate: ${passRate}% (${passCount}P / ${failCount}F)`);
        console.log(`  Flaky score: ${(result.flakyScore * 100).toFixed(0)}% (state changes)`);
      }

      if (result.entries.length > 0) {
        console.log('\n  Recent runs:');
        for (const entry of result.entries) {
          const icon = entry.status === 'passed' ? '✅' : entry.status === 'timedOut' ? '⏱️' : '❌';
          console.log(`    ${icon} ${entry.commitSha} ${entry.status} (${entry.durationMs}ms) ${entry.timestamp}`);
        }
      }

      console.log('');
    } catch (err) {
      console.error(`❌ ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── cerberus status ───────────────────────────────────────────
program
  .command('status')
  .description('Show classification status for a run')
  .requiredOption('--run-id <id>', 'CI run identifier')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const config = loadValidConfig(options.config);
    const { CerberusDB } = await import('../storage/index.js');

    const db = await CerberusDB.create(config.storage.db_path);
    try {
      const run = db.getRunByCiId(options.runId);
      if (!run) {
        console.log(`❌ Run not found: ${options.runId}`);
        process.exit(1);
      }

      console.log(`\n🐕‍🦺 Cerberus Status for run ${options.runId}`);
      console.log('─'.repeat(50));
      console.log(`  Commit:    ${run.commit_sha}`);
      console.log(`  Branch:    ${run.branch}`);
      console.log(`  Triggered: ${run.triggered_at}`);
      if (run.pr_number) console.log(`  PR:        #${run.pr_number}`);

      // Test results
      const tests = db.getTestResultsForRun(run.id);
      const passed = tests.filter((t) => t.status === 'passed').length;
      const failed = tests.filter((t) => t.status === 'failed').length;
      const skipped = tests.filter((t) => t.status === 'skipped').length;
      const timedOut = tests.filter((t) => t.status === 'timedOut').length;

      console.log(`\n  Tests: ${tests.length} total (${passed} passed, ${failed} failed, ${skipped} skipped, ${timedOut} timed out)`);

      // Classifications
      const classifications = db.getClassificationsForRun(run.id);
      if (classifications.length > 0) {
        const flaky = classifications.filter((c) => c.verdict === 'flaky').length;
        const regression = classifications.filter((c) => c.verdict === 'regression').length;
        const unknown = classifications.filter((c) => c.verdict === 'unknown').length;
        console.log(`  Classified: ${flaky} flaky, ${regression} regression, ${unknown} unknown`);
      } else {
        console.log('  Classified: (none — run classify first)');
      }

      // Performance metrics
      const perfMetrics = db.getPerfMetricsForRun(run.id);
      if (perfMetrics.length > 0) {
        console.log(`  Perf metrics: ${perfMetrics.length}`);
      }

      console.log('');
    } finally {
      db.close();
    }
  });

// ── cerberus compare ────────────────────────────────────────
program
  .command('compare')
  .description('Compare two CI runs side-by-side')
  .requiredOption('--run-id <id>', 'Run ID to compare (the "after" run)')
  .option('--other-run-id <id>', 'Run ID to compare against (the "before" run). If omitted, uses the previous run on the same branch.')
  .option('--json', 'Output as JSON')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const { compareRuns, formatCompareText } = await import('./compare.js');
    try {
      const result = await compareRuns({
        runId: options.runId,
        otherRunId: options.otherRunId,
        configPath: options.config,
        json: options.json || false,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(formatCompareText(result));
    } catch (err) {
      console.error(`❌ ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── cerberus baseline ──────────────────────────────────────
const baselineCmd = program
  .command('baseline')
  .description('Manage performance baselines from known-good runs');

baselineCmd
  .command('set')
  .description('Mark a run as a performance baseline')
  .requiredOption('--run-id <id>', 'CI run identifier to mark as baseline')
  .option('--label <text>', 'Optional label describing why this is a baseline')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const { setBaseline } = await import('./baseline.js');
    try {
      await setBaseline({
        runId: options.runId,
        label: options.label,
        configPath: options.config,
      });
      console.log(`✅ Run ${options.runId} marked as performance baseline.`);
      if (options.label) console.log(`   Label: "${options.label}"`);
    } catch (err) {
      console.error(`❌ ${(err as Error).message}`);
      process.exit(1);
    }
  });

baselineCmd
  .command('list')
  .description('List all performance baselines')
  .option('--json', 'Output as JSON')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const { listBaselines, formatBaselineList } = await import('./baseline.js');
    try {
      const result = await listBaselines({
        configPath: options.config,
        json: options.json || false,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(formatBaselineList(result));
    } catch (err) {
      console.error(`❌ ${(err as Error).message}`);
      process.exit(1);
    }
  });

baselineCmd
  .command('clear')
  .description('Remove baseline(s)')
  .option('--run-id <id>', 'Remove specific run as baseline. If omitted, clears all baselines.')
  .option('-c, --config <path>', 'Path to cerberus.config.yml', 'cerberus.config.yml')
  .action(async (options) => {
    const { clearBaseline } = await import('./baseline.js');
    try {
      await clearBaseline({
        runId: options.runId,
        configPath: options.config,
      });
      if (options.runId) {
        console.log(`✅ Cleared baseline for run ${options.runId}.`);
      } else {
        console.log('✅ Cleared all baselines.');
      }
    } catch (err) {
      console.error(`❌ ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
