/**
 * completion-message-bubble.js
 * Shows review completion text (suggestion or critical issue) in a tooltip-style bubble near the trigger.
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
 * Format a severity issue for the completion bubble: title plus location up to the line number
 * (no description).
 * @param {string|Object} issue
 * @returns {string}
 */
function formatSeverityIssueBubbleText(issue) {
  if (issue == null) return '';
  if (typeof issue === 'string') return issue.trim();
  const title = issue.title ? String(issue.title).trim() : '';
  let location = '';
  if (issue.filePath) {
    const start = typeof issue.startLine === 'number' ? issue.startLine : null;
    const end = typeof issue.endLine === 'number' ? issue.endLine : start;
    if (start != null && end != null && end !== start) {
      location = `${issue.filePath}:${start}-${end}`;
    } else if (start != null) {
      location = `${issue.filePath}:${start}`;
    } else {
      location = String(issue.filePath);
    }
  }
  const parts = [title, location].filter(Boolean);
  return parts.join(' — ');
}

/**
 * Text for the completion bubble: first suggestion (scoring) or first critical issue (severity).
 * @param {Object} review
 * @param {boolean} isSeverityFormat
 * @returns {string}
 */
export function getCompletionBubbleText(review, isSeverityFormat) {
  if (isSeverityFormat) {
    const issues = review.criticalIssues;
    if (!Array.isArray(issues) || issues.length === 0) return '';
    return formatSeverityIssueBubbleText(issues[0]);
  }
  const suggestions = review.suggestions;
  if (!Array.isArray(suggestions) || suggestions.length === 0) return '';
  const first = suggestions[0];
  if (typeof first === 'string') return first.trim();
  if (first && typeof first === 'object' && first.description) return String(first.description).trim();
  return String(first).trim();
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
