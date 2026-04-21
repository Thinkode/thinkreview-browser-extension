// content.js
// Detects GitLab MR and Azure DevOps PR pages, fetches code changes, injects UI, and displays integrated code review
// Debug toggle: set to false to disable console logs in production
// Check if DEBUG already exists to avoid conflicts
if (typeof DEBUG === 'undefined') {
  var DEBUG = false;
}

// Timing constants (in milliseconds)
const TIMEOUT_AUTO_REVIEW_DELAY = 500;
const MAX_PATCH_SIZE_FALLBACK = 50_000;

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

// Initialize logger functions with dynamic import
(async () => {
    try {
      // Use chrome.runtime.getURL for content scripts (same pattern as other dynamic imports)
      const loggerModule = await import(chrome.runtime.getURL('utils/logger.js'));
      // Upgrade to use the real logger functions
      dbgLog = loggerModule.dbgLog;
      dbgWarn = loggerModule.dbgWarn;
      dbgError = loggerModule.dbgError;
      dbgLog('Logger module loaded successfully');
    } catch (error) {
      // Keep using fallback functions if logger fails to load
      dbgWarn('Failed to load logger module, using console fallback:', error);
    }
  })();

  // Configuration constants
// Note: Daily review limit is now handled server-side via Firebase Remote Config
// Delay initial log until logger is loaded
setTimeout(() => {
  dbgLog('Content script loaded on:', window.location.href);
}, 100);

// Track if a review request is in progress to prevent duplicates
let isReviewInProgress = false;

// Track current PR ID for detecting navigation to new PRs
let currentPRId = null;

// Listen for Ollama metadata bar actions (switch to cloud, change model)
document.addEventListener('thinkreview-switch-to-cloud', async () => {
  await chrome.storage.local.set({ aiProvider: 'cloud' });
  if (typeof fetchAndDisplayCodeReview === 'function') {
    fetchAndDisplayCodeReview(true, false);
  }
});

document.addEventListener('thinkreview-ollama-model-changed', async (e) => {
  const model = e.detail?.model;
  if (!model) return;
  const { ollamaConfig } = await chrome.storage.local.get(['ollamaConfig']);
  const config = ollamaConfig || { url: 'http://localhost:11434', model: '' };
  await chrome.storage.local.set({ ollamaConfig: { ...config, model } });
  if (typeof fetchAndDisplayCodeReview === 'function') {
    fetchAndDisplayCodeReview(true, false);
  }
});

// Import platform detection services
let platformDetector = null;

// Import Azure DevOps token error module
let azureDevOpsTokenError = null;

// Initialize platform detection
async function initializePlatformDetection() {
  try {
    // Dynamically import platform detector
    const platformModule = await import(chrome.runtime.getURL('services/platform-detector.js'));
    platformDetector = platformModule.platformDetector;
    platformDetector.init();

    // Load custom Azure DevOps domains so on-prem URLs are detected
    const storage = await chrome.storage.local.get(['azureDevOpsDomains', 'bitbucketDataCenterDomains']);
    platformDetector.setAzureDevOpsCustomDomains(storage.azureDevOpsDomains || []);

    // Load custom Bitbucket Data Center domains
    platformDetector.setBitbucketCustomDomains(storage.bitbucketDataCenterDomains || []);
    
    // Dynamically import Azure DevOps API module for error handling
    const apiModule = await import(chrome.runtime.getURL('services/azure-devops-api.js'));

    // Run server version detection only for on-prem/custom domains (skip dev.azure.com and visualstudio.com)
    const hostname = window.location.hostname || '';
    const isAzureCloud = hostname.includes('dev.azure.com') || hostname.includes('visualstudio.com');
    if (
      !isAzureCloud &&
      platformDetector.isAzureDevOpsSite() &&
      typeof apiModule.detectAndCacheServerVersion === 'function'
    ) {
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const collection = pathParts.length > 0 ? pathParts[0] : '';
      const origin = window.location.origin;
      apiModule.detectAndCacheServerVersion(origin, collection)
        .then((result) => {
          if (!result || result.fromCache !== false) return;
          // Send to cloud via background script (avoids content script fetch to external API / CSP)
          chrome.runtime.sendMessage({
            type: 'LOG_AZURE_DEVOPS_VERSION',
            origin,
            version: result.version,
            collection,
            azureOnPremiseApiVersion: result.azureOnPremiseApiVersion ?? null,
            azureOnPremiseVersion: result.azureOnPremiseVersion ?? null
          }, (response) => {
            if (chrome.runtime.lastError) dbgWarn('Azure DevOps version cloud log failed (non-critical):', chrome.runtime.lastError);
          });
        })
        .catch((err) => {
          dbgWarn('Azure DevOps server version detection failed (non-critical):', err);
        });
    }
    
    // Dynamically import Azure DevOps token error module
    const tokenErrorModule = await import(chrome.runtime.getURL('components/azure-devops-token-error.js'));
    azureDevOpsTokenError = tokenErrorModule;
    
    dbgLog('Platform detection initialized');
  } catch (error) {
    dbgWarn('Error initializing platform detection:', error);
  }
}

// Debug information about the page
if (DEBUG) {
  const pageInfo = {
    url: window.location.href,
    pathname: window.location.pathname,
    host: window.location.host,
    protocol: window.location.protocol,
    hasMergeRequestsInPath: window.location.pathname.includes('/merge_requests/'),
    hasPullRequestsInPath: window.location.pathname.includes('/pullrequest/'),
    documentTitle: document.title,
    relevantElements: {
      mergeRequest: !!document.querySelector('.merge-request'),
      mergeRequestDetails: !!document.querySelector('.merge-request-details'),
      diffFilesHolder: !!document.querySelector('.diff-files-holder'),
      diffs: !!document.querySelector('.diffs'),
      mrStateWidget: !!document.querySelector('.mr-state-widget'),
      prHeader: !!document.querySelector('[data-testid="pull-request-header"]'),
      prTitle: !!document.querySelector('[data-testid="pull-request-title"]')
    }
  };
  dbgLog('Page information:', pageInfo);
}
// The integrated review component functions (createIntegratedReviewPanel, displayIntegratedReview, showIntegratedReviewError)
// are loaded from integrated-review.js which is included in the manifest.json

// Note: CloudService is imported dynamically when needed



// Cloud function URL for code review
const CLOUD_FUNCTIONS_BASE_URL = 'https://us-central1-thinkgpt.cloudfunctions.net';
const REVIEW_CODE_URL = `${CLOUD_FUNCTIONS_BASE_URL}/reviewPatchCode`;

/**
 * Check if the current page is a supported platform (GitLab MR, GitHub PR, or Azure DevOps PR)
 * @returns {boolean} True if the current page is supported
 */
function isSupportedPage() {
  if (!platformDetector) {
    // Fallback to GitLab detection if platform detector not initialized
    return isGitLabMRPage();
  }
  
  return platformDetector.isCurrentPageSupported();
}

/**
 * Check if we should show the AI Review button
 * For Azure DevOps and GitHub, always show the button (since they're SPAs)
 * For GitLab, only show on MR pages
 * @returns {boolean} True if button should be shown
 */
function shouldShowButton() {
  if (!platformDetector) {
    return isGitLabMRPage();
  }
  
  // Always show button on Azure DevOps sites (SPA)
  if (platformDetector.isAzureDevOpsSite()) {
    return true;
  }
  
  // Always show button on GitHub sites (SPA)
  if (platformDetector.isGitHubSite()) {
    return true;
  }

  // Always show button on Bitbucket sites (SPA; content script only runs when user allowed Bitbucket)
  if (platformDetector.isBitbucketSite()) {
    return true;
  }
  
  // For other platforms, only show on supported pages
  return platformDetector.isCurrentPageSupported();
}

/**
 * Get the current platform
 * @returns {string|null} Current platform ('gitlab' or 'azure-devops')
 */
function getCurrentPlatform() {
  if (!platformDetector) {
    return isGitLabMRPage() ? 'gitlab' : null;
  }
  
  return platformDetector.getCurrentPlatform();
}

/**
 * Check if the current page is a GitLab merge request page (legacy function)
 * @returns {boolean} True if the current page is a GitLab MR page
 */
function isGitLabMRPage() {
  return /\/merge_requests\//.test(window.location.pathname);
}

/**
 * Get patch URL for GitLab or GitHub (legacy function)
 * @returns {string} Patch URL
 */
