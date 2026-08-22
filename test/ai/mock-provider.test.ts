import { describe, it, expect } from 'vitest';
import { MockProvider } from '../../src/ai/mock-provider.js';
import type { ClassificationInput, SummaryInput } from '../../src/ai/provider.js';

describe('MockProvider', () => {
  const provider = new MockProvider();

  it('has the correct id', () => {
    expect(provider.id).toBe('mock');
  });

  describe('classify', () => {
    it('classifies retry-pass as flaky with high confidence', async () => {
      const input: ClassificationInput = {
        testName: 'checkout.spec.ts:42',
        errorMessage: 'Timeout waiting for selector',
        stackTrace: '',
        historyPattern: 'PFPF', // passed on retry (P first = most recent)
      };

      const result = await provider.classify(input);
      expect(result.verdict).toBe('flaky');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('classifies consistent failures as regression', async () => {
      const input: ClassificationInput = {
        testName: 'login.spec.ts:18',
        errorMessage: 'Element not found',
        stackTrace: '',
        historyPattern: 'FFF',
      };

      const result = await provider.classify(input);
      expect(result.verdict).toBe('regression');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('classifies timeout errors as flaky', async () => {
      const input: ClassificationInput = {
        testName: 'search.spec.ts:7',
        errorMessage: 'Navigation timeout of 30000ms exceeded',
        stackTrace: '',
        historyPattern: 'FPF',
      };

      const result = await provider.classify(input);
      expect(result.verdict).toBe('flaky');
    });

    it('classifies network errors as flaky', async () => {
      const input: ClassificationInput = {
        testName: 'api.spec.ts:12',
        errorMessage: 'fetch failed: ECONNRESET',
        stackTrace: '',
        historyPattern: 'FP',
      };

      const result = await provider.classify(input);
      expect(result.verdict).toBe('flaky');
    });

    it('classifies assertion failures as regression', async () => {
      const input: ClassificationInput = {
        testName: 'calc.spec.ts:5',
        errorMessage: 'Expected 5 to equal 10',
        stackTrace: '',
        historyPattern: 'F',
      };

      const result = await provider.classify(input);
      expect(result.verdict).toBe('regression');
    });

    it('classifies mixed history as flaky', async () => {
      const input: ClassificationInput = {
        testName: 'flaky.spec.ts:1',
        errorMessage: 'Something went wrong',
        stackTrace: '',
        historyPattern: 'FPFPF',
      };

      const result = await provider.classify(input);
      expect(result.verdict).toBe('flaky');
    });

    it('always returns a reasoning string', async () => {
      const input: ClassificationInput = {
        testName: 'test.spec.ts:1',
        errorMessage: 'error',
        stackTrace: '',
        historyPattern: 'F',
      };

      const result = await provider.classify(input);
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('summarize', () => {
    it('returns pass message when no issues', async () => {
      const input: SummaryInput = {
        flakyTests: [],
        regressions: [],
        perfDeltas: [],
      };

      const result = await provider.summarize(input);
      expect(result).toContain('All tests passed');
    });

    it('includes flaky test names in summary', async () => {
      const input: SummaryInput = {
        flakyTests: [{ name: 'checkout.spec.ts:42', count: 3 }],
        regressions: [],
        perfDeltas: [],
      };

      const result = await provider.summarize(input);
      expect(result).toContain('checkout.spec.ts:42');
    });

    it('includes regression names in summary', async () => {
      const input: SummaryInput = {
        flakyTests: [],
        regressions: [{ name: 'login.spec.ts:18' }],
        perfDeltas: [],
      };

      const result = await provider.summarize(input);
      expect(result).toContain('login.spec.ts:18');
    });

    it('includes performance deltas in summary', async () => {
      const input: SummaryInput = {
        flakyTests: [],
        regressions: [],
        perfDeltas: [{ metric: 'checkout_page_load_ms', deltaPct: 25.3 }],
      };

      const result = await provider.summarize(input);
      expect(result).toContain('checkout_page_load_ms');
      expect(result).toContain('+25.3%');
    });

    it('combines all issue types in summary', async () => {
      const input: SummaryInput = {
        flakyTests: [{ name: 'a.spec.ts:1', count: 2 }],
        regressions: [{ name: 'b.spec.ts:1' }],
        perfDeltas: [{ metric: 'metric', deltaPct: 10 }],
      };

      const result = await provider.summarize(input);
      // Flaky tests are mentioned by count and the top offender by name
      expect(result).toContain('1 test(s)');
      expect(result).toContain('b.spec.ts:1');
      expect(result).toContain('metric');
      expect(result).toContain('[MOCK');
    });
  });
});
