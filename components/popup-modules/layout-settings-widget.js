/**
 * layout-settings-widget.js
 * In-panel layout button with a body-appended dropdown showing grouped layout combinations.
 * Appended to document.body to avoid overflow clipping by the panel container.
 */

import { dbgWarn } from '../../utils/logger.js';

// Load this module's CSS
const _cssURL = chrome.runtime.getURL('components/popup-modules/layout-settings-widget.css');
if (!document.querySelector(`link[href="${_cssURL}"]`)) {
  const _link = document.createElement('link');
  _link.rel = 'stylesheet';
  _link.href = _cssURL;
  document.head.appendChild(_link);
}

const DEFAULT_LAYOUT_SETTINGS = {
  triggerMode: 'floating-button',
  buttonPosition: 'bottom-right',
  panelMode: 'overlay',
  sidebarSide: 'right',
};

// Grouped layout combinations
const LAYOUT_GROUPS = [
  {
    label: 'Floating Button',
    combos: [
      { id: 'float-br', label: 'Bottom Right', settings: { triggerMode: 'floating-button', buttonPosition: 'bottom-right', panelMode: 'overlay', sidebarSide: 'right' } },
      { id: 'float-bl', label: 'Bottom Left',  settings: { triggerMode: 'floating-button', buttonPosition: 'bottom-left',  panelMode: 'overlay', sidebarSide: 'left'  } },
    ],
  },
  {
    label: 'Sidebar Tab',
    combos: [
      { id: 'tab-right', label: 'Right side', settings: { triggerMode: 'sidebar-tab', buttonPosition: 'bottom-right', panelMode: 'overlay', sidebarSide: 'right' } },
      { id: 'tab-left',  label: 'Left side',  settings: { triggerMode: 'sidebar-tab', buttonPosition: 'bottom-right', panelMode: 'overlay', sidebarSide: 'left'  } },
    ],
  },
  {
    label: 'Docked Sidebar',
    combos: [
      { id: 'docked-right', label: 'Right side', settings: { triggerMode: 'sidebar-tab', buttonPosition: 'bottom-right', panelMode: 'docked', sidebarSide: 'right' } },
      { id: 'docked-left',  label: 'Left side',  settings: { triggerMode: 'sidebar-tab', buttonPosition: 'bottom-right', panelMode: 'docked', sidebarSide: 'left'  } },
    ],
  },
];

const ALL_COMBOS = LAYOUT_GROUPS.flatMap(g => g.combos);

async function _getSettings() {
  try {
    const result = await chrome.storage.local.get(['reviewLayoutSettings']);
    return { ...DEFAULT_LAYOUT_SETTINGS, ...(result.reviewLayoutSettings || {}) };
  } catch (e) {
    dbgWarn('Failed to load layout settings:', e);
    return { ...DEFAULT_LAYOUT_SETTINGS };
  }
}

async function _saveSettings(settings) {
  await chrome.storage.local.set({ reviewLayoutSettings: settings });
}

function _getActiveComboId(settings) {
  const c = ALL_COMBOS.find(c =>
    c.settings.triggerMode === settings.triggerMode &&
    c.settings.buttonPosition === settings.buttonPosition &&
    c.settings.panelMode === settings.panelMode &&
    c.settings.sidebarSide === settings.sidebarSide
  );
  return c ? c.id : null;
}

/**
 * Mounts the layout button into the header-actions element.
 * The dropdown is appended to document.body to avoid overflow clipping.
 * @param {HTMLElement} headerActionsEl
 */