function getPatchUrl() {
  // GitHub: normalize to canonical PR diff URL so suffix views like /files or /commits still work
  if (platformDetector && platformDetector.isOnGitHubPRPage()) {
    const githubDiffUrl = platformDetector.getGitHubPRDiffUrl && platformDetector.getGitHubPRDiffUrl();
    if (githubDiffUrl) {
      return githubDiffUrl;
    }
    // Fallback: legacy behavior for safety
    let legacyUrl = window.location.href.replace(/[#?].*$/, '');
    if (!legacyUrl.endsWith('.diff')) {
      legacyUrl += '.diff';
    }
    return legacyUrl;
  }

  // Bitbucket: API 2.0 patch endpoint (cookie auth from content script)
  if (platformDetector && platformDetector.isOnBitbucketPRPage()) {
    const bitbucketPatchUrl = platformDetector.getBitbucketPatchApiUrl && platformDetector.getBitbucketPatchApiUrl();
    if (bitbucketPatchUrl) {
      return bitbucketPatchUrl;
    }
  }

  // GitLab and others: keep existing .patch behavior
  let url = window.location.href.replace(/[#?].*$/, '');
  const extension = '.patch';
  
  if (!url.endsWith(extension)) {
    url += extension;
  }
  return url;
}

/**
 * Extract GitHub pull request ID from URL
 * @returns {string|null} Pull request ID
 */
function getGitHubPRId() {
  const pathname = window.location.pathname;
  const match = pathname.match(/\/pull\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Reads layout settings from chrome.storage.local, merged with defaults.
 * @returns {Promise<Object>}
 */
async function getLayoutSettings() {
  try {
    const result = await chrome.storage.local.get(['reviewLayoutSettings']);
    const raw = {
      triggerMode: 'sidebar-tab',
      buttonPosition: 'bottom-right',
      panelMode: 'docked',
      sidebarSide: 'right',
      ...(result.reviewLayoutSettings || {}),
    };
    const pos = raw.buttonPosition;
    if (pos === 'top-right') raw.buttonPosition = 'bottom-right';
    else if (pos === 'top-left') raw.buttonPosition = 'bottom-left';
    return raw;
  } catch (e) {
    dbgWarn('Failed to load layout settings:', e);
    return { triggerMode: 'sidebar-tab', buttonPosition: 'bottom-right', panelMode: 'docked', sidebarSide: 'right' };
  }
}

/**
 * Applies or removes the docked-sidebar body margin when the panel is expanded/collapsed.
 * @param {boolean} isExpanded - True when panel is being shown, false when minimized
 * @param {string} panelMode - 'overlay' | 'docked'
 * @param {string} sidebarSide - 'right' | 'left'
 */
function applyDockedBodyMargin(isExpanded, panelMode, sidebarSide) {
  if (panelMode !== 'docked') {
    document.body.classList.remove('thinkreview-body-docked-right', 'thinkreview-body-docked-left');
    return;
  }
  const bodyClass = sidebarSide === 'left' ? 'thinkreview-body-docked-left' : 'thinkreview-body-docked-right';
  const otherClass = sidebarSide === 'left' ? 'thinkreview-body-docked-right' : 'thinkreview-body-docked-left';
  if (isExpanded) {
    document.body.classList.add(bodyClass);
    document.body.classList.remove(otherClass);
  } else {
    document.body.classList.remove('thinkreview-body-docked-right', 'thinkreview-body-docked-left');
  }
}

const areButtonsInjected = () =>
  !!(document.getElementById('code-review-btns') || document.getElementById('thinkreview-sidebar-tab'));

async function injectButtons() {
  if (areButtonsInjected()) {
    dbgLog('Buttons already injected');
    return;
  }

  dbgLog('Injecting trigger UI');
  try {
    const settings = await getLayoutSettings();
    const { injectTrigger } = await import(chrome.runtime.getURL('components/layout-trigger.js'));
    injectTrigger(settings, toggleReviewPanel);
    dbgLog('Trigger injected via layout-trigger.js, mode:', settings.triggerMode);
  } catch (error) {
    dbgError('Failed to load layout-trigger.js, falling back to inline button:', error);
    _injectFallbackButton();
  }
}

// Fallback button used if layout-trigger.js fails to load
function _injectFallbackButton() {
  if (document.getElementById('code-review-btns')) return;
  const container = document.createElement('div');
  container.id = 'code-review-btns';
  container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
  const reviewBtn = document.createElement('button');
  reviewBtn.id = 'code-review-btn';
  reviewBtn.style.cssText = 'padding:8px 12px;background:#6b4fbb;color:white;border:none;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
  reviewBtn.innerHTML = '<span style="margin-right:5px;">AI Review</span><span style="font-size:10px;">▼</span>';
  reviewBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleReviewPanel(); };
  container.appendChild(reviewBtn);
  document.body.appendChild(container);
}

/**
 * Checks if the current page is a GitLab merge request page
 * Simplified: If content script loaded, Chrome already validated the domain
 * @returns {boolean} True if the current page is a GitLab MR page
 */
function isGitLabMRPage() {
  // If content script is running, we're already on a registered GitLab domain
  // Chrome filtered via registration pattern in background.js
  // Just verify URL path indicates an MR page
  const pathname = window.location.pathname;
  const isMRPathPattern = pathname.includes('/merge_requests/') || 
                         pathname.includes('/-/merge_requests/') ||
                         pathname.includes('/merge_requests');
  
  dbgLog('Page detection:', { 
    isMRPathPattern, 
    pathname: pathname 
  });
  
  return isMRPathPattern;
}

/**
 * Extracts the merge request ID from the URL
 * @returns {string} The merge request ID
 */
function getMergeRequestId() {
  const pathParts = window.location.pathname.split('/');
  const mrIndex = pathParts.indexOf('merge_requests');
  
  if (mrIndex !== -1 && mrIndex + 1 < pathParts.length) {
    return pathParts[mrIndex + 1];
  }
  
  // Fallback: try to extract from the URL
  const matches = window.location.pathname.match(/\/merge_requests\/(\d+)/);
  return matches && matches[1] ? matches[1] : null;
}

/**
 * Extracts the merge request subject/title from the page
 * @returns {string} The merge request subject
 */
function getMergeRequestSubject() {
  // Try to get the title from the page header
  const titleElement = document.querySelector('.detail-page-header-title');
  if (titleElement) {
    return titleElement.textContent.trim();
  }
  
  // Alternative: try the merge request title element
  const mrTitleElement = document.querySelector('.merge-request-title');
  if (mrTitleElement) {
    return mrTitleElement.textContent.trim();
  }
  
  // Another alternative: try the page title
  const pageTitle = document.title;
  if (pageTitle) {
    // Remove the project name and GitLab suffix if present
    return pageTitle.split('·')[0].trim();
  }
  
  return 'Unknown MR';
}

/**
 * Get the current PR/MR ID
 * @returns {string|null} Current PR/MR ID
 */
function getCurrentPRId() {
  if (!platformDetector) {
    return null;
  }
  
  if (platformDetector.isOnGitLabMRPage()) {
    return getMergeRequestId();
  } else if (platformDetector.isOnGitHubPRPage()) {
    return getGitHubPRId();
  } else if (platformDetector.isOnAzureDevOpsPRPage()) {
    const prInfo = platformDetector.detectPlatform().pageInfo;
    return prInfo?.prId || null;
  } else if (platformDetector.isOnBitbucketPRPage()) {
    const prInfo = platformDetector.detectPlatform().pageInfo;
    return prInfo?.prId || null;
  }
  
  return null;
}

/**
 * Check if we've navigated to a new PR and trigger review if needed
 */
async function checkAndTriggerReviewForNewPR() {
  // Only check if we're on a supported page (PR page)
  if (!isSupportedPage()) {
    // Not on a PR page - reset tracking and hide score popup
    if (currentPRId !== null) {
      currentPRId = null;
      
      // Clear patch content and conversation history when leaving PR page
      if (typeof window.clearPatchContentAndHistory === 'function') {
        window.clearPatchContentAndHistory();
      }
    }
    
    // Hide score popup when navigating to a non-PR page
    try {
      const scorePopupModule = await import(chrome.runtime.getURL('components/popup-modules/score-popup.js'));
      scorePopupModule.hideScorePopup();
    } catch (error) {
      // Silently fail if module not available
    }
    // Clear completion effects (shake + bubble)
    try {
      const effectsModule = await import(chrome.runtime.getURL('components/popup-modules/completion-effects.js'));
      effectsModule.clearTriggerShake();
    } catch (error) {
      // Silently fail if module not available
    }
    try {
      const bubbleModule = await import(chrome.runtime.getURL('components/popup-modules/completion-message-bubble.js'));
      bubbleModule.hideBubble();
    } catch (error) {
      // Silently fail if module not available
    }
    
    return;
  }
  
  const panel = document.getElementById('gitlab-mr-integrated-review');
  
  // If panel doesn't exist yet, create it (this handles SPA navigation to PR pages)
  if (!panel) {
    // Await the panel creation to ensure it completes before returning
    await injectIntegratedReviewPanel();
    return;
  }
  
  const newPRId = getCurrentPRId();
  
  // Check if we've navigated to a different PR
  if (newPRId && newPRId !== currentPRId) {
    dbgLog('Detected new PR page:', {
      oldId: currentPRId,
      newId: newPRId
    });
    
    // Clear patch content and conversation history from previous PR to free up memory
    if (typeof window.clearPatchContentAndHistory === 'function') {
      window.clearPatchContentAndHistory();
    }
    
    // Update tracked PR ID
    currentPRId = newPRId;
    
    // Ensure panel is minimized
    if (!panel.classList.contains('thinkreview-panel-minimized-to-button')) {
      panel.classList.add('thinkreview-panel-minimized-to-button');
      const reviewBtn = document.getElementById('code-review-btn');
      if (reviewBtn) {
        const arrowSpan = reviewBtn.querySelector('span:last-child');
        if (arrowSpan) {
          arrowSpan.textContent = '▲';
        }
      }
    }
    
    isReviewInProgress = false;
    
    // Trigger new review only if auto-start is enabled
    const autoStart = await getAutoStartReview();
    if (autoStart && isSupportedPage()) {
      setTimeout(() => fetchAndDisplayCodeReview(false, true), TIMEOUT_AUTO_REVIEW_DELAY);
    }
  } else if (currentPRId === null && newPRId) {
    // First time detecting a PR - just track it
    currentPRId = newPRId;
  }
}

/**
 * Gets whether to start the review automatically when opening a PR page (from extension options).
 * @returns {Promise<boolean>}
 */
function getAutoStartReview() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['autoStartReview'], (result) => {
      // Respect the "Start review automatically" option for all providers
      resolve(result.autoStartReview !== false);
    });
  });
}

/**
 * Injects the integrated review panel into the GitLab MR page.
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.triggerReview] - If true, trigger the review after creating the panel (e.g. user clicked AI Review button). If false/undefined, trigger only when autoStartReview option is enabled.
 */
async function injectIntegratedReviewPanel(opts = {}) {
  const panel = document.getElementById('gitlab-mr-integrated-review');
  
  // Check if the panel already exists
  if (panel) {
    dbgLog('Integrated review panel already exists');
    // Check if we've navigated to a new PR
    checkAndTriggerReviewForNewPR();
    return;
  }
  
  // Check if we're on a supported page first
  if (!isSupportedPage()) {
    dbgLog('Not on a supported page, skipping panel injection');
    return;
  }
  
  dbgLog('Creating integrated review panel');
  // Create the review panel with the patch URL
  const patchUrl = getPatchUrl();
  await createIntegratedReviewPanel(patchUrl);
  
  dbgLog('Integrated review panel created');
  
  // If the user explicitly triggered this (button click), expand the panel immediately
  if (opts.triggerReview === true) {
    const createdPanel = document.getElementById('gitlab-mr-integrated-review');
    if (createdPanel) {
      createdPanel.classList.remove('thinkreview-panel-minimized-to-button');
      const expandSettings = await getLayoutSettings();
      if (expandSettings.panelMode === 'docked') {
        createdPanel.classList.add('thinkreview-panel-docked');
        if (expandSettings.sidebarSide === 'left') createdPanel.classList.add('thinkreview-panel-docked-left');
      } else if (expandSettings.sidebarSide === 'left') {
        // In overlay mode, still apply the sidebar side for positioning alignment
        createdPanel.classList.add('thinkreview-panel-overlay-left');
      }
      applyDockedBodyMargin(true, expandSettings.panelMode, expandSettings.sidebarSide);
    }
  }
  
  // Track current PR ID
  currentPRId = getCurrentPRId();
  
  // Trigger the code review only when: user explicitly requested (button click) or auto-start is enabled
  if (opts.triggerReview === true) {
    fetchAndDisplayCodeReview(false, false);
  } else if (await getAutoStartReview()) {
    fetchAndDisplayCodeReview(false, true);
  }
}

/**
 * Check if the user is logged in
 * @returns {Promise<boolean>} True if the user is logged in
 */
function isUserLoggedIn() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user', 'userData', 'authSource'], (result) => {
      // Check both user and userData fields for backward compatibility
      // userData is the new field used by the updated authentication flow
      // Supports both extension OAuth and webapp Firebase auth
      if (result.userData) {
        dbgLog('User logged in via:', result.authSource || 'extension');
        resolve(true);
      } else if (result.user) {
        try {
          // Try to parse the user data to ensure it's valid
          const userData = JSON.parse(result.user);
          resolve(!!userData && !!userData.email);
        } catch (e) {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });
  });
}

