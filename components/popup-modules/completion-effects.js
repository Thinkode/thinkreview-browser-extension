/**
 * completion-effects.js
 * Runs the trigger shake animation for a set duration. Loads completion-effects.css.
 * Shake settings are configurable via the constants below.
 */

// ── Configurable shake constants ───────────────────────────────────────────
/** Number of shake cycles (each cycle = shake + calm period). */
export const SHAKE_CYCLES = 3;
/** Duration of one cycle (shake + calm) in milliseconds. */
export const SHAKE_CYCLE_DURATION_MS = 1500;
/** Total shake duration = cycles × cycle duration. Used for the timeout that removes the class. */
export const TOTAL_SHAKE_DURATION_MS = SHAKE_CYCLES * SHAKE_CYCLE_DURATION_MS;

// ── Styles ─────────────────────────────────────────────────────────────────
const cssURL = chrome.runtime.getURL('components/popup-modules/completion-effects.css');
if (!document.querySelector(`link[href="${cssURL}"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssURL;
  document.head.appendChild(link);
}

/* Injected style so animation duration and iteration count use the constants above. */
const SHAKE_STYLE_ID = 'thinkreview-shake-injected-style';
if (!document.getElementById(SHAKE_STYLE_ID)) {
  const cycleDurationSec = SHAKE_CYCLE_DURATION_MS / 1000;
  const style = document.createElement('style');
  style.id = SHAKE_STYLE_ID;
  style.textContent = `
#code-review-btn.thinkreview-trigger-shake {
  animation: thinkreview-shake-float ${cycleDurationSec}s ease-in-out ${SHAKE_CYCLES};
}
#thinkreview-sidebar-tab.thinkreview-trigger-shake {
  animation: thinkreview-shake-sidebar ${cycleDurationSec}s ease-in-out ${SHAKE_CYCLES};
}
`;
  document.head.appendChild(style);
}

let shakeTimeoutId = null;

/**
 * Runs the shake animation on the trigger, then removes the class after TOTAL_SHAKE_DURATION_MS.
 * @param {HTMLElement} triggerEl - The ThinkReview trigger (floating button or sidebar tab)
 * @param {number} [durationMs] - How long before removing the class (default: TOTAL_SHAKE_DURATION_MS)
 */
export function runTriggerShake(triggerEl, durationMs = TOTAL_SHAKE_DURATION_MS) {
  clearTriggerShake();
  if (!triggerEl) return;

  triggerEl.classList.add('thinkreview-trigger-shake');
  shakeTimeoutId = setTimeout(() => {
    triggerEl.classList.remove('thinkreview-trigger-shake');
    shakeTimeoutId = null;
  }, durationMs);
}

/**
 * Stops the shake and removes the shake class from the trigger.
 * Call when panel is expanded or when clearing completion effects.
 */
export function clearTriggerShake() {
  if (shakeTimeoutId != null) {
    clearTimeout(shakeTimeoutId);
    shakeTimeoutId = null;
  }
  const el = document.getElementById('code-review-btn') || document.getElementById('thinkreview-sidebar-tab');
  if (el) el.classList.remove('thinkreview-trigger-shake');
}
