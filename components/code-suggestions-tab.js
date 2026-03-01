// code-suggestions-tab.js
// Module for the Code Suggestions tab in the integrated review panel.
// Handles visibility, badge, population, and GitLab diff injection storage.
// Code suggestions feature is only available for Professional and Lite subscription types.

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
 * @param {string} [params.subscriptionType] - User subscription type (from storage); Free users see upgrade message
 * @param {Object} [params.logger] - Optional { dbgLog, dbgWarn }
 * @param {Function} [params.onExplainSuggestion] - Callback(suggestion) when Explain is clicked; switches to Review tab and sends message
 */
export async function updateCodeSuggestionsTab({ review, patchContent, subscriptionType = 'Free', logger = {}, onExplainSuggestion } = {}) {
  const { dbgLog = () => {}, dbgWarn = (...args) => console.warn('[CodeSuggestionsTab]', ...args) } = logger;

  const codeSuggestionsTabBtn = document.getElementById('tab-btn-code-suggestions');
  const codeSuggestionsPanel = document.getElementById('tab-panel-code-suggestions');
  const codeSuggestionsInner = document.getElementById('review-code-suggestions-inner');

  const hasSuggestions = Array.isArray(review.codeSuggestions) && review.codeSuggestions.length > 0;
  const canAccessSuggestions = hasCodeSuggestionsAccess(subscriptionType);

  if (hasSuggestions && !canAccessSuggestions) {
    // Free user: show tab with upgrade message
    if (codeSuggestionsTabBtn) {
      codeSuggestionsTabBtn.classList.remove('gl-hidden');
      // Add "New" badge same as paid users
      if (!codeSuggestionsTabBtn.querySelector('.thinkreview-new-badge')) {
        try {
          const badgeModule = await import('./utils/new-badge.js');
          const badgeCreator = badgeModule?.createNewBadge;
          if (badgeCreator) {
            const newBadge = badgeCreator('New');
            codeSuggestionsTabBtn.appendChild(newBadge);
          }
        } catch (error) {
          dbgWarn('Failed to load badge module for Code Suggestions tab:', error);
        }
      }
    }

    if (codeSuggestionsInner) {
      codeSuggestionsInner.innerHTML = '';
      const upgradeModule = await import('./utils/code-suggestions-upgrade-message.js');
      const upgradeBox = upgradeModule.createCodeSuggestionsUpgradeMessage();
      codeSuggestionsInner.appendChild(upgradeBox);
    }

    // Do not store for GitLab injection - Free users don't get suggestions
    delete window.__thinkreview_codeSuggestions;
    return;
  }

  if (hasSuggestions && canAccessSuggestions) {
    // Show Code Suggestions tab in the integrated panel
    if (codeSuggestionsTabBtn) {
      codeSuggestionsTabBtn.classList.remove('gl-hidden');
      // Add "New" badge next to tab header using same module as other badges
      if (!codeSuggestionsTabBtn.querySelector('.thinkreview-new-badge')) {
        try {
          const badgeModule = await import('./utils/new-badge.js');
          const badgeCreator = badgeModule?.createNewBadge;
          if (badgeCreator) {
            const newBadge = badgeCreator('New');
            codeSuggestionsTabBtn.appendChild(newBadge);
          }
        } catch (error) {
          dbgWarn('Failed to load badge module for Code Suggestions tab:', error);
        }
      }
    }

    if (codeSuggestionsInner) {
      codeSuggestionsInner.innerHTML = '';
      const suggestionModule = await import('./utils/code-suggestion-element.js');
      const copyModule = await import('./utils/item-copy-button.js');
      const createCopyButton = copyModule.createCopyButton;
      const showCopySuccessFeedback = copyModule.showCopySuccessFeedback;
      const showCopyErrorFeedback = copyModule.showCopyErrorFeedback;
      const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));

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
      window.__thinkreview_codeSuggestions = {
        suggestions: review.codeSuggestions,
        patchContent: patchContent,
        timestamp: Date.now()
      };
      dbgLog(`Stored ${review.codeSuggestions.length} code suggestions for injection`);
    }
  } else {
    // No code suggestions - hide tab and clear
    if (codeSuggestionsTabBtn) codeSuggestionsTabBtn.classList.add('gl-hidden');
    if (codeSuggestionsInner) codeSuggestionsInner.innerHTML = '';
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
