/**
 * Flaky Test Classifier — three-tier classification pipeline.
 * 
 * Tier 1: Rule-based pre-filter (no AI, always runs)
 * Tier 2: Verdict cache (check before AI)
 * Tier 3: AI classification (only for genuinely new, ambiguous errors)
 * 
 * This is the "three-headed dog" the project is named after.
 */

import * as crypto from 'node:crypto';
import { CerberusDB } from '../storage/index.js';
import { getProvider } from '../ai/index.js';
import type { CerberusConfig } from '../config/schema.js';
import type { ClassificationInput, ClassificationResult } from '../ai/provider.js';

export interface ClassificationResultSummary {
  total: number;
  flaky: number;
  regression: number;
  unknown: number;
  providerUsed: string;
}

/**
 * Compute a normalized error signature for caching.
 * Strips line numbers, timestamps, dynamic IDs, and normalizes whitespace.
 */
function computeErrorSignature(errorMessage: string, stackTrace: string): string {
  const normalized = `${errorMessage}\n${stackTrace}`
    // Remove line numbers like "at file.ts:42:10"
    .replace(/:\d+:\d+/g, '')
    // Remove timestamps (ISO format)
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '')
    // Remove UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    // Remove hex strings (session IDs, etc.)
    .replace(/\b[0-9a-f]{16,}\b/gi, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Tier 1: Rule-based pre-filter.
 * Returns a classification if rules can determine it, null otherwise.
 */
function ruleBasedClassification(
  errorMessage: string,
  historyPattern: string,
  retryCount: number,
): ClassificationResult | null {
  const msg = errorMessage.toLowerCase();

  // Rule 1: Test failed then passed on retry → strong flaky signal
  if (retryCount > 0) {
    return {
      verdict: 'flaky',
      confidence: 0.9,
      reasoning: 'Test passed on retry, indicating intermittent behavior.',
    };
  }

  // Rule 2: Consistent failures (3+) → regression
  if (historyPattern.length >= 3 && historyPattern.substring(0, 3).split('').every((c) => c === 'F')) {
    return {
      verdict: 'regression',
      confidence: 0.85,
      reasoning: 'Test has failed consistently across multiple consecutive runs.',
    };
  }

  // Rule 3: All timeouts → flaky
  if (msg.includes('timeout') && (msg.includes('navigation') || msg.includes('ebtimedout'))) {
    return {
      verdict: 'flaky',
      confidence: 0.8,
      reasoning: 'Navigation timeout is typically a timing/environment issue.',
    };
  }

  // No rule matched — escalate to tier 2/3
  return null;
}

/**
 * Main classification function for a CI run.
 */
export async function classifyRun(
  runId: string,
  config: CerberusConfig,
): Promise<ClassificationResultSummary> {
  // Find the run by CI run ID
  const db = await CerberusDB.create(config.storage.db_path);

  try {
    const run = db.getRunByCiId(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const failedTests = db.getFailedTestResultsForRun(run.id);
    const provider = getProvider(config.ai);

    let flaky = 0;
    let regression = 0;
    let unknown = 0;

    for (const test of failedTests) {
      // Get history pattern
      const historyPattern = db.getTestHistoryPattern(
        test.test_name,
        run.branch,
        config.classifier.history_depth,
      );

      // Compute error signature
      const errorSignature = computeErrorSignature(
        test.error_message || '',
        test.stack_trace || '',
      );

      // Tier 1: Rule-based pre-filter
      const ruleResult = ruleBasedClassification(
        test.error_message || '',
        historyPattern,
        test.retry_count,
      );

      if (ruleResult) {
        db.insertClassification({
          test_result_id: test.id,
          error_signature: errorSignature,
          verdict: ruleResult.verdict,
          confidence: ruleResult.confidence,
          reasoning: ruleResult.reasoning,
          classified_by: 'rules',
        });

        if (ruleResult.verdict === 'flaky') flaky++;
        else if (ruleResult.verdict === 'regression') regression++;
        else unknown++;
        continue;
      }

      // Tier 2: Check verdict cache
      const cached = db.getCachedClassification(
        test.test_name,
        errorSignature,
        config.classifier.cache_ttl_days,
      );

      if (cached) {
        db.insertClassification({
          test_result_id: test.id,
          error_signature: errorSignature,
          verdict: cached.verdict,
          confidence: cached.confidence,
          reasoning: `Cached from previous classification: ${cached.reasoning}`,
          classified_by: 'cache',
          ai_provider: cached.ai_provider,
        });

        if (cached.verdict === 'flaky') flaky++;
        else if (cached.verdict === 'regression') regression++;
        else unknown++;
        continue;
      }

      // Tier 3: AI classification
      const input: ClassificationInput = {
        testName: test.test_name,
        errorMessage: test.error_message || 'No error message',
        stackTrace: test.stack_trace || '',
        historyPattern,
      };

      const aiResult = await provider.classify(input);
      const classifiedBy = config.ai.provider === 'mock' ? 'mock' : 'ai';

      db.insertClassification({
        test_result_id: test.id,
        error_signature: errorSignature,
        verdict: aiResult.verdict,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning,
        classified_by: classifiedBy as 'ai' | 'mock',
        ai_provider: provider.id,
      });

      if (aiResult.verdict === 'flaky') flaky++;
      else if (aiResult.verdict === 'regression') regression++;
      else unknown++;
    }

    db.save();

    return {
      total: failedTests.length,
      flaky,
      regression,
      unknown,
      providerUsed: provider.id,
    };
  } finally {
    db.close();
  }
}
