// azure-devops-token-error.js
// Module for displaying Azure DevOps token configuration error with helpful UI

// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[Azure DevOps Token Error]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[Azure DevOps Token Error]', ...args); }

/**
 * Shows Azure DevOps token configuration error with helpful UI
 * @param {Function} stopEnhancedLoader - Function to stop the enhanced loader if running
 */
export function showAzureDevOpsTokenError(stopEnhancedLoader = null, extraInfo = null) {
  // Stop the enhanced loader if it's running
  if (typeof stopEnhancedLoader === 'function') {
    stopEnhancedLoader();
  }
  
  const reviewLoading = document.getElementById('review-loading');
  const reviewContent = document.getElementById('review-content');
  const reviewError = document.getElementById('review-error');
  
  // Hide all sections
  if (reviewLoading) reviewLoading.classList.add('gl-hidden');
  if (reviewContent) reviewContent.classList.add('gl-hidden');
  if (reviewError) reviewError.classList.add('gl-hidden');
  
  // Create Azure DevOps token error if it doesn't exist
  let tokenError = document.getElementById('review-azure-token-error');
  if (!tokenError) {
    tokenError = createTokenErrorElement();
    
    // Add the token error to the panel
    const cardBody = document.querySelector('#gitlab-mr-integrated-review .thinkreview-card-body');
    if (cardBody) {
      cardBody.appendChild(tokenError);
    }
  }
  
  // Update any contextual details
  updateTokenErrorDetails(tokenError, extraInfo);
  
  // Show the token error
  tokenError.classList.remove('gl-hidden');
}

/**
 * Creates the Azure DevOps token error element
 * @returns {HTMLElement} The token error element
 */
function createTokenErrorElement() {
  const tokenError = document.createElement('div');
  tokenError.id = 'review-azure-token-error';
  tokenError.className = 'gl-p-5 gl-text-center';
  
  // Create the error message container
  const messageContainer = createMessageContainer();
  tokenError.appendChild(messageContainer);
  
  // Create action buttons container
  const actionContainer = createActionContainer();
  tokenError.appendChild(actionContainer);
  
  return tokenError;
}

/**
 * Creates the message container with heading and description
 * @returns {HTMLElement} The message container element
 */
function createMessageContainer() {
  const messageContainer = document.createElement('div');
  messageContainer.className = 'gl-mb-5';
  messageContainer.style.textAlign = 'center';
  
  // Add heading
  const heading = document.createElement('h3');
  heading.className = 'azure-devops-token-heading';
  heading.style.textAlign = 'center';
  heading.style.marginBottom = '12px';
  heading.style.fontSize = '18px';
  heading.style.fontWeight = '600';
  heading.style.color = '#e6e6e6';
  heading.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.3)';
  heading.textContent = 'Azure DevOps Personal Access Token Issue';
  messageContainer.appendChild(heading);
  
  // Add description
  const description = document.createElement('p');
  description.className = 'azure-devops-token-description';
  description.style.textAlign = 'center';
  description.style.marginBottom = '16px';
  description.style.fontSize = '14px';
  description.style.color = '#b3b3b3';
  description.style.lineHeight = '1.4';
  description.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.2)';
  description.textContent = 'Your Azure DevOps Personal Access Token is incorrect, missing, or does not have access to this organization/project.';
  messageContainer.appendChild(description);
  
  // Optional debug details placeholder
  const extraDetails = document.createElement('p');
  extraDetails.className = 'azure-devops-token-extra';
  extraDetails.style.display = 'none';
  extraDetails.style.textAlign = 'center';
  extraDetails.style.marginBottom = '24px';
  extraDetails.style.fontSize = '12px';
  extraDetails.style.color = '#ffb347';
  extraDetails.style.lineHeight = '1.4';
  extraDetails.style.background = 'rgba(255, 179, 71, 0.08)';
  extraDetails.style.border = '1px solid rgba(255, 179, 71, 0.35)';
  extraDetails.style.borderRadius = '6px';
  extraDetails.style.padding = '10px 12px';
  extraDetails.style.wordBreak = 'break-word';
  extraDetails.textContent = '';
  messageContainer.appendChild(extraDetails);
  
  return messageContainer;
}

/**
 * Creates the action container with settings button and documentation link
 * @returns {HTMLElement} The action container element
 */
