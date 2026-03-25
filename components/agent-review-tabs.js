/**
 * Dynamic tabs for custom review agents: loader until ThinkReviewGetAgentReviewsForPatch returns.
 * After mounting tabs, runs ThinkReviewGetUserData (via REFRESH_USER_DATA_STORAGE), then calls the agent wait CF immediately.
 */

/** Incremented on each mount so stale fetches do not update the DOM after a new review. */
let agentTabFetchGeneration = 0;

function sanitizeAgentIdForDom(id) {
  return String(id || 'agent').replace(/[^a-zA-Z0-9]/g, '_');
}

function removePriorAgentTabs() {
  const tabButtons = document.getElementById('review-tab-buttons');
  const panelsWrap = document.querySelector('.thinkreview-tab-panels');
  if (tabButtons) {
    tabButtons.querySelectorAll('[data-thinkreview-agent-tab]').forEach((el) => el.remove());
  }
  if (panelsWrap) {
    panelsWrap.querySelectorAll('[data-thinkreview-agent-panel]').forEach((el) => el.remove());
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
  const dbgLog = logger.dbgLog || (() => {});
  const dbgWarn = logger.dbgWarn || (() => {});

  const myGeneration = ++agentTabFetchGeneration;

  removePriorAgentTabs();

  if (provider !== 'cloud' || !Array.isArray(enabledReviewAgents) || enabledReviewAgents.length === 0) {
    return;
  }
  if (!patchContent || typeof patchContent !== 'string') {
    dbgWarn('mountAgentReviewTabs: no patch content');
    return;
  }

  const tabButtons = document.getElementById('review-tab-buttons');
  const panelsWrap = document.querySelector('.thinkreview-tab-panels');
  if (!tabButtons || !panelsWrap) {
    dbgWarn('mountAgentReviewTabs: tab containers missing');
    return;
  }

  const formatting = await import(chrome.runtime.getURL('components/utils/formatting.js'));
  const markdownToHtml = formatting.markdownToHtml;
  const preprocessAIResponse = formatting.preprocessAIResponse;

  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

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

    const inner = document.createElement('div');
    inner.className = 'thinkreview-agent-tab-inner gl-p-4';
    inner.innerHTML =
      '<div class="thinkreview-agent-loading gl-display-flex gl-align-items-center gl-gap-3">' +
      '<span class="gl-spinner gl-spinner-md"></span>' +
      '<span>Agent running…</span>' +
      '</div>';
    panel.appendChild(inner);
    panelsWrap.appendChild(panel);
  }

  const applyResults = (payload) => {
    if (!payload || typeof payload !== 'object') {
      panelsWrap.querySelectorAll('[data-thinkreview-agent-panel]').forEach((panel) => {
        const inner = panel.querySelector('.thinkreview-agent-tab-inner');
        if (inner) {
          inner.innerHTML =
            '<p class="thinkreview-section-content">Could not load agent review. Try refreshing the page.</p>';
        }
      });
      return;
    }

    const agents = Array.isArray(payload.agents) ? payload.agents : [];
    const byId = new Map(agents.map((a) => [a.agentId, a]));

    panelsWrap.querySelectorAll('[data-thinkreview-agent-panel]').forEach((panel) => {
      const agentId = panel.dataset.agentId;
      const inner = panel.querySelector('.thinkreview-agent-tab-inner');
      if (!inner || !agentId) return;

      const row = byId.get(agentId);
      if (!row) {
        inner.innerHTML =
          '<p class="thinkreview-section-content">No result returned for this agent.</p>';
        return;
      }

      if (row.pending) {
        const extra =
          payload.status === 'timeout'
            ? ' The server stopped waiting; the agent may still be processing.'
            : '';
        inner.innerHTML = `<p class="thinkreview-section-content">Agent review not ready yet.${extra}</p>`;
        return;
      }

      if (row.relevanceSkipped) {
        const reason = row.skipReason
          ? markdownToHtml(preprocessAIResponse(String(row.skipReason)))
          : '<p>Skipped for this patch.</p>';
        inner.innerHTML =
          '<div class="thinkreview-agent-skip gl-mb-3"><h5 class="gl-font-weight-bold thinkreview-section-title">Not run</h5>' +
          `<div class="thinkreview-section-content">${reason}</div></div>`;
        return;
      }

      const sections = Array.isArray(row.sections) ? row.sections : [];
      if (sections.length === 0) {
        inner.innerHTML =
          '<p class="thinkreview-section-content">No sections in this agent response.</p>' +
          (row.parseError ? '<p class="gl-text-danger gl-mt-2">Parse error when reading the model output.</p>' : '');
        return;
      }

      let html = '';
      for (const sec of sections) {
        const title = sec.title ? String(sec.title) : 'Section';
        const content = sec.content != null ? String(sec.content) : '';
        html += `<div class="thinkreview-agent-section gl-mb-4">`;
        html += `<h5 class="gl-font-weight-bold thinkreview-section-title">${escapeHtml(title)}</h5>`;
        html += `<div class="thinkreview-section-content">${markdownToHtml(preprocessAIResponse(content))}</div>`;
        html += `</div>`;
      }
      if (row.parseError) {
        html += '<p class="gl-text-warning gl-mt-2">Some output may be incomplete (parse warning).</p>';
      }
      inner.innerHTML = html;
    });
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
