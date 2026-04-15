// code-suggestions-tab.js
// Module for the Code Suggestions tab in the integrated review panel.
// Handles visibility, suggestion count on tab, population, and GitLab diff injection storage.
// Code suggestions feature is only available for Professional and Lite subscription types.

/** Cached analytics module - loaded once on first use (use getURL for Firefox content script context) */
let _analyticsModulePromise = null;
async function getAnalyticsModule() {
  if (!_analyticsModulePromise) {
    _analyticsModulePromise = import(chrome.runtime.getURL('utils/analytics-service.js'));
  }
  return _analyticsModulePromise;
}

/**
 * Returns true if subscription type allows code suggestions (Professional, Lite, Teams).
 * @param {string} subscriptionType - User subscription type from storage
 * @returns {boolean}
 */
function hasCodeSuggestionsAccess(subscriptionType) {
  const raw = (subscriptionType ?? '').toString().trim().toLowerCase();
  return raw === 'professional' || raw === 'lite' || raw === 'teams';
}

/**
 * Updates the Code Suggestions tab based on review data.
 * Shows tab and populates when review.codeSuggestions exists; hides and clears when not.
 * For Free users with code suggestions, shows upgrade message instead.
 *
 * @param {Object} params
 * @param {Object} params.review - Review object with optional codeSuggestions array
 * @param {string} [params.patchContent] - Raw patch content for GitLab diff injection
 * @param {string} [params.subscriptionType] - User subscription type (from storage); Free users see upgrade message when forced truncation applies
 * @param {boolean} [params.wasForcedTruncated] - Whether the patch was forcibly truncated due to free-tier limits
 * @param {Object} [params.patchSize] - Patch size info { original, truncated, wasForcedTruncated, ... } from backend
 * @param {Object} [params.logger] - Optional { dbgLog, dbgWarn }
 * @param {Function} [params.onExplainSuggestion] - Callback(suggestion) when Explain is clicked; switches to Review tab and sends message
 */
