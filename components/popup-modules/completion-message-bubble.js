/**
 * completion-message-bubble.js
 * Shows the first best practice (or any text) in a tooltip-style bubble near the trigger for a set duration.
 */

const BUBBLE_ID = 'thinkreview-completion-bubble';
/** Max characters to show so text fits inside the bubble without overflow (~6 lines at 400px width). */
const MAX_TEXT_LENGTH = 320;
/** How long to show the bubble (ms). */
const BUBBLE_DURATION_MS = 5000;

const cssURL = chrome.runtime.getURL('components/popup-modules/completion-message-bubble.css');
if (!document.querySelector(`link[href="${cssURL}"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssURL;
  document.head.appendChild(link);
}

let hideTimeoutId = null;

/**
 * Normalize first best practice item to display string.
 * @param {string|Object} item - From review.bestPractices[0]
 * @returns {string}
 */
function toDisplayText(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'object' && item.description) return String(item.description).trim();
  return String(item).trim();
}

/**
 * Position bubble relative to trigger (above floating button, or beside sidebar tab).
 * @param {HTMLElement} bubble
 * @param {HTMLElement} triggerEl
 */
function positionBubble(bubble, triggerEl) {
  const triggerRect = triggerEl.getBoundingClientRect();
  const isSidebar = triggerEl.id === 'thinkreview-sidebar-tab';
  const sideRight = triggerEl.classList.contains('side-right');

  bubble.style.position = 'fixed';
  bubble.style.zIndex = '10001';

  if (isSidebar) {
    // Place bubble outside the tab (left of left tab, right of right tab)
    const gap = 8;
    if (sideRight) {
      bubble.style.right = `${window.innerWidth - triggerRect.left + gap}px`;
      bubble.style.left = 'auto';
    } else {
      bubble.style.left = `${triggerRect.right + gap}px`;
      bubble.style.right = 'auto';
    }
    bubble.style.top = `${triggerRect.top + triggerRect.height / 2}px`;
    bubble.style.transform = 'translateY(-50%)';
    bubble.classList.add('thinkreview-completion-bubble-sidebar');
  } else {
    // Floating button (bottom-right or bottom-left): show bubble to the left of the button
    const gap = 8;
    bubble.style.right = `${window.innerWidth - triggerRect.left + gap}px`;
    bubble.style.left = 'auto';
    bubble.style.top = `${triggerRect.top + triggerRect.height / 2}px`;
    bubble.style.bottom = 'auto';
    bubble.style.transform = 'translateY(-50%)';
    bubble.classList.add('thinkreview-completion-bubble-float-left');
  }
}

/**
 * Shows a message bubble near the trigger for a given duration.
 * @param {HTMLElement} triggerEl - The ThinkReview trigger (floating button or sidebar tab)
 * @param {string} text - Text to show (will be truncated to MAX_TEXT_LENGTH)
 * @param {number} durationMs - How long to show the bubble (default BUBBLE_DURATION_MS = 5s)
 */
export function showBubble(triggerEl, text, durationMs = BUBBLE_DURATION_MS) {
  hideBubble();

  if (!triggerEl || !text || typeof text !== 'string') return;

  const displayText = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) + '…' : text;

  const bubble = document.createElement('div');
  bubble.id = BUBBLE_ID;
  bubble.className = 'thinkreview-completion-bubble';
  bubble.setAttribute('aria-live', 'polite');
  bubble.textContent = displayText;

  positionBubble(bubble, triggerEl);
  document.body.appendChild(bubble);

  hideTimeoutId = setTimeout(() => {
    hideBubble();
  }, durationMs);
}

/**
 * Hides and removes the completion bubble. Clears any pending hide timeout.
 */
export function hideBubble() {
  if (hideTimeoutId != null) {
    clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }
  const bubble = document.getElementById(BUBBLE_ID);
  if (bubble) bubble.remove();
}
