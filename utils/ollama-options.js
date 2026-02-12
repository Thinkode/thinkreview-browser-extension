/**
 * Shared limits and clamping for Ollama generation options (temperature, top_p, top_k).
 * Used by popup (UI validation) and ollama-service (API requests).
 */

export const OLLAMA_TEMP_MIN = 0;
export const OLLAMA_TEMP_MAX = 2;
export const OLLAMA_TEMP_DEFAULT = 0.3;

export const OLLAMA_TOP_P_MIN = 0;
export const OLLAMA_TOP_P_MAX = 1;
export const OLLAMA_TOP_P_DEFAULT = 0.4;

export const OLLAMA_TOP_K_MIN = 1;
export const OLLAMA_TOP_K_MAX = 200;
export const OLLAMA_TOP_K_DEFAULT = 90;

/**
 * Clamp temperature to [OLLAMA_TEMP_MIN, OLLAMA_TEMP_MAX], defaulting invalid values to OLLAMA_TEMP_DEFAULT.
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
export function clampTemperature(value) {
  const n = Number(value);
  const use = Number.isFinite(n) ? n : OLLAMA_TEMP_DEFAULT;
  return Math.max(OLLAMA_TEMP_MIN, Math.min(OLLAMA_TEMP_MAX, use));
}

/**
 * Clamp top_p to [OLLAMA_TOP_P_MIN, OLLAMA_TOP_P_MAX], defaulting invalid values to OLLAMA_TOP_P_DEFAULT.
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
export function clampTopP(value) {
  const n = Number(value);
  const use = Number.isFinite(n) ? n : OLLAMA_TOP_P_DEFAULT;
  return Math.max(OLLAMA_TOP_P_MIN, Math.min(OLLAMA_TOP_P_MAX, use));
}

/**
 * Clamp top_k to [OLLAMA_TOP_K_MIN, OLLAMA_TOP_K_MAX], defaulting invalid values to OLLAMA_TOP_K_DEFAULT.
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
export function clampTopK(value) {
  const n = parseInt(value, 10);
  const use = Number.isFinite(n) ? n : OLLAMA_TOP_K_DEFAULT;
  return Math.max(OLLAMA_TOP_K_MIN, Math.min(OLLAMA_TOP_K_MAX, use));
}

/**
 * Clamp a full options object for Ollama API. Missing or invalid fields use defaults.
 * @param {{ temperature?: number, top_p?: number, top_k?: number }} options
 * @returns {{ temperature: number, top_p: number, top_k: number }}
 */
export function clampOllamaOptions(options = {}) {
  return {
    temperature: clampTemperature(options.temperature),
    top_p: clampTopP(options.top_p),
    top_k: clampTopK(options.top_k)
  };
}
