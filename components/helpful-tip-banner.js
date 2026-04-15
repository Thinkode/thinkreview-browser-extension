/**
 * Manages the helpful tip banner that guides users to toggle auto review settings.
 * Handles styles injection, HTML generation, and settings button click handling.
 */

// UI identifiers
const STYLES_ID = 'helpful-tip-styles';
const SETTINGS_BUTTON_ID = 'helpful-tip-settings-btn';
const USAGE_BUTTON_ID = 'helpful-tip-usage-btn';

// Timing constants (in milliseconds)
const ANALYTICS_IMPORT_TIMEOUT = 5000;

/**
 * Injects the tip banner styles into the document head (once only).
 */
export function injectStyles() {
  if (document.getElementById(STYLES_ID)) {
    return;
  }

  const styleEl = document.createElement('style');
  styleEl.id = STYLES_ID;
  styleEl.textContent = `
    .helpful-tip-banner {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: rgba(99, 179, 237, 0.08);
      border: 1px solid rgba(99, 179, 237, 0.25);
      border-radius: 6px;
      padding: 10px 12px;
      margin: 0 0 10px;
    }
    .helpful-tip-icon {
      font-size: 14px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .helpful-tip-text {
      font-size: 14px;
      color: #a0aec0;
      line-height: 1.45;
      flex: 1;
    }
    .helpful-tip-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }
    .helpful-tip-settings-btn,
    .helpful-tip-usage-btn {
      flex-shrink: 0;
      padding: 5px 10px;
      border-radius: 4px;
      border: 1px solid #4a5568;
      background: #2d3748;
      color: #cbd5e0;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, border-color 0.15s;
    }
    .helpful-tip-settings-btn:hover,
    .helpful-tip-usage-btn:hover {
      background: #3d4a5e;
      border-color: #6b4fbb;
      color: #e2e8f0;
    }
  `;
  document.head.appendChild(styleEl);
}

/**
 * Returns the HTML markup for the tip banner.
 * @returns {string} HTML string for the banner
 */
export function getHTML() {
  return `
    <div class="helpful-tip-banner">
      <span class="helpful-tip-icon">💡</span>
      <span class="helpful-tip-text">You can switch the auto-review setting to manual mode to better manage your daily review credits.</span>
      <div class="helpful-tip-actions">
        <button id="${SETTINGS_BUTTON_ID}" type="button" class="helpful-tip-settings-btn">Go to Settings</button>
        <button id="${USAGE_BUTTON_ID}" type="button" class="helpful-tip-usage-btn">View my usage</button>
      </div>
    </div>
  `;
}

/**
 * Wires the helpful tip banner action buttons (settings and usage).
 * @param {HTMLElement} container - The parent container of the banner
 */
const USAGE_PORTAL_URL = 'https://portal.thinkreview.dev/usage';

export function wireActionButtons(container) {
  const analyticsPromise = import(chrome.runtime.getURL('utils/analytics-service.js'));

  const settingsBtn = container.querySelector(`#${SETTINGS_BUTTON_ID}`);
  if (settingsBtn) {
    settingsBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await analyticsPromise;
        trackUserAction('helpful_tip_banner_settings_clicked', {
          context: 'upgrade_prompt',
          location: 'integrated_panel'
        }).catch(() => {});
      } catch (_) { /* silent */ }

      chrome.runtime.sendMessage({
        type: 'OPEN_EXTENSION_POPUP',
        scrollTo: 'auto-start-review-section'
      });
    });
  }

  const usageBtn = container.querySelector(`#${USAGE_BUTTON_ID}`);
  if (usageBtn) {
    usageBtn.addEventListener('click', async () => {
      try {
        const analyticsModule = await analyticsPromise;
        analyticsModule
          .trackUserAction(analyticsModule.KEY_EVENT_LIMIT_BANNER_VIEW_MY_USAGE, {
            context: 'daily_limit_upgrade_prompt',
            location: 'integrated_panel_helpful_tip',
            destination: 'portal_usage',
            url: USAGE_PORTAL_URL
          })
          .catch(() => {});
      } catch (_) { /* silent */ }

      window.open(USAGE_PORTAL_URL, '_blank');
    });
  }
}
