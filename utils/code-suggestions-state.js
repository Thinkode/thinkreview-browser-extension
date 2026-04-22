/**
 * code-suggestions-state.js
 * Centralized state management for code suggestions data.
 * Avoids polluting the global window object.
 */

/**
 * @typedef {Object} CodeSuggestionsData
 * @property {Array} suggestions - Array of code suggestion objects
 * @property {string} patchContent - Raw patch content
 * @property {number} timestamp - Timestamp when suggestions were stored
 * @property {boolean} injectionEnabled - Whether GitLab diff injection is enabled
 */

/**
 * @type {CodeSuggestionsData|null}
 */
let _codeSuggestionsData = null;

/**
 * Stores code suggestions data for later use (e.g., GitLab diff injection).
 * 
 * @param {Object} data - Code suggestions data
 * @param {Array} data.suggestions - Array of suggestion objects
 * @param {string} data.patchContent - Raw patch content
 * @param {boolean} data.injectionEnabled - Whether injection is enabled
 */
export function setCodeSuggestions(data) {
  if (!data || !Array.isArray(data.suggestions)) {
    console.warn('[CodeSuggestionsState] Invalid code suggestions data provided');
    return;
  }

  _codeSuggestionsData = {
    suggestions: data.suggestions,
    patchContent: data.patchContent || '',
    timestamp: Date.now(),
    injectionEnabled: data.injectionEnabled ?? false
  };
}

/**
 * Gets the stored code suggestions data.
 * 
 * @returns {CodeSuggestionsData|null}
 */
export function getCodeSuggestions() {
  return _codeSuggestionsData;
}

/**
 * Checks if code suggestions data exists.
 * 
 * @returns {boolean}
 */
export function hasCodeSuggestions() {
  return _codeSuggestionsData !== null;
}

/**
 * Updates the injection enabled flag without replacing all data.
 * 
 * @param {boolean} enabled - Whether injection should be enabled
 */
export function setInjectionEnabled(enabled) {
  if (_codeSuggestionsData) {
    _codeSuggestionsData.injectionEnabled = enabled;
  }
}

/**
 * Clears the stored code suggestions data.
 */
export function clearCodeSuggestions() {
  _codeSuggestionsData = null;
}
