/**
 * panel-settings-menu-widget.js
 * Settings gear opens a body-appended menu with nested Layout and Implement via flyouts,
 * plus a link to the full extension settings popup.
 */

import { dbgWarn } from '../../utils/logger.js';

const _cssURL = chrome.runtime.getURL('components/popup-modules/panel-settings-menu-widget.css');
if (!document.querySelector(`link[href="${_cssURL}"]`)) {
  const _link = document.createElement('link');
  _link.rel = 'stylesheet';
  _link.href = _cssURL;
  document.head.appendChild(_link);
}

function _layoutIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
}

function _implementIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
}

function _gearIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
}

function _positionMainMenu(dropdown, btn) {
  const rect = btn.getBoundingClientRect();
  const dropW = 240;
  let left = rect.right - dropW;
  if (left < 8) left = 8;
  const top = rect.bottom + 6;
  dropdown.style.position = 'fixed';
  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
  dropdown.style.width = `${dropW}px`;
}

function _positionSubmenu(submenu, anchorBtn, preferredWidth) {
  const rect = anchorBtn.getBoundingClientRect();
  const dropW = preferredWidth;
  const gap = 6;
  let left = rect.left - dropW - gap;
  if (left < 8) {
    left = rect.right + gap;
  }
  if (left + dropW > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - dropW - 8);
  }
  let top = rect.top;
  const maxH = Math.min(window.innerHeight * 0.7, 420);
  if (top + maxH > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - maxH - 8);
  }
  submenu.style.position = 'fixed';
  submenu.style.left = `${left}px`;
  submenu.style.top = `${top}px`;
  submenu.style.width = `${dropW}px`;
}

function _createMenuRow({ id, label, value, iconHtml, hasSubmenu }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'thinkreview-settings-menu-item';
  btn.dataset.menuAction = id;
  btn.setAttribute('role', 'menuitem');
  if (hasSubmenu) {
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
  }

  const icon = document.createElement('span');
  icon.className = 'thinkreview-settings-menu-item-icon';
  icon.innerHTML = iconHtml;

  const text = document.createElement('span');
  text.className = 'thinkreview-settings-menu-item-text';
  const lab = document.createElement('span');
  lab.className = 'thinkreview-settings-menu-item-label';
  lab.textContent = label;
  text.appendChild(lab);
  if (value != null) {
    const val = document.createElement('span');
    val.className = 'thinkreview-settings-menu-item-value';
    val.dataset.menuValue = id;
    val.textContent = value;
    text.appendChild(val);
  }

  btn.appendChild(icon);
  btn.appendChild(text);

  if (hasSubmenu) {
    const chevron = document.createElement('span');
    chevron.className = 'thinkreview-settings-menu-item-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '›';
    btn.appendChild(chevron);
  }

  return btn;
}

async function _trackSettingsMenu(eventName, params = {}) {
  try {
    const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
    analyticsModule
      .trackUserAction(eventName, {
        context: 'integrated_panel',
        location: 'settings_header_menu',
        ...params
      })
      .catch(() => {});
  } catch (_) {
    /* silent */
  }
}

/**
 * Attach nested settings dropdown to the existing gear button.
 * @param {HTMLElement} settingsButton
 * @param {{ settingsWrapper?: HTMLElement | null }} [options]
 */
