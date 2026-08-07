/**
 * user-toast.js
 * Friendly in-page toast near the ThinkReview trigger (replaces native alert()).
 */

const TOAST_ID = 'thinkreview-user-toast';
const DEFAULT_DURATION_MS = 4500;

const cssURL = chrome.runtime.getURL('components/popup-modules/user-toast.css');
if (!document.querySelector(`link[href="${cssURL}"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssURL;
  document.head.appendChild(link);
}

let hideTimeoutId = null;

/**
 * Info circle icon for toast.
 * @returns {SVGElement}
 */
function createInfoIconSvg() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('thinkreview-user-toast-icon');

  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '9');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  svg.appendChild(circle);

  const stem = document.createElementNS(NS, 'path');
  stem.setAttribute('d', 'M12 11v5');
  stem.setAttribute('stroke', 'currentColor');
  stem.setAttribute('stroke-width', '2');
  stem.setAttribute('stroke-linecap', 'round');
  svg.appendChild(stem);

  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('cx', '12');
  dot.setAttribute('cy', '8');
  dot.setAttribute('r', '1.25');
  dot.setAttribute('fill', 'currentColor');
  svg.appendChild(dot);

  return svg;
}

/**
 * Position toast relative to trigger, or top-center as fallback.
 * @param {HTMLElement} toast
 * @param {HTMLElement|null} triggerEl
 */
function positionToast(toast, triggerEl) {
  toast.style.position = 'fixed';
  toast.style.zIndex = '10002';

  if (!triggerEl) {
    toast.style.top = '24px';
    toast.style.left = '50%';
    toast.style.right = 'auto';
    toast.style.bottom = 'auto';
    toast.style.transform = 'translateX(-50%)';
    toast.classList.add('thinkreview-user-toast-center');
    return;
  }

  const triggerRect = triggerEl.getBoundingClientRect();
  const isSidebar = triggerEl.id === 'thinkreview-sidebar-tab';
  const sideRight = triggerEl.classList.contains('side-right');
  const gap = 10;

  if (isSidebar) {
    if (sideRight) {
      toast.style.right = `${window.innerWidth - triggerRect.left + gap}px`;
      toast.style.left = 'auto';
    } else {
      toast.style.left = `${triggerRect.right + gap}px`;
      toast.style.right = 'auto';
    }
    toast.style.top = `${triggerRect.top + triggerRect.height / 2}px`;
    toast.style.bottom = 'auto';
    toast.style.transform = 'translateY(-50%)';
    toast.classList.add('thinkreview-user-toast-sidebar');
    return;
  }

  toast.style.right = `${window.innerWidth - triggerRect.left + gap}px`;
  toast.style.left = 'auto';
  toast.style.top = `${triggerRect.top + triggerRect.height / 2}px`;
  toast.style.bottom = 'auto';
  toast.style.transform = 'translateY(-50%)';
  toast.classList.add('thinkreview-user-toast-float-left');
}

/**
 * Shows a non-blocking toast near the ThinkReview trigger.
 * @param {Object} options
 * @param {string} options.message - Body text
 * @param {string} [options.title] - Optional short title
 * @param {number} [options.durationMs] - Auto-hide duration (default 4500)
 * @param {HTMLElement|null} [options.triggerEl] - Anchor element; resolved if omitted
 */
export async function showUserToast({ message, title, durationMs = DEFAULT_DURATION_MS, triggerEl = null } = {}) {
  hideUserToast();

  if (!message || typeof message !== 'string') return;

  let anchor = triggerEl;
  if (!anchor) {
    try {
      const triggerResolver = await import(chrome.runtime.getURL('components/popup-modules/trigger-resolver.js'));
      anchor = triggerResolver.getActiveTriggerElement();
    } catch (_) {
      anchor = document.getElementById('code-review-btn') || document.getElementById('thinkreview-sidebar-tab');
    }
  }

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.className = 'thinkreview-user-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const row = document.createElement('div');
  row.className = 'thinkreview-user-toast-row';
  row.appendChild(createInfoIconSvg());

  const body = document.createElement('div');
  body.className = 'thinkreview-user-toast-body';

  if (title) {
    const titleEl = document.createElement('span');
    titleEl.className = 'thinkreview-user-toast-title';
    titleEl.textContent = title;
    body.appendChild(titleEl);
  }

  const messageEl = document.createElement('span');
  messageEl.className = 'thinkreview-user-toast-message';
  messageEl.textContent = message;
  body.appendChild(messageEl);
  row.appendChild(body);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'thinkreview-user-toast-close';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideUserToast();
  });
  row.appendChild(closeBtn);

  toast.appendChild(row);
  positionToast(toast, anchor);
  document.body.appendChild(toast);

  hideTimeoutId = setTimeout(() => {
    hideUserToast(true);
  }, durationMs);
}

/**
 * Hides and removes the toast.
 * @param {boolean} [animate] - Fade out before remove
 */
export function hideUserToast(animate = false) {
  if (hideTimeoutId != null) {
    clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }
  const toast = document.getElementById(TOAST_ID);
  if (!toast) return;

  if (animate) {
    toast.classList.add('thinkreview-user-toast-out');
    setTimeout(() => {
      const el = document.getElementById(TOAST_ID);
      if (el) el.remove();
    }, 200);
    return;
  }
  toast.remove();
}