/**
 * Shows a login prompt in the review panel
 */
function showLoginPrompt() {
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
  
  // Create login prompt if it doesn't exist
  let loginPrompt = document.getElementById('review-login-prompt');
  if (!loginPrompt) {
    loginPrompt = document.createElement('div');
    loginPrompt.id = 'review-login-prompt';
    loginPrompt.className = 'gl-p-5 gl-text-center';
    
    // Create the login message
    const messageContainer = document.createElement('div');
    messageContainer.className = 'gl-mb-5';
    
    // Add user icon
    const userIcon = document.createElement('div');
    userIcon.className = 'thinkreview-login-icon';
    userIcon.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="#6b4fbb"/>
      </svg>
    `;
    messageContainer.appendChild(userIcon);
    
    // Add heading
    const heading = document.createElement('h3');
    heading.className = 'thinkreview-login-heading';
    heading.textContent = 'Please log in to start generating reviews';
    messageContainer.appendChild(heading);
    
    // Add description
    const description = document.createElement('p');
    description.className = 'thinkreview-login-description';
    description.textContent = 'Sign in with your Google account to access AI code reviews';
    messageContainer.appendChild(description);
    
    loginPrompt.appendChild(messageContainer);
    
    // Create sign-in button container
    const signInContainer = document.createElement('div');
    signInContainer.id = 'gitlab-mr-signin-container';
    signInContainer.className = 'thinkreview-signin-container';
    
    // Create a button that will trigger the Google Sign-In flow
    const signInButton = document.createElement('button');
    signInButton.className = 'thinkreview-signin-button';
    signInButton.style.backgroundColor = '#4285F4';
    signInButton.style.color = 'white';
    signInButton.style.border = 'none';
    signInButton.style.padding = '10px 16px';
    signInButton.style.borderRadius = '4px';
    signInButton.style.display = 'inline-flex';
    signInButton.style.alignItems = 'center';
    signInButton.style.justifyContent = 'center';
    signInButton.style.cursor = 'pointer';
    signInButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48" style="margin-right: 8px;">
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
      </svg>
      Sign in with Google
    `;
    
    // Add click event to open extension page for sign-in
    signInButton.addEventListener('click', () => {
      dbgLog('Requesting background to open extension page for sign-in');
      
      // Ask background script to open the extension page (content scripts can't do this directly)
      chrome.runtime.sendMessage({ type: 'OPEN_EXTENSION_PAGE' }, (response) => {
        if (chrome.runtime.lastError) {
          dbgWarn('Error opening extension page:', chrome.runtime.lastError);
          return;
        }
        
        if (response && response.success) {
          // Update button to show it was opened
          signInButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="16 12 12 8 8 12"></polyline>
              <line x1="12" y1="16" x2="12" y2="8"></line>
            </svg>
            Opening sign-in...
          `;
          signInButton.disabled = true;
          
          // Add instructions container with steps
          const instructionsContainer = document.createElement('div');
          instructionsContainer.className = 'signin-instructions-container';
          
          const instructionsTitle = document.createElement('p');
          instructionsTitle.className = 'signin-instructions-title';
          instructionsTitle.textContent = 'After signing in:';
          instructionsContainer.appendChild(instructionsTitle);
          
          const instructionsList = document.createElement('ol');
          instructionsList.className = 'signin-instructions-list';
          instructionsList.innerHTML = `
            <li>Complete the sign-in on the new tab</li>
            <li><strong>Refresh this page</strong> (or press F5)</li>
            <li>Click <strong>"AI Review"</strong> button again</li>
          `;
          instructionsContainer.appendChild(instructionsList);
          
          signInContainer.appendChild(instructionsContainer);
        }
      });
    });
    
    signInContainer.appendChild(signInButton);
    loginPrompt.appendChild(signInContainer);
    
    // Add the login prompt to the panel
    const cardBody = document.querySelector('#gitlab-mr-integrated-review .thinkreview-card-body');
    if (cardBody) {
      cardBody.appendChild(loginPrompt);
    }
  }
  
  // Show the login prompt
  loginPrompt.classList.remove('gl-hidden');
}



/**
 * Shows an upgrade message in the integrated review panel
 * @param {number} reviewCount - The number of reviews used today
 * @param {number} dailyLimit - The daily review limit (optional, defaults to 3)
 * @param {Object|null} limitOverride - Optional override for the limit title/body (e.g. for PR size errors).
 *   If provided, { title: string, body: string } will be used instead of the remote config / fallback values.
 */
async function showUpgradeMessage(reviewCount, dailyLimit = 3, limitOverride = null) {
  // Stop the enhanced loader if it's running
  if (typeof stopEnhancedLoader === 'function') {
    stopEnhancedLoader();
  }
  
  const reviewLoading = document.getElementById('review-loading');
  const reviewContent = document.getElementById('review-content');
  const reviewError = document.getElementById('review-error');
  const loginPrompt = document.getElementById('review-login-prompt');
  
  // Hide loading indicator
  if (reviewLoading) reviewLoading.classList.add('gl-hidden');
  
  // Show content area
  if (reviewContent) reviewContent.classList.remove('gl-hidden');
  
  // Hide error area
  if (reviewError) reviewError.classList.add('gl-hidden');
  
  // Hide login prompt
  if (loginPrompt) loginPrompt.classList.add('gl-hidden');

  if (!reviewContent) return;

  // Hide all existing review UI (tabs, sections, chat input) so only the
  // upgrade message is visible and nothing remains interactive.
  const tabsWrapper = reviewContent.querySelector('.thinkreview-tabs-wrapper');
  const chatInputContainer = document.getElementById('chat-input-container');
  if (tabsWrapper) tabsWrapper.classList.add('gl-hidden');
  if (chatInputContainer) chatInputContainer.classList.add('gl-hidden');

  // Remove a previously injected upgrade wrapper if the function is called again
  const existingWrapper = document.getElementById('upgrade-message-wrapper');
  if (existingWrapper) existingWrapper.remove();

  // Create a dedicated full-panel upgrade container
  const upgradeWrapper = document.createElement('div');
  upgradeWrapper.id = 'upgrade-message-wrapper';

  // Load subscription section styles
  if (!document.getElementById('subscription-styles')) {
    const linkEl = document.createElement('link');
    linkEl.id = 'subscription-styles';
    linkEl.rel = 'stylesheet';
    linkEl.href = chrome.runtime.getURL('components/subscription-section.css');
    document.head.appendChild(linkEl);
  }

  // Load and initialize upgrade tip banner module
  const tipBannerModule = await import(chrome.runtime.getURL('components/helpful-tip-banner.js'));
  tipBannerModule.injectStyles();

  // Load subscription section HTML via background (avoids page CSP blocking fetch to chrome-extension://)
  chrome.runtime.sendMessage(
    { type: 'GET_EXTENSION_RESOURCE', path: 'components/subscription-section.html' },
    async (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        dbgWarn('Error loading subscription section:', response?.error || chrome.runtime.lastError?.message);
        return;
      }
      const fallbackConfig = {
        prompt: {
          limitTitle: 'Daily Review Limit Reached',
          limitBody: "You've used {reviewCount} of {dailyLimit} free reviews today. Your limit resets daily - come back tomorrow for more reviews, or unlock unlimited reviews by upgrading now.",
          title: 'Upgrade to one of our premium plans',
          description: 'Get unlimited reviews, review larger PRs, choose your AI model, customize review rules, and more'
        },
        promotionalMessage: '',
        plans: [
          {
            name: 'Lite',
            interval: 'monthly',
            price: 10,
            period: 'month',
            currency: 'USD',
            ctaText: 'Choose Lite',
            features: ['15 reviews per day', 'Bigger PR analysis', 'Lite flagship models'],
            checkoutUrl: 'https://portal.thinkreview.dev/subscription',
            hasDiscount: false
          },
          {
            name: 'Professional',
            interval: 'monthly',
            price: 15,
            period: 'month',
            currency: 'USD',
            ctaText: 'Choose Professional',
            features: ['25 reviews per day', 'Premium AI models', 'Priority support'],
            checkoutUrl: 'https://portal.thinkreview.dev/subscription',
            hasDiscount: false
          }
        ]
      };

      let upgradeConfig = fallbackConfig;
      try {
        const cloudModule = await import(chrome.runtime.getURL('services/cloud-service.js'));
        const storageData = await new Promise((resolve) => {
          chrome.storage.local.get(['userData', 'user'], resolve);
        });

        let email = storageData?.userData?.email || null;
        if (!email && storageData?.user) {
          try {
            const parsedUser = JSON.parse(storageData.user);
            email = parsedUser?.email || null;
          } catch (parseError) {
            dbgWarn('Failed to parse user data for upgrade config:', parseError);
          }
        }

        if (email) {
          const remoteConfig = await cloudModule.CloudService.getUpgradePromptConfig(email);
          if (remoteConfig && Array.isArray(remoteConfig.plans) && remoteConfig.plans.length > 0) {
            upgradeConfig = {
              ...fallbackConfig,
              ...remoteConfig,
              prompt: {
                ...fallbackConfig.prompt,
                ...(remoteConfig.prompt || {})
              }
            };
          }
        }
      } catch (configError) {
        dbgWarn('Error fetching upgrade prompt config, using fallback:', configError);
      }

      const safeBody = limitOverride
        ? String(limitOverride.body)
        : String(upgradeConfig.prompt.limitBody || fallbackConfig.prompt.limitBody)
            .replace('{reviewCount}', String(reviewCount))
            .replace('{dailyLimit}', String(dailyLimit));
      const safeLimitTitle = limitOverride
        ? String(limitOverride.title)
        : String(upgradeConfig.prompt.limitTitle || fallbackConfig.prompt.limitTitle);

      const html = response.content;
      upgradeWrapper.innerHTML = `
        ${tipBannerModule.getHTML()}
        <div class="gl-alert gl-alert-warning">
          <div class="gl-alert-content">
            <div class="gl-alert-title" id="upgrade-limit-title"></div>
            <div class="gl-mb-3" id="upgrade-limit-body"></div>
          </div>
        </div>
        ${html}
      `;

      const limitTitleEl = upgradeWrapper.querySelector('#upgrade-limit-title');
      const limitBodyEl = upgradeWrapper.querySelector('#upgrade-limit-body');
      if (limitTitleEl) limitTitleEl.textContent = safeLimitTitle;
      if (limitBodyEl) limitBodyEl.textContent = safeBody;

      const titleEl = upgradeWrapper.querySelector('#subscription-title');
      const descriptionEl = upgradeWrapper.querySelector('#subscription-description');
      if (titleEl) titleEl.textContent = upgradeConfig.prompt.title || fallbackConfig.prompt.title;
      if (descriptionEl) descriptionEl.textContent = upgradeConfig.prompt.description || fallbackConfig.prompt.description;

      const promotionEl = upgradeWrapper.querySelector('#subscription-promotion');
      const promoText =
        typeof upgradeConfig.promotionalMessage === 'string' ? upgradeConfig.promotionalMessage.trim() : '';
      if (promotionEl) {
        if (promoText) {
          promotionEl.textContent = promoText;
          promotionEl.classList.remove('gl-hidden');
        } else {
          promotionEl.textContent = '';
          promotionEl.classList.add('gl-hidden');
        }
      }

      const plans = Array.isArray(upgradeConfig.plans) ? upgradeConfig.plans.slice(0, 2) : fallbackConfig.plans;
      const cards = upgradeWrapper.querySelectorAll('.subscription-plan-card');
      cards.forEach((card, idx) => {
        const plan = plans[idx];
        if (!plan) {
          card.classList.add('gl-hidden');
          return;
        }

        const nameEl = card.querySelector('.plan-name');
        const priceEl = card.querySelector('.plan-price');
        const billedEl = card.querySelector('.plan-billed');
        const taglineEl = card.querySelector('.plan-tagline');
        const offerEl = card.querySelector('.plan-offer');
        const featuresEl = card.querySelector('.plan-features');
        const ctaBtn = card.querySelector('.upgrade-btn');

        const period = plan.period || 'month';
        const isAnnualInterval = String(plan.interval || '').toLowerCase() === 'annual';
        const currency = plan.currency || 'USD';
        const price = Number.isFinite(Number(plan.price)) ? Number(plan.price) : null;
        const discountPercent = Number(plan.discountPercent || 0);
        const showDiscountedPrice =
          plan.hasDiscount &&
          discountPercent > 0 &&
          discountPercent < 100 &&
          price !== null &&
          price > 0;

        if (nameEl) nameEl.textContent = plan.name || `Plan ${idx + 1}`;
        if (priceEl) {
          priceEl.textContent = '';
          const suffix = `/${period}`;
          const formatAmount = (n) => {
            const rounded = Math.round(n * 100) / 100;
            return Number.isInteger(rounded) ? String(rounded) : String(rounded);
          };
          if (price !== null) {
            if (showDiscountedPrice) {
              const discountedRaw = price * (1 - discountPercent / 100);
              const discounted = Math.round(discountedRaw * 100) / 100;
              const currentSpan = document.createElement('span');
              currentSpan.className = 'plan-price-current';
              currentSpan.textContent = `$${formatAmount(discounted)}${suffix}`;
              const originalSpan = document.createElement('span');
              originalSpan.className = 'plan-price-original';
              originalSpan.textContent = `$${formatAmount(price)}${suffix}`;
              priceEl.appendChild(originalSpan);
              priceEl.appendChild(currentSpan);
            } else {
              priceEl.textContent = `$${formatAmount(price)}${suffix}`;
            }
          } else {
            priceEl.textContent = `${currency}/${period}`;
          }
        }
        if (billedEl) {
          if (isAnnualInterval) {
            billedEl.textContent = 'Billed annually';
            billedEl.classList.remove('gl-hidden');
          } else {
            billedEl.textContent = '';
            billedEl.classList.add('gl-hidden');
          }
        }
        if (taglineEl) taglineEl.textContent = plan.tagline || '';

        if (offerEl) {
          if (plan.hasDiscount && discountPercent > 0) {
            offerEl.classList.remove('gl-hidden');
            offerEl.textContent = `${discountPercent}% off`;
          } else {
            offerEl.classList.add('gl-hidden');
            offerEl.textContent = '';
          }
        }

        if (featuresEl) {
          featuresEl.replaceChildren();
          const features = Array.isArray(plan.features) ? plan.features : [];
          features.forEach((feature) => {
            const li = document.createElement('li');
            li.textContent = String(feature);
            featuresEl.appendChild(li);
          });
        }

        if (ctaBtn) {
          ctaBtn.textContent = plan.ctaText || 'Choose Plan';
          ctaBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            try {
              const { trackUserAction } = await import(chrome.runtime.getURL('utils/analytics-service.js'));
              trackUserAction('upgrade_button_clicked', {
                context: 'subscription_section',
                location: 'integrated_panel',
                source: 'daily_limit',
                planId: plan.id || null,
                interval: plan.interval || null
              }).catch(() => {});
            } catch (error) {
              // Silently fail - analytics should never break CTA
            }

            const destinationUrl = plan.checkoutUrl || 'https://portal.thinkreview.dev/subscription';
            window.open(destinationUrl, '_blank');
          });
        }
      });

      tipBannerModule.wireActionButtons(upgradeWrapper);
    }
  );

  // Prepend so it appears at the top of the content area
  reviewContent.insertBefore(upgradeWrapper, reviewContent.firstChild);
}

/**
 * Shows a PR size limit upgrade message for free-tier users whose PR exceeds the max patch size.
 * Reuses the full upgrade prompt UI but with a hardcoded message specific to PR size limits.
 * The subscription plans section (title, description, plan cards) still comes from remote config.
 * @param {number} patchSize - The actual patch size in bytes
 * @param {number} maxPatchSize - The maximum allowed patch size in bytes for the free tier
 */
function showPatchTooLargeMessage(patchSize, maxPatchSize) {
  const patchSizeKB = Math.round(patchSize / 1024);
  const maxPatchSizeKB = Math.round(maxPatchSize / 1024);
  showUpgradeMessage(0, 0, {
    title: 'PR Too Large for Free Plan',
    body: `Your PR is ${patchSizeKB} KB, which exceeds the ${maxPatchSizeKB} KB limit for free accounts. Upgrade to review larger PRs with more powerful AI models.`
  });
}

/** Dummy Azure DevOps token used when none is set in storage (>25 chars to satisfy length checks). */
const DUMMY_AZURE_DEVOPS_TOKEN = 'thinkreview-azure-no-token-placeholder';

/**
 * Get Azure DevOps token from storage
 * @returns {Promise<string>} Azure DevOps token, or a dummy placeholder if not set
 */
async function getAzureDevOpsToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['azureDevOpsToken'], (result) => {
      if (chrome.runtime.lastError) {
        dbgWarn('Error accessing Azure DevOps token storage:', chrome.runtime.lastError);
        resolve(DUMMY_AZURE_DEVOPS_TOKEN);
        return;
      }
      const token = result.azureDevOpsToken;
      resolve(token && String(token).trim() ? token : DUMMY_AZURE_DEVOPS_TOKEN);
    });
  });
}

/**
 * Fetches code changes and sends them for AI review
 * Supports both GitLab (patch) and Azure DevOps (API) platforms
 */
async function fetchAndDisplayCodeReview(forceRegenerate = false, isAutoTriggered = false) {
  // If already processing a review, ignore this request
  if (isReviewInProgress) {
    return;
  }
  
  // Set flag to indicate review is in progress
  isReviewInProgress = true;
  
  // Show loading indicator on button if panel is minimized
  try {
    const panel = document.getElementById('gitlab-mr-integrated-review');
    const panelIsMinimized = panel && panel.classList.contains('thinkreview-panel-minimized-to-button');
    if (panelIsMinimized) {
      const loadingModule = await import(chrome.runtime.getURL('components/popup-modules/button-loading-indicator.js'));
      loadingModule.showButtonLoadingIndicator();
    }
  } catch (error) {
    // Silently fail if module not available
    dbgLog('Failed to show loading indicator:', error);
  }
  
  try {
    // Check if the user is logged in first
    const loggedIn = await isUserLoggedIn();
    if (!loggedIn) {
      dbgLog('User not logged in, showing login prompt');
      // Hide loading indicator if showing login prompt
      try {
        const loadingModule = await import(chrome.runtime.getURL('components/popup-modules/button-loading-indicator.js'));
        loadingModule.hideButtonLoadingIndicator();
      } catch (error) {
        // Silently fail if module not available
      }
      showLoginPrompt();
      isReviewInProgress = false;
      return;
    }

    // Determine platform and get code changes
    let codeContent = '';
    let reviewId = null;

    if (platformDetector && platformDetector.isOnGitLabMRPage()) {
      // GitLab: fetch patch file
      const patchUrl = getPatchUrl();
      const response = await fetch(patchUrl, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Not a Merge request page or there are no code changes yet in this MR- if you think this is a bug, please report it here: https://thinkreview.dev/bug-report`);
      }
      codeContent = await response.text();
      reviewId = getMergeRequestId();
      
    } else if (platformDetector && platformDetector.isOnGitHubPRPage()) {
      // GitHub: fetch diff file through background script (to avoid CORS)
      const patchUrl = getPatchUrl();
      dbgLog('Fetching GitHub diff through background script:', patchUrl);
      
      const bgResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          type: 'FETCH_GITHUB_DIFF', 
          url: patchUrl 
        }, resolve);
      });
      
      if (!bgResponse || !bgResponse.success) {
        throw new Error(bgResponse?.error || `Not a Pull request page or there are no code changes yet in this PR- if you think this is a bug, please report it here: https://thinkreview.dev/bug-report`);
      }
      
      codeContent = bgResponse.content;
      reviewId = getGitHubPRId();
      
    } else if (platformDetector && platformDetector.isOnAzureDevOpsPRPage()) {
      dbgLog('Starting Azure DevOps code fetch');
      const prInfo = platformDetector.detectPlatform().pageInfo;
      dbgLog('PR info retrieved:', {
        hasPrId: !!prInfo?.prId,
        hasPrUrl: !!prInfo?.prUrl
      });

      const hostname = window.location.hostname || '';
      const isAzureCloud =
        hostname.includes('dev.azure.com') || hostname.includes('visualstudio.com');

      if (isAzureCloud) {
        // Azure DevOps Services: use the logged-in browser session (cookies). Must run in the content script context.
        const apiModule = await import(chrome.runtime.getURL('services/azure-devops-api.js'));
        try {
          const fetcherModule = await import(chrome.runtime.getURL('services/azure-devops-fetcher.js'));
          await fetcherModule.azureDevOpsFetcher.init(prInfo, { useSessionCookies: true });
          const formattedChanges = await fetcherModule.azureDevOpsFetcher.fetchCodeChanges();
          codeContent = fetcherModule.azureDevOpsFetcher.toPatchString(formattedChanges);
          reviewId = prInfo.prId;
          dbgLog('Azure DevOps changes fetched (cloud session):', {
            fileCount: formattedChanges?.files?.length || 0,
            totalLines: formattedChanges?.totalLines || 0
          });
        } catch (error) {
          const AuthErr = apiModule.AzureDevOpsAuthError;
          const isAuth =
            (AuthErr && error instanceof AuthErr) ||
            error?.name === 'AzureDevOpsAuthError';
          if (isAuth) {
            dbgLog('Azure DevOps session authentication/access failed, showing sign-in UI');
            if (azureDevOpsTokenError) {
              const detailMessage =
                error.details?.userMessage || error.details?.rawMessage || error.message;
              azureDevOpsTokenError.showAzureDevOpsTokenError(
                stopEnhancedLoader,
                detailMessage,
                { sessionAuth: true }
              );
            } else {
              throw new Error(error.message);
            }
            return;
          }
          throw error;
        }
      } else {
        // On-premises / custom domain: PAT from extension storage; fetch in background (no session cookies).
        const azureToken = await getAzureDevOpsToken();
        if (!azureToken || azureToken === DUMMY_AZURE_DEVOPS_TOKEN) {
          if (azureDevOpsTokenError) {
            azureDevOpsTokenError.showAzureDevOpsTokenError(stopEnhancedLoader);
          } else {
            throw new Error(
              'Azure DevOps token not configured. Please set your Personal Access Token in the extension popup.'
            );
          }
          return;
        }

        dbgLog('Azure PAT found for on-prem, fetching via background');
        try {
          const azureResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              {
                type: 'FETCH_AZURE_DEVOPS_PATCH',
                prInfo,
                azureToken
              },
              resolve
            );
          });

          if (!azureResponse || !azureResponse.success) {
            if (azureResponse?.isAuthError) {
              dbgLog('Azure DevOps token authentication/access failed, showing token error UI');
              if (azureDevOpsTokenError) {
                const detailMessage = azureResponse.detailMessage || azureResponse.error;
                azureDevOpsTokenError.showAzureDevOpsTokenError(stopEnhancedLoader, detailMessage);
              } else {
                throw new Error(
                  'Azure DevOps token is invalid or expired. Please update your Personal Access Token in the extension popup.'
                );
              }
              return;
            }

            throw new Error(azureResponse?.error || 'Failed to fetch Azure DevOps changes');
          }

          codeContent = azureResponse.content;
          reviewId = prInfo.prId;

          dbgLog('Azure DevOps changes fetched:', {
            fileCount: azureResponse.fileCount || 0,
            totalLines: azureResponse.totalLines || 0
          });
        } catch (error) {
          throw error;
        }
      }
    } else if (platformDetector && platformDetector.isOnBitbucketPRPage()) {
      // Bitbucket: fetch patch via background script to avoid page CSP blocking connect-src
      const patchUrl = getPatchUrl();
      dbgLog('Fetching Bitbucket patch through background script:', patchUrl);
      const bgResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'FETCH_BITBUCKET_PATCH', url: patchUrl }, resolve);
      });
      if (!bgResponse || !bgResponse.success) {
        // 401/403 from Bitbucket API (e.g. GET .../repositories/.../pullrequests/1) or token missing: show token prompt
        const errMsg = (bgResponse?.error || '').toLowerCase();
        const authRequired = bgResponse?.bitbucketAuthRequired === true || errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('unauthorized') || errMsg.includes('forbidden');
        if (authRequired) {
          try {
            const bitbucketTokenErrorModule = await import(chrome.runtime.getURL('components/bitbucket-token-error.js'));
            bitbucketTokenErrorModule.showBitbucketTokenError(stopEnhancedLoader, bgResponse?.serverMessage || null);
          } catch (e) {
            dbgWarn('Failed to show Bitbucket token error UI:', e);
            throw new Error('Generate a Bitbucket API token for ThinkReview (takes about 60 seconds): https://thinkreview.dev/docs/bitbucket-integration');
          }
          return;
        }
        throw new Error(bgResponse?.error || `Not a pull request page or there are no code changes yet in this PR. If you think this is a bug, please report it here: https://thinkreview.dev/bug-report`);
      }
      codeContent = bgResponse.content;
      const prInfo = platformDetector.detectPlatform().pageInfo;
      reviewId = prInfo?.prId || null;
    } else {
      throw new Error('Unsupported platform');
    }

    // Show loading state and start enhanced loader
    // Note: Daily limit checking is now handled server-side in the cloud function
    const reviewLoading = document.getElementById('review-loading');
    const reviewContent = document.getElementById('review-content');
    const reviewError = document.getElementById('review-error');
    const loginPrompt = document.getElementById('review-login-prompt');
    
    if (reviewLoading) reviewLoading.classList.remove('gl-hidden');
    if (reviewContent) reviewContent.classList.add('gl-hidden');
    if (reviewError) reviewError.classList.add('gl-hidden');
    if (loginPrompt) loginPrompt.classList.add('gl-hidden');
    const azureTokenErr = document.getElementById('review-azure-token-error');
    const bitbucketTokenErr = document.getElementById('review-bitbucket-token-error');
    if (azureTokenErr) azureTokenErr.classList.add('gl-hidden');
    if (bitbucketTokenErr) bitbucketTokenErr.classList.add('gl-hidden');
    
    // Start the enhanced loader if available
    if (typeof startEnhancedLoader === 'function') {
      startEnhancedLoader();
    }
    
    // Apply filtering for GitLab, GitHub, and Bitbucket patches (Azure DevOps changes are already filtered)
    let filteredCodeContent = codeContent;
    let filterSummaryText = null;
    
    if (platformDetector && (platformDetector.isOnGitLabMRPage() || platformDetector.isOnGitHubPRPage() || platformDetector.isOnBitbucketPRPage())) {
      // Dynamically import patch filtering utilities for GitLab and GitHub
      const patchFilterModule = await import(chrome.runtime.getURL('utils/patch-filter.js'));
      const { filterPatch, getFilterSummary } = patchFilterModule;
      
      // Filter out media and binary files from the patch
      const filterResult = filterPatch(codeContent);
      filteredCodeContent = filterResult.filteredPatch;
      
      // Generate filter summary text if files were removed
      filterSummaryText = filterResult.removedFileCount > 0 ? getFilterSummary(filterResult) : null;
      
      // Log filtering statistics if any files were removed
      if (filterResult.removedFileCount > 0) {
        dbgLog('Filtered out', filterResult.removedFileCount, 'media/binary files:', filterResult.removedFiles);
      }
    }
    
    // Get the user's language preference from extension storage
    const result = await chrome.storage.local.get(['code-review-language']);
    const language = result['code-review-language'] || 'English';
    
    // Get the full MR/PR URL
    const mrUrl = window.location.href;
    
    // Get platform for sending to background script
    const platform = getCurrentPlatform();

    // For auto-triggered reviews, run the decision maker before calling the cloud function
    if (isAutoTriggered) {
      const { shouldProceedWithAutoReview } = await import(chrome.runtime.getURL('services/autoReviewDecisionMaker.js'));
      const decision = shouldProceedWithAutoReview(filteredCodeContent, { platform, mrId: reviewId });
      if (!decision.proceed) {
        dbgLog('Auto review skipped by autoReviewDecisionMaker:', decision.reason, decision.details);
        return;
      }
    }
    
    // Send the code content for review via background script (avoids CSP fetch issues)
    const bgResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        type: 'REVIEW_PATCH_CODE', 
        patchContent: filteredCodeContent,
        mrId: reviewId, // Include the review ID for tracking
        mrUrl: mrUrl, // Include the full MR/PR URL
        language, // Include the language preference
        platform, // Include platform information
        forceRegenerate // Include force regenerate flag
      }, resolve);
    });

    if (!bgResponse || !bgResponse.success) {
      // Check if it's a free-tier PR size limit exceeded error
      if (bgResponse?.isPatchTooLarge) {
        dbgLog('PR patch too large for free tier');
        showPatchTooLargeMessage(
          bgResponse.patchSize || 0,
          bgResponse.maxPatchSize || MAX_PATCH_SIZE_FALLBACK
        );
        return; // Exit early, don't show error
      }
      // Check if it's a daily limit exceeded error
      if (bgResponse?.isLimitExceeded) {
        dbgLog('Daily review limit exceeded');
        showUpgradeMessage(
          bgResponse.currentCount || bgResponse.dailyLimit, 
          bgResponse.dailyLimit || 15
        );
        return; // Exit early, don't show error
      }
      throw new Error(bgResponse?.error || 'Failed to review patch');
    }

    const data = bgResponse.data;
    // Log only metadata, not the actual review content
    dbgLog('Code review completed successfully:', {
      status: data?.status,
      hasReview: !!data?.review,
      reviewLength: data?.review?.response?.length || 0
    });
    
    if (!data || data.status !== 'success' || !data.review) {
      throw new Error('Invalid response from code review service');
    }
    
    // Check if there was a JSON parsing error from the AI response
    if (data.review.parsingError === true) {
      dbgWarn('JSON parsing error detected in review response');
      const errorMessage = data.review.errorMessage 
        ? `Unable to parse AI response: ${data.review.errorMessage}. Please try regenerating the review.`
        : 'The AI generated a response that could not be parsed. Please try regenerating the review or report this issue at https://thinkreview.dev/bug-report';
      await showIntegratedReviewError(errorMessage);
      return;
    }
    
    // Append filter summary to the review summary if files were filtered
    if (filterSummaryText) {
      data.review.summary = (data.review.summary || '') + '\n\n' + filterSummaryText;
    }
    

    // Display the review results (use filtered patch — same string as reviewPatchCode_1_1 for agent checksums)
    displayIntegratedReview(
      data.review,
      filteredCodeContent,
      data.patchSize,
      data.subscriptionType,
      data.modelUsed,
      data.cached,
      bgResponse.provider,
      data.ollamaMeta,
      {
        enabledReviewAgents: data.enabledReviewAgents,
        mrId: reviewId,
        provider: bgResponse.provider,
        platform
      }
    );
    
    // Handle code suggestions injection for GitLab
    if (Array.isArray(data.review.codeSuggestions) && data.review.codeSuggestions.length > 0) {
      // Check if we're on GitLab
      const platform = getCurrentPlatform();
      if (platform === 'gitlab' || (platformDetector && platformDetector.isOnGitLabMRPage())) {
        dbgLog('[Code Review Extension] Code suggestions detected, will inject into GitLab diff view');
        
        // Wait a bit for the review panel to be fully rendered, then inject suggestions
        // The injection module has its own waiting logic for GitLab's diff view
        setTimeout(async () => {
          try {
            // Check if suggestions were stored by displayIntegratedReview
            if (window.__thinkreview_codeSuggestions) {
              const { suggestions, patchContent: storedPatchContent, injectionEnabled } = window.__thinkreview_codeSuggestions;
              
              // Check if injection is enabled (default to true if not set)
              if (injectionEnabled === false) {
                dbgLog(`[Code Review Extension] GitLab injection is disabled, skipping ${suggestions.length} code suggestions`);
                delete window.__thinkreview_codeSuggestions;
                return;
              }
              
              dbgLog(`[Code Review Extension] Attempting to inject ${suggestions.length} code suggestions`);
              
              // Import and use the injection module
              const injectorModule = await import(chrome.runtime.getURL('utils/gitlab-suggestion-injector.js'));
              const result = await injectorModule.injectCodeSuggestions(suggestions, storedPatchContent || codeContent);
              
              dbgLog(`[Code Review Extension] Code suggestions injection result:`, result);
              
              // Clear the stored suggestions after injection
              delete window.__thinkreview_codeSuggestions;
            }
          } catch (injectionError) {
            dbgWarn('[Code Review Extension] Error injecting code suggestions:', injectionError);
          }
        }, 1000); // Initial delay, injection module will wait for diff view to be ready
      } else {
        dbgLog('[Code Review Extension] Code suggestions found but not on GitLab, skipping injection');
      }
    }
  } catch (error) {
    dbgWarn('Error during code review:', error);
    
    // Parse error message to provide user-friendly messages
    const noCodeChangesMessage = 'There are no code changes yet in this merge request. If you think this is a bug, please report it here: https://thinkreview.dev/bug-report';
    let userFriendlyMessage = error.message || 'Failed to complete code review';
    
    // Check if error is about missing patchContent
    if (error.message?.includes('patchContent')) {
      userFriendlyMessage = noCodeChangesMessage;
    } else if (error.message?.includes('HTTP 400')) {
      // Try to parse JSON error message
      const jsonMatch = error.message.match(/\{.*\}/);
      if (jsonMatch) {
        try {
          const errorData = JSON.parse(jsonMatch[0]);
          if (errorData.message?.includes('patchContent')) {
            userFriendlyMessage = noCodeChangesMessage;
          }
        } catch {
          // Ignore parse errors, use original message
        }
      }
    }
    
    await showIntegratedReviewError(userFriendlyMessage);
  } finally {
    // Hide loading indicator when review completes
    try {
      const loadingModule = await import(chrome.runtime.getURL('components/popup-modules/button-loading-indicator.js'));
      loadingModule.hideButtonLoadingIndicator();
    } catch (error) {
      // Silently fail if module not available
    }
    // Reset flag when done
    isReviewInProgress = false;
  }
}

