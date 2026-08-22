import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getProvider, ProviderError } from '../../src/ai/factory.js';
import { MockProvider } from '../../src/ai/mock-provider.js';
import { ClaudeProvider } from '../../src/ai/claude-provider.js';
import { OpenAICompatibleProvider } from '../../src/ai/openai-compatible-provider.js';
import type { AIConfig } from '../../src/ai/provider.js';

describe('getProvider factory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns MockProvider when provider is explicitly "mock"', () => {
    const config: AIConfig = {
      provider: 'mock',
      model: 'test',
      base_url: null,
      api_key_env: null,
    };
    const provider = getProvider(config, true);
    expect(provider).toBeInstanceOf(MockProvider);
  });

  it('returns MockProvider when API key env is unset', () => {
    const config: AIConfig = {
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      base_url: null,
      api_key_env: 'NONEXISTENT_API_KEY_12345',
    };
    const provider = getProvider(config, true);
    expect(provider).toBeInstanceOf(MockProvider);
  });

  it('returns MockProvider when API key env is empty string', () => {
    process.env.EMPTY_KEY = '';
    const config: AIConfig = {
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      base_url: null,
      api_key_env: 'EMPTY_KEY',
    };
    const provider = getProvider(config, true);
    expect(provider).toBeInstanceOf(MockProvider);
  });

  it('returns ClaudeProvider when API key is available', () => {
    process.env.TEST_ANTHROPIC_KEY = 'sk-ant-fake-key-for-test';
    const config: AIConfig = {
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      base_url: null,
      api_key_env: 'TEST_ANTHROPIC_KEY',
    };
    const provider = getProvider(config, true);
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it('returns OpenAICompatibleProvider when configured with base_url and key', () => {
    process.env.TEST_OPENAI_KEY = 'sk-fake-key-for-test';
    const config: AIConfig = {
      provider: 'openai-compatible',
      model: 'gpt-4',
      base_url: 'https://api.openai.com/v1',
      api_key_env: 'TEST_OPENAI_KEY',
    };
    const provider = getProvider(config, true);
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('throws ProviderError when openai-compatible has no base_url', () => {
    process.env.TEST_KEY = 'sk-fake';
    const config: AIConfig = {
      provider: 'openai-compatible',
      model: 'gpt-4',
      base_url: null,
      api_key_env: 'TEST_KEY',
    };
    expect(() => getProvider(config, true)).toThrow(ProviderError);
    expect(() => getProvider(config, true)).toThrow('base_url');
  });

  it('falls back to MockProvider for unknown provider type', () => {
    const config = {
      provider: 'unknown-provider' as AIConfig['provider'],
      model: 'test',
      base_url: null,
      api_key_env: null,
    };
    const provider = getProvider(config as AIConfig, true);
    expect(provider).toBeInstanceOf(MockProvider);
  });
});
