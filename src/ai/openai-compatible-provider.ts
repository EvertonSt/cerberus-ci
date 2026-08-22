/**
 * OpenAICompatibleProvider — generic adapter for OpenAI-compatible APIs.
 * Works with OpenAI, OpenRouter, Groq, Together AI, DeepSeek, Ollama, LM Studio, etc.
 * No 'openai' npm package needed — uses raw fetch to keep dependency surface small.
 */

import type { AIProvider, ClassificationInput, ClassificationResult, SummaryInput } from './provider.js';
import { parseClassificationResult } from './claude-provider.js';

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

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChatRequest {
  model: string;
  messages: OpenAIChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.model = model;
    this.id = `openai-compatible:${model}`;
  }

  private async chat(messages: OpenAIChatMessage[], maxTokens = 512): Promise<string> {
    const requestBody: OpenAIChatRequest = {
      model: this.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI-compatible API error (${response.status}): ${errorText.substring(0, 200)}`,
      );
    }

    const data = (await response.json()) as OpenAIChatResponse;

    if (!data.choices || data.choices.length === 0) {
      throw new Error('OpenAI-compatible API returned empty choices array');
    }

    return data.choices[0].message.content;
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

    const text = await this.chat([
      { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ]);

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

    const text = await this.chat([
      { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
      { role: 'user', content: parts.join('\n') },
    ]);

    return text.trim();
  }
}
