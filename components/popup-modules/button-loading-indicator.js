/**
 * Button Loading Indicator Module
 * Adds a loading indicator to the AI Review button when review is in progress and panel is minimized
 */

// Load CSS for the button loading indicator
const cssURL = chrome.runtime.getURL('components/popup-modules/button-loading-indicator.css');
const linkElement = document.createElement('link');
linkElement.rel = 'stylesheet';
linkElement.href = cssURL;
if (!document.querySelector(`link[href="${cssURL}"]`)) {
  document.head.appendChild(linkElement);
}

/**
 * Shows loading indicator on the AI Review button
 */
export function showButtonLoadingIndicator() {
  const reviewBtn = document.getElementById('code-review-btn');
  if (!reviewBtn) return;

  // Check if loading indicator already exists
  if (reviewBtn.querySelector('.thinkreview-button-loading')) {
    return;
  }

  // Create loading spinner
  const loadingIndicator = document.createElement('span');
  loadingIndicator.className = 'thinkreview-button-loading';
  loadingIndicator.setAttribute('aria-label', 'Review in progress');
  
  // Insert loading indicator before the arrow span
  const arrowSpan = reviewBtn.querySelector('span:last-child');
  if (arrowSpan) {
    reviewBtn.insertBefore(loadingIndicator, arrowSpan);
  } else {
    reviewBtn.appendChild(loadingIndicator);
  }
}

/**
 * Hides loading indicator from the AI Review button
 */
export function hideButtonLoadingIndicator() {
  const reviewBtn = document.getElementById('code-review-btn');
  if (!reviewBtn) return;

  const loadingIndicator = reviewBtn.querySelector('.thinkreview-button-loading');
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