function createActionContainer() {
  const actionContainer = document.createElement('div');
  actionContainer.className = 'azure-devops-token-actions';
  actionContainer.style.display = 'flex';
  actionContainer.style.flexDirection = 'column';
  actionContainer.style.gap = '12px';
  actionContainer.style.alignItems = 'center';
  
  // Create "Open Extension Settings" button
  const settingsButton = createSettingsButton(actionContainer);
  actionContainer.appendChild(settingsButton);
  
  // Create "Learn How to Generate Token" link
  const learnLink = createLearnLink();
  actionContainer.appendChild(learnLink);
  
  return actionContainer;
}

/**
 * Creates the settings button with click handler
 * @param {HTMLElement} actionContainer - The action container to add help text to
 * @returns {HTMLElement} The settings button element
 */
function createSettingsButton(actionContainer) {
  const settingsButton = document.createElement('button');
  settingsButton.className = 'azure-devops-token-settings-button';
  settingsButton.style.backgroundColor = '#0078D4';
  settingsButton.style.color = 'white';
  settingsButton.style.border = 'none';
  settingsButton.style.padding = '12px 20px';
  settingsButton.style.borderRadius = '6px';
  settingsButton.style.display = 'inline-flex';
  settingsButton.style.alignItems = 'center';
  settingsButton.style.justifyContent = 'center';
  settingsButton.style.cursor = 'pointer';
  settingsButton.style.fontSize = '14px';
  settingsButton.style.fontWeight = '500';
  settingsButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
  settingsButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"></path>
    </svg>
    Open Extension Settings
  `;
  
  // Add click event to open extension popup
  settingsButton.addEventListener('click', () => {
    dbgLog('[Content] Requesting background to open extension popup for Azure DevOps token configuration');
    
    // Ask background script to open the extension popup
    chrome.runtime.sendMessage({ type: 'OPEN_EXTENSION_POPUP' }, (response) => {
      if (chrome.runtime.lastError) {
        dbgWarn('[Content] Error opening extension popup:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        dbgLog('[Content] Extension popup opened successfully');
      }
    });
  });
  
  return settingsButton;
}

/**
 * Creates the learn link with hover effects
 * @returns {HTMLElement} The learn link element
 */
function createLearnLink() {
  const learnLink = document.createElement('a');
  learnLink.href = 'https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows';
  learnLink.target = '_blank';
  learnLink.rel = 'noopener noreferrer';
  learnLink.className = 'azure-devops-token-learn-link';
  learnLink.style.color = '#4da6ff';
  learnLink.style.textDecoration = 'none';
  learnLink.style.fontSize = '14px';
  learnLink.style.display = 'inline-flex';
  learnLink.style.alignItems = 'center';
  learnLink.style.gap = '6px';
  learnLink.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.2)';
  learnLink.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
    Learn how to generate a Personal Access Token
  `;
  
  // Add hover effect
  learnLink.addEventListener('mouseenter', () => {
    learnLink.style.textDecoration = 'underline';
  });
  learnLink.addEventListener('mouseleave', () => {
    learnLink.style.textDecoration = 'none';
  });
  
  return learnLink;
}

/**
 * Updates the optional extra details section with Azure DevOps error info
 * @param {HTMLElement} container - The token error container element
 * @param {string|null} extraInfo - Optional extra info to display
 */
function updateTokenErrorDetails(container, extraInfo) {
  const extraElement = container.querySelector('.azure-devops-token-extra');
  if (!extraElement) {
    return;
  }
  
  if (extraInfo && extraInfo.trim().length > 0) {
    const trimmed = extraInfo.trim();
    const displayText = trimmed.length > 320 ? `${trimmed.slice(0, 317)}…` : trimmed;
    extraElement.textContent = `Details from Azure DevOps: ${displayText}`;
    extraElement.style.display = 'block';
  } else {
    extraElement.textContent = '';
    extraElement.style.display = 'none';
  }
}

/**
 * Hides the Azure DevOps token error
 */
export function hideAzureDevOpsTokenError() {
  const tokenError = document.getElementById('review-azure-token-error');
  if (tokenError) {
    tokenError.classList.add('gl-hidden');
  }
}

/**
 * Checks if the Azure DevOps token error is currently visible
 * @returns {boolean} True if the token error is visible
 */
export function isAzureDevOpsTokenErrorVisible() {
  const tokenError = document.getElementById('review-azure-token-error');
  return tokenError && !tokenError.classList.contains('gl-hidden');
}