// Toggle button functionality removed - using only arrow down and AI Review button

// Review count tracking functionality removed

/**
 * Toggles the review panel between minimized-to-button and normal states
 * The AI Review button is used to both maximize and minimize the panel
 * The arrow down button in the panel header can also be used to minimize the panel
 */
async function toggleReviewPanel() {
  dbgLog('toggleReviewPanel called');
  
  // Check if we're on a supported page first (before creating/opening panel)
  // For Azure DevOps and GitHub (SPAs), this ensures we're on a PR page
  if (!isSupportedPage()) {
    dbgLog('Not on a supported page, showing alert');
    alert('Please navigate to a Pull Request page to generate an AI code review.');
    return;
  }
  
  const panel = document.getElementById('gitlab-mr-integrated-review');
  const reviewBtn = document.getElementById('code-review-btn');
  
  dbgLog('Panel exists:', !!panel);
  
  if (!panel) {
    // If panel doesn't exist yet, create it and trigger review (user clicked AI Review button)
    injectIntegratedReviewPanel({ triggerReview: true });
    return;
  }
  
  // Toggle the panel state
  if (panel.classList.contains('thinkreview-panel-minimized-to-button')) {
    // If panel is minimized, maximize it
    panel.classList.remove('thinkreview-panel-minimized', 'thinkreview-panel-hidden', 'thinkreview-panel-minimized-to-button');

    // Apply docked mode if configured
    const expandSettings = await getLayoutSettings();
    if (expandSettings.panelMode === 'docked') {
      panel.classList.add('thinkreview-panel-docked');
      if (expandSettings.sidebarSide === 'left') panel.classList.add('thinkreview-panel-docked-left');
      else panel.classList.remove('thinkreview-panel-docked-left');
    } else if (expandSettings.sidebarSide === 'left') {
      // In overlay mode, apply the sidebar side for positioning alignment
      panel.classList.add('thinkreview-panel-overlay-left');
    } else {
      panel.classList.remove('thinkreview-panel-overlay-left');
    }
    applyDockedBodyMargin(true, expandSettings.panelMode, expandSettings.sidebarSide);
    
    // Hide score popup when panel is expanded
    try {
      const scorePopupModule = await import(chrome.runtime.getURL('components/popup-modules/score-popup.js'));
      scorePopupModule.hideScorePopup();
    } catch (error) {
      // Silently fail if module not available
    }
    
    // Hide notification indicator when panel is expanded
    try {
      const notificationModule = await import(chrome.runtime.getURL('components/popup-modules/button-notification.js'));
      notificationModule.hideButtonNotification();
    } catch (error) {
      // Silently fail if module not available
    }

    // Clear completion effects (shake + first best practice bubble)
    try {
      const effectsModule = await import(chrome.runtime.getURL('components/popup-modules/completion-effects.js'));
      effectsModule.clearTriggerShake();
    } catch (error) {
      // Silently fail if module not available
    }
    try {
      const bubbleModule = await import(chrome.runtime.getURL('components/popup-modules/completion-message-bubble.js'));
      bubbleModule.hideBubble();
    } catch (error) {
      // Silently fail if module not available
    }
    
    // Hide loading indicator when panel is expanded
    try {
      const loadingModule = await import(chrome.runtime.getURL('components/popup-modules/button-loading-indicator.js'));
      loadingModule.hideButtonLoadingIndicator();
    } catch (error) {
      // Silently fail if module not available
    }
    
    // Update the button arrow to down arrow
    const arrowSpan = reviewBtn?.querySelector('span:last-child');
    if (arrowSpan) {
      arrowSpan.textContent = '▼';
    }
    
    // Check if this is the first time expanding and no review has been generated yet
    const reviewContent = document.getElementById('review-content');
    const reviewError = document.getElementById('review-error');
    const hasReview = reviewContent && !reviewContent.classList.contains('gl-hidden');
    const hasError = reviewError && !reviewError.classList.contains('gl-hidden');
    
    // If no review has been generated yet (no content and no error), trigger the review
    if (!hasReview && !hasError && !isReviewInProgress) {
      fetchAndDisplayCodeReview(false, false);
    }
  } else {
    // If panel is already visible, minimize it (even if review is in progress)
    panel.classList.remove('thinkreview-panel-minimized', 'thinkreview-panel-hidden', 'thinkreview-panel-minimized-to-button');
    panel.classList.add('thinkreview-panel-minimized-to-button');

    // Get settings to apply left positioning if needed
    const minimizeSettings = await getLayoutSettings();
    if (minimizeSettings.sidebarSide === 'left') {
      panel.classList.add('thinkreview-panel-overlay-left');
    } else {
      panel.classList.remove('thinkreview-panel-overlay-left');
    }

    // Remove docked mode classes when minimizing
    panel.classList.remove('thinkreview-panel-docked', 'thinkreview-panel-docked-left', 'thinkreview-panel-button-top');
    applyDockedBodyMargin(false, 'overlay', 'right');
    
    // Show score popup when panel is minimized
    try {
      const scorePopupModule = await import(chrome.runtime.getURL('components/popup-modules/score-popup.js'));
      scorePopupModule.showScorePopupIfMinimized();
    } catch (error) {
      // Silently fail if module not available
    }
    
    // Hide notification when panel is manually minimized (user has already seen the review)
    try {
      const notificationModule = await import(chrome.runtime.getURL('components/popup-modules/button-notification.js'));
      notificationModule.hideButtonNotification();
    } catch (error) {
      // Silently fail if module not available
    }
    
    // Show loading indicator if review is in progress when panel is minimized
    try {
      const loadingModule = await import(chrome.runtime.getURL('components/popup-modules/button-loading-indicator.js'));
      if (isReviewInProgress) {
        loadingModule.showButtonLoadingIndicator();
      }
    } catch (error) {
      // Silently fail if module not available
    }
    
    // Update the button arrow to up arrow
    const arrowSpan = reviewBtn?.querySelector('span:last-child');
    if (arrowSpan) {
      arrowSpan.textContent = '▲';
    }
  }
  
  // Save the state to extension storage
  chrome.storage.local.set({
    'gitlab-mr-review-minimized-to-button': String(panel.classList.contains('thinkreview-panel-minimized-to-button'))
  });
}

