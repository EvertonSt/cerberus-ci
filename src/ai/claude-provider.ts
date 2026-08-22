/**
 * ClaudeProvider — native Anthropic SDK integration for AI classification and summarization.
 * This is the default provider, matching the rest of the portfolio.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, ClassificationInput, ClassificationResult, SummaryInput } from './provider.js';

const CLASSIFY_SYSTEM_PROMPT = `You are a test failure classifier for a CI pipeline. Given a test failure, classify it as either "flaky" (intermittent, not related to code changes) or "regression" (a real bug introduced by a code change).

Signals that suggest FLAKY:
- Timing/timeout errors (navigation timeout, element wait timeout, etc.)
- Network errors (ECONNRESET, socket hang up, fetch failed)
- Element not found / target closed / page closed (race conditions)
- "Passed on retry" history pattern
- Mixed pass/fail history with no clear trend
- Browser-specific errors that don't appear on all runs

Signals that suggest REGRESSION:
- Assertion failures with clear expected vs. actual mismatches
- Consistent failures across multiple runs (e.g., "FFF")
- Errors in business logic (validation, calculation, state management)
- New errors that appeared after a specific commit
- Errors that only occur on the changed code paths

You will receive:
- testName: the full test identifier
- errorMessage: the error message
- stackTrace: the stack trace (if available)
- historyPattern: pass/fail history as a string (P=pass, F=fail, newest first)

Respond with ONLY valid JSON matching this exact schema:
{
  "verdict": "flaky" | "regression",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence explanation"
}`;

const SUMMARIZE_SYSTEM_PROMPT = `You are a CI quality report summarizer. Write a concise, plain-English paragraph (2-4 sentences) summarizing the test health and performance status for a pull request. Be specific about patterns you notice. Be actionable — suggest what engineers should look at.`;

export class ClaudeProvider implements AIProvider {
  readonly id: string;
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.id = `claude:${model}`;
  }

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const userMessage = [
      `Test: ${input.testName}`,
      `Error: ${input.errorMessage}`,
      input.stackTrace ? `Stack: ${input.stackTrace}` : '',
      `History (newest→oldest): ${input.historyPattern}`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return parseClassificationResult(text);
  }

  async summarize(input: SummaryInput): Promise<string> {
    const parts: string[] = [];

    if (input.flakyTests.length > 0) {
      parts.push(
        `Flaky tests (${input.flakyTests.length}): ${input.flakyTests.map((t) => `${t.name} (${t.count}x)`).join(', ')}`,
      );
    }

    if (input.regressions.length > 0) {
      parts.push(
        `Regressions (${input.regressions.length}): ${input.regressions.map((t) => t.name).join(', ')}`,
      );
    }

    if (input.perfDeltas.length > 0) {
      parts.push(
        `Performance: ${input.perfDeltas.map((d) => `${d.metric} (${d.deltaPct > 0 ? '+' : ''}${d.deltaPct.toFixed(1)}%)`).join(', ')}`,
      );
    }

    if (parts.length === 0) {
      return 'All tests passed with no performance regressions detected.';
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: SUMMARIZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: parts.join('\n') }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return text.trim();
  }
}

/**
 * Parse and validate JSON classification result from an AI provider response.
 * Falls back to safe defaults on malformed output.
 */
export function parseClassificationResult(text: string): ClassificationResult {
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      return {
        verdict: 'regression',
        confidence: 0.5,
        reasoning: 'Unable to parse AI response; defaulting to regression for safety.',
      };
    }

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);

    if (
      typeof parsed.verdict !== 'string' ||
      !['flaky', 'regression'].includes(parsed.verdict) ||
      typeof parsed.confidence !== 'number' ||
      parsed.confidence < 0 ||
      parsed.confidence > 1 ||
      typeof parsed.reasoning !== 'string'
    ) {
      return {
        verdict: 'regression',
        confidence: 0.5,
        reasoning: 'AI response validation failed; defaulting to regression for safety.',
      };
    }

    return {
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  } catch {
    return {
      verdict: 'regression',
      confidence: 0.5,
      reasoning: 'Failed to parse AI response as JSON; defaulting to regression for safety.',
    };
  }
}
