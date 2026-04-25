/**
 * Button Loading Indicator Module
 * Adds a loading indicator to the ThinkReview trigger (floating button or sidebar tab) when review is in progress and panel is minimized.
 * On side layout, the indicator is shown at the bottom of the tab for visibility.
 */

const cssURL = chrome.runtime.getURL('components/popup-modules/button-loading-indicator.css');
if (!document.querySelector(`link[href="${cssURL}"]`)) {
  const linkElement = document.createElement('link');
  linkElement.rel = 'stylesheet';
  linkElement.href = cssURL;
  document.head.appendChild(linkElement);
}

/**
 * Returns the active trigger element (floating button or sidebar tab).
 * @returns {HTMLElement | null}
 */
function getTrigger() {
  return document.getElementById('code-review-btn') || document.getElementById('thinkreview-sidebar-tab');
}

/**
 * Shows loading indicator on the active trigger (floating button or sidebar tab).
 */
export function showButtonLoadingIndicator() {
  const trigger = getTrigger();
  if (!trigger) return;

  if (trigger.querySelector('.thinkreview-button-loading')) {
    return;
  }

  const loadingIndicator = document.createElement('span');
  loadingIndicator.className = 'thinkreview-button-loading';
  loadingIndicator.setAttribute('aria-label', 'Review in progress');

  const isSidebarTab = trigger.id === 'thinkreview-sidebar-tab';
  if (isSidebarTab) {
    loadingIndicator.classList.add('thinkreview-button-loading-side');
  }

  const arrowSpan = trigger.querySelector('span:last-child');
  if (arrowSpan) {
    trigger.insertBefore(loadingIndicator, arrowSpan);
  } else {
    trigger.appendChild(loadingIndicator);
  }
}

/**
 * Hides loading indicator from whichever trigger currently has it.
 */
export function hideButtonLoadingIndicator() {
  const trigger = getTrigger();
  if (!trigger) return;

  const loadingIndicator = trigger.querySelector('.thinkreview-button-loading');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
}

/**
 * Updates loading indicator based on review state and panel state
 * @param {boolean} reviewInProgress - Whether review is in progress
 * @param {boolean} panelIsMinimized - Whether panel is minimized
 */
export function updateButtonLoadingIndicator(reviewInProgress, panelIsMinimized) {
  if (reviewInProgress && panelIsMinimized) {
    showButtonLoadingIndicator();
  } else {
    hideButtonLoadingIndicator();
  }
}

