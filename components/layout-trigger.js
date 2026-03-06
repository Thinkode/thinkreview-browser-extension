/**
 * layout-trigger.js
 * Module for injecting the trigger UI (floating button or sidebar tab) onto the page.
 * Loaded dynamically by content.js via chrome.runtime.getURL().
 */

// Load this module's CSS
const _cssURL = chrome.runtime.getURL('components/layout-trigger.css');
if (!document.querySelector(`link[href="${_cssURL}"]`)) {
  const _link = document.createElement('link');
  _link.rel = 'stylesheet';
  _link.href = _cssURL;
  document.head.appendChild(_link);
}

const FLOATING_BTN_CONTAINER_ID = 'code-review-btns';
const SIDEBAR_TAB_ID = 'thinkreview-sidebar-tab';

export const DEFAULT_LAYOUT_SETTINGS = {
  triggerMode: 'floating-button',
  buttonPosition: 'bottom-right',
  panelMode: 'overlay',
  sidebarSide: 'right',
};

/**
 * Reads layout settings from chrome.storage.local, merged with defaults.
 * @returns {Promise<Object>}
 */
export async function getLayoutSettings() {
  try {
    const result = await chrome.storage.local.get(['reviewLayoutSettings']);
    return { ...DEFAULT_LAYOUT_SETTINGS, ...(result.reviewLayoutSettings || {}) };
  } catch (_) {
    return { ...DEFAULT_LAYOUT_SETTINGS };
  }
}

/**
 * Removes any existing trigger elements from the page.
 */
export function removeTrigger() {
  document.getElementById(FLOATING_BTN_CONTAINER_ID)?.remove();
  document.getElementById(SIDEBAR_TAB_ID)?.remove();
}

/**
 * Injects the configured trigger element onto the page.
 * @param {Object} settings - Layout settings (from getLayoutSettings())
 * @param {Function} onToggle - Callback invoked when the trigger is activated
 */
export function injectTrigger(settings, onToggle) {
  removeTrigger();
  if (settings.triggerMode === 'sidebar-tab') {
    _injectSidebarTab(settings, onToggle);
  } else {
    _injectFloatingButton(settings, onToggle);
  }
}

/**
 * Updates the arrow indicator on the floating button (▲/▼).
 * No-op when the trigger is a sidebar tab.
 * @param {string} arrow - '▲' or '▼'
 */
export function updateTriggerArrow(arrow) {
  const reviewBtn = document.getElementById('code-review-btn');
  if (reviewBtn) {
    const arrowSpan = reviewBtn.querySelector('span:last-child');
    if (arrowSpan) arrowSpan.textContent = arrow;
  }
}

// ── Private helpers ───────────────────────────────────────

async function _trackClick(context) {
  try {
    const mod = await import(chrome.runtime.getURL('utils/analytics-service.js'));
    mod.trackUserAction('ai_review_clicked', { context, location: 'pr_page' }).catch(() => {});
  } catch (_) {}
}

function _injectFloatingButton(settings, onToggle) {
  const container = document.createElement('div');
  container.id = FLOATING_BTN_CONTAINER_ID;
  container.className = `thinkreview-floating-btn-container pos-${settings.buttonPosition || 'bottom-right'}`;

  const logoUrl = chrome.runtime.getURL('images/icon16.png');
  const btn = document.createElement('button');
  btn.id = 'code-review-btn';
  btn.style.cssText = 'padding:7px 12px;background:#6b4fbb;color:white;border:none;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
  btn.innerHTML = `<img src="${logoUrl}" style="width:14px;height:14px;border-radius:2px;flex-shrink:0;"><span>ThinkReview</span><span style="font-size:9px;opacity:0.8;">▼</span>`;

  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    _trackClick('main_button');
    onToggle();
  };

  container.appendChild(btn);
  document.body.appendChild(container);
}

function _injectSidebarTab(settings, onToggle) {
  const side = settings.sidebarSide || 'right';
  const chevron = side === 'right' ? '◀' : '▶';
  const logoUrl = chrome.runtime.getURL('images/icon16.png');

  const tab = document.createElement('button');
  tab.id = SIDEBAR_TAB_ID;
  tab.className = `thinkreview-sidebar-tab side-${side}`;
  tab.title = 'Open ThinkReview panel';
  // Logo and label wrapped together so rotation applies to both, keeping logo before text
  tab.innerHTML = `
    <span class="thinkreview-sidebar-tab-chevron">${chevron}</span>
    <span class="thinkreview-sidebar-tab-content">
      <img src="${logoUrl}" class="thinkreview-sidebar-tab-logo">
      <span class="thinkreview-sidebar-tab-label">ThinkReview</span>
    </span>
  `;

  tab.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    _trackClick('sidebar_tab');
    onToggle();
  };

  document.body.appendChild(tab);
}
