import { normalizeIdeAssistTarget } from './ide-assist-preference.js';

/**
 * @param {string} target
 * @param {object|null|undefined} integrationOpts
 * @param {object} [options]
 * @param {function} [options.warn]
 * @param {function} [options.getExtensionUrl]
 * @returns {Promise<{ attachToReviewListRow: (args: object) => void } | null>}
 */
export async function createIdeAssistIntegrationForTarget(target, integrationOpts, options = {}) {
  const t = normalizeIdeAssistTarget(target);
  const getExtensionUrl =
    typeof options.getExtensionUrl === 'function'
      ? options.getExtensionUrl
      : (path) => chrome.runtime.getURL(path);

  switch (t) {
    case 'none':
      return null;
    case 'cursor': {
      const m = await import(getExtensionUrl('utils/ide-integration/cursor-suggestion.js'));
      return m.createCursorSuggestionIntegration(integrationOpts, options);
    }
    case 'github_copilot': {
      const m = await import(getExtensionUrl('utils/ide-integration/github-copilot-suggestion.js'));
      return m.createGitHubCopilotSuggestionIntegration(integrationOpts, options);
    }
    case 'claude_code': {
      const m = await import(getExtensionUrl('utils/ide-integration/claude-code-suggestion.js'));
      return m.createClaudeCodeSuggestionIntegration(integrationOpts, options);
    }
    default:
      return null;
  }
}

