/**
 * Review Prompt Module Index
 * Main entry point for the review prompt component
 */

// Import the CSS
const cssURL = chrome.runtime.getURL('components/review-prompt/review-prompt.css');
const linkElement = document.createElement('link');
linkElement.rel = 'stylesheet';
linkElement.href = cssURL;
document.head.appendChild(linkElement);

// Import and export the ReviewPrompt class
export { ReviewPrompt } from './review-prompt.js';

// Create a default instance for easy use
let defaultInstance = null;

/**
 * Get or create the default review prompt instance
 * @param {Object} config - Configuration options
 * @returns {ReviewPrompt} - The review prompt instance
 */
export function getReviewPrompt(config = {}) {
  if (!defaultInstance) {
    // Import the class dynamically
    import('./review-prompt.js').then(module => {
      defaultInstance = new module.ReviewPrompt(config);
    });
  }
  return defaultInstance;
}

/**
 * Initialize the review prompt with default settings
 * @param {string} containerId - Container ID to inject the prompt into
 * @param {Object} config - Additional configuration options
 */
export async function initReviewPrompt(containerId = 'gitlab-mr-integrated-review', config = {}) {
  try {
    const module = await import('./review-prompt.js');
    const instance = new module.ReviewPrompt(config);
    instance.init(containerId);
    return instance;
  } catch (error) {
    // console.error('[ReviewPrompt] Failed to initialize:', error);
    return null;
  }
}

/**
 * Check and show review prompt if conditions are met
 * @returns {Promise<boolean>} - True if prompt was shown
 */
export async function checkAndShowReviewPrompt() {
  try {
    const module = await import('./review-prompt.js');
    if (!defaultInstance) {
      defaultInstance = new module.ReviewPrompt();
    }
    return await defaultInstance.checkAndShow();
  } catch (error) {
    // console.error('[ReviewPrompt] Failed to check and show:', error);
    return false;
  }
}

/**
 * Reset review prompt preferences (for testing)
 */
export async function resetReviewPromptPreferences() {
  try {
    const module = await import('./review-prompt.js');
    if (!defaultInstance) {
      defaultInstance = new module.ReviewPrompt();
    }
    defaultInstance.resetPreferences();
  } catch (error) {
    // console.error('[ReviewPrompt] Failed to reset preferences:', error);
  }
}

/**
 * Update review prompt configuration
 * @param {Object} newConfig - New configuration options
 */
export async function updateReviewPromptConfig(newConfig) {
  try {
    const module = await import('./review-prompt.js');
    if (!defaultInstance) {
      defaultInstance = new module.ReviewPrompt();
    }
    defaultInstance.updateConfig(newConfig);
  } catch (error) {
    // console.error('[ReviewPrompt] Failed to update config:', error);
  }
}

/**
 * Destroy the review prompt instance
 */
export function destroyReviewPrompt() {
  if (defaultInstance) {
    defaultInstance.destroy();
    defaultInstance = null;
  }
}

// Export utility functions with aliases
export {
  getReviewPrompt as getInstance,
  initReviewPrompt as init,
  checkAndShowReviewPrompt as checkAndShow,
  resetReviewPromptPreferences as resetPreferences,
  updateReviewPromptConfig as updateConfig,
  destroyReviewPrompt as destroy
};