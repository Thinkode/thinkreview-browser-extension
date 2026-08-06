/**
 * Header control: pick scoring vs severity review layout.
 * Visual dropdown matches the Implement via / IDE assist picker.
 */

import { dbgWarn } from '../../utils/logger.js';

const _cssURL = chrome.runtime.getURL('components/popup-modules/review-format-preference-widget.css');
if (!document.querySelector(`link[href="${_cssURL}"]`)) {
  const _link = document.createElement('link');
  _link.rel = 'stylesheet';
  _link.href = _cssURL;
  document.head.appendChild(_link);
}

/** Scorecard / gauge icon for scoring format */
function createScoringIconSvg() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute(
    'd',
    'M4 19V5M4 19h16M8 15V9m4 6V7m4 8v-3'
  );
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/** Stacked severity / alert levels icon */
function createSeverityIconSvg() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute(
    'd',
    'M12 3L3 20h18L12 3zm0 6v5m0 3h.01'
  );
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

const ROWS = [
  {
    id: 'severity',
    label: 'severity',
    description: 'PR description with critical / high / low issues',
    icon: createSeverityIconSvg
  },
  {
    id: 'scoring',
    label: 'scoring',
    description: 'Scorecard with strengths & suggestions',
    icon: createScoringIconSvg
  }
];

async function _getFormat() {
  try {
    const result = await chrome.storage.local.get(['code-review-format']);
    return result['code-review-format'] === 'scoring' ? 'scoring' : 'severity';
  } catch (e) {
    dbgWarn('Failed to load review format preference:', e);
    return 'severity';
  }
}

async function _setFormat(format) {
  const normalized = format === 'scoring' ? 'scoring' : 'severity';
  await chrome.storage.local.set({ 'code-review-format': normalized });
  return normalized;
}

function _positionDropdown(dropdown, btn) {
  const rect = btn.getBoundingClientRect();
  const dropW = 280;
  let left = rect.right - dropW;
  if (left < 8) left = 8;
  const top = rect.bottom + 6;
  dropdown.style.position = 'fixed';
  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
  dropdown.style.width = `${dropW}px`;
}

function _setTrigger(btn, formatId) {
  const row = ROWS.find((r) => r.id === formatId) || ROWS[0];
  btn.replaceChildren();
  const icon = row.icon();
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'thinkreview-review-format-btn-label';
  label.textContent = row.label;
  btn.appendChild(icon);
  btn.appendChild(label);
  btn.setAttribute('aria-label', `Review format: ${row.label}`);
  btn.title = `Review format: ${row.label}`;
}

function _refreshDropdownActive(dropdown, activeId) {
  dropdown.querySelectorAll('.thinkreview-review-format-item').forEach((el) => {
    const id = el.dataset.format;
    const on = id === activeId;
    el.classList.toggle('active', on);
    const check = el.querySelector('.thinkreview-review-format-item-check');
    if (check) check.textContent = on ? '\u2713' : '';
  });
}

async function _trackFormatMenu(eventName, params = {}) {
  try {
    const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
    analyticsModule
      .trackUserAction(eventName, {
        context: 'integrated_review_panel',
        location: 'review_format_header_menu',
        ...params
      })
      .catch(() => {});
  } catch (_) {
    /* silent */
  }
}

/**
 * @param {HTMLElement} headerActionsEl
 * @param {{ onFormatChange?: (format: string) => void | Promise<void>, insertBeforeEl?: HTMLElement | null }} [options]
 */
