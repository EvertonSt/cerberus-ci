/**
 * Report Generation — creates Markdown quality reports and posts as PR comments.
 */

import { CerberusDB } from '../storage/index.js';
import { getProvider } from '../ai/index.js';
import type { CerberusConfig } from '../config/schema.js';
import type { SummaryInput } from '../ai/provider.js';
import { checkPerfRegressions } from '../perf/index.js';

export interface ReportOptions {
  runId: string;
  prNumber: number;
  repo: string;
  config: CerberusConfig;
}

export interface ReportResult {
  markdown: string;
  posted: boolean;
  commentUrl?: string;
}

const CERBERUS_COMMENT_MARKER = '<!-- cerberus-quality-gate -->';

/**
 * Generate the quality report Markdown.
 */
export async function generateReport(options: ReportOptions): Promise<ReportResult> {
  const db = await CerberusDB.create(options.config.storage.db_path);

  try {
    const run = db.getRunByCiId(options.runId);
    if (!run) {
      throw new Error(`Run not found: ${options.runId}`);
    }

    const classifications = db.getClassificationsForRun(run.id);
    const perfMetrics = db.getPerfMetricsForRun(run.id);

    // Categorize results
    const flakyTests: Array<{ name: string; count: number }> = [];
    const regressions: Array<{ name: string }> = [];
    let unknownCount = 0;

    for (const c of classifications) {
      if (c.verdict === 'flaky') {
        // Get the test name
        const testResults = db.getTestResultsForRun(run.id);
        const test = testResults.find((t) => t.id === c.test_result_id);
        if (test) {
          const existing = flakyTests.find((f) => f.name === test.test_name);
          if (existing) {
            existing.count++;
          } else {
            flakyTests.push({ name: test.test_name, count: 1 });
          }
        }
      } else if (c.verdict === 'regression') {
        const testResults = db.getTestResultsForRun(run.id);
        const test = testResults.find((t) => t.id === c.test_result_id);
        if (test) {
          regressions.push({ name: test.test_name });
        }
      } else if (c.verdict === 'unknown') {
        unknownCount++;
      }
    }

    // Check performance regressions
    const perfResult = perfMetrics.length > 0 ? checkPerfRegressions(perfMetrics, db, options.config) : null;
    const perfDeltas = perfResult
      ? perfResult.regressions.map((r) => ({
          metric: r.metricName,
          deltaPct: r.deltaPct,
        }))
      : [];

    // Check gate status
    const hasRegression = regressions.length > 0 && options.config.gate.fail_on_regression;
    const hasPerfRegression =
      perfResult && perfResult.regressions.length > 0 && options.config.gate.fail_on_perf_regression;
    const hasTooManyFlaky =
      flakyTests.length > options.config.gate.max_new_flaky_tests;
    const hasUnknown =
      unknownCount > 0 && options.config.gate.fail_on_unknown;
    const gatePassed = !hasRegression && !hasPerfRegression && !hasTooManyFlaky && !hasUnknown;

    // Generate AI summary (or mock)
    const provider = getProvider(options.config.ai);
    const summaryInput: SummaryInput = {
      flakyTests,
      regressions,
      perfDeltas,
    };
    const summary = await provider.summarize(summaryInput);

    // Build Markdown report
    const lines: string[] = [];
    lines.push(CERBERUS_COMMENT_MARKER);
    lines.push('');
    lines.push('## 🐕‍🦺 Cerberus Quality Gate');
    lines.push('');

    if (gatePassed) {
      lines.push('**Gate: ✅ PASSED**');
    } else {
      lines.push('**Gate: ❌ FAILED**');
    }
    lines.push('');

    // Summary stats
    if (flakyTests.length > 0) {
      lines.push(
        `- ${flakyTests.length} flaky test(s) detected (not blocking): ${flakyTests.map((t) => `\`${t.name}\``).join(', ')}`,
      );
    } else {
      lines.push('- 0 flaky tests detected');
    }

    if (regressions.length > 0) {
      lines.push(
        `- **${regressions.length} regression(s)** (blocking): ${regressions.map((r) => `\`${r.name}\``).join(', ')}`,
      );
    } else {
      lines.push('- 0 regressions');
    }

    if (unknownCount > 0) {
      lines.push(`- ${unknownCount} test(s) classified as unknown`);
    }

    // Performance section
    if (perfResult && perfMetrics.length > 0) {
      const perfLines: string[] = [];
      for (const delta of perfDeltas) {
        const reg = perfResult.regressions.find((r) => r.metricName === delta.metric);
        if (reg) {
          perfLines.push(
            `${delta.metric}: ${reg.currentValue.toFixed(0)}ms vs baseline ${reg.baselineMedian.toFixed(0)}ms (+${delta.deltaPct.toFixed(1)}%, **over threshold**)`,
          );
        }
      }
      if (perfResult.insufficientHistory.length > 0) {
        perfLines.push(
          `Insufficient history for: ${perfResult.insufficientHistory.join(', ')}`,
        );
      }
      if (perfLines.length > 0) {
        lines.push(`- Performance:`);
        for (const pl of perfLines) {
          lines.push(`  - ${pl}`);
        }
      }
    }

    // AI Summary
    lines.push('');
    lines.push('<details><summary>AI Analysis</summary>');
    lines.push('');
    lines.push(summary);
    lines.push('');
    lines.push('</details>');

    // Footer
    lines.push('');
    lines.push(`<sub>Classified using: ${provider.id}</sub>`);
    lines.push('');
    lines.push(CERBERUS_COMMENT_MARKER);

    const markdown = lines.join('\n');

    // Post as PR comment if GitHub token is available
    const githubToken = process.env.GITHUB_TOKEN;
    let posted = false;
    let commentUrl: string | undefined;

    if (githubToken) {
      try {
        commentUrl = await postOrUpdateComment({
          repo: options.repo,
          prNumber: options.prNumber,
          markdown,
          githubToken,
        });
        posted = true;
      } catch (err) {
        console.error(`Failed to post PR comment: ${(err as Error).message}`);
      }
    }

    return { markdown, posted, commentUrl };
  } finally {
    db.close();
  }
}

interface CommentPostOptions {
  repo: string;
  prNumber: number;
  markdown: string;
  githubToken: string;
}

/**
 * Post or update a PR comment via GitHub API.
 * Updates existing Cerberus comment if found, otherwise creates a new one.
 */
async function postOrUpdateComment(options: CommentPostOptions): Promise<string> {
  const { repo, prNumber, markdown, githubToken } = options;

  // List existing comments
  const listResponse = await fetch(
    `https://api.github.com/repos/${repo}/issues/${prNumber}/comments?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    },
  );

  if (!listResponse.ok) {
    throw new Error(`Failed to list comments: ${listResponse.status}`);
  }

  const comments = (await listResponse.json()) as Array<{
    id: number;
    body: string;
  }>;

  // Find existing Cerberus comment
  const existing = comments.find((c) => c.body.includes(CERBERUS_COMMENT_MARKER));

  if (existing) {
    // Update existing comment
    const updateResponse = await fetch(
      `https://api.github.com/repos/${repo}/issues/comments/${existing.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: markdown }),
      },
    );

    if (!updateResponse.ok) {
      throw new Error(`Failed to update comment: ${updateResponse.status}`);
    }

    const updated = (await updateResponse.json()) as { html_url: string };
    return updated.html_url;
  } else {
    // Create new comment
    const createResponse = await fetch(
      `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: markdown }),
      },
    );

    if (!createResponse.ok) {
      throw new Error(`Failed to create comment: ${createResponse.status}`);
    }

    const created = (await createResponse.json()) as { html_url: string };
    return created.html_url;
  }
}
