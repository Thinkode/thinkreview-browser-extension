/**
 * panel-text-size-widget.js
 * In-panel text size preference (Small / Medium / Large / Extra large).
 * Used by the panel settings gear submenu.
 */

import { dbgWarn } from '../../utils/logger.js';

const _cssURL = chrome.runtime.getURL('components/popup-modules/panel-text-size-widget.css');
if (!document.querySelector(`link[href="${_cssURL}"]`)) {
  const _link = document.createElement('link');
  _link.rel = 'stylesheet';
  _link.href = _cssURL;
  document.head.appendChild(_link);
}

export const PANEL_TEXT_SIZE_STORAGE_KEY = 'panelTextSize';

export const TEXT_SIZE_OPTIONS = [
  { id: 'small', label: 'Small', zoom: 0.875 },
  { id: 'medium', label: 'Medium', zoom: 1 },
  { id: 'large', label: 'Large', zoom: 1.125 },
  { id: 'x-large', label: 'Extra large', zoom: 1.25 }
];

const DEFAULT_TEXT_SIZE = 'medium';

export async function getPanelTextSize() {
  try {
    const result = await chrome.storage.local.get([PANEL_TEXT_SIZE_STORAGE_KEY]);
    const raw = result[PANEL_TEXT_SIZE_STORAGE_KEY];
    return TEXT_SIZE_OPTIONS.some((o) => o.id === raw) ? raw : DEFAULT_TEXT_SIZE;
  } catch (e) {
    dbgWarn('Failed to load panel text size:', e);
    return DEFAULT_TEXT_SIZE;
  }
}

export async function savePanelTextSize(sizeId) {
  const option = TEXT_SIZE_OPTIONS.find((o) => o.id === sizeId);
  if (!option) return;
  await chrome.storage.local.set({ [PANEL_TEXT_SIZE_STORAGE_KEY]: option.id });
}

export function getPanelTextSizeLabel(sizeId) {
  const option = TEXT_SIZE_OPTIONS.find((o) => o.id === sizeId);
  return option ? option.label : 'Medium';
}

export function getPanelTextSizeZoom(sizeId) {
  const option = TEXT_SIZE_OPTIONS.find((o) => o.id === sizeId);
  return option ? option.zoom : 1;
}

/**
 * Apply text size to the integrated review panel root element.
 * @param {HTMLElement | null | undefined} panelEl
 * @param {string} sizeId
 */
export function applyPanelTextSize(panelEl, sizeId) {
  if (!panelEl) return;
  const option = TEXT_SIZE_OPTIONS.find((o) => o.id === sizeId) || TEXT_SIZE_OPTIONS[1];
  panelEl.dataset.panelTextSize = option.id;
  panelEl.style.setProperty('--thinkreview-text-zoom', String(option.zoom));
}

/**
 * Fill a container with text size options (settings submenu).
 * @param {HTMLElement} container
 * @param {{ activeId?: string, onSelect?: (sizeId: string) => void | Promise<void> }} [options]
 */
export function populateTextSizeOptions(container, options = {}) {
  const { activeId = DEFAULT_TEXT_SIZE, onSelect } = options;
  container.replaceChildren();

  const label = document.createElement('div');
  label.className = 'thinkreview-text-size-section-label';
  label.textContent = 'Text size';
  container.appendChild(label);

  for (const option of TEXT_SIZE_OPTIONS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `thinkreview-text-size-item${option.id === activeId ? ' active' : ''}`;
    item.dataset.textSize = option.id;
    item.setAttribute('role', 'menuitem');

    const preview = document.createElement('span');
    preview.className = 'thinkreview-text-size-preview';
    preview.textContent = 'Aa';
    preview.style.fontSize = `${Math.round(14 * option.zoom)}px`;

    const text = document.createElement('span');
    text.className = 'thinkreview-text-size-item-label';
    text.textContent = option.label;

    item.appendChild(preview);
    item.appendChild(text);

    if (option.id === activeId) {
      const check = document.createElement('span');
      check.className = 'thinkreview-text-size-item-check';
      check.setAttribute('aria-label', 'active');
      check.textContent = '✓';
      item.appendChild(check);
    }

    container.appendChild(item);
  }

  container.addEventListener('click', async (e) => {
    e.stopPropagation();
    const item = e.target.closest('.thinkreview-text-size-item');
    if (!item) return;

    const sizeId = item.dataset.textSize;
    if (!sizeId || item.classList.contains('active')) return;

    await savePanelTextSize(sizeId);
    refreshTextSizeActiveItems(container, sizeId);

    const panelEl = document.getElementById('gitlab-mr-integrated-review');
    applyPanelTextSize(panelEl, sizeId);
    document.dispatchEvent(new CustomEvent('thinkreview:textsizechanged', { detail: { sizeId } }));

    if (typeof onSelect === 'function') {
      await onSelect(sizeId);
    }
  });
}

export function refreshTextSizeActiveItems(container, activeId) {
  container.querySelectorAll('.thinkreview-text-size-item').forEach((item) => {
    const isActive = item.dataset.textSize === activeId;
    item.classList.toggle('active', isActive);
    let check = item.querySelector('.thinkreview-text-size-item-check');
    if (isActive && !check) {
      check = document.createElement('span');
      check.className = 'thinkreview-text-size-item-check';
      check.setAttribute('aria-label', 'active');
      check.textContent = '✓';
      item.appendChild(check);
    } else if (!isActive && check) {
      check.remove();
    }
  });
}
