/**
 * Tests for ClaudeProvider — mocked HTTP, never hits real Anthropic API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseClassificationResult } from '../../src/ai/claude-provider.js';
import type { ClassificationInput, SummaryInput } from '../../src/ai/provider.js';

// Mock the Anthropic SDK
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

describe('ClaudeProvider (mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies a flaky test correctly', async () => {
    const { ClaudeProvider } = await import('../../src/ai/claude-provider.js');
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            verdict: 'flaky',
            confidence: 0.85,
            reasoning: 'Navigation timeout with mixed history suggests intermittent failure.',
          }),
        },
      ],
    });

    const provider = new ClaudeProvider('test-key', 'claude-sonnet-4-6');
    const result = await provider.classify({
      testName: 'checkout.spec.ts:42',
      errorMessage: 'TimeoutError: Navigation timeout of 30000ms exceeded',
      stackTrace: 'at Page.goto (node_modules/playwright)',
      historyPattern: 'PFPFPF',
    });

    expect(result.verdict).toBe('flaky');
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning).toContain('timeout');
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
      }),
    );
  });

  it('classifies a regression test correctly', async () => {
    const { ClaudeProvider } = await import('../../src/ai/claude-provider.js');
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            verdict: 'regression',
            confidence: 0.95,
            reasoning: 'Assertion failure with clear expected vs actual mismatch.',
          }),
        },
      ],
    });

    const provider = new ClaudeProvider('test-key', 'claude-sonnet-4-6');
    const result = await provider.classify({
      testName: 'auth.spec.ts:18',
      errorMessage: "Expected 'admin' to equal 'user'",
      stackTrace: '',
      historyPattern: 'FFFP',
    });

    expect(result.verdict).toBe('regression');
    expect(result.confidence).toBe(0.95);
  });

  it('handles empty stack trace', async () => {
    const { ClaudeProvider } = await import('../../src/ai/claude-provider.js');
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            verdict: 'flaky',
            confidence: 0.7,
            reasoning: 'Network error pattern.',
          }),
        },
      ],
    });

    const provider = new ClaudeProvider('test-key', 'claude-sonnet-4-6');
    const result = await provider.classify({
      testName: 'api.spec.ts:5',
      errorMessage: 'ECONNRESET',
      stackTrace: '',
      historyPattern: 'FPFPFP',
    });

    expect(result.verdict).toBe('flaky');
  });

  it('handles malformed JSON response gracefully', async () => {
    const { ClaudeProvider } = await import('../../src/ai/claude-provider.js');
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I think this is flaky because of timing.' }],
    });

    const provider = new ClaudeProvider('test-key', 'claude-sonnet-4-6');
    const result = await provider.classify({
      testName: 'test.ts:1',
      errorMessage: 'error',
      stackTrace: '',
      historyPattern: 'F',
    });

    // Should fallback to regression for safety
    expect(result.verdict).toBe('regression');
    expect(result.confidence).toBe(0.5);
  });

  it('handles JSON in code block', async () => {
    const { ClaudeProvider } = await import('../../src/ai/claude-provider.js');
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '```json\n{"verdict":"flaky","confidence":0.8,"reasoning":"timeout error"}\n```',
        },
      ],
    });

    const provider = new ClaudeProvider('test-key', 'claude-sonnet-4-6');
    const result = await provider.classify({
      testName: 'test.ts:1',
      errorMessage: 'timeout',
      stackTrace: '',
      historyPattern: 'PFP',
    });

    expect(result.verdict).toBe('flaky');
    expect(result.confidence).toBe(0.8);
  });

  it('summarizes empty results', async () => {
    const { ClaudeProvider } = await import('../../src/ai/claude-provider.js');

    const provider = new ClaudeProvider('test-key', 'claude-sonnet-4-6');
    const result = await provider.summarize({
      flakyTests: [],
      regressions: [],
      perfDeltas: [],
    });

    expect(result).toBe('All tests passed with no performance regressions detected.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('summarizes mixed results via Claude', async () => {
    const { ClaudeProvider } = await import('../../src/ai/claude-provider.js');
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '2 flaky tests and 1 regression detected. Focus on fixing the regression first.',
        },
      ],
    });

    const provider = new ClaudeProvider('test-key', 'claude-sonnet-4-6');
    const result = await provider.summarize({
      flakyTests: [{ name: 'checkout.spec.ts:42', count: 3 }],
      regressions: [{ name: 'auth.spec.ts:18' }],
      perfDeltas: [{ metric: 'page_load_ms', deltaPct: 25.3 }],
    });

    expect(result).toContain('regression');
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('has correct id format', async () => {
    const { ClaudeProvider } = await import('../../src/ai/claude-provider.js');
    const provider = new ClaudeProvider('test-key', 'claude-sonnet-4-6');
    expect(provider.id).toBe('claude:claude-sonnet-4-6');
  });
});

describe('parseClassificationResult', () => {
  it('parses valid JSON', () => {
    const result = parseClassificationResult(
      '{"verdict":"flaky","confidence":0.9,"reasoning":"timeout"}',
    );
    expect(result.verdict).toBe('flaky');
    expect(result.confidence).toBe(0.9);
  });

  it('parses JSON in code block', () => {
    const result = parseClassificationResult(
      '```json\n{"verdict":"regression","confidence":0.8,"reasoning":"assertion"}\n```',
    );
    expect(result.verdict).toBe('regression');
  });

  it('rejects invalid verdict', () => {
    const result = parseClassificationResult(
      '{"verdict":"maybe","confidence":0.5,"reasoning":"idk"}',
    );
    expect(result.verdict).toBe('regression'); // safe fallback
  });

  it('rejects out-of-range confidence', () => {
    const result = parseClassificationResult(
      '{"verdict":"flaky","confidence":2.0,"reasoning":"high confidence"}',
    );
    expect(result.verdict).toBe('regression');
  });

  it('rejects negative confidence', () => {
    const result = parseClassificationResult(
      '{"verdict":"flaky","confidence":-0.5,"reasoning":"neg"}',
    );
    expect(result.verdict).toBe('regression');
  });

  it('rejects missing reasoning', () => {
    const result = parseClassificationResult(
      '{"verdict":"flaky","confidence":0.9}',
    );
    expect(result.verdict).toBe('regression');
  });

  it('handles completely invalid JSON', () => {
    const result = parseClassificationResult('this is not json at all');
    expect(result.verdict).toBe('regression');
  });

  it('handles empty string', () => {
    const result = parseClassificationResult('');
    expect(result.verdict).toBe('regression');
  });
});
