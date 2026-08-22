/**
 * AI Provider Abstraction — the core interface for all AI operations.
 * Three providers conform to this: Claude, OpenAI-compatible, and Mock.
 */

export interface ClassificationInput {
  testName: string;
  errorMessage: string;
  stackTrace: string;
  historyPattern: string; // e.g. "PPPFPFP", newest→oldest
}

export interface ClassificationResult {
  verdict: 'flaky' | 'regression';
  confidence: number; // 0.0–1.0
  reasoning: string; // one sentence
}

export interface SummaryInput {
  flakyTests: Array<{ name: string; count: number }>;
  regressions: Array<{ name: string }>;
  perfDeltas: Array<{ metric: string; deltaPct: number }>;
}

export interface AIProvider {
  readonly id: string; // e.g. 'claude', 'openai-compatible', 'mock'
  classify(input: ClassificationInput): Promise<ClassificationResult>;
  summarize(input: SummaryInput): Promise<string>;
}

export interface AIConfig {
  provider: 'claude' | 'openai-compatible' | 'mock';
  model: string;
  base_url: string | null;
  api_key_env: string | null;
}