/**
 * Gets a conversational AI response based on the patch content and conversation history.
 * This function is exposed to the window object to be accessible from integrated-review.js
 * @param {string} patchContent - The content of the patch file.
 * @param {Array} conversationHistory - The history of the conversation.
 * @param {string} [language] - Optional language preference for the response.
 * @returns {Promise<Object>} - A promise that resolves with the AI's response.
 */
window.getAIResponse = (patchContent, conversationHistory, language = 'English') => {
  return new Promise((resolve, reject) => {
    // Get the merge request/pull request ID for tracking
    let mrId = null;
    if (platformDetector) {
      if (platformDetector.isOnGitLabMRPage()) {
        mrId = getMergeRequestId();
      } else if (platformDetector.isOnGitHubPRPage()) {
        mrId = getGitHubPRId();
      } else if (platformDetector.isOnAzureDevOpsPRPage()) {
        const prInfo = platformDetector.detectPlatform().pageInfo;
        mrId = prInfo?.prId || null;
      }
    }
    
    // Get the full MR/PR URL
    const mrUrl = window.location.href;
    
    chrome.runtime.sendMessage(
      {
        type: 'GET_AI_RESPONSE',
        patchContent,
        conversationHistory,
        mrId, // Include the MR ID for conversation tracking
        mrUrl, // Include the MR URL for authentication
        language, // Include the language preference
      },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (response && response.success) {
          const data = response.data;
          const routedProvider = response.provider || 'cloud';
          const merged =
            data && typeof data === 'object' && !Array.isArray(data)
              ? { ...data, provider: data.provider || routedProvider }
              : { response: data, provider: routedProvider };
          resolve(merged);
        } else {
          const error = new Error(response?.error || 'Failed to get AI response.');
          // Pass rate limit error properties if available
          if (response.isRateLimit) {
            error.isRateLimit = response.isRateLimit;
            error.rateLimitMessage = response.rateLimitMessage;
            error.retryAfter = response.retryAfter;
          }
          reject(error);
        }
      }
    );
  });
};

