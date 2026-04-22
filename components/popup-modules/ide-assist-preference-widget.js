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

/** Small “off” glyph for the “no IDE buttons” option (not from brand assets). */
function createNoneIdeIconSvg() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '9');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  const line = document.createElementNS(NS, 'path');
  line.setAttribute('d', 'M7 7l10 10M17 7L7 17');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linecap', 'round');
  svg.appendChild(circle);
  svg.appendChild(line);
  return svg;
}

const ROWS = [
  { id: 'cursor', label: 'Cursor', icon: createCursorProductIconSvg },
  { id: 'github_copilot', label: 'GitHub Copilot via VS Code', icon: createGitHubCopilotIconSvg },
  { id: 'claude_code', label: 'Claude Code via VS Code', icon: createClaudeCodeIconSvg },
  { id: 'none', label: 'None (hide Implement buttons)', icon: createNoneIdeIconSvg }
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
  btn.setAttribute(
    'aria-label',
    targetId === 'none'
      ? 'Implement buttons off — choose an option to show them on list rows'
      : 'Choose where to implement from (row buttons)'
  );
}

async function _trackIdeAssistMenu(eventName, params = {}) {
  try {
    const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
    analyticsModule
      .trackUserAction(eventName, {
        context: 'integrated_review_panel',
        location: 'ide_assist_header_menu',
        ...params
      })
      .catch(() => {});
  } catch (_) {
    /* silent */
  }
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
  const _panelRoot = window.__thinkreviewShadowRoot || document;
  if (!headerActionsEl || _panelRoot.getElementById('thinkreview-ide-assist-btn')) return;

  // Also inject the widget's own CSS into the shadow root so the button (inside shadow) is styled.
  const _widgetCssURL = chrome.runtime.getURL('components/popup-modules/ide-assist-preference-widget.css');
  if (!_panelRoot.querySelector(`link[href="${_widgetCssURL}"]`)) {
    const _shadowLink = document.createElement('link');
    _shadowLink.rel = 'stylesheet';
    _shadowLink.href = _widgetCssURL;
    _panelRoot.appendChild(_shadowLink);
  }

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
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  _setTriggerIcon(btn, current);

  const wrapper = document.createElement('span');
  wrapper.className = 'thinkreview-ide-assist-btn-wrapper';
  const tooltip = document.createElement('span');
  tooltip.className = 'thinkreview-ide-assist-tooltip';
  tooltip.textContent = 'Implement via';
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
    if (row.id === 'none') {
      const divider = document.createElement('div');
      divider.className = 'thinkreview-ide-assist-divider';
      divider.setAttribute('role', 'separator');
      dropdown.appendChild(divider);
    }
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
    await _trackIdeAssistMenu('ide_assist_menu_open_clicked', { ide: active });
    _refreshDropdownActive(dropdown, active);
    _positionDropdown(dropdown, btn);
    dropdown.style.display = 'block';
    btn.setAttribute('aria-expanded', 'true');
  });

  // Use composedPath() so clicks inside the shadow DOM (which retarget e.target
  // to the shadow host) are still correctly identified as "inside the panel".
  document.addEventListener('click', (e) => {
    const path = e.composedPath();
    if (!path.includes(dropdown)) {
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

    const previousIde = await getIdeAssistTarget();
    await setIdeAssistTarget(id);
    await _trackIdeAssistMenu(`ide_assist_menu_${id}_selected_clicked`, {
      ide: id,
      previous_ide: previousIde
    });
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
