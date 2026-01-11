/**
 * New Badge Module
 * Creates a reusable "New" badge component that can be attached to any element
 */

// Load CSS for the badge
const cssURL = chrome.runtime.getURL('components/utils/new-badge.css');
const linkElement = document.createElement('link');
linkElement.rel = 'stylesheet';
linkElement.href = cssURL;
if (!document.querySelector(`link[href="${cssURL}"]`)) {
  document.head.appendChild(linkElement);
}

/**
 * Creates a new badge element with customizable text
 * @param {string} text - The text to display in the badge (default: "New")
 * @returns {HTMLElement} - The badge element ready to be appended to a parent
 */
export function createNewBadge(text = 'New') {
  const badge = document.createElement('span');
  badge.className = 'thinkreview-new-badge';
  badge.textContent = text;
  badge.setAttribute('aria-label', text);
  return badge;
}
