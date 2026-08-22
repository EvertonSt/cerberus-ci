/**
 * Tests for OpenAICompatibleProvider — mocked fetch, never hits real APIs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();

describe('OpenAICompatibleProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('classifies a flaky test correctly', async () => {
    const { OpenAICompatibleProvider } = await import('../../src/ai/openai-compatible-provider.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                verdict: 'flaky',
                confidence: 0.82,
                reasoning: 'Navigation timeout with intermittent history.',
              }),
            },
          },
        ],
      }),
    });

    const provider = new OpenAICompatibleProvider(
      'https://api.openai.com/v1',
      'test-key',
      'gpt-4.1',
    );
    const result = await provider.classify({
      testName: 'checkout.spec.ts:42',
      errorMessage: 'TimeoutError: Navigation timeout',
      stackTrace: 'at Page.goto',
      historyPattern: 'PFPFPF',
    });

    expect(result.verdict).toBe('flaky');
    expect(result.confidence).toBe(0.82);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('classifies a regression', async () => {
    const { OpenAICompatibleProvider } = await import('../../src/ai/openai-compatible-provider.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"verdict":"regression","confidence":0.95,"reasoning":"clear assertion mismatch"}',
            },
          },
        ],
      }),
    });

    const provider = new OpenAICompatibleProvider(
      'http://localhost:11434/v1',
      '',
      'llama3',
    );
    const result = await provider.classify({
      testName: 'auth.spec.ts:18',
      errorMessage: "Expected 'admin' but got 'user'",
      stackTrace: '',
      historyPattern: 'FFFP',
    });

    expect(result.verdict).toBe('regression');
    expect(provider.id).toBe('openai-compatible:llama3');
  });

  it('strips trailing slash from base URL', async () => {
    const { OpenAICompatibleProvider } = await import('../../src/ai/openai-compatible-provider.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"verdict":"flaky","confidence":0.7,"reasoning":"timeout"}',
            },
          },
        ],
      }),
    });

    const provider = new OpenAICompatibleProvider(
      'https://api.example.com/v1/',
      'key',
      'model',
    );
    await provider.classify({
      testName: 'test.ts',
      errorMessage: 'timeout',
      stackTrace: '',
      historyPattern: 'F',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.anything(),
    );
  });

  it('throws on API error', async () => {
    const { OpenAICompatibleProvider } = await import('../../src/ai/openai-compatible-provider.js');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const provider = new OpenAICompatibleProvider(
      'https://api.openai.com/v1',
      'bad-key',
      'gpt-4.1',
    );

    await expect(
      provider.classify({
        testName: 'test.ts',
        errorMessage: 'error',
        stackTrace: '',
        historyPattern: 'F',
      }),
    ).rejects.toThrow('OpenAI-compatible API error (401)');
  });

  it('throws on empty choices', async () => {
    const { OpenAICompatibleProvider } = await import('../../src/ai/openai-compatible-provider.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    const provider = new OpenAICompatibleProvider(
      'https://api.openai.com/v1',
      'key',
      'gpt-4.1',
    );

    await expect(
      provider.classify({
        testName: 'test.ts',
        errorMessage: 'error',
        stackTrace: '',
        historyPattern: 'F',
      }),
    ).rejects.toThrow('empty choices');
  });

  it('summarizes empty results', async () => {
    const { OpenAICompatibleProvider } = await import('../../src/ai/openai-compatible-provider.js');

    const provider = new OpenAICompatibleProvider(
      'https://api.openai.com/v1',
      'key',
      'gpt-4.1',
    );
    const result = await provider.summarize({
      flakyTests: [],
      regressions: [],
      perfDeltas: [],
    });

    expect(result).toBe('All tests passed with no performance regressions detected.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('summarizes with flaky tests and perf deltas', async () => {
    const { OpenAICompatibleProvider } = await import('../../src/ai/openai-compatible-provider.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '3 flaky tests detected. Page load is 25% slower.',
            },
          },
        ],
      }),
    });

    const provider = new OpenAICompatibleProvider(
      'https://api.openai.com/v1',
      'key',
      'gpt-4.1',
    );
    const result = await provider.summarize({
      flakyTests: [
        { name: 'a.spec.ts', count: 2 },
        { name: 'b.spec.ts', count: 1 },
      ],
      regressions: [],
      perfDeltas: [{ metric: 'page_load', deltaPct: 25.3 }],
    });

    expect(result).toContain('flaky');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('handles malformed JSON from provider', async () => {
    const { OpenAICompatibleProvider } = await import('../../src/ai/openai-compatible-provider.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'This test looks flaky to me based on the error pattern.',
            },
          },
        ],
      }),
    });

    const provider = new OpenAICompatibleProvider(
      'https://api.openai.com/v1',
      'key',
      'gpt-4.1',
    );
    const result = await provider.classify({
      testName: 'test.ts',
      errorMessage: 'error',
      stackTrace: '',
      historyPattern: 'F',
    });

    // Falls back to regression for safety
    expect(result.verdict).toBe('regression');
    expect(result.confidence).toBe(0.5);
  });

  it('handles JSON in code block from provider', async () => {
    const { OpenAICompatibleProvider } = await import('../../src/ai/openai-compatible-provider.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '```json\n{"verdict":"flaky","confidence":0.75,"reasoning":"race condition"}\n```',
            },
          },
        ],
      }),
    });

    const provider = new OpenAICompatibleProvider(
      'https://api.openai.com/v1',
      'key',
      'gpt-4.1',
    );
    const result = await provider.classify({
      testName: 'test.ts',
      errorMessage: 'race condition',
      stackTrace: '',
      historyPattern: 'FPFP',
    });

    expect(result.verdict).toBe('flaky');
  });

  it('sends correct request structure', async () => {
    const { OpenAICompatibleProvider } = await import('../../src/ai/openai-compatible-provider.js');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"verdict":"flaky","confidence":0.8,"reasoning":"test"}' } }],
      }),
    });

    const provider = new OpenAICompatibleProvider(
      'https://api.openai.com/v1',
      'my-api-key',
      'gpt-4.1',
    );
    await provider.classify({
      testName: 'test.ts',
      errorMessage: 'error msg',
      stackTrace: 'stack trace',
      historyPattern: 'PF',
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.model).toBe('gpt-4.1');
    expect(callBody.messages).toHaveLength(2);
    expect(callBody.messages[0].role).toBe('system');
    expect(callBody.messages[1].role).toBe('user');
    expect(callBody.messages[1].content).toContain('test.ts');
    expect(callBody.messages[1].content).toContain('error msg');
    expect(callBody.messages[1].content).toContain('stack trace');
    expect(callBody.temperature).toBe(0.3);

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders.Authorization).toBe('Bearer my-api-key');
  });
});
