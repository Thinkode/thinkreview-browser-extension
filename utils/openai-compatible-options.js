/**
 * Shared defaults and normalization helpers for OpenAI-compatible provider settings.
 */

export const OPENAI_COMPATIBLE_TEMPERATURE_DEFAULT = 0.8;
export const OPENAI_COMPATIBLE_TOP_P_DEFAULT = 1;
export const OPENAI_COMPATIBLE_MAX_TOKENS_DEFAULT = 200000;
export const OPENAI_COMPATIBLE_RESERVED_RESPONSE_TOKENS = 1024;
export const OPENAI_COMPATIBLE_REASONING_EFFORT_OPTIONS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

function clampNumber(value, min, max, fallback) {
  const parsedValue = Number(value);
  const useValue = Number.isFinite(parsedValue) ? parsedValue : fallback;
  return Math.max(min, Math.min(max, useValue));
}

export function clampOpenAICompatibleTemperature(value) {
  return clampNumber(value, 0, 2, OPENAI_COMPATIBLE_TEMPERATURE_DEFAULT);
}

export function clampOpenAICompatibleTopP(value) {
  return clampNumber(value, 0, 1, OPENAI_COMPATIBLE_TOP_P_DEFAULT);
}

export function normalizeOpenAICompatibleTopK(value) {
  const parsedValue = parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }
  return parsedValue;
}

export function normalizeOpenAICompatibleReasoningEffort(value) {
  const effort = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return OPENAI_COMPATIBLE_REASONING_EFFORT_OPTIONS.includes(effort) ? effort : '';
}

export function normalizeOpenAICompatibleMaxTokens(value) {
  const parsedValue = parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return OPENAI_COMPATIBLE_MAX_TOKENS_DEFAULT;
  }
  return parsedValue;
}

export function normalizeOpenAICompatibleConfig(config = {}) {
  return {
    ...config,
    temperature: clampOpenAICompatibleTemperature(config.temperature),
    top_p: clampOpenAICompatibleTopP(config.top_p),
    top_k: normalizeOpenAICompatibleTopK(config.top_k),
    reasoning_effort: normalizeOpenAICompatibleReasoningEffort(config.reasoning_effort),
    max_tokens: normalizeOpenAICompatibleMaxTokens(config.max_tokens)
  };
}

export function resolveOpenAICompatibleDisplayedMaxTokens(config = {}) {
  const normalizedConfig = normalizeOpenAICompatibleConfig(config);
  const parsedContextLength = Number(config.contextLength);

  if (Number.isFinite(parsedContextLength) && parsedContextLength > 0) {
    const contextLimit = Math.max(1, parsedContextLength - OPENAI_COMPATIBLE_RESERVED_RESPONSE_TOKENS);
    const hasExplicitMaxTokens = Object.prototype.hasOwnProperty.call(config, 'max_tokens')
      && config.max_tokens !== ''
      && config.max_tokens != null;

    if (hasExplicitMaxTokens && normalizedConfig.max_tokens !== OPENAI_COMPATIBLE_MAX_TOKENS_DEFAULT) {
      return Math.max(1, Math.min(normalizedConfig.max_tokens, contextLimit));
    }

    return contextLimit;
  }

  return normalizedConfig.max_tokens;
}
