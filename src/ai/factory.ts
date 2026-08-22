/**
 * Provider factory — reads config and returns the appropriate AIProvider implementation.
 * Falls back to MockProvider if no API key is available.
 */

import type { AIConfig, AIProvider } from './provider.js';
import { MockProvider } from './mock-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Factory function that creates the appropriate AI provider based on config.
 * Falls back to MockProvider with a warning if the API key is missing or empty.
 *
 * @param config - AI configuration from cerberus.config.yml
 * @param silent - If true, don't log warnings (useful in tests)
 * @returns AIProvider implementation
 */
export function getProvider(config: AIConfig, silent = false): AIProvider {
  // If explicitly set to mock, use mock
  if (config.provider === 'mock') {
    if (!silent) {
      console.warn('[cerberus] Using MockProvider (explicitly configured)');
    }
    return new MockProvider();
  }

  // Check if API key is available
  const apiKeyEnvName = config.api_key_env;
  let apiKey: string | undefined;

  if (apiKeyEnvName) {
    apiKey = process.env[apiKeyEnvName];
  }

  // Fall back to mock if no key is available
  if (!apiKey || apiKey.trim() === '') {
    if (!silent) {
      const envName = apiKeyEnvName || 'unknown';
      console.warn(
        `[cerberus] API key not found (env: ${envName}). Falling back to MockProvider.`,
      );
    }
    return new MockProvider();
  }

  switch (config.provider) {
    case 'claude': {
      const model = config.model || 'claude-sonnet-4-6';
      return new ClaudeProvider(apiKey, model);
    }

    case 'openai-compatible': {
      const baseUrl = config.base_url;
      if (!baseUrl) {
        throw new ProviderError(
          'openai-compatible provider requires base_url to be set in config',
        );
      }
      const model = config.model || 'gpt-4';
      return new OpenAICompatibleProvider(baseUrl, apiKey, model);
    }

    default: {
      if (!silent) {
        console.warn(`[cerberus] Unknown provider '${config.provider}'. Falling back to MockProvider.`);
      }
      return new MockProvider();
    }
  }
}
