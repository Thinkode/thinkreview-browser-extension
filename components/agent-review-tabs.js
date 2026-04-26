/**
 * Dynamic tabs for custom review agents: loader until ThinkReviewGetAgentReviewsForPatch returns.
 * After mounting tabs, runs ThinkReviewGetUserData (via REFRESH_USER_DATA_STORAGE), then calls the agent wait CF immediately.
 */

/** Incremented on each mount so stale fetches do not update the DOM after a new review. */
let agentTabFetchGeneration = 0;

if (typeof DEBUG === 'undefined') {
  var DEBUG = false;
}

// Logger functions - loaded dynamically to avoid module import issues in content scripts
// Provide fallback functions immediately, then upgrade when logger loads
// Check if variables already exist to avoid redeclaration errors
if (typeof dbgLog === 'undefined') {
  var dbgLog = (...args) => { if (DEBUG) console.log('[ThinkReview Extension]', ...args); };
}
if (typeof dbgWarn === 'undefined') {
  var dbgWarn = (...args) => { if (DEBUG) console.warn('[ThinkReview Extension]', ...args); };
}
if (typeof dbgError === 'undefined') {
  var dbgError = (...args) => { if (DEBUG) console.error('[ThinkReview Extension]', ...args); };
}

import { getAgentIcon } from './utils/agent-icon.js';

export function sanitizeAgentIdForDom(id) {
  return String(id || 'agent').replace(/[^a-zA-Z0-9]/g, '_');
}

export function removePriorAgentTabs() {
  const tabButtons = document.getElementById('review-tab-buttons');
  const panelsWrap = document.querySelector('.thinkreview-tab-panels');
  if (tabButtons) {
    tabButtons.querySelectorAll('[data-thinkreview-agent-tab]').forEach((el) => el.remove());
  }
  if (panelsWrap) {
    panelsWrap.querySelectorAll('[data-thinkreview-agent-panel]').forEach((el) => el.remove());
  }
}

export const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export async function renderEmptyAgentState(tabButtons, panelsWrap) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'thinkreview-tab-btn';
  btn.setAttribute('data-tab', 'agent_empty_placeholder');
  btn.setAttribute('data-thinkreview-agent-tab', '1');
  btn.textContent = 'Agents';
  try {
    const newBadgeMod = await import(chrome.runtime.getURL('components/utils/new-badge.js'));
    btn.appendChild(newBadgeMod.createNewBadge());
  } catch (e) { dbgError('Failed to load new badge for agent placeholder:', e); }
  tabButtons.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'thinkreview-tab-panel';
  panel.id = 'tab-panel-agent-empty-placeholder';
  panel.setAttribute('data-tab', 'agent_empty_placeholder');
  panel.setAttribute('data-thinkreview-agent-panel', '1');

  panel.innerHTML =
    '<div class="thinkreview-agent-tab-scroll">' +
    '<div class="thinkreview-agent-empty">' +
    '<div class="thinkreview-agent-empty-icon-wrap">' +
    getAgentIcon('thinkreview-agent-empty-icon', '24', '24') +
    '</div>' +
    '<div class="thinkreview-agent-empty-title">No Agents Added Yet</div>' +
    '<div class="thinkreview-agent-empty-subtitle">' +
    'Agents are custom AI reviewers you can configure to run alongside your standard review — ' +
    'each one focused on a different aspect of your code, like security, performance, or your team\'s specific guidelines.' +
    '</div>' +
    '<div class="thinkreview-agent-empty-steps">' +
    '<div class="thinkreview-agent-empty-step">' +
    '<span class="thinkreview-agent-empty-step-num">1</span>' +
    '<span>Go to your agent portal and create a new agent</span>' +
    '</div>' +
    '<div class="thinkreview-agent-empty-step">' +
    '<span class="thinkreview-agent-empty-step-num">2</span>' +
    '<span>Define its focus area, prompt, and name</span>' +
    '</div>' +
    '<div class="thinkreview-agent-empty-step">' +
    '<span class="thinkreview-agent-empty-step-num">3</span>' +
    '<span>Re-run your review — the agent tab will appear automatically</span>' +
    '</div>' +
    '</div>' +
    '<a class="thinkreview-agent-empty-cta" href="https://portal.thinkreview.dev/agents" target="_blank" rel="noopener noreferrer">' +
    getAgentIcon('', '14', '14', 'flex-shrink:0') +
    'Add an Agent' +
    '</a>' +
    '</div>' +
    '</div>';

  panelsWrap.appendChild(panel);

  const ctaLink = panel.querySelector('.thinkreview-agent-empty-cta');
  if (ctaLink) {
    ctaLink.addEventListener('click', async () => {
      try {
        const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
        analyticsModule.trackUserAction('add_agent_cta_clicked', {
          context: 'integrated_panel',
          location: 'agent_empty_state'
        }).catch(() => {});
      } catch (e) { dbgError('Failed to track add_agent_cta_clicked:', e); }
    });
  }
}

