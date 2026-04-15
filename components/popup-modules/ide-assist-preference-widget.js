/**
 * Header control: pick which IDE shortcut appears on suggestion / best-practice rows.
 * Placed next to the layout button; dropdown is appended to document.body.
 */

import { dbgWarn } from '../../utils/logger.js';
import {
  createClaudeCodeIconSvg,
  createCursorProductIconSvg,
  createGitHubCopilotIconSvg,
  ensureIdeActionIconsLoaded
} from '../../utils/ide-integration/ide-action-icons.js';
import { getIdeAssistTarget, setIdeAssistTarget } from '../../utils/ide-integration/ide-assist-preference.js';

const _cssURL = chrome.runtime.getURL('components/popup-modules/ide-assist-preference-widget.css');
if (!document.querySelector(`link[href="${_cssURL}"]`)) {
  const _link = document.createElement('link');
  _link.rel = 'stylesheet';
  _link.href = _cssURL;
  document.head.appendChild(_link);
}

const ROWS = [
  { id: 'cursor', label: 'Cursor', icon: createCursorProductIconSvg },
  { id: 'github_copilot', label: 'GitHub Copilot via VS Code', icon: createGitHubCopilotIconSvg },
  { id: 'claude_code', label: 'Claude Code via VS Code', icon: createClaudeCodeIconSvg }
];

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

function _setTriggerIcon(btn, targetId) {
  const row = ROWS.find((r) => r.id === targetId) || ROWS[0];
  btn.replaceChildren();
  const icon = row.icon();
  icon.setAttribute('aria-hidden', 'true');
  btn.appendChild(icon);
}

function _refreshDropdownActive(dropdown, activeId) {
  dropdown.querySelectorAll('.thinkreview-ide-assist-item').forEach((el) => {
    const id = el.dataset.ide;
    const on = id === activeId;
    el.classList.toggle('active', on);
    const check = el.querySelector('.thinkreview-ide-assist-item-check');
    if (check) check.textContent = on ? '\u2713' : '';
  });
}

/**
 * @param {HTMLElement} headerActionsEl
 */
export async function mountIdeAssistPreferenceWidget(headerActionsEl) {
  if (!headerActionsEl || document.getElementById('thinkreview-ide-assist-btn')) return;

  try {
    await ensureIdeActionIconsLoaded();
  } catch (e) {
    dbgWarn('IDE assist widget: failed to preload icons', e);
    return;
  }

  const current = await getIdeAssistTarget();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'thinkreview-ide-assist-btn';
  btn.className = 'thinkreview-ide-assist-btn';
  btn.setAttribute('aria-label', 'Choose IDE for suggestion actions');
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  _setTriggerIcon(btn, current);

  const wrapper = document.createElement('span');
  wrapper.className = 'thinkreview-ide-assist-btn-wrapper';
  const tooltip = document.createElement('span');
  tooltip.className = 'thinkreview-ide-assist-tooltip';
  tooltip.textContent = 'IDE for suggestion buttons';
  wrapper.appendChild(btn);
  wrapper.appendChild(tooltip);

  const layoutWrapper = headerActionsEl.querySelector('.thinkreview-layout-btn-wrapper');
  if (layoutWrapper) {
    layoutWrapper.insertAdjacentElement('afterend', wrapper);
  } else {
    headerActionsEl.insertBefore(wrapper, headerActionsEl.firstChild);
  }

  const dropdown = document.createElement('div');
  dropdown.id = 'thinkreview-ide-assist-dropdown';
  dropdown.setAttribute('role', 'menu');
  dropdown.style.display = 'none';

  const label = document.createElement('div');
  label.className = 'thinkreview-ide-assist-section-label';
  label.textContent = 'Implement via';
  dropdown.appendChild(label);

  for (const row of ROWS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'thinkreview-ide-assist-item';
    item.dataset.ide = row.id;
    item.setAttribute('role', 'menuitem');

    const iconWrap = document.createElement('span');
    iconWrap.className = 'thinkreview-ide-assist-item-icon';
    const ic = row.icon();
    ic.setAttribute('aria-hidden', 'true');
    iconWrap.appendChild(ic);

    const lab = document.createElement('span');
    lab.className = 'thinkreview-ide-assist-item-label';
    lab.textContent = row.label;

    const check = document.createElement('span');
    check.className = 'thinkreview-ide-assist-item-check';
    check.setAttribute('aria-hidden', 'true');

    item.appendChild(iconWrap);
    item.appendChild(lab);
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
    const active = await getIdeAssistTarget();
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
    const item = e.target.closest('.thinkreview-ide-assist-item');
    if (!item) return;
    const id = item.dataset.ide;
    if (!id) return;

    await setIdeAssistTarget(id);
    _setTriggerIcon(btn, id);
    _refreshDropdownActive(dropdown, id);
    dropdown.style.display = 'none';
    btn.setAttribute('aria-expanded', 'false');

    document.dispatchEvent(new CustomEvent('thinkreview:ideassistchanged'));
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
