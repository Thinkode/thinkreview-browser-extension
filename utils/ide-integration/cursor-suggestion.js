/**
 * Cursor: "Open in Cursor" for Review tab → Suggestions, Security issues, and Best practices rows.
 * Other IDEs: add sibling modules (e.g. vscode-copilot-suggestion.js) using the same shared helpers.
 */

import { createCursorProductIconSvg, ensureIdeActionIconsLoaded } from './ide-action-icons.js';
import { buildReviewSuggestionPromptBody } from './suggestion-prompt-body.js';
import { openUrlWithTransientAnchor } from './open-deeplink.js';
import { trackUserAction } from '../analytics-service.js';

const BUTTON_CLASS = 'thinkreview-open-cursor-btn thinkreview-open-ide-btn';
const IDE_ANALYTICS_ID = 'cursor';

/**
 * @param {object|null|undefined} integrationOpts - same shape as displayIntegratedReview (platform, mrId, …)
 * @param {object} [options]
 * @param {function} [options.warn] - e.g. dbgWarn from integrated-review
 * @param {function} [options.getExtensionUrl] - (path) => full URL; default chrome.runtime.getURL
 * @returns {Promise<{ attachToReviewListRow: (args: { itemWrapper: HTMLElement, itemPlainText: string, listCategory: 'suggestion'|'practice'|'security' }) => void } | null>}
 */
export async function createCursorSuggestionIntegration(integrationOpts, options = {}) {
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

  let buildCursorPromptDeeplink;
  try {
    const mod = await import(getExtensionUrl('utils/cursor-deeplink.js'));
    buildCursorPromptDeeplink = mod.buildCursorPromptDeeplink;
  } catch (e) {
    warn('Failed to load cursor deeplink helper', e);
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
    warn('Failed to format review label for Cursor context', e);
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
      const { href, truncated } = buildCursorPromptDeeplink(promptBody);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = BUTTON_CLASS;
      btn.dataset.tooltip = 'Implement via Cursor';
      const icon = createCursorProductIconSvg();
      icon.setAttribute('aria-hidden', 'true');
      btn.appendChild(icon);
      const isPractice = listCategory === 'practice';
      const isSecurity = listCategory === 'security';
      const baseTitle = isPractice
        ? 'Open Cursor with this best practice as the chat prompt. The prompt includes this MR/PR page URL so you can match the correct local repo (confirm in Cursor before running).'
        : isSecurity
          ? 'Open Cursor with this security issue as the chat prompt. The prompt includes this MR/PR page URL so you can match the correct local repo (confirm in Cursor before running).'
          : 'Open Cursor with this suggestion as the chat prompt. The prompt includes this MR/PR page URL so you can match the correct local repo (confirm in Cursor before running).';
      btn.title = truncated ? `${baseTitle} Prompt was shortened to fit Cursor link limits.` : baseTitle;
      btn.setAttribute(
        'aria-label',
        truncated
          ? 'Open in Cursor; prompt was shortened to fit link limits'
          : isPractice
            ? 'Open in Cursor with this best practice as the chat prompt'
            : isSecurity
              ? 'Open in Cursor with this security issue as the chat prompt'
              : 'Open in Cursor with this suggestion as the chat prompt'
      );

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const analyticsEventName = `open_in_${IDE_ANALYTICS_ID}_${itemKind}_clicked`;
        await trackUserAction(analyticsEventName, {
          context: 'integrated_review_panel',
          ide: IDE_ANALYTICS_ID,
          list_section: itemKind,
          prompt_truncated: truncated
        }).catch(() => {});
        openUrlWithTransientAnchor(href);
      });

      itemWrapper.appendChild(btn);
    }
  };
}
