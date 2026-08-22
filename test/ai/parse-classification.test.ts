import { describe, it, expect } from 'vitest';
import { parseClassificationResult } from '../../src/ai/claude-provider.js';

describe('parseClassificationResult', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      verdict: 'flaky',
      confidence: 0.85,
      reasoning: 'Timeout error with mixed history.',
    });
    const result = parseClassificationResult(json);
    expect(result.verdict).toBe('flaky');
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning).toBe('Timeout error with mixed history.');
  });

  it('parses JSON inside markdown code block', () => {
    const text = `Here's my analysis:
\`\`\`json
{"verdict": "regression", "confidence": 0.9, "reasoning": "Consistent assertion failure."}
\`\`\``;
    const result = parseClassificationResult(text);
    expect(result.verdict).toBe('regression');
    expect(result.confidence).toBe(0.9);
  });

  it('returns safe default for malformed JSON', () => {
    const result = parseClassificationResult('not json at all');
    expect(result.verdict).toBe('regression');
    expect(result.confidence).toBe(0.5);
  });

  it('returns safe default for missing verdict field', () => {
    const json = JSON.stringify({ confidence: 0.8, reasoning: 'test' });
    const result = parseClassificationResult(json);
    expect(result.verdict).toBe('regression');
  });

  it('returns safe default for invalid verdict value', () => {
    const json = JSON.stringify({
      verdict: 'invalid',
      confidence: 0.8,
      reasoning: 'test',
    });
    const result = parseClassificationResult(json);
    expect(result.verdict).toBe('regression');
  });

  it('returns safe default for out-of-range confidence', () => {
    const json = JSON.stringify({
      verdict: 'flaky',
      confidence: 1.5,
      reasoning: 'test',
    });
    const result = parseClassificationResult(json);
    expect(result.verdict).toBe('regression');
  });

  it('returns safe default for negative confidence', () => {
    const json = JSON.stringify({
      verdict: 'flaky',
      confidence: -0.5,
      reasoning: 'test',
    });
    const result = parseClassificationResult(json);
    expect(result.verdict).toBe('regression');
  });

  it('returns safe default for missing reasoning', () => {
    const json = JSON.stringify({
      verdict: 'flaky',
      confidence: 0.8,
    });
    const result = parseClassificationResult(json);
    expect(result.verdict).toBe('regression');
  });
});