export async function mountReviewFormatPreferenceWidget(headerActionsEl, options = {}) {
  if (!headerActionsEl || document.getElementById('thinkreview-review-format-btn')) return;

  const { onFormatChange, insertBeforeEl = null } = options;
  const current = await _getFormat();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'thinkreview-review-format-btn';
  btn.className = 'thinkreview-review-format-btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  _setTrigger(btn, current);

  const wrapper = document.createElement('span');
  wrapper.className = 'thinkreview-review-format-btn-wrapper';
  wrapper.id = 'thinkreview-review-format-btn-wrapper';
  const tooltip = document.createElement('span');
  tooltip.className = 'thinkreview-review-format-tooltip';
  tooltip.textContent = 'Review format';
  wrapper.appendChild(btn);
  wrapper.appendChild(tooltip);

  if (insertBeforeEl && insertBeforeEl.parentElement === headerActionsEl) {
    headerActionsEl.insertBefore(wrapper, insertBeforeEl);
  } else {
    const settingsWrapper = headerActionsEl.querySelector('.thinkreview-settings-btn-wrapper');
    if (settingsWrapper) {
      headerActionsEl.insertBefore(wrapper, settingsWrapper);
    } else {
      headerActionsEl.appendChild(wrapper);
    }
  }

  const dropdown = document.createElement('div');
  dropdown.id = 'thinkreview-review-format-dropdown';
  dropdown.setAttribute('role', 'menu');
  dropdown.style.display = 'none';

  const sectionLabel = document.createElement('div');
  sectionLabel.className = 'thinkreview-review-format-section-label';
  sectionLabel.textContent = 'Review format';
  dropdown.appendChild(sectionLabel);

  for (const row of ROWS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'thinkreview-review-format-item';
    item.dataset.format = row.id;
    item.setAttribute('role', 'menuitem');

    const iconWrap = document.createElement('span');
    iconWrap.className = 'thinkreview-review-format-item-icon';
    const ic = row.icon();
    ic.setAttribute('aria-hidden', 'true');
    iconWrap.appendChild(ic);

    const textWrap = document.createElement('span');
    textWrap.className = 'thinkreview-review-format-item-text';
    const lab = document.createElement('span');
    lab.className = 'thinkreview-review-format-item-label';
    lab.textContent = row.label;
    const desc = document.createElement('span');
    desc.className = 'thinkreview-review-format-item-desc';
    desc.textContent = row.description;
    textWrap.appendChild(lab);
    textWrap.appendChild(desc);

    const check = document.createElement('span');
    check.className = 'thinkreview-review-format-item-check';
    check.setAttribute('aria-hidden', 'true');

    item.appendChild(iconWrap);
    item.appendChild(textWrap);
    item.appendChild(check);
    dropdown.appendChild(item);
  }

  _refreshDropdownActive(dropdown, current);
  document.body.appendChild(dropdown);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const isOpen = dropdown.style.display !== 'none';
    if (isOpen) {
      dropdown.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    const active = await _getFormat();
    await _trackFormatMenu('review_format_menu_open_clicked', { reviewFormat: active });
    _refreshDropdownActive(dropdown, active);
    _positionDropdown(dropdown, btn);
    dropdown.style.display = 'block';
    btn.setAttribute('aria-expanded', 'true');
  });

  document.addEventListener('click', (e) => {
    if (e.target !== btn && !dropdown.contains(/** @type {Node} */ (e.target))) {
      dropdown.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  dropdown.addEventListener('click', async (e) => {
    e.stopPropagation();
    const item = e.target.closest('.thinkreview-review-format-item');
    if (!item) return;
    const id = item.dataset.format;
    if (!id) return;

    const previous = await _getFormat();
    if (id === previous) {
      dropdown.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
      return;
    }

    const selected = await _setFormat(id);
    await _trackFormatMenu('review_format_changed', {
      reviewFormat: selected,
      previous_format: previous
    });
    _setTrigger(btn, selected);
    _refreshDropdownActive(dropdown, selected);
    dropdown.style.display = 'none';
    btn.setAttribute('aria-expanded', 'false');

    if (typeof onFormatChange === 'function') {
      try {
        await onFormatChange(selected);
      } catch (err) {
        dbgWarn('Review format change handler failed:', err);
      }
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      if (dropdown.style.display !== 'none') _positionDropdown(dropdown, btn);
    },
    { passive: true }
  );
  window.addEventListener(
    'resize',
    () => {
      if (dropdown.style.display !== 'none') _positionDropdown(dropdown, btn);
    },
    { passive: true }
  );
}
