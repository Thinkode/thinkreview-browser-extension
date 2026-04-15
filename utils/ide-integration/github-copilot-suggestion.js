/**
 * GitHub Copilot Chat (VS Code): vscode://github.copilot-chat?prompt=...
 */

import { buildGitHubCopilotPromptDeeplink } from './github-copilot-deeplink.js';
import { createGitHubCopilotIconSvg, ensureIdeActionIconsLoaded } from './ide-action-icons.js';
import { buildReviewSuggestionPromptBody } from './suggestion-prompt-body.js';
import { openUrlWithTransientAnchor } from './open-deeplink.js';

const BUTTON_CLASS = 'thinkreview-open-github-copilot-btn thinkreview-open-ide-btn';
const ANALYTICS_ACTION = 'open_in_github_copilot_clicked';

/**
 * @param {object|null|undefined} integrationOpts
 * @param {object} [options]
 * @param {function} [options.warn]
 * @param {function} [options.getExtensionUrl]
 */
export async function createGitHubCopilotSuggestionIntegration(integrationOpts, options = {}) {
  const warn = typeof options.warn === 'function' ? options.warn : () => {};
  const getExtensionUrl =
    typeof options.getExtensionUrl === 'function'
      ? options.getExtensionUrl
      : (path) => chrome.runtime.getURL(path);

  try {
    await ensureIdeActionIconsLoaded(getExtensionUrl);
  } catch (e) {
    warn('Failed to load IDE action icons', e);
    return null;
  }

  let reviewRequestLabel = null;
  try {
    const metadataBarModule = await import(getExtensionUrl('components/review-metadata-bar.js'));
    reviewRequestLabel = metadataBarModule.formatReviewRequestLabel(
      integrationOpts?.platform ?? null,
      integrationOpts?.mrId ?? null
    );
  } catch (e) {
    warn('Failed to format review label for GitHub Copilot context', e);
  }

  const mrPageUrl =
    typeof window !== 'undefined' && window.location?.href
      ? String(window.location.href).split(/[#]/)[0]
      : '';

  return {
    attachToReviewListRow({ itemWrapper, itemPlainText, listCategory }) {
      const itemKind =
        listCategory === 'practice' ? 'practice' : listCategory === 'security' ? 'security' : 'suggestion';
      const promptBody = buildReviewSuggestionPromptBody(itemPlainText, {
        mrPageUrl,
        reviewRequestLabel,
        itemKind
      });
      const { href, truncated } = buildGitHubCopilotPromptDeeplink(promptBody);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = BUTTON_CLASS;
      btn.dataset.tooltip = 'Implement via GitHub Copilot';
      const icon = createGitHubCopilotIconSvg();
      icon.setAttribute('aria-hidden', 'true');
      btn.appendChild(icon);

      const isPractice = listCategory === 'practice';
      const isSecurity = listCategory === 'security';
      const baseTitle = isPractice
        ? 'Open GitHub Copilot Chat in VS Code with this best practice as the prompt. Requires VS Code with GitHub Copilot Chat. Prompt may need a recent VS Code build.'
        : isSecurity
          ? 'Open GitHub Copilot Chat in VS Code with this security issue as the prompt. Requires VS Code with GitHub Copilot Chat. Prompt may need a recent VS Code build.'
          : 'Open GitHub Copilot Chat in VS Code with this suggestion as the prompt. Requires VS Code with GitHub Copilot Chat. Prompt may need a recent VS Code build.';
      btn.title = truncated ? `${baseTitle} Prompt was shortened to fit link limits.` : baseTitle;
      btn.setAttribute(
        'aria-label',
        truncated
          ? 'Open GitHub Copilot Chat; prompt was shortened to fit link limits'
          : isPractice
            ? 'Open GitHub Copilot Chat with this best practice as the prompt'
            : isSecurity
              ? 'Open GitHub Copilot Chat with this security issue as the prompt'
              : 'Open GitHub Copilot Chat with this suggestion as the prompt'
      );

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
          const analyticsModule = await import(getExtensionUrl('utils/analytics-service.js'));
          analyticsModule.trackUserAction(ANALYTICS_ACTION, {
            context: 'integrated_review_panel',
            category:
              listCategory === 'practice' ? 'practice' : listCategory === 'security' ? 'security' : 'suggestion'
          }).catch(() => {});
        } catch (err) {
          /* silent */
        }
        openUrlWithTransientAnchor(href);
      });

      itemWrapper.appendChild(btn);
    }
  };
}
