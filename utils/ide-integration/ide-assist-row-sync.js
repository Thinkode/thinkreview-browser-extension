import { createIdeAssistIntegrationForTarget } from './ide-assist-integration-factory.js';
import { getIdeAssistTarget } from './ide-assist-preference.js';

function extractPlainTextFromHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

/**
 * @param {HTMLElement} wrapper
 * @returns {'suggestion'|'practice'|'security'|null}
 */
function listCategoryForWrapper(wrapper) {
  if (wrapper.closest('#review-suggestions')) return 'suggestion';
  if (wrapper.closest('#review-practices')) return 'practice';
  if (wrapper.closest('#review-security')) return 'security';
  return null;
}

/**
 * Remove existing IDE shortcut buttons and re-attach for the stored preference.
 * @param {object|null|undefined} integrationOpts
 * @param {object} [options]
 * @param {function} [options.warn]
 * @param {function} [options.getExtensionUrl]
 */
export async function syncIdeAssistRows(integrationOpts, options = {}) {
  const panel = document.getElementById('gitlab-mr-integrated-review');
  if (!panel) return;

  panel
    .querySelectorAll(
      '#review-suggestions .thinkreview-open-ide-btn, #review-practices .thinkreview-open-ide-btn, #review-security .thinkreview-open-ide-btn'
    )
    .forEach((b) => b.remove());

  const target = await getIdeAssistTarget();
  const integration = await createIdeAssistIntegrationForTarget(target, integrationOpts, options);
  if (!integration) return;

  const wrappers = panel.querySelectorAll(
    '#review-suggestions .thinkreview-item-wrapper, #review-practices .thinkreview-item-wrapper, #review-security .thinkreview-item-wrapper'
  );
  wrappers.forEach((itemWrapper) => {
    const listCategory = listCategoryForWrapper(itemWrapper);
    if (!listCategory) return;
    const contentEl = itemWrapper.querySelector('.thinkreview-item-content');
    if (!contentEl) return;
    const itemPlainText = extractPlainTextFromHtml(contentEl.innerHTML).trim();
    integration.attachToReviewListRow({ itemWrapper, itemPlainText, listCategory });
  });
}
