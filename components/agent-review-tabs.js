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

    // SCROLL WRAPPER
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'thinkreview-agent-tab-scroll';

    const inner = document.createElement('div');
    inner.className = 'thinkreview-agent-tab-inner';
    inner.innerHTML =
      '<div class="thinkreview-agent-loading">' +
        '<div class="thinkreview-agent-state-icon-wrap">' +
          '<span class="thinkreview-agent-spinner-ring"></span>' +
          '<svg class="thinkreview-agent-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>' +
            '<path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>' +
          '</svg>' +
        '</div>' +
        '<div class="thinkreview-agent-state-title">Agent Running</div>' +
        '<div class="thinkreview-agent-state-subtitle">Analyzing your code changes\u2026</div>' +
        '<div class="thinkreview-agent-state-bar"><div class="thinkreview-agent-state-bar-fill"></div></div>' +
      '</div>';
    
    scrollWrap.appendChild(inner);
    panel.appendChild(scrollWrap);
    panelsWrap.appendChild(panel);
  }

  const applyResults = (payload) => {
    if (!payload || typeof payload !== 'object') {
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
          payload.status === 'timeout'
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
          '</div>';
        return;
      }

      if (row.relevanceSkipped) {
        const reason = row.skipReason
          ? markdownToHtml(preprocessAIResponse(String(row.skipReason)))
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

      // Clear the loading/error HTML
      inner.innerHTML = '';
      
      const contentFragment = document.createDocumentFragment();

      for (const sec of sections) {
        const title = sec.title ? String(sec.title) : 'Section';
        const content = sec.content != null ? String(sec.content) : '';
        
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'thinkreview-agent-section gl-mb-4';
        
        const headerRow = document.createElement('div');
        headerRow.className = 'thinkreview-section-header-row';
        headerRow.innerHTML = `<h5 class="gl-font-weight-bold thinkreview-section-title">${escapeHtml(title)}</h5>`;
        sectionDiv.appendChild(headerRow);
        
        // Ensure lists inside agent sections match the style of main review lists
        let sectHtml = markdownToHtml(preprocessAIResponse(content));
        sectHtml = sectHtml.replace(/<ul>/g, '<ul class="gl-pl-5 thinkreview-section-list">');
        sectHtml = sectHtml.replace(/<ol>/g, '<ol class="gl-pl-5 thinkreview-section-list">');
        
        // Check if there are lists in the markdown output
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = sectHtml;
        const lists = tempContainer.querySelectorAll('ul.thinkreview-section-list, ol.thinkreview-section-list');
        
        if (lists.length > 0) {
          // If there are lists, make each list item a clickable item
          lists.forEach(list => {
            const listItems = list.querySelectorAll('li');
            
            // For each li, we need to create the wrapper structure
            for (let i = 0; i < listItems.length; i++) {
              const li = listItems[i];
              const liContent = li.innerHTML;
              
              const itemWrapper = document.createElement('div');
              itemWrapper.className = 'thinkreview-item-wrapper';
              
              const liContentDiv = document.createElement('div');
              liContentDiv.className = 'thinkreview-section-content thinkreview-clickable-item';
              liContentDiv.innerHTML = liContent;
              
              // Add click listener
              liContentDiv.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                  const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
                  analyticsModule.trackUserAction('review_item_clicked', {
                    context: 'integrated_review_panel',
                    category: 'agent_section_item'
                  }).catch(() => {});
                } catch (error) { /* silent */ }
                
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = liContent;
                const itemText = (tempDiv.textContent || tempDiv.innerText || '').trim();
                
                const query = `Can you provide more details about this from the agent's ${title} section? ${itemText}`;
                
                try {
                  const irModule = await import(chrome.runtime.getURL('components/integrated-review.js'));
                  if (irModule && irModule.handleSendMessage) irModule.handleSendMessage(query);
                  else if (window.handleSendMessage) window.handleSendMessage(query);
                } catch (err) {
                  if (window.handleSendMessage) window.handleSendMessage(query);
                }
              });
              
              itemWrapper.appendChild(liContentDiv);
              
              if (typeof window.attachCopyButtonToItem === 'function') {
                window.attachCopyButtonToItem(liContentDiv, itemWrapper);
              }
              
              // Clear original li content and append the wrapper
              li.innerHTML = '';
              li.appendChild(itemWrapper);
            }
          });
          
          sectionDiv.appendChild(tempContainer);
        } else {
          // If no lists, make the whole section clickable as before
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
              }).catch(() => {});
            } catch (error) { /* silent */ }
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = sectHtml;
            const itemText = (tempDiv.textContent || tempDiv.innerText || '').trim();
            
            const query = `Can you provide more details about this from the ${title} section? ${itemText}`;
            
            try {
              const irModule = await import(chrome.runtime.getURL('components/integrated-review.js'));
              if (irModule && irModule.handleSendMessage) {
                irModule.handleSendMessage(query);
              } else if (window.handleSendMessage) {
                window.handleSendMessage(query);
              }
            } catch (e) {
              if (window.handleSendMessage) window.handleSendMessage(query);
            }
          });
          
          itemWrapper.appendChild(contentDiv);
          
          if (typeof window.attachCopyButtonToItem === 'function') {
            window.attachCopyButtonToItem(contentDiv, itemWrapper);
          }
          
          sectionDiv.appendChild(itemWrapper);
        }
        
        contentFragment.appendChild(sectionDiv);
      }
      
      if (row.parseError) {
        const warning = document.createElement('p');
        warning.className = 'gl-text-warning gl-mt-2';
        warning.textContent = 'Some output may be incomplete (parse warning).';
        contentFragment.appendChild(warning);
      }
      
      inner.appendChild(contentFragment);
    });

    // Move skipped-agent tabs to the end of the tab bar and panel list
    const tabButtons = document.getElementById('review-tab-buttons');
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
