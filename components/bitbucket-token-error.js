// bitbucket-token-error.js
// Module for displaying Bitbucket API token configuration error with helpful UI
import { dbgLog, dbgWarn } from '../utils/logger.js';
import { getShadowRoot } from '../utils/shadow-dom-state.js';

const BITBUCKET_DOCS_URL = 'https://thinkreview.dev/docs/bitbucket-integration';

/**
 * Shows Bitbucket token configuration error with helpful UI
 * @param {Function} stopEnhancedLoader - Function to stop the enhanced loader if running
 * @param {string|null} extraInfo - Optional server error message to surface to the user
 */
export function showBitbucketTokenError(stopEnhancedLoader = null, extraInfo = null) {
  if (typeof stopEnhancedLoader === 'function') {
    stopEnhancedLoader();
  }

  const panelRoot = getShadowRoot();
  const reviewLoading = panelRoot.getElementById('review-loading');
  const reviewContent = panelRoot.getElementById('review-content');
  const reviewError = panelRoot.getElementById('review-error');

  if (reviewLoading) reviewLoading.classList.add('gl-hidden');
  if (reviewContent) reviewContent.classList.add('gl-hidden');
  if (reviewError) reviewError.classList.add('gl-hidden');

  let tokenError = panelRoot.getElementById('review-bitbucket-token-error');
  if (!tokenError) {
    tokenError = createTokenErrorElement();
    const cardBody = panelRoot.querySelector('.thinkreview-card-body');
    if (cardBody) {
      cardBody.appendChild(tokenError);
    }
  }

  updateTokenErrorDetails(tokenError, extraInfo);
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

  const extraDetails = document.createElement('p');
  extraDetails.className = 'bitbucket-token-extra';
  extraDetails.style.display = 'none';
  extraDetails.style.textAlign = 'left';
  extraDetails.style.marginBottom = '16px';
  extraDetails.style.fontSize = '12px';
  extraDetails.style.color = '#ffb347';
  extraDetails.style.lineHeight = '1.5';
  extraDetails.style.background = 'rgba(255, 179, 71, 0.08)';
  extraDetails.style.border = '1px solid rgba(255, 179, 71, 0.35)';
  extraDetails.style.borderRadius = '6px';
  extraDetails.style.padding = '10px 12px';
  extraDetails.style.wordBreak = 'break-word';
  messageContainer.appendChild(extraDetails);

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

/**
 * Updates the optional extra details section with the server's error message.
 * @param {HTMLElement} container - The token error container element
 * @param {string|null} extraInfo - Raw server message (may be plain text or JSON/HTML)
 */
function updateTokenErrorDetails(container, extraInfo) {
  const extraElement = container.querySelector('.bitbucket-token-extra');
  if (!extraElement) return;

  if (extraInfo && extraInfo.trim().length > 0) {
    const trimmed = extraInfo.trim();
    const displayText = trimmed.length > 400 ? `${trimmed.slice(0, 397)}…` : trimmed;
    extraElement.textContent = `Server message: ${displayText}`;
    extraElement.style.display = 'block';
  } else {
    extraElement.textContent = '';
    extraElement.style.display = 'none';
  }
}

export function hideBitbucketTokenError() {
  const tokenError = document.getElementById('review-bitbucket-token-error');
  if (tokenError) {
    tokenError.classList.add('gl-hidden');
  }
}
