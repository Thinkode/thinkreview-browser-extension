/**
 * First-open interactive tour for integrated panel settings.
 * Walks through review format, text size, settings gear, layout, and auto-start.
 */

import { dbgWarn } from '../../utils/logger.js';

const _cssURL = chrome.runtime.getURL('components/popup-modules/panel-settings-tour.css');
if (!document.querySelector(`link[href="${_cssURL}"]`)) {
  const _link = document.createElement('link');
  _link.rel = 'stylesheet';
  _link.href = _cssURL;
  document.head.appendChild(_link);
}

export const PANEL_SETTINGS_TOUR_SEEN_KEY = 'thinkreview-panel-settings-tour-seen';
export const PANEL_SETTINGS_TOUR_ACTIVE_ATTR = 'data-thinkreview-tour-active';

const TOUR_ROOT_ID = 'thinkreview-panel-settings-tour';
const PAD = 6;

/** @type {AbortController | null} */
let _activeAbort = null;

export function isPanelSettingsTourActive() {
  return document.documentElement.hasAttribute(PANEL_SETTINGS_TOUR_ACTIVE_ATTR);
}

async function _markSeen() {
  try {
    await chrome.storage.local.set({ [PANEL_SETTINGS_TOUR_SEEN_KEY]: true });
  } catch (e) {
    dbgWarn('Failed to persist panel settings tour seen flag:', e);
  }
}

async function _track(eventName, params = {}) {
  try {
    const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
    await analyticsModule.trackUserAction(eventName, {
      context: 'panel_settings_tour',
      ...params
    });
  } catch (_) {
    /* silent */
  }
}