export async function mountLayoutSettingsWidget(headerActionsEl) {
  if (!headerActionsEl || document.getElementById('thinkreview-layout-btn')) return;

  const settings = await _getSettings();

  // ── Button ──────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'thinkreview-layout-btn';
  btn.className = 'thinkreview-layout-btn';
  btn.title = 'Layout & display options';
  btn.setAttribute('aria-label', 'Layout options');
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;

  headerActionsEl.insertBefore(btn, headerActionsEl.firstChild);

  // ── Dropdown (body-appended to avoid overflow clipping) ──
  const dropdown = document.createElement('div');
  dropdown.id = 'thinkreview-layout-dropdown';
  dropdown.className = 'thinkreview-layout-dropdown';
  dropdown.style.display = 'none';
  dropdown.innerHTML = _buildDropdownHTML(settings);
  document.body.appendChild(dropdown);

  // ── Toggle dropdown ──────────────────────────────────────
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const isOpen = dropdown.style.display !== 'none';
    if (isOpen) {
      dropdown.style.display = 'none';
      return;
    }
    // Refresh active state
    const current = await _getSettings();
    _refreshActiveItems(dropdown, current);
    // Position relative to button
    _positionDropdown(dropdown, btn);
    dropdown.style.display = 'block';
  });

  // ── Close on outside click ───────────────────────────────
  document.addEventListener('click', (e) => {
    if (e.target !== btn && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  // ── Handle combo item clicks ─────────────────────────────
  dropdown.addEventListener('click', async (e) => {
    e.stopPropagation(); // Prevent panel header from collapsing
    const item = e.target.closest('.thinkreview-layout-item');
    if (!item) return;

    const comboId = item.dataset.combo;
    const combo = ALL_COMBOS.find(c => c.id === comboId);
    if (!combo) return;

    await _saveSettings(combo.settings);
    _refreshActiveItems(dropdown, combo.settings);
    document.dispatchEvent(new CustomEvent('thinkreview:layoutchanged', { detail: combo.settings }));

    setTimeout(() => { dropdown.style.display = 'none'; }, 150);
  });

  // ── Reposition on scroll/resize ─────────────────────────
  window.addEventListener('scroll', () => {
    if (dropdown.style.display !== 'none') _positionDropdown(dropdown, btn);
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (dropdown.style.display !== 'none') _positionDropdown(dropdown, btn);
  }, { passive: true });
}

// ── Private helpers ───────────────────────────────────────

function _positionDropdown(dropdown, btn) {
  const rect = btn.getBoundingClientRect();
  const dropW = 232;
  let left = rect.right - dropW;
  if (left < 8) left = 8;
  const top = rect.bottom + 6;
  dropdown.style.position = 'fixed';
  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
  dropdown.style.width = `${dropW}px`;
}

function _buildDropdownHTML(settings) {
  const activeId = _getActiveComboId(settings);
  return LAYOUT_GROUPS.map((group, gi) => `
    ${gi > 0 ? '<div class="thinkreview-layout-divider"></div>' : ''}
    <div class="thinkreview-layout-section-label">${group.label}</div>
    ${group.combos.map(combo => `
      <button
        class="thinkreview-layout-item${activeId === combo.id ? ' active' : ''}"
        data-combo="${combo.id}"
      >
        <span class="thinkreview-layout-item-diagram">${_buildDiagram(combo.settings)}</span>
        <span class="thinkreview-layout-item-label">${combo.label}</span>
        ${activeId === combo.id ? '<span class="thinkreview-layout-item-check" aria-label="active">✓</span>' : ''}
      </button>
    `).join('')}
  `).join('');
}

function _refreshActiveItems(dropdown, settings) {
  const activeId = _getActiveComboId(settings);
  dropdown.querySelectorAll('.thinkreview-layout-item').forEach(item => {
    const isActive = item.dataset.combo === activeId;
    item.classList.toggle('active', isActive);
    let check = item.querySelector('.thinkreview-layout-item-check');
    if (isActive && !check) {
      check = document.createElement('span');
      check.className = 'thinkreview-layout-item-check';
      check.setAttribute('aria-label', 'active');
      check.textContent = '✓';
      item.appendChild(check);
    } else if (!isActive && check) {
      check.remove();
    }
  });
}

function _buildDiagram(s) {
  const isTab = s.triggerMode === 'sidebar-tab';
  const isDocked = s.panelMode === 'docked';
  const isLeft = s.sidebarSide === 'left';
  const isTopPos = s.buttonPosition && s.buttonPosition.startsWith('top');
  const isLeftPos = s.buttonPosition && s.buttonPosition.endsWith('left');

  const pageBg = `<rect x="0.5" y="0.5" width="39" height="27" rx="2" fill="#2a2440" stroke="#4a3880" stroke-width="0.8"/>`;
  let elements = '';

  if (isDocked) {
    const x = isLeft ? 0.5 : 28.5;
    elements = `
      <rect x="${x}" y="0.5" width="11" height="27" rx="2" fill="#6b4fbb" opacity="0.85"/>
      <rect x="${isLeft ? 2 : 30}" y="10" width="7" height="7" rx="1" fill="#9b7ef0"/>
    `;
  } else if (isTab) {
    const tx = isLeft ? 0.5 : 35.5;
    elements = `
      <rect x="${tx}" y="8" width="4" height="12" rx="1" fill="#6b4fbb" opacity="0.9"/>
      <rect x="${isLeft ? 6 : 5}" y="4" width="19" height="19" rx="2" fill="#4a3880" stroke="#6b4fbb" stroke-width="0.6"/>
    `;
  } else {
    const bx = isLeftPos ? 2 : 29;
    const by = isTopPos ? 2 : 21;
    const px = isLeftPos ? 2 : 8;
    const py = isTopPos ? 9 : 3;
    elements = `
      <rect x="${px}" y="${py}" width="20" height="14" rx="2" fill="#4a3880" stroke="#6b4fbb" stroke-width="0.6"/>
      <rect x="${bx}" y="${by}" width="9" height="5" rx="1" fill="#6b4fbb"/>
    `;
  }

  return `<svg viewBox="0 0 40 28" width="40" height="28" xmlns="http://www.w3.org/2000/svg">${pageBg}${elements}</svg>`;
}


