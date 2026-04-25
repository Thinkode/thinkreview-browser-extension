/**
 * Button Notification Module
 * Adds a notification indicator to the ThinkReview trigger (floating button or sidebar tab) when review is completed but panel hasn't been opened.
 * On side layout, the dot is shown at the bottom of the tab for visibility.
 */

const cssURL = chrome.runtime.getURL('components/popup-modules/button-notification.css');
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
 * Shows notification indicator on the active trigger (floating button or sidebar tab).
 */
export function showButtonNotification() {
  const trigger = getTrigger();
  if (!trigger) return;

  if (trigger.querySelector('.thinkreview-button-notification')) {
    return;
  }

  const notification = document.createElement('span');
  notification.className = 'thinkreview-button-notification';
  notification.setAttribute('aria-label', 'Review ready - click to view');

  const isSidebarTab = trigger.id === 'thinkreview-sidebar-tab';
  if (isSidebarTab) {
    notification.classList.add('thinkreview-button-notification-side');
  }

  const arrowSpan = trigger.querySelector('span:last-child');
  if (arrowSpan) {
    trigger.insertBefore(notification, arrowSpan);
  } else {
    trigger.appendChild(notification);
  }
}

/**
 * Hides notification indicator from whichever trigger currently has it.
 */
export function hideButtonNotification() {
  const trigger = getTrigger();
  if (!trigger) return;

  const notification = trigger.querySelector('.thinkreview-button-notification');
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