export async function updateCodeSuggestionsTab({ review, patchContent, subscriptionType = 'Free', wasForcedTruncated = false, patchSize = null, logger = {}, onExplainSuggestion } = {}) {
  const { dbgLog = () => {}, dbgWarn = (...args) => console.warn('[CodeSuggestionsTab]', ...args) } = logger;

  const codeSuggestionsTabBtn = document.getElementById('tab-btn-code-suggestions');
  const codeSuggestionsPanel = document.getElementById('tab-panel-code-suggestions');
  const codeSuggestionsInner = document.getElementById('review-code-suggestions-inner');

  const hasSuggestions = Array.isArray(review.codeSuggestions) && review.codeSuggestions.length > 0;
  const canAccessSuggestions = hasCodeSuggestionsAccess(subscriptionType);
  const isFreeLike = !canAccessSuggestions;

  // Show full code suggestions whenever we have them.
  // For Free users with forced truncation, we add a banner explaining partial coverage,
  // but we still show the suggestions themselves.
  if (hasSuggestions) {
    // Show Code Suggestions tab in the integrated panel
    if (codeSuggestionsTabBtn) {
      codeSuggestionsTabBtn.classList.remove('gl-hidden');
      codeSuggestionsTabBtn.querySelectorAll('.thinkreview-new-badge').forEach((el) => el.remove());

      const suggestionCount = review.codeSuggestions.length;
      let countEl = codeSuggestionsTabBtn.querySelector('.thinkreview-code-suggestions-tab-count');
      if (!countEl) {
        countEl = document.createElement('span');
        countEl.className = 'thinkreview-code-suggestions-tab-count';
        codeSuggestionsTabBtn.appendChild(countEl);
      }
      countEl.textContent = suggestionCount > 99 ? '99+' : String(suggestionCount);
      countEl.setAttribute('aria-label', `${suggestionCount} code suggestion${suggestionCount === 1 ? '' : 's'}`);
    }

    if (codeSuggestionsInner) {
      codeSuggestionsInner.replaceChildren();

      // For Free + forced-truncated users, show a truncation banner above the suggestions
      if (isFreeLike && wasForcedTruncated) {
        try {
          if (patchSize && typeof patchSize.original === 'number' && patchSize.original > 0 && typeof patchSize.truncated === 'number') {
            const original = patchSize.original;
            const truncated = patchSize.truncated;

            // Calculate percentages with a minimum visible value of 0.1% when some code was reviewed
            let percentageReviewed;
            const rawPercentage = (truncated / original) * 100;
            if (rawPercentage > 0 && rawPercentage < 0.1) {
              percentageReviewed = 0.1;
            } else {
              percentageReviewed = Math.round(rawPercentage * 10) / 10; // one decimal place
            }

            const banner = document.createElement('div');
            banner.className = 'thinkreview-upgrade-message thinkreview-code-suggestions-upgrade-message';
            banner.innerHTML = `
              <div class="thinkreview-upgrade-message-content">
                <span class="thinkreview-upgrade-icon">⚡</span>
                <span class="thinkreview-upgrade-text">
                  Code suggestions are based on only ${percentageReviewed}% of this PR due to free tier limits.
                  <a href="https://portal.thinkreview.dev/subscription" target="_blank" class="thinkreview-upgrade-link">
                    Upgrade to one of our premium plans
                  </a>
                  to get code suggestions for the entire PR.
                </span>
              </div>
            `;
            codeSuggestionsInner.appendChild(banner);
          }
        } catch (e) {
          dbgWarn('Failed to render code suggestions truncation banner:', e);
        }
      }
      
      // Add GitLab injection toggle control (Beta)
      const toggleContainer = document.createElement('div');
      toggleContainer.className = 'thinkreview-gitlab-injection-toggle';
      Object.assign(toggleContainer.style, {
        marginBottom: '12px',
        padding: '8px',
        backgroundColor: '#2a2a2a',
        borderRadius: '4px',
        border: '1px solid #3a3a3a'
      });
      
      const toggleWrapper = document.createElement('label');
      Object.assign(toggleWrapper.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        userSelect: 'none'
      });
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'gitlab-injection-toggle';
      checkbox.className = 'thinkreview-gitlab-injection-checkbox';
      
      // Load saved preference
      const savedPreference = await chrome.storage.local.get(['gitlabInjectionEnabled']);
      checkbox.checked = savedPreference.gitlabInjectionEnabled === true; // Default to false
      
      Object.assign(checkbox.style, {
        width: '16px',
        height: '16px',
        cursor: 'pointer',
        accentColor: '#6b4fbb'
      });
      
      const labelText = document.createElement('span');
      Object.assign(labelText.style, {
        fontSize: '12px',
        color: '#e0e0e0',
        fontWeight: '500'
      });
      labelText.textContent = 'Show suggestions in GitLab diff';
      
      const betaBadge = document.createElement('span');
      Object.assign(betaBadge.style, {
        fontSize: '9px',
        padding: '2px 5px',
        backgroundColor: '#8b5cf6',
        color: '#ffffff',
        borderRadius: '3px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      });
      betaBadge.textContent = 'Beta';
      
      toggleWrapper.appendChild(checkbox);
      toggleWrapper.appendChild(labelText);
      toggleWrapper.appendChild(betaBadge);
      toggleContainer.appendChild(toggleWrapper);
      
      // Save preference on change
      checkbox.addEventListener('change', async () => {
        await chrome.storage.local.set({ gitlabInjectionEnabled: checkbox.checked });
        dbgLog(`GitLab injection ${checkbox.checked ? 'enabled' : 'disabled'}`);
        try {
          const analyticsModule = await getAnalyticsModule();
          analyticsModule.trackUserAction('gitlab_diff_suggestions_toggled', {
            context: 'code_suggestions_tab',
            location: 'integrated_panel',
            enabled: checkbox.checked
          }).catch(() => {});
        } catch (e) { /* silent */ }
        // Update stored suggestions flag
        if (window.__thinkreview_codeSuggestions) {
          window.__thinkreview_codeSuggestions.injectionEnabled = checkbox.checked;
        }
      });
      
      codeSuggestionsInner.appendChild(toggleContainer);
      
      const [suggestionModule, copyModule, analyticsModule] = await Promise.all([
        import(chrome.runtime.getURL('components/utils/code-suggestion-element.js')),
        import(chrome.runtime.getURL('components/utils/item-copy-button.js')),
        getAnalyticsModule()
      ]);
      const createCopyButton = copyModule.createCopyButton;
      const showCopySuccessFeedback = copyModule.showCopySuccessFeedback;
      const showCopyErrorFeedback = copyModule.showCopyErrorFeedback;

      for (let i = 0; i < review.codeSuggestions.length; i++) {
        const suggestion = review.codeSuggestions[i];
        const el = suggestionModule.createCodeSuggestionElement(suggestion);
        const copyBtn = createCopyButton();
        copyBtn.title = 'Copy code suggestion';
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          const lines = [];
          if (suggestion.description) lines.push(suggestion.description);
          if (suggestion.suggestedCode) {
            const suggestedCodeLines = suggestion.suggestedCode.split('\n');
            const linesToAdd = Math.max(0, suggestedCodeLines.length - 1);
            lines.push('', `\`\`\`suggestion:-0+${linesToAdd}`, suggestion.suggestedCode, '```');
          }
          try {
            await navigator.clipboard.writeText(lines.join('\n'));
            if (showCopySuccessFeedback) showCopySuccessFeedback(copyBtn);
            analyticsModule.trackUserAction('copy_button', {
              context: 'code_suggestion',
              location: 'integrated_panel'
            }).catch(() => {});
          } catch (err) {
            if (showCopyErrorFeedback) showCopyErrorFeedback(copyBtn);
          }
        });
        el.appendChild(copyBtn);
        // Wrap in suggestion-tab-item div (separate class from diff injection to avoid reinject conflicts)
        const wrapper = document.createElement('div');
        wrapper.className = 'thinkreview-suggestion-tab-item';
        Object.assign(wrapper.style, {
          marginTop: '8px',
          padding: '8px',
          backgroundColor: '#1e1e1e',
          borderLeft: '3px solid #6b4fbb',
          borderRadius: '4px',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0
        });
        wrapper.appendChild(el);

        // Explain button - sends message to conversation
        if (typeof onExplainSuggestion === 'function') {
          const explainBtn = document.createElement('button');
          explainBtn.type = 'button';
          explainBtn.className = 'thinkreview-explain-suggestion-btn';
          explainBtn.textContent = 'Explain';
          explainBtn.title = 'Ask AI to explain this suggestion in the conversation';
          Object.assign(explainBtn.style, {
            marginTop: '8px',
            padding: 0,
            fontSize: '12px',
            background: 'none',
            border: 'none',
            color: '#b8a5e8',
            cursor: 'pointer',
            textDecoration: 'underline'
          });
          explainBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            onExplainSuggestion(suggestion);
          });
          wrapper.appendChild(explainBtn);
        }

        codeSuggestionsInner.appendChild(wrapper);

        // Add separator between suggestions (not after the last one)
        if (i < review.codeSuggestions.length - 1) {
          const separator = document.createElement('div');
          separator.className = 'thinkreview-code-suggestion-separator';
          codeSuggestionsInner.appendChild(separator);
        }
      }
    }

    // Store for GitLab diff injection (content.js will process when on GitLab)
    if (patchContent) {
      const savedPreference = await chrome.storage.local.get(['gitlabInjectionEnabled']);
      const injectionEnabled = savedPreference.gitlabInjectionEnabled === true; // Default to false
      
      window.__thinkreview_codeSuggestions = {
        suggestions: review.codeSuggestions,
        patchContent: patchContent,
        timestamp: Date.now(),
        injectionEnabled: injectionEnabled
      };
      dbgLog(`Stored ${review.codeSuggestions.length} code suggestions for injection (enabled: ${injectionEnabled})`);
    }
  } else {
    // No code suggestions - hide tab and clear
    if (codeSuggestionsTabBtn) {
      codeSuggestionsTabBtn.classList.add('gl-hidden');
      codeSuggestionsTabBtn.querySelectorAll('.thinkreview-new-badge, .thinkreview-code-suggestions-tab-count').forEach((el) => el.remove());
    }
    if (codeSuggestionsInner) codeSuggestionsInner.replaceChildren();
    delete window.__thinkreview_codeSuggestions;

    // Ensure we're on Review tab when Code Suggestions tab is hidden
    const reviewTabBtn = document.querySelector('.thinkreview-tab-btn[data-tab="review"]');
    const reviewTabPanel = document.getElementById('tab-panel-review');
    if (reviewTabBtn && reviewTabPanel) {
      document.querySelectorAll('.thinkreview-tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.thinkreview-tab-panel').forEach((p) => p.classList.remove('active'));
      reviewTabBtn.classList.add('active');
      reviewTabPanel.classList.add('active');
    }
  }
}