export function renderAgentLoadingTabs(enabledReviewAgents, tabButtons, panelsWrap) {
  for (const agent of enabledReviewAgents) {
    const safe = sanitizeAgentIdForDom(agent.id);
    const tabKey = `agent_${safe}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thinkreview-tab-btn';
    btn.setAttribute('data-tab', tabKey);
    btn.setAttribute('data-thinkreview-agent-tab', '1');
    btn.textContent = agent.name || 'Agent';
    tabButtons.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'thinkreview-tab-panel';
    panel.id = `tab-panel-${tabKey.replace(/_/g, '-')}`;
    panel.setAttribute('data-tab', tabKey);
    panel.setAttribute('data-thinkreview-agent-panel', '1');
    panel.dataset.agentId = agent.id;

    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'thinkreview-agent-tab-scroll';

    const inner = document.createElement('div');
    inner.className = 'thinkreview-agent-tab-inner';
    inner.innerHTML =
      '<div class="thinkreview-agent-loading">' +
      '<div class="thinkreview-agent-state-icon-wrap">' +
      '<span class="thinkreview-agent-spinner-ring"></span>' +
      getAgentIcon('thinkreview-agent-state-icon', '24', '24') +
      '</div>' +
      '<div class="thinkreview-agent-state-title">Agent Running</div>' +
      '<div class="thinkreview-agent-state-subtitle">Analyzing your code changes…</div>' +
      '<div class="thinkreview-agent-state-bar"><div class="thinkreview-agent-state-bar-fill"></div></div>' +
      '<p class="loader-close-hint">Feel free to close this panel and return in a few seconds; this agent\'s review will keep running in the cloud.</p>' +
      '</div>';

    scrollWrap.appendChild(inner);
    panel.appendChild(scrollWrap);
    panelsWrap.appendChild(panel);
  }
}

export function handleAgentPayloadError(panelsWrap) {
  panelsWrap.querySelectorAll('[data-thinkreview-agent-panel]').forEach((panel) => {
    const inner = panel.querySelector('.thinkreview-agent-tab-inner');
    if (inner) {
      inner.innerHTML =
        '<div class="thinkreview-agent-error">' +
        '<div class="thinkreview-agent-error-icon-wrap">' +
        '<svg class="thinkreview-agent-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="9"/>' +
        '<path d="M12 8v4m0 4h.01"/>' +
        '</svg>' +
        '</div>' +
        '<div class="thinkreview-agent-state-title">Could Not Load</div>' +
        '<div class="thinkreview-agent-state-subtitle">The agent review failed to load. Refresh the page to try again.</div>' +
        '</div>';
    }
  });
}

export function renderAgentPanelState(inner, row, processors, timeoutInfo) {
  if (!row) {
    inner.innerHTML =
      '<div class="thinkreview-agent-error">' +
      '<div class="thinkreview-agent-error-icon-wrap">' +
      '<svg class="thinkreview-agent-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="9"/>' +
      '<path d="M12 8v4m0 4h.01"/>' +
      '</svg>' +
      '</div>' +
      '<div class="thinkreview-agent-state-title">No Result</div>' +
      '<div class="thinkreview-agent-state-subtitle">No result was returned for this agent.</div>' +
      '</div>';
    return;
  }

  if (row.pending) {
    const extra =
      timeoutInfo
        ? 'The server stopped waiting; the agent may still be processing.'
        : '';
    inner.innerHTML =
      '<div class="thinkreview-agent-loading">' +
      '<div class="thinkreview-agent-state-icon-wrap thinkreview-agent-state-icon-wrap--pending">' +
      '<span class="thinkreview-agent-spinner-ring"></span>' +
      '<svg class="thinkreview-agent-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="9"/>' +
      '<path d="M12 7v5l3 3"/>' +
      '</svg>' +
      '</div>' +
      '<div class="thinkreview-agent-state-title">Still Processing</div>' +
      `<div class="thinkreview-agent-state-subtitle">${extra || 'The agent is still working.'} Check back in a moment.</div>` +
      '<p class="loader-close-hint">Feel free to close this panel and return in a few seconds; this agent\'s review will keep running in the cloud.</p>' +
      '</div>';
    return;
  }

  if (row.relevanceSkipped) {
    const reason = row.skipReason
      ? processors.markdownToHtml(processors.preprocessAIResponse(escapeHtml(String(row.skipReason))))
      : '<p>Skipped for this patch.</p>';
    inner.innerHTML =
      '<div class="thinkreview-agent-notrun">' +
      '<div class="thinkreview-agent-notrun-icon-wrap">' +
      '<svg class="thinkreview-agent-notrun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="9"/>' +
      '<path d="M9 12h6"/>' +
      '</svg>' +
      '</div>' +
      '<span class="thinkreview-agent-notrun-badge">Not Run</span>' +
      '<div class="thinkreview-agent-notrun-reason">' +
      '<div class="thinkreview-agent-notrun-title">Agent Skipped</div>' +
      '<span class="thinkreview-agent-notrun-reason-label">Reason</span>' +
      `${reason}` +
      '</div>' +
      '</div>';
    return;
  }

  const sections = Array.isArray(row.sections) ? row.sections : [];
  if (sections.length === 0) {
    inner.innerHTML =
      '<p class="thinkreview-section-content">No sections in this agent response.</p>' +
      (row.parseError ? '<p class="gl-text-danger gl-mt-2">Parse error when reading the model output.</p>' : '');
    return;
  }

  inner.replaceChildren();
  const contentFragment = document.createDocumentFragment();

  for (const sec of sections) {
    const sectionDiv = renderAgentSectionContent(sec, processors);
    contentFragment.appendChild(sectionDiv);
  }

  if (row.parseError) {
    const warning = document.createElement('p');
    warning.className = 'gl-text-warning gl-mt-2';
    warning.textContent = 'Some output may be incomplete (parse warning).';
    contentFragment.appendChild(warning);
  }

  inner.appendChild(contentFragment);
}

export function renderAgentSectionContent(sec, processors) {
  const title = sec.title ? String(sec.title) : 'Section';
  const content = sec.content != null ? String(sec.content) : '';

  const sectionDiv = document.createElement('div');
  sectionDiv.className = 'thinkreview-agent-section gl-mb-4';

  const headerRow = document.createElement('div');
  headerRow.className = 'thinkreview-section-header-row';
  headerRow.innerHTML = `<h5 class="gl-font-weight-bold thinkreview-section-title">${escapeHtml(title)}</h5>`;
  sectionDiv.appendChild(headerRow);

  let sectHtml = processors.markdownToHtml(processors.preprocessAIResponse(content));
  sectHtml = sectHtml.replace(/<ul>/g, '<ul class="gl-pl-5 thinkreview-section-list">');
  sectHtml = sectHtml.replace(/<ol>/g, '<ol class="gl-pl-5 thinkreview-section-list">');

  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = sectHtml;
  const lists = tempContainer.querySelectorAll('ul.thinkreview-section-list, ol.thinkreview-section-list');

  if (lists.length > 0) {
    lists.forEach(list => {
      const listItems = list.querySelectorAll('li');

      for (let i = 0; i < listItems.length; i++) {
        const li = listItems[i];
        const liContent = li.innerHTML;

        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'thinkreview-item-wrapper';

        const liContentDiv = document.createElement('div');
        liContentDiv.className = 'thinkreview-section-content thinkreview-clickable-item';
        liContentDiv.innerHTML = liContent;

        liContentDiv.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
            analyticsModule.trackUserAction('review_item_clicked', {
              context: 'integrated_review_panel',
              category: 'agent_section_item'
            }).catch(() => { });
          } catch (error) { dbgError('Failed to track review item click for agent section:', error); }

          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = liContent;
          const itemText = (tempDiv.textContent || tempDiv.innerText || '').trim();

          const query = `Can you provide more details about this from the agent's ${title} section? ${itemText}`;

          const sendMessageHandler = (typeof window !== 'undefined' && typeof window.handleSendMessage === 'function')
            ? window.handleSendMessage
            : null;

          if (sendMessageHandler) {
            sendMessageHandler(query);
          } else {
            dbgWarn('handleSendMessage is not available on window; cannot send query for agent section item.');
          }
        });

        itemWrapper.appendChild(liContentDiv);
        processors.attachCopyButtonToItem(liContentDiv, itemWrapper);

        li.replaceChildren();
        li.appendChild(itemWrapper);
      }
    });

    sectionDiv.appendChild(tempContainer);
  } else {
    const itemWrapper = document.createElement('div');
    itemWrapper.className = 'thinkreview-item-wrapper';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'thinkreview-section-content thinkreview-clickable-item';
    contentDiv.innerHTML = sectHtml;

    contentDiv.addEventListener('click', async () => {
      try {
        const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
        analyticsModule.trackUserAction('review_item_clicked', {
          context: 'integrated_review_panel',
          category: 'agent_section'
        }).catch(() => { });
      } catch (error) { dbgError('Failed to track review item click for agent section container:', error); }

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = sectHtml;
      const itemText = (tempDiv.textContent || tempDiv.innerText || '').trim();

      const query = `Can you provide more details about this from the ${title} section? ${itemText}`;

      try {
        if (window.handleSendMessage) {
          window.handleSendMessage(query);
        } else {
          // Fallback: dispatch a CustomEvent that the integrated review script can listen for
          const event = new CustomEvent('thinkreview:sendMessage', {
            detail: { query }
          });
          window.dispatchEvent(event);
        }
      } catch (e) {
        dbgError('Failed to route review item click into chat flow:', e);
      }
    });

    itemWrapper.appendChild(contentDiv);
    processors.attachCopyButtonToItem(contentDiv, itemWrapper);

    sectionDiv.appendChild(itemWrapper);
  }

  return sectionDiv;
}

