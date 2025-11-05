/**
 * Button Notification Module
 * Adds a notification indicator to the AI Review button when review is completed but panel hasn't been opened
 */

// Load CSS for the button notification
const cssURL = chrome.runtime.getURL('components/popup-modules/button-notification.css');
const linkElement = document.createElement('link');
linkElement.rel = 'stylesheet';
linkElement.href = cssURL;
if (!document.querySelector(`link[href="${cssURL}"]`)) {
  document.head.appendChild(linkElement);
}

/**
 * Shows notification indicator on the AI Review button
 */
export function showButtonNotification() {
  const reviewBtn = document.getElementById('code-review-btn');
  if (!reviewBtn) return;

  // Check if notification already exists
  if (reviewBtn.querySelector('.thinkreview-button-notification')) {
    return;
  }

  // Create notification dot
  const notification = document.createElement('span');
  notification.className = 'thinkreview-button-notification';
  notification.setAttribute('aria-label', 'Review ready - click to view');
  
  // Insert notification before the arrow span
  const arrowSpan = reviewBtn.querySelector('span:last-child');
  if (arrowSpan) {
    reviewBtn.insertBefore(notification, arrowSpan);
  } else {
    reviewBtn.appendChild(notification);
  }
}

/**
 * Hides notification indicator from the AI Review button
 */
export function hideButtonNotification() {
  const reviewBtn = document.getElementById('code-review-btn');
  if (!reviewBtn) return;

  const notification = reviewBtn.querySelector('.thinkreview-button-notification');
  if (notification) {
    notification.remove();
  }
}

/**
 * Checks if notification should be shown based on panel state
 * @param {boolean} panelIsMinimized - Whether the panel is minimized
 * @param {boolean} reviewCompleted - Whether review has been completed
 */
export function updateButtonNotification(panelIsMinimized, reviewCompleted) {
  if (panelIsMinimized && reviewCompleted) {
    showButtonNotification();
  } else {
    hideButtonNotification();
  }
}