function _delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function _waitForPanelExpanded(panelEl, signal) {
  return new Promise((resolve) => {
    if (!panelEl) {
      resolve(false);
      return;
    }
    if (!panelEl.classList.contains('thinkreview-panel-minimized-to-button')) {
      resolve(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (!panelEl.classList.contains('thinkreview-panel-minimized-to-button')) {
        observer.disconnect();
        resolve(true);
      }
    });
    observer.observe(panelEl, { attributes: true, attributeFilter: ['class'] });

    const onAbort = () => {
      observer.disconnect();
      resolve(false);
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function _getSettingsMenuApi() {
  const btn = document.getElementById('thinkreview-settings-btn');
  return btn?.__thinkreviewSettingsMenuApi || null;
}

function _closeMenusQuietly() {
  const api = _getSettingsMenuApi();
  api?.closeAll?.();
  const formatBtn = document.getElementById('thinkreview-review-format-btn');
  const formatDropdown = document.getElementById('thinkreview-review-format-dropdown');
  if (formatDropdown) formatDropdown.style.display = 'none';
  if (formatBtn) formatBtn.setAttribute('aria-expanded', 'false');
}

async function _openFormatDropdown() {
  const btn = document.getElementById('thinkreview-review-format-btn');
  const dropdown = document.getElementById('thinkreview-review-format-dropdown');
  if (!btn || !dropdown) return null;
  if (dropdown.style.display === 'none' || !dropdown.style.display) {
    btn.click();
    await _delay(40);
  }
  return btn;
}

async function _openSettingsMain() {
  const api = _getSettingsMenuApi();
  if (!api?.openMain) return null;
  const dropdown = document.getElementById('thinkreview-settings-dropdown');
  if (!dropdown || dropdown.style.display === 'none') {
    await api.openMain();
    await _delay(40);
  }
  return document.getElementById('thinkreview-settings-btn');
}

async function _openLayoutSubmenu() {
  const api = _getSettingsMenuApi();
  if (!api) return null;
  await _openSettingsMain();
  api.closeSubmenus?.();
  await api.openSubmenu('layout');
  await _delay(40);
  return document.querySelector('[data-menu-action="layout"]');
}

function _buildSteps(panelEl) {
  const hasFormat = !!document.getElementById('thinkreview-review-format-btn');

  /** @type {Array<{ id: string, title: string, body: string, getTarget: () => (Element | null | Promise<Element | null>), before?: () => Promise<void> }>} */
  const steps = [
    {
      id: 'welcome',
      title: 'Customize your review panel',
      body: 'Take a quick tour of the controls in the header — review format, text size, layout, and more.',
      getTarget: () =>
        panelEl.querySelector('.thinkreview-header-actions') ||
        panelEl.querySelector('.thinkreview-card-header'),
      before: async () => {
        _closeMenusQuietly();
      }
    },
    {
      id: 'regenerate',
      title: 'Regenerate review',
      body: 'ThinkReview detects PR changes automatically. Use refresh when you want a second pass or to re-run with a different model.',
      getTarget: () =>
        panelEl.querySelector('#regenerate-review-btn') ||
        panelEl.querySelector('.thinkreview-regenerate-btn-wrapper'),
      before: async () => {
        _closeMenusQuietly();
      }
    },
    {
      id: 'text-size',
      title: 'Adjust text size',
      body: 'Use − / + to make review text smaller or larger. The size is saved for next time.',
      getTarget: () => panelEl.querySelector('.thinkreview-text-size-controls'),
      before: async () => {
        _closeMenusQuietly();
      }
    },
    {
      id: 'language',
      title: 'Review language',
      body: 'Choose the language for the AI review. The review is written in the language you select here.',
      getTarget: () => panelEl.querySelector('#language-selector'),
      before: async () => {
        _closeMenusQuietly();
      }
    }
  ];

  if (hasFormat) {
    steps.push({
      id: 'review-format',
      title: 'Scoring or severity',
      body: 'Switch between a scorecard review and a severity layout (critical / high / low issues). Pick what fits your workflow — you can change it anytime.',
      getTarget: async () => {
        await _openFormatDropdown();
        return document.getElementById('thinkreview-review-format-btn');
      },
      before: async () => {
        const api = _getSettingsMenuApi();
        api?.closeAll?.();
      }
    });
  }

  steps.push(
    {
      id: 'settings-menu',
      title: 'Open Settings',
      body: 'The gear menu holds layout, implement-via IDE, text size, auto-start, credits, and portal links.',
      getTarget: async () => {
        await _openSettingsMain();
        return document.getElementById('thinkreview-settings-btn');
      },
      before: async () => {
        const formatDropdown = document.getElementById('thinkreview-review-format-dropdown');
        const formatBtn = document.getElementById('thinkreview-review-format-btn');
        if (formatDropdown) formatDropdown.style.display = 'none';
        if (formatBtn) formatBtn.setAttribute('aria-expanded', 'false');
      }
    },
    {
      id: 'layout',
      title: 'Choose a layout',
      body: 'Floating, sidebar tab, or docked — left or right. Try a layout that keeps the PR readable while you review.',
      getTarget: async () => {
        const row = await _openLayoutSubmenu();
        return row || document.getElementById('thinkreview-settings-layout-submenu');
      }
    },
    {
      id: 'auto-start',
      title: 'Auto-start reviews',
      body: 'When on, ThinkReview starts reviewing as you open a PR. Turn it off if you prefer to start reviews manually.',
      getTarget: async () => {
        await _openSettingsMain();
        const api = _getSettingsMenuApi();
        api?.closeSubmenus?.();
        await _delay(30);
        return document.querySelector('[data-menu-action="auto-start-review"]');
      }
    },
    {
      id: 'done',
      title: "You're all set",
      body: 'Explore the rest of the settings anytime from the gear. You can reopen full extension settings from the bottom of that menu.',
      getTarget: () => document.getElementById('thinkreview-settings-btn'),
      before: async () => {
        _closeMenusQuietly();
      }
    }
  );

  return steps;
}

function _positionCard(card, targetRect) {
  const cardW = card.offsetWidth || 320;
  const cardH = card.offsetHeight || 180;
  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = targetRect.bottom + gap;
  let left = Math.min(Math.max(8, targetRect.right - cardW), vw - cardW - 8);

  if (top + cardH > vh - 8) {
    top = Math.max(8, targetRect.top - cardH - gap);
  }
  if (top < 8) top = 8;

  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
}

function _positionSpotlight(spotlight, targetRect) {
  spotlight.style.top = `${Math.max(0, targetRect.top - PAD)}px`;
  spotlight.style.left = `${Math.max(0, targetRect.left - PAD)}px`;
  spotlight.style.width = `${targetRect.width + PAD * 2}px`;
  spotlight.style.height = `${targetRect.height + PAD * 2}px`;
}

/**
 * @param {HTMLElement} panelEl
 */
function _runTour(panelEl) {
  if (document.getElementById(TOUR_ROOT_ID)) return;

  const steps = _buildSteps(panelEl);
  if (!steps.length) return;

  document.documentElement.setAttribute(PANEL_SETTINGS_TOUR_ACTIVE_ATTR, '1');

  const root = document.createElement('div');
  root.id = TOUR_ROOT_ID;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'ThinkReview settings tour');

  const blocker = document.createElement('div');
  blocker.className = 'thinkreview-tour-blocker';
  blocker.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  blocker.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  root.appendChild(blocker);

  const spotlight = document.createElement('div');
  spotlight.className = 'thinkreview-tour-spotlight';
  root.appendChild(spotlight);

  // Card is a body-level sibling so it can stack above open menus (same max z-index).
  const card = document.createElement('div');
  card.className = 'thinkreview-tour-card';
  card.id = 'thinkreview-panel-settings-tour-card';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'thinkreview-tour-eyebrow';
  card.appendChild(eyebrow);

  const title = document.createElement('h3');
  title.className = 'thinkreview-tour-title';
  card.appendChild(title);

  const body = document.createElement('p');
  body.className = 'thinkreview-tour-body';
  card.appendChild(body);

  const progress = document.createElement('div');
  progress.className = 'thinkreview-tour-progress';
  progress.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < steps.length; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'thinkreview-tour-dot';
    progress.appendChild(dot);
  }
  card.appendChild(progress);

  const actions = document.createElement('div');
  actions.className = 'thinkreview-tour-actions';

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'thinkreview-tour-btn thinkreview-tour-btn-skip';
  skipBtn.textContent = 'Skip';

  const right = document.createElement('div');
  right.className = 'thinkreview-tour-actions-right';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'thinkreview-tour-btn thinkreview-tour-btn-secondary';
  backBtn.textContent = 'Back';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'thinkreview-tour-btn thinkreview-tour-btn-primary';
  nextBtn.textContent = 'Next';

  right.appendChild(backBtn);
  right.appendChild(nextBtn);
  actions.appendChild(skipBtn);
  actions.appendChild(right);
  card.appendChild(actions);

  document.body.appendChild(root);
  document.body.appendChild(card);

  let stepIndex = 0;
  /** @type {Element | null} */
  let highlightedEl = null;
  /** @type {Element[]} */
  let raisedEls = [];

  const clearHighlight = () => {
    if (highlightedEl) {
      highlightedEl.classList.remove('thinkreview-tour-target-pulse');
      highlightedEl = null;
    }
    raisedEls.forEach((el) => el.classList.remove('thinkreview-tour-raised'));
    raisedEls = [];
  };

  const raiseEls = (...els) => {
    raisedEls.forEach((el) => el.classList.remove('thinkreview-tour-raised'));
    raisedEls = [];
    els.forEach((el) => {
      if (!el) return;
      el.classList.add('thinkreview-tour-raised');
      raisedEls.push(el);
    });
  };

  const unionRect = (...els) => {
    const valid = els.filter((el) => el && el.getBoundingClientRect);
    if (!valid.length) return null;
    let top = Infinity;
    let left = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    valid.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      top = Math.min(top, r.top);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
    if (!Number.isFinite(top)) return null;
    return { top, left, width: right - left, height: bottom - top, right, bottom };
  };

  let repositionRaf = 0;
  let layoutFollowUpTimer = 0;
  /** @type {((e: TransitionEvent) => void) | null} */
  let layoutTransitionHandler = null;

  const clearLayoutFollowUp = () => {
    clearTimeout(layoutFollowUpTimer);
    layoutFollowUpTimer = 0;
    if (layoutTransitionHandler) {
      document
        .getElementById('gitlab-mr-integrated-review')
        ?.removeEventListener('transitionend', layoutTransitionHandler);
      layoutTransitionHandler = null;
    }
  };

  const endTour = async (reason) => {
    clearHighlight();
    _closeMenusQuietly();
    document.documentElement.removeAttribute(PANEL_SETTINGS_TOUR_ACTIVE_ATTR);
    window.removeEventListener('resize', scheduleReposition);
    window.removeEventListener('scroll', scheduleReposition, true);
    document.removeEventListener('thinkreview:layoutchanged', onLayoutChanged);
    if (repositionRaf) {
      cancelAnimationFrame(repositionRaf);
      repositionRaf = 0;
    }
    clearLayoutFollowUp();
    root.remove();
    card.remove();
    await _markSeen();
    await _track('panel_settings_tour_completed', {
      reason,
      last_step: steps[stepIndex]?.id || null,
      step_index: stepIndex
    });
  };

  const resolveTarget = async (step) => {
    if (typeof step.before === 'function') {
      await step.before();
    }
    const target = await step.getTarget();
    return target instanceof Element ? target : null;
  };

  const applyHighlight = (step, target) => {
    const formatDropdown = document.getElementById('thinkreview-review-format-dropdown');
    const settingsDropdown = document.getElementById('thinkreview-settings-dropdown');
    const layoutSubmenu = document.getElementById('thinkreview-settings-layout-submenu');

    const extraRaise = [];
    if (step.id === 'review-format' && formatDropdown?.style.display !== 'none') {
      extraRaise.push(formatDropdown);
    }
    if (
      (step.id === 'settings-menu' || step.id === 'layout' || step.id === 'auto-start') &&
      settingsDropdown?.style.display !== 'none'
    ) {
      extraRaise.push(settingsDropdown);
    }
    if (step.id === 'layout' && layoutSubmenu?.style.display !== 'none') {
      extraRaise.push(layoutSubmenu);
    }

    clearHighlight();
    if (target) {
      highlightedEl = target;
      target.classList.add('thinkreview-tour-target-pulse');
      raiseEls(target, ...extraRaise);
      const rect =
        unionRect(target, ...extraRaise) || target.getBoundingClientRect();
      _positionSpotlight(spotlight, rect);
      _positionCard(card, rect);
      spotlight.style.display = 'block';
    } else {
      spotlight.style.display = 'none';
      card.style.top = '72px';
      card.style.left = `${Math.max(8, window.innerWidth - 340)}px`;
    }
  };

  const onReposition = () => {
    if (!highlightedEl || !document.body.contains(highlightedEl)) return;
    // Sync menu reposition so spotlight reads up-to-date menu geometry this frame
    _getSettingsMenuApi()?.reposition?.();
    const rect = unionRect(highlightedEl, ...raisedEls) || highlightedEl.getBoundingClientRect();
    _positionSpotlight(spotlight, rect);
    _positionCard(card, rect);
  };

  const scheduleReposition = () => {
    if (repositionRaf) return;
    repositionRaf = requestAnimationFrame(() => {
      repositionRaf = 0;
      onReposition();
    });
  };

  /**
   * Follow panel/menu movement after a live layout change.
   * One rAF now + one follow-up on panel transitionend (0.5s fallback).
   */
  const refreshHighlightAfterLayoutChange = async () => {
    const step = steps[stepIndex];
    if (!step || !document.getElementById(TOUR_ROOT_ID)) return;

    if (step.id === 'layout') {
      const target = await _openLayoutSubmenu();
      applyHighlight(step, target || document.getElementById('thinkreview-settings-layout-submenu'));
    }

    scheduleReposition();
    clearLayoutFollowUp();

    const panel = document.getElementById('gitlab-mr-integrated-review');
    if (panel) {
      layoutTransitionHandler = (e) => {
        if (e.target !== panel) return;
        if (e.propertyName !== 'right' && e.propertyName !== 'left' && e.propertyName !== 'width') {
          return;
        }
        clearLayoutFollowUp();
        scheduleReposition();
      };
      panel.addEventListener('transitionend', layoutTransitionHandler);
    }

    layoutFollowUpTimer = setTimeout(() => {
      layoutFollowUpTimer = 0;
      if (layoutTransitionHandler) {
        panel?.removeEventListener('transitionend', layoutTransitionHandler);
        layoutTransitionHandler = null;
      }
      scheduleReposition();
    }, 520);
  };

  const onLayoutChanged = () => {
    refreshHighlightAfterLayoutChange().catch(() => {});
  };

  const renderStep = async () => {
    const step = steps[stepIndex];
    if (!step) {
      await endTour('finished');
      return;
    }

    eyebrow.textContent = `Step ${stepIndex + 1} of ${steps.length}`;
    title.textContent = step.title;
    body.textContent = step.body;
    backBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = stepIndex === steps.length - 1 ? 'Done' : 'Next';
    skipBtn.style.visibility = stepIndex === steps.length - 1 ? 'hidden' : 'visible';

    progress.querySelectorAll('.thinkreview-tour-dot').forEach((dot, i) => {
      dot.classList.toggle('is-active', i === stepIndex);
      dot.classList.toggle('is-done', i < stepIndex);
    });

    const target = await resolveTarget(step);
    if (!document.getElementById(TOUR_ROOT_ID)) return;

    applyHighlight(step, target);

    await _track('panel_settings_tour_step_viewed', {
      step_id: step.id,
      step_index: stepIndex
    });
  };

  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    endTour('skipped');
  });

  backBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (stepIndex <= 0) return;
    stepIndex -= 1;
    await renderStep();
  });

  nextBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (stepIndex >= steps.length - 1) {
      await endTour('finished');
      return;
    }
    stepIndex += 1;
    await renderStep();
  });

  root.addEventListener('click', (e) => e.stopPropagation());
  root.addEventListener('mousedown', (e) => e.stopPropagation());
  card.addEventListener('click', (e) => e.stopPropagation());
  card.addEventListener('mousedown', (e) => e.stopPropagation());

  window.addEventListener('resize', scheduleReposition, { passive: true });
  window.addEventListener('scroll', scheduleReposition, true);
  document.addEventListener('thinkreview:layoutchanged', onLayoutChanged);

  _track('panel_settings_tour_started', { step_count: steps.length });
  renderStep();
}