/**
 * Start monitoring URL changes for SPA navigation
 */
function startSPANavigationMonitoring() {
  let lastUrl = window.location.href;
  
  // Simple approach: check if URL changed periodically
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      checkAndTriggerReviewForNewPR();
    }
  }, 1000);
  
  dbgLog('Started SPA navigation monitoring');
}

// Initialize when the page is loaded
async function initializeExtension() {
  // Initialize platform detection first
  await initializePlatformDetection();
  
  // Check if we should show the button (always true for Azure DevOps and GitHub, only on MR pages for GitLab)
  if (shouldShowButton()) {
    const platform = getCurrentPlatform();
    dbgLog('Initializing for platform:', platform);
    
    await injectButtons();

    // If the trigger still didn't land (e.g. extension context warming up right after install/update),
    // watch for DOM changes and inject as soon as the body is mutated instead of guessing a delay.
    if (!areButtonsInjected()) {
      dbgWarn('Trigger not found after injectButtons(), observing DOM for retry...');
      const retryObserver = new MutationObserver(async (_, obs) => {
        if (areButtonsInjected()) {
          obs.disconnect();
          return;
        }
        await injectButtons();
        if (areButtonsInjected()) {
          obs.disconnect();
        }
      });
      retryObserver.observe(document.body, { childList: true, subtree: true });
      // Disconnect after 10 s so we don't keep observing a page that never settles.
      setTimeout(() => retryObserver.disconnect(), 10_000);
    }
    
    // Start SPA navigation monitoring for GitHub, Azure DevOps, and Bitbucket (SPAs)
    // Check by site (domain) rather than platform, because platform is null on non-PR pages
    if (platformDetector && (platformDetector.isGitHubSite() || platformDetector.isAzureDevOpsSite() || platformDetector.isBitbucketSite())) {
      startSPANavigationMonitoring();
    }
    
    // Wait for the page to fully load before injecting the integrated review panel
    setTimeout(() => {
      injectIntegratedReviewPanel();
      // Panel is already created in minimized state to prevent flash
      // Just update the button arrow to up arrow
      const reviewBtn = document.getElementById('code-review-btn');
      if (reviewBtn) {
        const arrowSpan = reviewBtn.querySelector('span:last-child');
        if (arrowSpan) {
          arrowSpan.textContent = '▲';
        }
      }
      
      // Save the minimized state to extension storage
      chrome.storage.local.set({ 'code-review-minimized-to-button': 'true' });
    }, 1000);
  } else {
    dbgLog('Current page does not need the button');
  }
}

