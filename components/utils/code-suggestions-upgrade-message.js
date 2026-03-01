// code-suggestions-upgrade-message.js
// Upgrade message shown to Free users in the Code Suggestions tab.

const SUBSCRIPTION_PORTAL_URL = 'https://portal.thinkreview.dev/subscription';

/**
 * Creates and returns the upgrade message DOM element for the Code Suggestions tab.
 * Shown when a Free user has code suggestions in their review.
 *
 * @returns {HTMLElement} The upgrade message container element
 */
export function createCodeSuggestionsUpgradeMessage() {
  const upgradeBox = document.createElement('div');
  upgradeBox.className = 'thinkreview-code-suggestions-upgrade';
  Object.assign(upgradeBox.style, {
    padding: '20px 16px',
    backgroundColor: '#1e1e1e',
    borderRadius: '8px',
    border: '1px solid rgba(107, 79, 187, 0.3)',
    margin: '8px 0'
  });

  const intro = document.createElement('p');
  intro.style.cssText = 'margin: 0 0 12px; color: #e0e0e0; font-size: 14px; line-height: 1.5;';
  intro.textContent = 'Unlock code suggestions with line numbers and review comments ready to be pasted in your code review - plus:';

  const featureList = document.createElement('ul');
  featureList.style.cssText = 'margin: 0 0 20px; padding-left: 20px; color: #b8b8b8; font-size: 13px; line-height: 1.7; text-align: left;';
  const features = [
    'Use the best frontier models in the market',
    '25 code reviews per day',
    'Add custom rules that best fit your codebase and team'
  ];
  features.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    featureList.appendChild(li);
  });

  const buttonWrapper = document.createElement('div');
  buttonWrapper.style.cssText = 'text-align: center; margin-bottom: 8px;';

  const upgradeLink = document.createElement('a');
  upgradeLink.href = SUBSCRIPTION_PORTAL_URL;
  upgradeLink.target = '_blank';
  upgradeLink.rel = 'noopener noreferrer';
  upgradeLink.textContent = 'Upgrade to unlock';
  upgradeLink.className = 'thinkreview-code-suggestions-upgrade-link';
  Object.assign(upgradeLink.style, {
    display: 'inline-block',
    padding: '10px 20px',
    backgroundColor: '#6b4fbb',
    color: '#fff',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  });

  upgradeLink.addEventListener('click', async () => {
    try {
      const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
      analyticsModule.trackUserAction('code_suggestions_upgrade_clicked', {
        context: 'code_suggestions_tab',
        location: 'integrated_panel',
        source: 'upgrade_message'
      }).catch(() => {});
    } catch (_) {}
  });

  const freeTrialNote = document.createElement('p');
  freeTrialNote.style.cssText = 'margin: 8px 0 0; color: #8a8a8a; font-size: 12px; text-align: center;';
  freeTrialNote.textContent = 'Free trial available';

  buttonWrapper.appendChild(upgradeLink);
  buttonWrapper.appendChild(freeTrialNote);
  upgradeBox.appendChild(intro);
  upgradeBox.appendChild(featureList);
  upgradeBox.appendChild(buttonWrapper);

  return upgradeBox;
}
