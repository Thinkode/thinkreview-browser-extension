/**
 * trigger-resolver.js
 * Returns the active ThinkReview trigger element (floating button or sidebar tab).
 * Used so completion effects (shake, bubble) work for both layouts.
 */

const FLOATING_BTN_ID = 'code-review-btn';
const SIDEBAR_TAB_ID = 'thinkreview-sidebar-tab';

/**
 * Returns the currently visible trigger element: floating button or sidebar tab.
 * @returns {HTMLElement | null}
 */
export function getActiveTriggerElement() {
  return document.getElementById(FLOATING_BTN_ID) || document.getElementById(SIDEBAR_TAB_ID);
}

/**
 * Removes the shake class from the active trigger (if present).
 * Call when panel is expanded or when clearing completion effects.
 */
export function clearTriggerShake() {
  const el = document.getElementById(FLOATING_BTN_ID) || document.getElementById(SIDEBAR_TAB_ID);
  if (el) el.classList.remove('thinkreview-trigger-shake');
}