/**
 * Start the panel settings tour on first expand if the user hasn't seen it.
 * @param {HTMLElement} panelEl
 */
export async function maybeStartPanelSettingsTour(panelEl) {
  if (!panelEl) return;
  if (document.getElementById(TOUR_ROOT_ID)) return;

  try {
    const result = await chrome.storage.local.get([PANEL_SETTINGS_TOUR_SEEN_KEY]);
    if (result[PANEL_SETTINGS_TOUR_SEEN_KEY]) return;
  } catch (e) {
    dbgWarn('Failed to read panel settings tour flag:', e);
    return;
  }

  if (_activeAbort) {
    _activeAbort.abort();
  }
  const abort = new AbortController();
  _activeAbort = abort;

  const expanded = await _waitForPanelExpanded(panelEl, abort.signal);
  if (!expanded || abort.signal.aborted) return;

  await _delay(700);
  if (abort.signal.aborted) return;

  try {
    const again = await chrome.storage.local.get([PANEL_SETTINGS_TOUR_SEEN_KEY]);
    if (again[PANEL_SETTINGS_TOUR_SEEN_KEY]) return;
  } catch (_) {
    return;
  }

  if (document.getElementById(TOUR_ROOT_ID)) return;
  if (panelEl.classList.contains('thinkreview-panel-minimized-to-button')) return;

  _runTour(panelEl);
}
