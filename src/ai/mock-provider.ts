/**
 * MockProvider — deterministic local heuristic for testing without API keys.
 * Used whenever no provider is configured, CERBERUS_MOCK=1, or api_key_env is unset.
 */

import type { AIProvider, ClassificationInput, ClassificationResult, SummaryInput } from './provider.js';

/**
 * Deterministic heuristic classifier that examines the error message and history
 * to produce a verdict without any API call.
 */
function classifyHeuristic(input: ClassificationInput): ClassificationResult {
  const msg = input.errorMessage.toLowerCase();
  const pattern = input.historyPattern;

  // Strong flaky signals: test passed on retry (last char is P after an F)
  const hasRetryPass = pattern.length >= 2 && pattern[0] === 'P' && pattern[1] === 'F';

  // Timing/timeout related errors are usually flaky
  const isTiming =
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('ebtimedout') ||
    msg.includes('navigation timeout');

  // Network errors are usually flaky
  const isNetwork =
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed') ||
    msg.includes('socket hang up');

  // Element not found patterns are often flaky (race conditions)
  const isElementNotFound =
    msg.includes('element not found') ||
    msg.includes('no element found') ||
    msg.includes('waiting for selector') ||
    msg.includes('target closed') ||
    msg.includes('page closed');

  // Browser/environment crashes are usually flaky
  const isEnvironment =
    msg.includes('browser closed') ||
    msg.includes('crashed') ||
    msg.includes('out of memory') ||
    msg.includes('session closed') ||
    msg.includes('browsercontext');

  // Race condition signals
  const isRaceCondition =
    msg.includes('race condition') ||
    msg.includes('concurrent') ||
    msg.includes('stale element') ||
    msg.includes('detached element');

  // Assertion failures with clear expected/actual are usually real regressions
  const isAssertion =
    msg.includes('expected') &&
    (msg.includes('to equal') ||
      msg.includes('to be') ||
      msg.includes('to contain') ||
      msg.includes('to match') ||
      msg.includes('to throw'));

  // Consistent failures (3+ consecutive) are regressions
  const isConsistentFail =
    pattern.length >= 3 && pattern.substring(0, 3).split('').every((c) => c === 'F');

  // Intermittent pattern (alternating F and P) is flaky
  const isIntermittent = pattern.length >= 4 && /^(FP|PF){2,}/.test(pattern);

  if (hasRetryPass) {
    return {
      verdict: 'flaky',
      confidence: 0.9,
      reasoning: 'Test passed on retry within the same run, indicating intermittent behavior.',
    };
  }

  if (isConsistentFail) {
    return {
      verdict: 'regression',
      confidence: 0.85,
      reasoning: 'Test has failed consistently across multiple consecutive runs.',
    };
  }

  if (isTiming || isNetwork || isElementNotFound || isEnvironment || isRaceCondition || isIntermittent) {
    const signal = isTiming
      ? 'timing/timeout'
      : isNetwork
        ? 'network'
        : isEnvironment
          ? 'browser/environment crash'
          : isRaceCondition
            ? 'race condition'
            : isElementNotFound
              ? 'element targeting'
              : 'intermittent behavior';
    return {
      verdict: 'flaky',
      confidence: 0.75,
      reasoning: `Error pattern suggests intermittent issue: ${signal}.`,
    };
  }

  if (isAssertion) {
    return {
      verdict: 'regression',
      confidence: 0.8,
      reasoning: 'Assertion failure with clear expected vs. actual mismatch indicates a real code change effect.',
    };
  }

  // Default: mark as flaky with lower confidence if pattern is mixed
  const failCount = pattern.split('').filter((c) => c === 'F').length;
  const passCount = pattern.split('').filter((c) => c === 'P').length;
  const isMixed = failCount > 0 && passCount > 0;

  if (isMixed) {
    return {
      verdict: 'flaky',
      confidence: 0.6,
      reasoning: `Mixed pass/fail history (${passCount}P/${failCount}F) suggests intermittent behavior.`,
    };
  }

  return {
    verdict: 'regression',
    confidence: 0.5,
    reasoning: 'Unable to determine pattern from available signals; defaulting to regression for safety.',
  };
}

export class MockProvider implements AIProvider {
  readonly id = 'mock';

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    return classifyHeuristic(input);
  }

  async summarize(input: SummaryInput): Promise<string> {
    const lines: string[] = [];

    // Overall status
    const totalIssues = input.flakyTests.length + input.regressions.length + input.perfDeltas.length;
    if (totalIssues === 0) {
      return 'All tests passed with no performance regressions detected. Clean run — ship it!';
    }

    // Flaky tests section
    if (input.flakyTests.length > 0) {
      const totalFlakyRuns = input.flakyTests.reduce((sum, t) => sum + t.count, 0);
      lines.push(
        `**Flaky tests:** ${input.flakyTests.length} test(s) failed intermittently (${totalFlakyRuns} total failures). ` +
        'These are not blocking but should be quarantined or fixed to maintain CI trust.',
      );

      // Suggest top offender
      const top = input.flakyTests.sort((a, b) => b.count - a.count)[0];
      if (top && top.count > 2) {
        lines.push(
          `  Top offender: \`${top.name}\` (${top.count}x) — prioritize fixing or removing this test.`,
        );
      }
    }

    // Regressions section
    if (input.regressions.length > 0) {
      lines.push(
        `**Regressions:** ${input.regressions.length} test(s) are consistently failing. ` +
        'These indicate real bugs introduced by the code change and must be fixed before merging.',
      );
      const names = input.regressions.map((r) => `\`${r.name}\``).join(', ');
      lines.push(`  Affected: ${names}`);
    }

    // Performance section
    if (input.perfDeltas.length > 0) {
      const regressed = input.perfDeltas.filter((d) => d.deltaPct > 0);
      const improved = input.perfDeltas.filter((d) => d.deltaPct < 0);

      if (regressed.length > 0) {
        const deltas = regressed
          .map((d) => `\`${d.metric}\` (+${d.deltaPct.toFixed(1)}%)`)
          .join(', ');
        lines.push(`**Performance regressions:** ${deltas} — investigate before merging.`);
      }

      if (improved.length > 0) {
        const deltas = improved
          .map((d) => `\`${d.metric}\` (${d.deltaPct.toFixed(1)}%)`)
          .join(', ');
        lines.push(`**Performance improvements:** ${deltas} — nice work!`);
      }
    }

    // Recommendation
    if (input.regressions.length > 0) {
      lines.push('\n*Recommendation: Fix the regressions before merging. The flaky tests can be addressed separately.*');
    } else if (input.flakyTests.length > 3) {
      lines.push('\n*Recommendation: High flaky test count is eroding CI reliability. Consider a flaky test quarantine sprint.*');
    }

    return lines.join('\n') + '\n\n_[MOCK — this summary was generated without an AI provider]_';
  }
}