// Initialize the extension
initializeExtension();

// ── Live layout change handling ────────────────────────────
// Re-apply trigger and docked mode when settings change (from popup or in-panel widget)
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.reviewLayoutSettings) return;
  const settings = changes.reviewLayoutSettings.newValue || {};
  const merged = {
    triggerMode: 'floating-button',
    buttonPosition: 'bottom-right',
    panelMode: 'overlay',
    sidebarSide: 'right',
    ...settings,
  };
  if (merged.buttonPosition === 'top-right') merged.buttonPosition = 'bottom-right';
  else if (merged.buttonPosition === 'top-left') merged.buttonPosition = 'bottom-left';

  // Re-inject the trigger UI with the new settings
  try {
    const { injectTrigger, removeTrigger } = await import(chrome.runtime.getURL('components/layout-trigger.js'));
    removeTrigger();
    injectTrigger(merged, toggleReviewPanel);
  } catch (e) {
    dbgWarn('Failed to re-inject trigger UI:', e);
  }

  // If panel is currently open (not minimized), re-apply docked mode and overlay side
  const panel = document.getElementById('gitlab-mr-integrated-review');
  if (panel && !panel.classList.contains('thinkreview-panel-minimized-to-button')) {
    panel.classList.remove('thinkreview-panel-docked', 'thinkreview-panel-docked-left');
    if (merged.panelMode === 'docked') {
      panel.classList.add('thinkreview-panel-docked');
      if (merged.sidebarSide === 'left') panel.classList.add('thinkreview-panel-docked-left');
    } else {
      // Overlay mode: position panel on left or right to match layout
      if (merged.sidebarSide === 'left') panel.classList.add('thinkreview-panel-overlay-left');
      else panel.classList.remove('thinkreview-panel-overlay-left');
    }
    applyDockedBodyMargin(!panel.classList.contains('thinkreview-panel-minimized-to-button'), merged.panelMode, merged.sidebarSide);
  } else {
    // Panel is minimized or absent — ensure body margins are cleared
    applyDockedBodyMargin(false, 'overlay', 'right');
  }
});

// Listen for layoutchanged event dispatched by the in-panel widget (layout-settings-widget.js)
document.addEventListener('thinkreview:layoutchanged', async (e) => {
  // The storage.onChanged listener above already handles this via the chrome.storage.set call;
  // nothing extra needed here. Event is kept for future extensibility.
});

// Listen for panelminimized event dispatched by integrated-review.js header click
document.addEventListener('thinkreview:panelminimized', () => {
  applyDockedBodyMargin(false, 'overlay', 'right');
  const panel = document.getElementById('gitlab-mr-integrated-review');
  if (panel) {
    panel.classList.remove('thinkreview-panel-docked', 'thinkreview-panel-docked-left');
  }
});