export async function mountPanelSettingsMenu(settingsButton, options = {}) {
  if (!settingsButton || document.getElementById('thinkreview-settings-dropdown')) return;

  const layoutUrl = chrome.runtime.getURL('components/popup-modules/layout-settings-widget.js');
  const ideUrl = chrome.runtime.getURL('components/popup-modules/ide-assist-preference-widget.js');
  const idePrefUrl = chrome.runtime.getURL('utils/ide-integration/ide-assist-preference.js');

  let layoutMod;
  let ideMod;
  let getIdeAssistTarget;
  try {
    [layoutMod, ideMod, { getIdeAssistTarget }] = await Promise.all([
      import(layoutUrl),
      import(ideUrl),
      import(idePrefUrl)
    ]);
  } catch (e) {
    dbgWarn('Failed to load settings menu dependencies:', e);
    return;
  }

  const {
    getLayoutSettings,
    getLayoutComboSummary,
    populateLayoutOptions,
    refreshLayoutActiveItems
  } = layoutMod;
  const {
    populateIdeAssistOptions,
    refreshIdeAssistActiveItems,
    getIdeAssistRowLabel
  } = ideMod;

  const [layoutSettings, ideTarget] = await Promise.all([
    getLayoutSettings(),
    getIdeAssistTarget()
  ]);

  settingsButton.setAttribute('aria-haspopup', 'true');
  settingsButton.setAttribute('aria-expanded', 'false');
  settingsButton.setAttribute('aria-label', 'Panel settings');
  settingsButton.title = 'Settings';

  const main = document.createElement('div');
  main.id = 'thinkreview-settings-dropdown';
  main.setAttribute('role', 'menu');
  main.style.display = 'none';

  const sectionLabel = document.createElement('div');
  sectionLabel.className = 'thinkreview-settings-menu-section-label';
  sectionLabel.textContent = 'Settings';
  main.appendChild(sectionLabel);

  const layoutRow = _createMenuRow({
    id: 'layout',
    label: 'Layout',
    value: getLayoutComboSummary(layoutSettings),
    iconHtml: _layoutIconSvg(),
    hasSubmenu: true
  });
  const ideRow = _createMenuRow({
    id: 'implement',
    label: 'Implement via',
    value: getIdeAssistRowLabel(ideTarget),
    iconHtml: _implementIconSvg(),
    hasSubmenu: true
  });
  main.appendChild(layoutRow);
  main.appendChild(ideRow);

  const divider = document.createElement('div');
  divider.className = 'thinkreview-settings-menu-divider';
  divider.setAttribute('role', 'separator');
  main.appendChild(divider);

  const allSettingsRow = _createMenuRow({
    id: 'all-settings',
    label: 'All extension settings',
    value: null,
    iconHtml: _gearIconSvg(),
    hasSubmenu: false
  });
  main.appendChild(allSettingsRow);
  document.body.appendChild(main);

  const layoutSub = document.createElement('div');
  layoutSub.id = 'thinkreview-settings-layout-submenu';
  layoutSub.className = 'thinkreview-settings-submenu';
  layoutSub.setAttribute('role', 'menu');
  layoutSub.style.display = 'none';
  populateLayoutOptions(layoutSub, {
    settings: layoutSettings,
    onSelect: async (settings) => {
      const valueEl = layoutRow.querySelector('[data-menu-value="layout"]');
      if (valueEl) valueEl.textContent = getLayoutComboSummary(settings);
      _closeAll();
    }
  });
  document.body.appendChild(layoutSub);

  const ideSub = document.createElement('div');
  ideSub.id = 'thinkreview-settings-ide-submenu';
  ideSub.className = 'thinkreview-settings-submenu';
  ideSub.setAttribute('role', 'menu');
  ideSub.style.display = 'none';
  await populateIdeAssistOptions(ideSub, {
    activeId: ideTarget,
    onSelect: async (id, meta) => {
      if (!meta?.href) {
        const valueEl = ideRow.querySelector('[data-menu-value="implement"]');
        if (valueEl) valueEl.textContent = getIdeAssistRowLabel(id);
      }
      _closeAll();
    }
  });
  document.body.appendChild(ideSub);

  let openSubmenu = null; // 'layout' | 'implement' | null

  function _closeSubmenus() {
    layoutSub.style.display = 'none';
    ideSub.style.display = 'none';
    layoutRow.setAttribute('aria-expanded', 'false');
    ideRow.setAttribute('aria-expanded', 'false');
    openSubmenu = null;
  }

  function _closeAll() {
    _closeSubmenus();
    main.style.display = 'none';
    settingsButton.setAttribute('aria-expanded', 'false');
  }

  async function _openSubmenu(kind) {
    if (openSubmenu === kind) {
      _closeSubmenus();
      return;
    }
    _closeSubmenus();
    openSubmenu = kind;

    if (kind === 'layout') {
      const current = await getLayoutSettings();
      refreshLayoutActiveItems(layoutSub, current);
      const valueEl = layoutRow.querySelector('[data-menu-value="layout"]');
      if (valueEl) valueEl.textContent = getLayoutComboSummary(current);
      _positionSubmenu(layoutSub, layoutRow, 232);
      layoutSub.style.display = 'block';
      layoutRow.setAttribute('aria-expanded', 'true');
    } else if (kind === 'implement') {
      const active = await getIdeAssistTarget();
      refreshIdeAssistActiveItems(ideSub, active);
      const valueEl = ideRow.querySelector('[data-menu-value="implement"]');
      if (valueEl) valueEl.textContent = getIdeAssistRowLabel(active);
      _positionSubmenu(ideSub, ideRow, 280);
      ideSub.style.display = 'block';
      ideRow.setAttribute('aria-expanded', 'true');
    }
  }

  async function _openMain() {
    const [currentLayout, currentIde] = await Promise.all([
      getLayoutSettings(),
      getIdeAssistTarget()
    ]);
    const layoutVal = layoutRow.querySelector('[data-menu-value="layout"]');
    const ideVal = ideRow.querySelector('[data-menu-value="implement"]');
    if (layoutVal) layoutVal.textContent = getLayoutComboSummary(currentLayout);
    if (ideVal) ideVal.textContent = getIdeAssistRowLabel(currentIde);

    _positionMainMenu(main, settingsButton);
    main.style.display = 'block';
    settingsButton.setAttribute('aria-expanded', 'true');
    await _trackSettingsMenu('settings_menu_open_clicked');
  }

  settingsButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const isOpen = main.style.display !== 'none';
    if (isOpen) {
      _closeAll();
      return;
    }
    await _openMain();
  });

  main.addEventListener('click', async (e) => {
    e.stopPropagation();
    const item = e.target.closest('.thinkreview-settings-menu-item');
    if (!item) return;
    const action = item.dataset.menuAction;
    if (action === 'layout') {
      await _trackSettingsMenu('settings_menu_layout_clicked');
      await _openSubmenu('layout');
      return;
    }
    if (action === 'implement') {
      await _trackSettingsMenu('settings_menu_implement_clicked');
      await _openSubmenu('implement');
      return;
    }
    if (action === 'all-settings') {
      await _trackSettingsMenu('settings_opened', { via: 'all_extension_settings' });
      _closeAll();
      chrome.runtime.sendMessage({ type: 'OPEN_EXTENSION_POPUP' });
    }
  });

  document.addEventListener('click', (e) => {
    const t = /** @type {Node} */ (e.target);
    if (
      t === settingsButton ||
      settingsButton.contains(t) ||
      main.contains(t) ||
      layoutSub.contains(t) ||
      ideSub.contains(t)
    ) {
      return;
    }
    _closeAll();
  });

  const reposition = () => {
    if (main.style.display === 'none') return;
    _positionMainMenu(main, settingsButton);
    if (openSubmenu === 'layout') _positionSubmenu(layoutSub, layoutRow, 232);
    if (openSubmenu === 'implement') _positionSubmenu(ideSub, ideRow, 280);
  };
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition, { passive: true });

  // Keep tooltip text in sync with inclusive menu
  const tooltip = options.settingsWrapper?.querySelector('.thinkreview-settings-tooltip');
  if (tooltip) tooltip.textContent = 'Settings';
}