export function sortAgentTabs(tabButtons, panelsWrap, byId) {
  if (tabButtons) {
    tabButtons.querySelectorAll('[data-thinkreview-agent-tab]').forEach((btn) => {
      const tabKey = btn.getAttribute('data-tab');
      const panel = panelsWrap.querySelector(`[data-thinkreview-agent-panel][data-tab="${tabKey}"]`);
      const agentId = panel ? panel.dataset.agentId : null;
      const row = agentId ? byId.get(agentId) : null;
      if (row && row.relevanceSkipped) {
        tabButtons.appendChild(btn);
        panelsWrap.appendChild(panel);
      }
    });
  }
}

/**
 * @param {Object} opts
 * @param {Array<{id: string, name: string}>} opts.enabledReviewAgents
 * @param {string} opts.patchContent - exact string sent to reviewPatchCode_1_1
 * @param {string|null|undefined} opts.mrId
 * @param {string} opts.provider - 'cloud' | 'ollama' | etc.
 * @param {{ dbgLog?: Function, dbgWarn?: Function }} opts.logger
 */
export async function mountAgentReviewTabs(opts) {
  const { enabledReviewAgents, patchContent, mrId, provider, logger = {} } = opts;
  const dbgLog = logger.dbgLog || (() => { });
  const dbgWarn = logger.dbgWarn || (() => { });

  const myGeneration = ++agentTabFetchGeneration;

  removePriorAgentTabs();

  if (provider !== 'cloud') {
    return;
  }

  const tabButtons = document.getElementById('review-tab-buttons');
  const panelsWrap = document.querySelector('.thinkreview-tab-panels');
  if (!tabButtons || !panelsWrap) {
    dbgWarn('mountAgentReviewTabs: tab containers missing');
    return;
  }

  if (!Array.isArray(enabledReviewAgents) || enabledReviewAgents.length === 0) {
    await renderEmptyAgentState(tabButtons, panelsWrap);
    return;
  }

  if (!patchContent || typeof patchContent !== 'string') {
    dbgWarn('mountAgentReviewTabs: no patch content');
    return;
  }

  const formatting = await import(chrome.runtime.getURL('components/utils/formatting.js'));
  const copyBtnModule = await import(chrome.runtime.getURL('components/utils/item-copy-button.js'));

  const processors = {
    markdownToHtml: formatting.markdownToHtml,
    preprocessAIResponse: formatting.preprocessAIResponse,
    attachCopyButtonToItem: copyBtnModule.attachCopyButtonToItem
  };

  renderAgentLoadingTabs(enabledReviewAgents, tabButtons, panelsWrap);

  const applyResults = (payload) => {
    if (!payload || typeof payload !== 'object') {
      handleAgentPayloadError(panelsWrap);
      return;
    }

    const agents = Array.isArray(payload.agents) ? payload.agents : [];
    const byId = new Map(agents.map((a) => [a.agentId, a]));

    panelsWrap.querySelectorAll('[data-thinkreview-agent-panel]').forEach((panel) => {
      const agentId = panel.dataset.agentId;
      const inner = panel.querySelector('.thinkreview-agent-tab-inner');
      if (!inner || !agentId) return;

      const row = byId.get(agentId);
      const timeoutInfo = payload.status === 'timeout';

      renderAgentPanelState(inner, row, processors, timeoutInfo);
    });

    const activeTabButtons = document.getElementById('review-tab-buttons');
    const activePanelsWrap = document.querySelector('.thinkreview-tab-panels');
    sortAgentTabs(activeTabButtons, activePanelsWrap, byId);
  };

  (async () => {
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'REFRESH_USER_DATA_STORAGE' }, (resp) => {
          if (chrome.runtime.lastError) {
            dbgWarn('REFRESH_USER_DATA_STORAGE before agent fetch:', chrome.runtime.lastError.message);
          } else if (resp?.status !== 'success') {
            dbgWarn('REFRESH_USER_DATA_STORAGE before agent fetch:', resp?.error || resp);
          }
          resolve(resp);
        });
      });
    } catch (e) {
      dbgWarn('refresh before agent fetch failed:', e);
    }

    if (myGeneration !== agentTabFetchGeneration) {
      dbgLog('Skipping stale agent-reviews fetch');
      return;
    }

    try {
      dbgLog('Fetching agent reviews for patch (after ThinkReviewGetUserData)');
      const bgResp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'FETCH_AGENT_REVIEWS_FOR_PATCH',
            patchContent,
            mrId: mrId != null && mrId !== '' ? mrId : null
          },
          resolve
        );
      });
      if (myGeneration !== agentTabFetchGeneration) return;
      if (!bgResp?.success) {
        dbgWarn('Agent reviews fetch failed:', bgResp?.error);
        applyResults(null);
        return;
      }
      applyResults(bgResp.data);
    } catch (e) {
      dbgWarn('mountAgentReviewTabs fetch error:', e);
      applyResults(null);
    }
  })();
}
