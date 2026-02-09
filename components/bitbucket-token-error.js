// bitbucket-token-error.js
// Module for displaying Bitbucket API token configuration error with helpful UI
import { dbgLog, dbgWarn } from '../utils/logger.js';

const BITBUCKET_DOCS_URL = 'https://thinkreview.dev/docs/bitbucket-integration';

/**
 * Shows Bitbucket token configuration error with helpful UI
 * @param {Function} stopEnhancedLoader - Function to stop the enhanced loader if running
 */
export function showBitbucketTokenError(stopEnhancedLoader = null) {
  if (typeof stopEnhancedLoader === 'function') {
    stopEnhancedLoader();
  }

  const reviewLoading = document.getElementById('review-loading');
  const reviewContent = document.getElementById('review-content');
  const reviewError = document.getElementById('review-error');

  if (reviewLoading) reviewLoading.classList.add('gl-hidden');
  if (reviewContent) reviewContent.classList.add('gl-hidden');
  if (reviewError) reviewError.classList.add('gl-hidden');

  let tokenError = document.getElementById('review-bitbucket-token-error');
  if (!tokenError) {
    tokenError = createTokenErrorElement();
    const cardBody = document.querySelector('#gitlab-mr-integrated-review .thinkreview-card-body');
    if (cardBody) {
      cardBody.appendChild(tokenError);
    }
  }

  tokenError.classList.remove('gl-hidden');
}

function createTokenErrorElement() {
  const tokenError = document.createElement('div');
  tokenError.id = 'review-bitbucket-token-error';
  tokenError.className = 'gl-p-5 gl-text-center';
  Object.assign(tokenError.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '1',
    minHeight: '0',
    boxSizing: 'border-box'
  });

  const messageContainer = document.createElement('div');
  messageContainer.className = 'gl-mb-5';
  messageContainer.style.textAlign = 'center';

  const heading = document.createElement('h3');
  heading.className = 'bitbucket-token-heading';
  heading.style.textAlign = 'center';
  heading.style.marginBottom = '12px';
  heading.style.fontSize = '18px';
  heading.style.fontWeight = '600';
  heading.style.color = '#e6e6e6';
  heading.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.3)';
  heading.textContent = 'Bitbucket API token required';
  messageContainer.appendChild(heading);

  const description = document.createElement('p');
  description.className = 'bitbucket-token-description';
  description.style.textAlign = 'center';
  description.style.marginBottom = '16px';
  description.style.fontSize = '14px';
  description.style.color = '#b3b3b3';
  description.style.lineHeight = '1.4';
  description.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.2)';
  description.textContent = 'Generate a Bitbucket API token for ThinkReview. It takes about 60 seconds.';
  messageContainer.appendChild(description);

  tokenError.appendChild(messageContainer);

  const actionContainer = document.createElement('div');
  actionContainer.className = 'bitbucket-token-actions';
  actionContainer.style.display = 'flex';
  actionContainer.style.flexDirection = 'column';
  actionContainer.style.gap = '12px';
  actionContainer.style.alignItems = 'center';

  const settingsButton = document.createElement('button');
  settingsButton.className = 'bitbucket-token-settings-button';
  Object.assign(settingsButton.style, {
    backgroundColor: '#0052CC',
    color: 'white',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
  });
  settingsButton.textContent = 'Open Extension Settings';
  settingsButton.addEventListener('click', () => {
    dbgLog('[Content] Requesting background to open extension popup for Bitbucket token');
    chrome.runtime.sendMessage({ type: 'OPEN_EXTENSION_POPUP' }, (response) => {
      if (chrome.runtime.lastError) {
        dbgWarn('[Content] Error opening extension popup:', chrome.runtime.lastError);
      }
    });
  });
  actionContainer.appendChild(settingsButton);

  const learnLink = document.createElement('a');
  learnLink.href = BITBUCKET_DOCS_URL;
  learnLink.target = '_blank';
  learnLink.rel = 'noopener noreferrer';
  learnLink.className = 'bitbucket-token-learn-link';
  Object.assign(learnLink.style, {
    color: '#4da6ff',
    textDecoration: 'none',
    fontSize: '14px'
  });
  learnLink.textContent = 'How to generate Bitbucket token for ThinkReview (takes 60 seconds)';
  learnLink.addEventListener('mouseenter', () => { learnLink.style.textDecoration = 'underline'; });
  learnLink.addEventListener('mouseleave', () => { learnLink.style.textDecoration = 'none'; });
  actionContainer.appendChild(learnLink);

  tokenError.appendChild(actionContainer);
  return tokenError;
}

export function hideBitbucketTokenError() {
  const tokenError = document.getElementById('review-bitbucket-token-error');
  if (tokenError) {
    tokenError.classList.add('gl-hidden');
  }
}
