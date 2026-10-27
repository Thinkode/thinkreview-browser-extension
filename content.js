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

function trackAnalytics(eventName, params) {
  import(chrome.runtime.getURL('utils/analytics-service.js'))
    .then((m) => m.trackUserAction(eventName, params || {}))
    .catch(() => {});
}

function setAnalyticsContext(partial) {
  import(chrome.runtime.getURL('utils/analytics-service.js'))
    .then((m) => m.setAnalyticsContext(partial || {}))
    .catch(() => {});
}

function countReviewFindings(review) {
  if (!review) return 0;
  const len = (v) => (Array.isArray(v) ? v.length : 0);
  const severity = len(review.criticalIssues) + len(review.highIssues) + len(review.lowIssues);
  if (severity > 0) return severity;
  return len(review.suggestions) + len(review.securityIssues) + len(review.bestPractices);
}

function classifyReviewError(error) {
  const msg = String(error?.message || '');
  if (msg.includes('patchContent') || msg.includes('no code changes')) return 'no_code_changes';
  if (msg.includes('Azure DevOps token')) return 'azure_token';
  if (msg.includes('HTTP')) return 'http_error';
  if (msg.includes('Not a Merge request') || msg.includes('Not a Pull request')) return 'not_pr_page';
  return 'unknown';
}

let lastPrPageDetectedKey = null;

async function trackPrPageOpened() {
  try {
    const platform = getCurrentPlatform() || 'unknown';
    const prId = (typeof getCurrentPRId === 'function' && getCurrentPRId()) || currentPRId || '';
    const key = `${platform}:${prId || (typeof location !== 'undefined' ? location.pathname : '')}`;
    if (key === lastPrPageDetectedKey) return;
    lastPrPageDetectedKey = key;

    const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
    analyticsModule.setAnalyticsContext({ platform });
    analyticsModule.trackUserAction('pr_page_detected', { platform }).catch(() => {});

    const awaiting = await chrome.storage.local.get(['ga_awaiting_first_open']);
    if (awaiting.ga_awaiting_first_open) {
      await chrome.storage.local.set({ ga_awaiting_first_open: false });
      analyticsModule.trackUserAction('first_open', { platform }).catch(() => {});
    }
  } catch {
    // analytics must never block panel injection
  }
}

  // Configuration constants
// Note: Daily review limit is now handled server-side via Firebase Remote Config
// Delay initial log until logger is loaded
setTimeout(() => {
  dbgLog('Content script loaded on:', window.location.href);
}, 100);

// Track if a review request is in progress to prevent duplicates
let isReviewInProgress = false;

// When the user requests a manual review while another run is in flight (e.g. auto-review
// still fetching patch or running the auto decision maker), remember it and run after the
// current invocation finishes so REVIEW_PATCH_CODE / reviewPatchCode_1_1 is not dropped.
let pendingManualReview = null;

// Bumped on PR navigation so in-flight reviews from a previous PR abort cleanly
// and their finally block does not clear isReviewInProgress for a newer run.
let reviewSessionId = 0;

// Delayed auto-start after SPA PR navigation (cleared when navigating again)
let pendingAutoReviewTimeoutId = null;

// Track current PR ID for detecting navigation to new PRs
let currentPRId = null;

// State for the button-injection retry observer — grouped to reduce namespace pollution.
const retryState = {
  observer: null,        // MutationObserver instance
  timeoutId: null,       // 10 s hard-stop timer
  debounceTimerId: null, // debounce timer inside the observer callback
  isInjecting: false,    // prevents concurrent injectButtons() calls in the observer
};

/** Disconnect the retry observer and clear all associated timers in one call. */
function _teardownRetryObserver() {
  clearTimeout(retryState.timeoutId);
  retryState.timeoutId = null;
  clearTimeout(retryState.debounceTimerId);
  retryState.debounceTimerId = null;
  if (retryState.observer) {
    retryState.observer.disconnect();
    retryState.observer = null;
  }
}

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

/**
 * Azure-only extras (API helpers, token UI, on-prem version probe).
 * Kept off the critical path so the ThinkReview button can appear sooner.
 */
async function initializeAzurePlatformExtras() {
  try {
    const apiModule = await import(chrome.runtime.getURL('services/azure-devops-api.js'));

    const hostname = window.location.hostname || '';
    const isAzureCloud = hostname.includes('dev.azure.com') || hostname.includes('visualstudio.com');
    if (
      !isAzureCloud &&
      platformDetector &&
      platformDetector.isAzureDevOpsSite() &&
      typeof apiModule.detectAndCacheServerVersion === 'function'
    ) {
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const collection = pathParts.length > 0 ? pathParts[0] : '';
      const origin = window.location.origin;
      apiModule.detectAndCacheServerVersion(origin, collection)
        .then((result) => {
          if (!result || result.fromCache !== false) return;
          chrome.runtime.sendMessage({
            type: 'LOG_AZURE_DEVOPS_VERSION',
            origin,
            version: result.version,
            collection,
            azureOnPremiseApiVersion: result.azureOnPremiseApiVersion ?? null,
            azureOnPremiseVersion: result.azureOnPremiseVersion ?? null
          }, () => {
            if (chrome.runtime.lastError) dbgWarn('Azure DevOps version cloud log failed (non-critical):', chrome.runtime.lastError);
          });
        })
        .catch((err) => {
          dbgWarn('Azure DevOps server version detection failed (non-critical):', err);
        });
    }

    const tokenErrorModule = await import(chrome.runtime.getURL('components/azure-devops-token-error.js'));
    azureDevOpsTokenError = tokenErrorModule;
  } catch (error) {
    dbgWarn('Error initializing Azure platform extras:', error);
  }
}

// Initialize platform detection (lightweight — enough to decide whether to show the button)
async function initializePlatformDetection() {
  try {
    const platformModule = await import(chrome.runtime.getURL('services/platform-detector.js'));
    platformDetector = platformModule.platformDetector;
    platformDetector.init();

    const storage = await chrome.storage.local.get(['azureDevOpsDomains', 'bitbucketDataCenterDomains']);
    platformDetector.setAzureDevOpsCustomDomains(storage.azureDevOpsDomains || []);
    platformDetector.setBitbucketCustomDomains(storage.bitbucketDataCenterDomains || []);

    // Do not block button injection on Azure API / token-error modules
    initializeAzurePlatformExtras().catch(() => {});

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
 * Check if we should show the ThinkReview trigger button
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

async function injectButtons(preloaded = null) {
  if (areButtonsInjected()) {
    dbgLog('Buttons already injected');
    return;
  }

  dbgLog('Injecting trigger UI');
  try {
    const settingsPromise = preloaded?.settingsPromise || getLayoutSettings();
    let triggerModulePromise = preloaded?.triggerModulePromise;
    if (!triggerModulePromise) {
      triggerModulePromise = import(chrome.runtime.getURL('components/layout-trigger.js'));
    }
    const [settings, triggerModule] = await Promise.all([settingsPromise, triggerModulePromise]);
    if (!triggerModule?.injectTrigger) {
      throw new Error('layout-trigger module unavailable');
    }
    triggerModule.injectTrigger(settings, toggleReviewPanel);
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
  reviewBtn.innerHTML = '<span style="margin-right:5px;">ThinkReview</span><span style="font-size:10px;">▼</span>';
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
 * Check if we've navigated to a new PR and trigger review if needed.
 * Clears panel state only when the URL identifies a different PR than currentPRId
 * (not when navigating to non-PR pages).
 */
async function checkAndTriggerReviewForNewPR() {
  // Only check if we're on a supported page (PR page)
  if (!isSupportedPage()) {
    // Not on a PR page: do not clear the integrated panel or reset currentPRId.
    // Keeping currentPRId lets us detect a switch to a *different* PR after browsing
    // elsewhere (clear + optional auto-run only runs in that branch below).
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
    try {
      const toastModule = await import(chrome.runtime.getURL('components/popup-modules/user-toast.js'));
      toastModule.hideUserToast();
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
    
    // Invalidate any in-flight review from the previous PR and cancel a pending auto-start
    reviewSessionId += 1;
    isReviewInProgress = false;
    pendingManualReview = null;
    if (pendingAutoReviewTimeoutId != null) {
      clearTimeout(pendingAutoReviewTimeoutId);
      pendingAutoReviewTimeoutId = null;
    }

    // Trigger new review only if auto-start is enabled
    const autoStart = await getAutoStartReview();
    if (autoStart && isSupportedPage()) {
      pendingAutoReviewTimeoutId = setTimeout(() => {
        pendingAutoReviewTimeoutId = null;
        fetchAndDisplayCodeReview(false, true);
      }, TIMEOUT_AUTO_REVIEW_DELAY);
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
      // Respect the "Start review automatically" option for all providers (default on when unset)
      resolve(result.autoStartReview !== false);
    });
  });
}

/**
 * Injects the integrated review panel into the GitLab MR page.
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.triggerReview] - If true, trigger the review after creating the panel (e.g. user clicked the ThinkReview button). If false/undefined, trigger only when autoStartReview option is enabled.
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
  trackPrPageOpened();
  // Create the review panel with the patch URL
  const patchUrl = getPatchUrl();
  await createIntegratedReviewPanel(patchUrl);
  
  dbgLog('Integrated review panel created');
  
  // Track current PR ID (before review fetch so SPA state stays consistent)
  currentPRId = getCurrentPRId();

  // If the user explicitly triggered this (button click), expand the panel and start review in parallel
  if (opts.triggerReview === true) {
    const fetchPromise = fetchAndDisplayCodeReview(false, false);
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
      } else {
        createdPanel.classList.remove('thinkreview-panel-overlay-left');
      }
      applyDockedBodyMargin(true, expandSettings.panelMode, expandSettings.sidebarSide);
    }
    try {
      await fetchPromise;
    } catch (e) {
      dbgWarn('Review fetch failed:', e?.message || e);
    }
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
 * @param {{ sessionExpired?: boolean }} [options]
 */
function showLoginPrompt(options = {}) {
  const { sessionExpired = false } = options;
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
  
  // Create login prompt if it doesn't exist (replace legacy Google-only prompt)
  let loginPrompt = document.getElementById('review-login-prompt');
  if (loginPrompt && loginPrompt.dataset.signinFlow !== 'portal-v2') {
    loginPrompt.remove();
    loginPrompt = null;
  }
  if (!loginPrompt) {
    loginPrompt = document.createElement('div');
    loginPrompt.id = 'review-login-prompt';
    loginPrompt.dataset.signinFlow = 'portal-v2';
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
    heading.textContent = sessionExpired
      ? 'Sign in again'
      : 'Sign in to start generating reviews';
    messageContainer.appendChild(heading);

    if (sessionExpired) {
      const sessionNotice = document.createElement('p');
      sessionNotice.id = 'review-session-expired-notice';
      sessionNotice.className = 'thinkreview-session-expired-notice';
      sessionNotice.textContent = 'Your session has expired. Please sign in again to continue.';
      messageContainer.insertBefore(sessionNotice, heading);
    }
    
    const portalSignInUrl = 'https://portal.thinkreview.dev/signin-extension';
    const description = document.createElement('p');
    description.className = 'thinkreview-login-description';
    description.innerHTML =
      `Click the button below or open <a href="${portalSignInUrl}" target="_blank" rel="noopener noreferrer">${portalSignInUrl}</a>.`;
    const signInLink = description.querySelector('a');
    if (signInLink) {
      signInLink.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        chrome.runtime.sendMessage({ type: 'OPEN_SIGNIN_PORTAL' }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            window.open(portalSignInUrl, '_blank', 'noopener,noreferrer');
          }
        });
      });
    }
    messageContainer.appendChild(description);
    
    loginPrompt.appendChild(messageContainer);
    
    // Create sign-in button container
    const signInContainer = document.createElement('div');
    signInContainer.id = 'gitlab-mr-signin-container';
    signInContainer.className = 'thinkreview-signin-container';
    
    const signInButton = document.createElement('button');
    signInButton.type = 'button';
    signInButton.className = 'thinkreview-signin-button';
    signInButton.textContent = 'Signup / Sign in';

    const refreshHint = document.createElement('p');
    refreshHint.className = 'thinkreview-login-description thinkreview-login-refresh-hint';
    refreshHint.textContent = 'After signing in, this panel will update automatically.';
    
    signInButton.addEventListener('click', () => {
      dbgLog('Requesting background to open portal sign-in page');
      trackAnalytics('sign_in_clicked', {
        context: 'login_prompt',
        location: 'integrated_panel',
        session_expired: options.sessionExpired ? 1 : 0
      });
      signInButton.disabled = true;
      const prevLabel = signInButton.textContent;
      signInButton.textContent = 'Opening…';
      refreshHint.textContent = 'Waiting for you to finish signing in… this panel will update automatically.';
      startLoginPromptAuthWatch();
      chrome.runtime.sendMessage({ type: 'OPEN_SIGNIN_PORTAL' }, (response) => {
        if (chrome.runtime.lastError) {
          dbgWarn('Error opening portal sign-in:', chrome.runtime.lastError);
          signInButton.disabled = false;
          signInButton.textContent = prevLabel;
          return;
        }
        if (!response || !response.success) {
          dbgWarn('Portal sign-in open failed:', response && response.error);
          signInButton.disabled = false;
          signInButton.textContent = prevLabel;
          return;
        }
        signInButton.textContent = prevLabel;
        signInButton.disabled = false;
      });
    });
    
    signInContainer.appendChild(signInButton);
    signInContainer.appendChild(refreshHint);

    loginPrompt.appendChild(signInContainer);
    
    // Add the login prompt to the panel
    const cardBody = document.querySelector('#gitlab-mr-integrated-review .thinkreview-card-body');
    if (cardBody) {
      cardBody.appendChild(loginPrompt);
    }
  } else {
    applySessionExpiredToLoginPrompt(loginPrompt, sessionExpired);
  }
  
  // Show the login prompt
  loginPrompt.classList.remove('gl-hidden');
  startLoginPromptAuthWatch();
  trackAnalytics('sign_in_shown', {
    context: 'login_prompt',
    location: 'integrated_panel',
    session_expired: sessionExpired ? 1 : 0
  });
}

function applySessionExpiredToLoginPrompt(loginPrompt, sessionExpired) {
  const heading = loginPrompt.querySelector('.thinkreview-login-heading');
  let notice = loginPrompt.querySelector('#review-session-expired-notice');

  if (sessionExpired) {
    if (!notice && heading) {
      notice = document.createElement('p');
      notice.id = 'review-session-expired-notice';
      notice.className = 'thinkreview-session-expired-notice';
      notice.textContent = 'Your session has expired. Please sign in again to continue.';
      heading.parentNode.insertBefore(notice, heading);
    } else if (notice) {
      notice.classList.remove('gl-hidden');
    }
    if (heading) heading.textContent = 'Sign in again';
  } else {
    if (notice) notice.classList.add('gl-hidden');
    if (heading) heading.textContent = 'Sign in to start generating reviews';
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'AUTH_SESSION_EXPIRED') {
    showLoginPrompt({ sessionExpired: true });
    return;
  }
  if (message?.type === 'WEBAPP_AUTH_SYNCED') {
    dbgLog('Received webapp auth sync in integrated panel');
    handleIntegratedPanelAuthAvailable();
  }
});

let loginAuthWatcherReady = null;

function getLoginAuthWatcher() {
  if (!loginAuthWatcherReady) {
    loginAuthWatcherReady = import(chrome.runtime.getURL('utils/panel-auth-sync.js'))
      .then((mod) => {
        const watcher = mod.createLoginAuthWatcher({
          isUserLoggedIn,
          onAuthAvailable: () => {
            dbgLog('Auth detected in integrated panel; starting review without page refresh');
            return fetchAndDisplayCodeReview(false, false);
          },
        });
        chrome.storage.onChanged.addListener(watcher.onStorageChanged);
        return watcher;
      })
      .catch((error) => {
        dbgWarn('Failed to initialize login auth watcher:', error);
        return null;
      });
  }
  return loginAuthWatcherReady;
}

function startLoginPromptAuthWatch() {
  getLoginAuthWatcher().then((watcher) => {
    if (watcher) watcher.startPoll();
  });
}

function handleIntegratedPanelAuthAvailable() {
  getLoginAuthWatcher().then((watcher) => {
    if (watcher) watcher.handleAuthAvailable();
  });
}

// Start loading the watcher immediately so it is ready when the user signs in.
getLoginAuthWatcher();

let upgradePromptLoader = null;
let thinkReviewLoaderModulePromise = null;

function getThinkReviewLoaderModule() {
  return (thinkReviewLoaderModulePromise ??= import(
    chrome.runtime.getURL('components/loader/loader.js')
  ));
}

function unmountUpgradePromptLoader() {
  if (upgradePromptLoader) {
    upgradePromptLoader.hide();
    upgradePromptLoader = null;
  }
}

window.unmountUpgradePromptLoader = unmountUpgradePromptLoader;

/**
 * Mount the branded loader inside the upgrade wrapper while remote config is fetched.
 * @param {HTMLElement} hostEl
 */
async function mountUpgradePromptLoader(hostEl) {
  if (!hostEl) return;
  try {
    const { ThinkReviewLoader } = await getThinkReviewLoaderModule();
    if (!hostEl.isConnected) return;
    unmountUpgradePromptLoader();
    upgradePromptLoader = new ThinkReviewLoader(hostEl, {
      message: 'Loading upgrade options',
      subMessage: 'Fetching your plans and credit packs…',
      size: 0.48,
      showFacts: true,
      minHeight: 220,
      contained: true,
    });
    upgradePromptLoader.show();
  } catch (error) {
    dbgWarn('Failed to mount upgrade prompt loader:', error);
  }
}

function revealUpgradePrompt(upgradeWrapper, reviewContent, options = {}) {
  unmountUpgradePromptLoader();
  if (upgradeWrapper) upgradeWrapper.classList.remove('is-loading');
  const skipLoader = options?.skipLoader === true;
  if (upgradeWrapper && reviewContent && !upgradeWrapper.isConnected) {
    reviewContent.insertBefore(upgradeWrapper, reviewContent.firstChild);
  }
  if (!skipLoader) {
    dismissIntegratedReviewLoadingUI();
  }
  if (reviewContent) reviewContent.classList.remove('gl-hidden');
}

/**
 * Formats the date a monthly credit pool resets (e.g. "1 Nov").
 * @param {string|null|undefined} resetsAt - ISO timestamp from the quota check
 * @returns {string|null}
 */
function formatLimitResetDate(resetsAt) {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Built-in limit-screen fallbacks when the server has not yet shipped limitScreens. */
const BUILTIN_LIMIT_SCREEN_FALLBACKS = {
  monthly: {
    free: {
      kicker: 'Monthly limit',
      title: 'Monthly Review Limit Reached',
      body: "You've used {reviewCount} of {monthlyLimit} free review credits this month. Your credits reset on {resetDate}. Upgrade for a larger monthly pool, or top up instantly with credit packs.",
      bodyFallback: "You've used all your free review credits this month. Upgrade for a larger pool, or top up with credit packs.",
      plansHeading: 'Upgrade to one of our premium plans',
      plansDescription: 'Get up to 600 monthly review credits, review Giant PRs, choose your AI model, customize review rules, and more',
      planIds: ['lite', 'professional'],
      showCreditPacks: true,
      showRewards: true,
      showTip: true,
      sectionOrder: ['plans', 'packs', 'rewards'],
      packsHeading: 'Or buy review credits without upgrading'
    },
    lite: {
      kicker: 'Monthly limit',
      title: 'Monthly Review Limit Reached',
      body: "You've used {reviewCount} of {monthlyLimit} Lite credits this month. Credits reset on {resetDate}. Go Professional for a larger pool, or top up instantly.",
      bodyFallback: "You've used all your Lite credits this month. Upgrade to Professional or top up with credit packs.",
      plansHeading: 'Upgrade to Professional',
      plansDescription: 'Get more monthly credits, frontier models, GitHub Enterprise / Azure DevOps, and Priority Support',
      planIds: ['professional'],
      showCreditPacks: true,
      showRewards: false,
      showTip: true,
      sectionOrder: ['plans', 'packs'],
      packsHeading: 'Or buy review credits without upgrading'
    },
    professional: {
      kicker: 'Monthly limit',
      title: 'Monthly Review Limit Reached',
      body: "You've used {reviewCount} of {monthlyLimit} Professional credits this month. Credits reset on {resetDate}. Top up instantly — additional credits work with your plan and last 1 year.",
      bodyFallback: "You've used all your Professional credits this month. Top up with credit packs to keep reviewing.",
      plansHeading: '',
      plansDescription: '',
      planIds: [],
      showCreditPacks: true,
      showRewards: false,
      showTip: true,
      sectionOrder: ['packs'],
      packsHeading: 'Buy review credits to keep reviewing'
    },
    teams: {
      kicker: 'Monthly limit',
      title: 'Monthly Review Limit Reached',
      body: "You've used {reviewCount} of {monthlyLimit} Teams credits this month. Credits reset on {resetDate}. Top up instantly — additional credits work with your plan and last 1 year.",
      bodyFallback: "You've used all your Teams credits this month. Top up with credit packs to keep reviewing.",
      plansHeading: '',
      plansDescription: '',
      planIds: [],
      showCreditPacks: true,
      showRewards: false,
      showTip: true,
      sectionOrder: ['packs'],
      packsHeading: 'Buy review credits to keep reviewing'
    }
  },
  burst: {
    free: {
      kicker: 'Daily burst limit',
      title: 'Daily Burst Limit Reached',
      body: "You've used {todayCount} of today's {dailyCap} free review credits. This daily safety limit resets {dailyResetLabel}. Your monthly credits are unaffected. Upgrade for a higher daily capacity, or buy credits to keep reviewing now.",
      bodyFallback: "You've reached today's burst limit. It resets tomorrow, and your monthly credits are unaffected. Upgrade or buy credits to keep reviewing.",
      plansHeading: 'Upgrade for a higher daily capacity',
      plansDescription: 'Lite raises your daily capacity and monthly pool. Professional unlocks frontier models and more.',
      planIds: ['lite', 'professional'],
      showCreditPacks: true,
      showRewards: true,
      showTip: true,
      sectionOrder: ['packs', 'plans', 'rewards'],
      packsHeading: 'Buy review credits to keep reviewing now'
    },
    lite: {
      kicker: 'Daily burst limit',
      title: 'Daily Burst Limit Reached',
      body: "You've used {todayCount} of today's {dailyCap} review credits. Your monthly credits are safe and this daily limit resets {dailyResetLabel}. Buy additional credits to keep reviewing right now.",
      bodyFallback: "You've reached today's burst limit. Your monthly credits are safe. Buy additional credits to keep reviewing, or continue tomorrow.",
      plansHeading: '',
      plansDescription: '',
      planIds: [],
      showCreditPacks: true,
      showRewards: false,
      showTip: true,
      sectionOrder: ['packs'],
      packsHeading: 'Buy review credits to unlock today\'s limit'
    },
    professional: {
      kicker: 'Daily burst limit',
      title: 'Daily Burst Limit Reached',
      body: "You've used {todayCount} of today's {dailyCap} review credits. Your monthly credits are safe and this daily limit resets {dailyResetLabel}. Buy additional credits to keep reviewing right now.",
      bodyFallback: "You've reached today's burst limit. Your monthly credits are safe. Buy additional credits to keep reviewing, or continue tomorrow.",
      plansHeading: '',
      plansDescription: '',
      planIds: [],
      showCreditPacks: true,
      showRewards: false,
      showTip: true,
      sectionOrder: ['packs'],
      packsHeading: 'Buy review credits to unlock today\'s limit'
    },
    teams: {
      kicker: 'Daily burst limit',
      title: 'Daily Burst Limit Reached',
      body: "You've used {todayCount} of today's {dailyCap} review credits. Your monthly credits are safe and this daily limit resets {dailyResetLabel}. Buy additional credits to keep reviewing right now.",
      bodyFallback: "You've reached today's burst limit. Your monthly credits are safe. Buy additional credits to keep reviewing, or continue tomorrow.",
      plansHeading: '',
      plansDescription: '',
      planIds: [],
      showCreditPacks: true,
      showRewards: false,
      showTip: true,
      sectionOrder: ['packs'],
      packsHeading: 'Buy review credits to unlock today\'s limit'
    }
  },
  prSize: {
    free: {
      kicker: 'Upgrade',
      title: 'PR Too Large for Free Plan',
      body: 'Your PR exceeds the free-plan size limit. Upgrade to review larger PRs with more powerful AI models.',
      bodyFallback: 'Your PR is too large for the free plan. Upgrade to review larger PRs.',
      plansHeading: 'Upgrade to review Giant PRs',
      plansDescription: 'Lite and Professional unlock Giant PR analysis, more models, and custom agents',
      planIds: ['lite', 'professional'],
      showCreditPacks: false,
      showRewards: false,
      showTip: false,
      sectionOrder: ['plans'],
      packsHeading: ''
    }
  }
};

function normalizeUpgradePlanKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'lite' || key === 'professional' || key === 'teams' || key === 'free') return key;
  return null;
}

/**
 * Resolve user plan for limit-screen selection.
 * Preference: server userPlan → 429 planType → chrome.storage subscription.
 * @param {string|null} serverUserPlan
 * @param {object|null} limitDetails
 * @param {object} storageData
 * @returns {string|null} null when unknown (legacy fallback behavior)
 */
function resolveUpgradeUserPlan(serverUserPlan, limitDetails, storageData) {
  const fromServer = normalizeUpgradePlanKey(serverUserPlan);
  if (fromServer) return fromServer;
  const fromLimit = normalizeUpgradePlanKey(limitDetails?.planType);
  if (fromLimit) return fromLimit;
  const sub =
    storageData?.userSubscriptionData?.userSubscriptionType ||
    storageData?.userData?.subscriptionType ||
    storageData?.subscriptionType ||
    null;
  return normalizeUpgradePlanKey(sub);
}

function getLimitScreenConfig(limitScreens, limitType, planKey) {
  const typeKey = limitType === 'burst' ? 'burst' : limitType === 'prSize' ? 'prSize' : 'monthly';
  const plan = planKey || 'free';
  const fromServer = limitScreens?.[typeKey];
  if (fromServer && typeof fromServer === 'object') {
    // Server may send either the resolved screen for the user's plan, or a map by plan.
    if (fromServer.title || fromServer.body || Array.isArray(fromServer.planIds)) {
      return fromServer;
    }
    if (fromServer[plan] && typeof fromServer[plan] === 'object') return fromServer[plan];
    if (fromServer.free && typeof fromServer.free === 'object') return fromServer.free;
  }
  const builtin = BUILTIN_LIMIT_SCREEN_FALLBACKS[typeKey];
  if (!builtin) return null;
  return builtin[plan] || builtin.free || null;
}

function interpolateLimitScreenText(template, values) {
  if (typeof template !== 'string' || !template) return '';
  let out = template;
  let missing = false;
  out = out.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = values[key];
    if (value == null || value === '') {
      missing = true;
      return '';
    }
    return String(value);
  });
  return missing ? null : out;
}

function filterPlansByIds(plans, planIds) {
  if (!Array.isArray(planIds)) return Array.isArray(plans) ? plans.slice(0, 2) : [];
  if (planIds.length === 0) return [];
  const wanted = planIds.map((id) => String(id).toLowerCase());
  const list = Array.isArray(plans) ? plans : [];
  return wanted
    .map((id) => list.find((p) => String(p?.id || p?.name || '').toLowerCase() === id))
    .filter(Boolean);
}

/**
 * Shows an upgrade message in the integrated review panel
 * @param {number} reviewCount - The number of reviews used this month
 * @param {number} dailyLimit - The monthly review-credit limit (optional, defaults to 30)
 * @param {Object|null} limitOverride - Optional override for the limit title/body (e.g. for PR size errors).
 *   If provided, { title: string, body: string } will be used instead of the remote config / fallback values.
 * @param {number|null} purchasedReviewCredits - Prepaid credits balance (used after daily limit).
 * @param {{ skipLoader?: boolean, hideCreditPacks?: boolean, limitDetails?: object|null }} [options]
 */
async function showUpgradeMessage(
  reviewCount,
  dailyLimit = 30,
  limitOverride = null,
  purchasedReviewCredits = null,
  options = {}
) {
  const limitDetails = options?.limitDetails || null;
  const isBurstLimit = !limitOverride && limitDetails?.limitType === 'burst';
  const isPrSizeLimit = Boolean(limitOverride) || limitDetails?.limitType === 'prSize';
  const limitTypeKey = isPrSizeLimit ? 'prSize' : isBurstLimit ? 'burst' : 'monthly';
  // Burst no longer hides packs — packs unlock the daily burst cap. PR-size still hides them.
  const hideCreditPacks = options?.hideCreditPacks === true;
  const resetDateLabel = formatLimitResetDate(limitDetails?.resetsAt);
  const dailyResetLabel =
    formatLimitResetDate(limitDetails?.dailyResetsAt) || 'tomorrow';
  const upgradeSurface = isPrSizeLimit ? 'large_pr' : 'limit_banner';
  // Analytics fired after plan/screen resolution below.
  const reviewContent = document.getElementById('review-content');
  const reviewError = document.getElementById('review-error');
  const loginPrompt = document.getElementById('review-login-prompt');

  // Hide error area
  if (reviewError) reviewError.classList.add('gl-hidden');

  // Hide login prompt
  if (loginPrompt) loginPrompt.classList.add('gl-hidden');

  if (!reviewContent) {
    dismissIntegratedReviewLoadingUI();
    return;
  }

  // Hide all existing review UI (tabs, sections, chat input) so only the
  // upgrade message is visible and nothing remains interactive.
  const tabsWrapper = reviewContent.querySelector('.thinkreview-tabs-wrapper');
  const chatInputContainer = document.getElementById('chat-input-container');
  if (tabsWrapper) tabsWrapper.classList.add('gl-hidden');
  if (chatInputContainer) chatInputContainer.classList.add('gl-hidden');

  // Remove a previously injected upgrade wrapper if the function is called again
  unmountUpgradePromptLoader();
  const existingWrapper = document.getElementById('upgrade-message-wrapper');
  if (existingWrapper) existingWrapper.remove();

  // Create a dedicated full-panel upgrade container and show a loader immediately
  // so the dark panel is not empty while getUpgradePromptConfig returns.
  const upgradeWrapper = document.createElement('div');
  upgradeWrapper.id = 'upgrade-message-wrapper';
  upgradeWrapper.className = 'upgrade-prompt-panel is-loading';

  const loadingHost = document.createElement('div');
  loadingHost.id = 'upgrade-prompt-loading';
  loadingHost.setAttribute('role', 'status');
  loadingHost.textContent = 'Loading upgrade options…';
  upgradeWrapper.appendChild(loadingHost);
  if (!reviewContent) {
    dbgWarn('showUpgradeMessage: #review-content not found, aborting loader mount');
    return;
  }
  reviewContent.insertBefore(upgradeWrapper, reviewContent.firstChild);
  reviewContent.classList.remove('gl-hidden');
  dismissIntegratedReviewLoadingUI();
  mountUpgradePromptLoader(loadingHost);

  // Monthly pool exhausted: record it so the settings-menu usage meter shows full now
  // instead of waiting for the next user-data refresh.
  if (limitTypeKey === 'monthly' || limitTypeKey === 'burst') {
    import(chrome.runtime.getURL('components/popup-modules/credits-usage-bar.js'))
      .then((creditsUsageModule) => {
        if (limitTypeKey === 'burst') {
          return creditsUsageModule.markDailyCapExhausted({
            limit: limitDetails?.dailyCap ?? limitDetails?.burstLimit
          });
        }
        return creditsUsageModule.markMonthlyPoolExhausted({
          limit: limitDetails?.monthlyLimit ?? dailyLimit,
          resetsAt: limitDetails?.resetsAt || null
        });
      })
      .catch(() => {});
  }

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
      if (!upgradeWrapper.isConnected) {
        unmountUpgradePromptLoader();
        return;
      }
      if (chrome.runtime.lastError || !response?.success) {
        dbgWarn('Error loading subscription section:', response?.error || chrome.runtime.lastError?.message);
        unmountUpgradePromptLoader();
        upgradeWrapper.classList.remove('is-loading');
        // Keep impression analytics even when the subscription section fails to load.
        const failureVariant = `${limitTypeKey}_${normalizeUpgradePlanKey(limitDetails?.planType) || 'unknown'}`;
        const failurePlan = normalizeUpgradePlanKey(limitDetails?.planType) || 'unknown';
        if (upgradeSurface === 'limit_banner') {
          trackAnalytics('daily_limit_reached', {
            context: 'upgrade_prompt',
            location: 'integrated_panel',
            surface: upgradeSurface,
            limit_type: limitTypeKey,
            plan_type: failurePlan,
            screen_variant: failureVariant,
            sections_shown: '',
            review_count: reviewCount,
            daily_limit: dailyLimit,
            purchased_credits: purchasedReviewCredits
          });
        }
        trackAnalytics('upgrade_impression', {
          context: 'upgrade_prompt',
          location: 'integrated_panel',
          surface: upgradeSurface,
          limit_type: limitTypeKey,
          plan_type: failurePlan,
          screen_variant: failureVariant,
          sections_shown: ''
        });
        const fallbackKicker = limitOverride ? 'Upgrade' : (isBurstLimit ? 'Daily burst limit' : 'Monthly limit');
        const fallbackTitle = limitOverride
          ? String(limitOverride.title)
          : (isBurstLimit ? 'Daily Burst Limit Reached' : 'Monthly Review Limit Reached');
        upgradeWrapper.innerHTML = `
          <div class="upgrade-prompt-header">
            <div class="upgrade-prompt-kicker"></div>
            <h2 class="upgrade-prompt-title"></h2>
            <p class="upgrade-prompt-body">Unable to load upgrade options. Please try again or visit the portal.</p>
            <a href="https://portal.thinkreview.dev/subscription" target="_blank" rel="noopener noreferrer"
               class="upgrade-rewards-prize-btn" style="margin-top:12px;">
              Open subscription portal
            </a>
          </div>
        `;
        // Set via textContent so a title from config/overrides is never parsed as HTML.
        upgradeWrapper.querySelector('.upgrade-prompt-kicker').textContent = fallbackKicker;
        upgradeWrapper.querySelector('.upgrade-prompt-title').textContent = fallbackTitle;
        revealUpgradePrompt(upgradeWrapper, reviewContent, options);
        return;
      }
      const fallbackConfig = {
        prompt: {
          limitTitle: 'Monthly Review Limit Reached',
          limitBody: "You've used {reviewCount} of {dailyLimit} free review credits this month. Your credits reset on {resetDate} — upgrade now for a larger monthly pool.",
          title: 'Upgrade to one of our premium plans',
          description: 'Get up to 600 monthly review credits, review Giant PRs, choose your AI model, customize review rules, and more'
        },
        promotionalMessage: '',
        plans: [
          {
            id: 'lite',
            name: 'Lite',
            interval: 'monthly',
            price: 15,
            period: 'month',
            currency: 'USD',
            ctaText: 'Choose Lite',
            features: ['200 review credits per month', 'About 6.7x more usage than Free', 'Bigger PR analysis', 'Lite flagship models'],
            checkoutUrl: 'https://portal.thinkreview.dev/subscription',
            hasDiscount: false
          },
          {
            id: 'professional',
            name: 'Professional',
            interval: 'monthly',
            price: 30,
            period: 'month',
            currency: 'USD',
            ctaText: 'Choose Professional',
            features: ['600 review credits per month', '20x more usage than Free', 'Premium AI models', 'Priority support'],
            checkoutUrl: 'https://portal.thinkreview.dev/subscription',
            hasDiscount: false,
            isPopular: true
          }
        ],
        limitScreens: null,
        userPlan: null
      };

      let upgradeConfig = fallbackConfig;
      let storageData = {};
      try {
        const cloudModule = await import(chrome.runtime.getURL('services/cloud-service.js'));
        storageData = await new Promise((resolve) => {
          chrome.storage.local.get(
            ['userData', 'user', 'userSubscriptionData', 'subscriptionType'],
            resolve
          );
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
          const hasRemotePlans = Array.isArray(remoteConfig?.plans) && remoteConfig.plans.length > 0;
          const hasRemoteCreditPacks =
            Array.isArray(remoteConfig?.creditPacks) && remoteConfig.creditPacks.length > 0;
          if (remoteConfig && (hasRemotePlans || hasRemoteCreditPacks || remoteConfig.rewardsCta || remoteConfig.limitScreens)) {
            upgradeConfig = {
              ...fallbackConfig,
              ...remoteConfig,
              prompt: {
                ...fallbackConfig.prompt,
                ...(remoteConfig.prompt || {})
              },
              plans: hasRemotePlans ? remoteConfig.plans : fallbackConfig.plans,
              creditPacks: !hasRemoteCreditPacks ? [] : remoteConfig.creditPacks,
              rewardsCta: remoteConfig.rewardsCta || null,
              limitScreens: remoteConfig.limitScreens || null,
              userPlan: remoteConfig.userPlan || null
            };
          }
        }
      } catch (configError) {
        dbgWarn('Error fetching upgrade prompt config, using fallback:', configError);
      }

      const userPlanKey = resolveUpgradeUserPlan(
        upgradeConfig.userPlan,
        limitDetails,
        storageData
      );
      const screenConfig = getLimitScreenConfig(
        upgradeConfig.limitScreens,
        limitTypeKey,
        userPlanKey || 'free'
      );

      const showPacks =
        !hideCreditPacks &&
        (screenConfig ? screenConfig.showCreditPacks !== false : true);
      // Free credits (Rewards) are for free users only; unknown plan keeps legacy behavior.
      const isKnownPaidPlan = userPlanKey !== null && userPlanKey !== 'free';
      const showRewards =
        !isKnownPaidPlan && (screenConfig ? screenConfig.showRewards !== false : true);
      const showTip = screenConfig ? screenConfig.showTip !== false : true;
      const sectionOrder = Array.isArray(screenConfig?.sectionOrder)
        ? screenConfig.sectionOrder
        : isBurstLimit
          ? ['packs', 'plans', 'rewards']
          : ['plans', 'packs', 'rewards'];

      if (!showPacks) {
        upgradeConfig.creditPacks = [];
      }

      // Number(null) is 0, which would render "0 of today's N credits". Absent
      // values stay missing so the prompt falls back to the generic burst copy.
      const monthlyPool = Number(limitDetails?.monthlyLimit ?? dailyLimit);
      const capSource = limitDetails?.dailyCap ?? limitDetails?.burstLimit;
      const burstLimitValue = capSource == null ? NaN : Number(capSource);
      const burstTodayValue = limitDetails?.todayCount == null ? NaN : Number(limitDetails.todayCount);
      const hasBurstNumbers =
        isBurstLimit && Number.isFinite(burstLimitValue) && burstLimitValue > 0 && Number.isFinite(burstTodayValue);

      const placeholderValues = {
        reviewCount: Number.isFinite(Number(reviewCount)) ? String(reviewCount) : '',
        monthlyLimit: Number.isFinite(monthlyPool) ? String(monthlyPool) : '',
        dailyLimit: Number.isFinite(monthlyPool) ? String(monthlyPool) : String(dailyLimit),
        todayCount: Number.isFinite(burstTodayValue) ? String(burstTodayValue) : '',
        dailyCap: Number.isFinite(burstLimitValue) ? String(burstLimitValue) : '',
        resetDate: resetDateLabel || 'the 1st of next month',
        dailyResetLabel,
        creditsBalance:
          typeof purchasedReviewCredits === 'number' && Number.isFinite(purchasedReviewCredits)
            ? String(purchasedReviewCredits)
            : ''
      };

      let safeBody;
      let safeLimitTitle;
      let safeKicker;
      if (limitOverride) {
        safeBody = String(limitOverride.body);
        safeLimitTitle = String(limitOverride.title);
        safeKicker = screenConfig?.kicker || 'Upgrade';
      } else if (screenConfig) {
        safeLimitTitle = screenConfig.title || (isBurstLimit ? 'Daily Burst Limit Reached' : 'Monthly Review Limit Reached');
        safeKicker = screenConfig.kicker || (isBurstLimit ? 'Daily burst limit' : 'Monthly limit');
        const interpolated = interpolateLimitScreenText(screenConfig.body, placeholderValues);
        safeBody =
          interpolated ||
          screenConfig.bodyFallback ||
          (isBurstLimit
            ? "You've reached today's burst limit. It resets tomorrow, and your monthly credits are unaffected."
            : String(upgradeConfig.prompt.limitBody || fallbackConfig.prompt.limitBody)
                .replace('{reviewCount}', placeholderValues.reviewCount)
                .replace('{dailyLimit}', placeholderValues.dailyLimit)
                .replace('{resetDate}', placeholderValues.resetDate));
      } else if (isBurstLimit) {
        safeLimitTitle = 'Daily Burst Limit Reached';
        safeKicker = 'Daily burst limit';
        safeBody = hasBurstNumbers
          ? `You've used ${burstTodayValue} of today's ${burstLimitValue} review credits. This daily safety limit resets tomorrow, and your monthly credits are unaffected.`
          : "You've reached today's burst limit. It resets tomorrow, and your monthly credits are unaffected.";
      } else {
        safeKicker = 'Monthly limit';
        safeBody = String(upgradeConfig.prompt.limitBody || fallbackConfig.prompt.limitBody)
          .replace('{reviewCount}', String(reviewCount))
          .replace('{dailyLimit}', String(Number.isFinite(monthlyPool) ? monthlyPool : dailyLimit))
          .replace('{resetDate}', resetDateLabel || 'the 1st of next month');
        safeLimitTitle = String(upgradeConfig.prompt.limitTitle || fallbackConfig.prompt.limitTitle);
      }

      const planIdsForScreen = Array.isArray(screenConfig?.planIds)
        ? screenConfig.planIds
        : userPlanKey === 'professional' || userPlanKey === 'teams'
          ? []
          : userPlanKey === 'lite'
            ? ['professional']
            : null;
      const allPlans = Array.isArray(upgradeConfig.plans) ? upgradeConfig.plans : fallbackConfig.plans;
      const plans =
        planIdsForScreen === null
          ? allPlans.slice(0, 2)
          : filterPlansByIds(allPlans, planIdsForScreen);
      const showPlansSection = plans.length > 0;

      const sectionsShown = [];
      if (showPlansSection) sectionsShown.push('plans');
      if (showPacks) sectionsShown.push('packs');
      if (showRewards && upgradeConfig.rewardsCta?.enabled) sectionsShown.push('rewards');
      const screenVariant = `${limitTypeKey}_${userPlanKey || 'unknown'}`;

      if (upgradeSurface === 'limit_banner') {
        trackAnalytics('daily_limit_reached', {
          context: 'upgrade_prompt',
          location: 'integrated_panel',
          surface: upgradeSurface,
          limit_type: limitTypeKey,
          plan_type: userPlanKey || 'unknown',
          screen_variant: screenVariant,
          sections_shown: sectionsShown.join(','),
          review_count: reviewCount,
          daily_limit: dailyLimit,
          purchased_credits: purchasedReviewCredits
        });
      }
      trackAnalytics('upgrade_impression', {
        context: 'upgrade_prompt',
        location: 'integrated_panel',
        surface: upgradeSurface,
        limit_type: limitTypeKey,
        plan_type: userPlanKey || 'unknown',
        screen_variant: screenVariant,
        sections_shown: sectionsShown.join(',')
      });

      const html = response.content;
      const prepaidBalance =
        typeof purchasedReviewCredits === 'number' && Number.isFinite(purchasedReviewCredits)
          ? purchasedReviewCredits
          : null;

      // Burst limit: meter shows today's spend against the daily cap; otherwise the monthly pool.
      const meterUsed = isBurstLimit ? burstTodayValue : Number(reviewCount);
      const meterTotal = isBurstLimit ? burstLimitValue : monthlyPool;
      const showUsageMeter =
        !limitOverride &&
        Number.isFinite(meterUsed) &&
        Number.isFinite(meterTotal) &&
        meterTotal > 0;
      const usagePct = showUsageMeter
        ? Math.min(100, Math.round((meterUsed / meterTotal) * 100))
        : 0;
      const meterLabel = isBurstLimit
        ? `${meterUsed} / ${meterTotal} review credits used today`
        : `${meterUsed} / ${meterTotal} review credits used this month${resetDateLabel ? ` · resets ${resetDateLabel}` : ''}`;
      const meterHtml = showUsageMeter
        ? `<div class="upgrade-prompt-meter" aria-hidden="true"><div class="upgrade-prompt-meter-fill" style="width:${usagePct}%"></div></div>
           <div class="upgrade-prompt-meter-label">${meterLabel}</div>`
        : '';

      if (!upgradeWrapper.isConnected) {
        unmountUpgradePromptLoader();
        return;
      }

      unmountUpgradePromptLoader();
      upgradeWrapper.classList.remove('is-loading');
      upgradeWrapper.innerHTML = `
        <div class="upgrade-prompt-header">
          <div class="upgrade-prompt-kicker" id="upgrade-limit-kicker"></div>
          <h2 class="upgrade-prompt-title" id="upgrade-limit-title"></h2>
          <p class="upgrade-prompt-body" id="upgrade-limit-body"></p>
          ${meterHtml}
        </div>
        <div id="upgrade-credits-actions"></div>
        <div id="upgrade-rewards-actions"></div>
        ${html}
        ${showTip ? tipBannerModule.getHTML() : ''}
      `;

      const kickerEl = upgradeWrapper.querySelector('#upgrade-limit-kicker');
      const limitTitleEl = upgradeWrapper.querySelector('#upgrade-limit-title');
      const limitBodyEl = upgradeWrapper.querySelector('#upgrade-limit-body');
      if (kickerEl) kickerEl.textContent = safeKicker;
      if (limitTitleEl) limitTitleEl.textContent = safeLimitTitle;
      if (limitBodyEl) limitBodyEl.textContent = safeBody;

      const creditsActionsEl = upgradeWrapper.querySelector('#upgrade-credits-actions');
      const subscriptionSection = upgradeWrapper.querySelector('#subscription-section');
      const analyticsExtras = {
        plan_type: userPlanKey || 'unknown',
        limit_type: limitTypeKey,
        screen_variant: screenVariant,
        sections_shown: sectionsShown.join(',')
      };

      const rewardsActionsEl = upgradeWrapper.querySelector('#upgrade-rewards-actions');
      const hasRewardsCta = showRewards && Boolean(upgradeConfig.rewardsCta?.enabled);
      // Rewards are visually secondary unless RC puts them first in sectionOrder.
      const rewardsSecondary = sectionOrder.indexOf('rewards') !== 0;
      const upgradeCreditPacks =
        showPacks || hasRewardsCta
          ? await import(chrome.runtime.getURL('components/upgrade-credit-packs.js'))
          : null;

      if (creditsActionsEl) {
        if (!showPacks) {
          creditsActionsEl.replaceChildren();
          creditsActionsEl.classList.add('gl-hidden');
        } else {
          creditsActionsEl.classList.remove('gl-hidden');
          await upgradeCreditPacks.renderUpgradeCreditPacksActions(creditsActionsEl, {
            creditPacks: upgradeConfig.creditPacks,
            prepaidBalance,
            rewardsCta: null,
            packsHeading: screenConfig?.packsHeading || null,
            isBurstLimit,
            analyticsContext: upgradeSurface,
            analyticsExtras
          });
        }
      }

      if (rewardsActionsEl) {
        if (!hasRewardsCta) {
          rewardsActionsEl.replaceChildren();
          rewardsActionsEl.classList.add('gl-hidden');
        } else {
          rewardsActionsEl.classList.remove('gl-hidden');
          await upgradeCreditPacks.renderUpgradeCreditPacksActions(rewardsActionsEl, {
            renderPacks: false,
            rewardsCta: upgradeConfig.rewardsCta,
            rewardsSecondary,
            analyticsContext: upgradeSurface,
            analyticsExtras
          });
        }
      }

      const titleEl = upgradeWrapper.querySelector('#subscription-title');
      const descriptionEl = upgradeWrapper.querySelector('#subscription-description');
      const plansHeading =
        (screenConfig?.plansHeading && String(screenConfig.plansHeading).trim()) ||
        upgradeConfig.prompt.title ||
        fallbackConfig.prompt.title;
      const plansDescription =
        (screenConfig?.plansDescription && String(screenConfig.plansDescription).trim()) ||
        upgradeConfig.prompt.description ||
        fallbackConfig.prompt.description;
      if (titleEl) titleEl.textContent = plansHeading;
      if (descriptionEl) descriptionEl.textContent = plansDescription;

      const promotionEl = upgradeWrapper.querySelector('#subscription-promotion');
      const promoText =
        typeof upgradeConfig.promotionalMessage === 'string' ? upgradeConfig.promotionalMessage.trim() : '';
      if (promotionEl) {
        if (promoText && showPlansSection) {
          promotionEl.textContent = promoText;
          promotionEl.classList.remove('gl-hidden');
        } else {
          promotionEl.textContent = '';
          promotionEl.classList.add('gl-hidden');
        }
      }

      if (subscriptionSection) {
        if (!showPlansSection) {
          subscriptionSection.classList.add('gl-hidden');
        } else {
          subscriptionSection.classList.remove('gl-hidden');
        }
      }

      const plansGrid = upgradeWrapper.querySelector('#subscription-plans');
      if (plansGrid) {
        plansGrid.classList.toggle('subscription-plans--single', plans.length === 1);
      }

      const cards = upgradeWrapper.querySelectorAll('.subscription-plan-card');
      cards.forEach((card, idx) => {
        const plan = plans[idx];
        if (!plan) {
          card.classList.add('gl-hidden');
          return;
        }
        card.classList.remove('gl-hidden');

        const nameEl = card.querySelector('.plan-name');
        const priceEl = card.querySelector('.plan-price');
        const billedEl = card.querySelector('.plan-billed');
        const taglineEl = card.querySelector('.plan-tagline');
        const offerEl = card.querySelector('.plan-offer');
        const featuresEl = card.querySelector('.plan-features');
        const ctaBtn = card.querySelector('.upgrade-btn');
        const popularEl = card.querySelector('.plan-popular-badge');
        const usageEl = card.querySelector('.plan-usage-multiple');

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
        if (popularEl) {
          if (plan.isPopular) {
            popularEl.textContent = 'Most popular';
            popularEl.classList.remove('gl-hidden');
          } else {
            popularEl.textContent = '';
            popularEl.classList.add('gl-hidden');
          }
        }
        if (usageEl) {
          if (plan.usageMultiple && plan.usageMultiple.value > 0) {
            usageEl.textContent = `${plan.usageMultiple.value}x more usage than ${plan.usageMultiple.comparedTo || 'Free'}`;
            usageEl.classList.remove('gl-hidden');
          } else {
            usageEl.textContent = '';
            usageEl.classList.add('gl-hidden');
          }
        }
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
          const savings = typeof plan.savingsLabel === 'string' ? plan.savingsLabel.trim() : '';
          if (isAnnualInterval) {
            billedEl.textContent = savings ? `Billed annually · ${savings}` : 'Billed annually';
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
          let ctaLabel = plan.ctaText || 'Choose Plan';
          if (plan.freeTrial?.available) {
            const days = plan.freeTrial.value > 0 ? plan.freeTrial.value : null;
            ctaLabel =
              days != null
                ? `Start ${days}-day free trial`
                : plan.ctaText || 'Start Free Trial';
          }
          ctaBtn.textContent = ctaLabel;
          ctaBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            try {
              const { trackUserAction } = await import(chrome.runtime.getURL('utils/analytics-service.js'));
              trackUserAction('upgrade_button_clicked', {
                context: 'subscription_section',
                location: 'integrated_panel',
                source: upgradeSurface,
                surface: upgradeSurface,
                planId: plan.id || null,
                interval: plan.interval || null,
                ...analyticsExtras
              }).catch(() => {});
            } catch (error) {
              // Silently fail - analytics should never break CTA
            }

            const destinationUrl = plan.checkoutUrl || 'https://portal.thinkreview.dev/subscription';
            window.open(destinationUrl, '_blank');
          });
        }
      });

      // Reorder packs/plans/rewards per sectionOrder for conversion.
      const tipBanner = upgradeWrapper.querySelector('.helpful-tip-banner');
      const orderedNodes = [];
      const sectionNodes = {
        packs: creditsActionsEl,
        rewards: rewardsActionsEl,
        plans: subscriptionSection
      };
      sectionOrder.forEach((section) => {
        const node = sectionNodes[section];
        if (node && !orderedNodes.includes(node)) orderedNodes.push(node);
      });
      // Any section missing from a (mis)configured sectionOrder keeps a sane default position.
      ['packs', 'plans', 'rewards'].forEach((section) => {
        const node = sectionNodes[section];
        if (node && !orderedNodes.includes(node)) orderedNodes.push(node);
      });
      orderedNodes.forEach((node) => upgradeWrapper.appendChild(node));
      if (tipBanner) upgradeWrapper.appendChild(tipBanner);

      if (showTip) tipBannerModule.wireActionButtons(upgradeWrapper);
      revealUpgradePrompt(upgradeWrapper, reviewContent, options);
    }
  );
}

window.showUpgradeMessage = showUpgradeMessage;

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
  showUpgradeMessage(
    0,
    0,
    {
      title: 'PR Too Large for Free Plan',
      body: `Your PR is ${patchSizeKB} KB, which exceeds the ${maxPatchSizeKB} KB limit for free accounts. Upgrade to review larger PRs with more powerful AI models.`
    },
    null,
    { hideCreditPacks: true, limitDetails: { limitType: 'prSize', planType: 'free' } }
  );
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
      const trimmed = token ? String(token).trim() : '';
      resolve(trimmed || DUMMY_AZURE_DEVOPS_TOKEN);
    });
  });
}

/** Show in-panel loader as soon as review work begins (before patch fetch / filter). */
function showIntegratedReviewLoadingUI() {
  const elementsToHide = [
    'review-content',
    'review-error',
    'review-login-prompt',
    'review-azure-token-error',
    'review-bitbucket-token-error',
  ];

  elementsToHide.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('gl-hidden');
  });

  const reviewLoading = document.getElementById('review-loading');
  if (reviewLoading) reviewLoading.classList.remove('gl-hidden');
  if (typeof startEnhancedLoader === 'function') {
    startEnhancedLoader();
  }
}

function dismissIntegratedReviewLoadingUI() {
  if (typeof stopEnhancedLoader === 'function') {
    stopEnhancedLoader();
  }
  const reviewLoading = document.getElementById('review-loading');
  if (reviewLoading) reviewLoading.classList.add('gl-hidden');
}

/**
 * Fetches code changes and sends them for AI review
 * Supports both GitLab (patch) and Azure DevOps (API) platforms
 */
async function fetchAndDisplayCodeReview(forceRegenerate = false, isAutoTriggered = false) {
  // If already processing a review, ignore duplicate auto runs but queue manual intent
  if (isReviewInProgress) {
    if (!isAutoTriggered) {
      pendingManualReview = { forceRegenerate: !!forceRegenerate };
    }
    return;
  }
  
  // Set flag to indicate review is in progress; capture session for PR-nav invalidation
  isReviewInProgress = true;
  const sessionAtStart = reviewSessionId;
  
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
  
  const reviewStartedAt = Date.now();
  const reviewTrigger = isAutoTriggered ? 'auto' : 'manual';

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
      return;
    }

    showIntegratedReviewLoadingUI();

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
      // Azure DevOps: fetch via background script using stored PAT (cloud and on-prem)
      dbgLog('Starting Azure DevOps code fetch');
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

      const prInfo = platformDetector.detectPlatform().pageInfo;
      dbgLog('PR info retrieved:', {
        hasPrId: !!prInfo?.prId,
        hasPrUrl: !!prInfo?.prUrl
      });

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

    // In-panel loader already shown after login; keep UI through filter + cloud call.

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
    
    if (typeof showLoaderLargePatchHint === 'function') {
      showLoaderLargePatchHint(filteredCodeContent);
    }

    // Get the user's language preference from extension storage
    const result = await chrome.storage.local.get(['code-review-language', 'code-review-format']);
    const language = result['code-review-language'] || 'English';
    const reviewFormat = result['code-review-format'] === 'scoring' ? 'scoring' : 'severity';
    
    // Get the full MR/PR URL
    const mrUrl = window.location.href;
    
    // Get platform for sending to background script
    const platform = getCurrentPlatform();
    setAnalyticsContext({ platform });

    // PR changed while we were fetching — do not call the cloud or update UI for the old PR
    if (sessionAtStart !== reviewSessionId) {
      dbgLog('Review session invalidated after patch fetch (PR changed); aborting');
      try {
        dismissIntegratedReviewLoadingUI();
      } catch (error) {
        dbgLog('Failed to dismiss loading UI after session invalidation:', error);
      }
      return;
    }

    // For auto-triggered reviews, run the decision maker before calling the cloud function
    if (isAutoTriggered) {
      const { shouldProceedWithAutoReview } = await import(chrome.runtime.getURL('services/autoReviewDecisionMaker.js'));
      const decision = shouldProceedWithAutoReview(filteredCodeContent, { platform, mrId: reviewId });
      if (!decision.proceed) {
        dbgLog('Auto review skipped by autoReviewDecisionMaker:', decision.reason, decision.details);
        trackAnalytics('auto_start_review_skipped', {
          context: 'auto_review',
          reason: decision.reason || 'unknown',
          patch_size: decision.details?.patchSize,
          platform
        });
        try {
          dismissIntegratedReviewLoadingUI();
        } catch (error) {
          dbgLog('Failed to dismiss loading UI after auto review skip:', error);
        }
        return;
      }
    }

    trackAnalytics('review_started', {
      context: 'code_review',
      trigger: reviewTrigger,
      review_format: reviewFormat,
      platform,
      patch_size: typeof filteredCodeContent === 'string' ? filteredCodeContent.length : 0,
      force_regenerate: forceRegenerate ? 1 : 0
    });
    if (isAutoTriggered) {
      trackAnalytics('auto_start_review_triggered', {
        context: 'auto_review',
        platform,
        patch_size: typeof filteredCodeContent === 'string' ? filteredCodeContent.length : 0
      });
    }
    
    // Send the code content for review via background script (avoids CSP fetch issues).
    // After ~4 min, also poll cache so Chrome dropping the long message does not lose the review.
    const { requestPatchReviewFromBackground } = await import(
      chrome.runtime.getURL('utils/request-patch-review-background.js')
    );
    const bgResponse = await requestPatchReviewFromBackground({
      patchContent: filteredCodeContent,
      mrId: reviewId,
      mrUrl: mrUrl,
      language,
      platform,
      forceRegenerate,
      reviewFormat
    });

    if (!bgResponse || !bgResponse.success) {
      if (bgResponse?.isAuthExpired) {
        dbgLog('Session expired during code review');
        showLoginPrompt({ sessionExpired: true });
        return;
      }
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
          bgResponse.currentCount || bgResponse.limitDetails?.monthlyLimit || bgResponse.dailyLimit,
          bgResponse.limitDetails?.monthlyLimit || bgResponse.dailyLimit || 30,
          null,
          bgResponse.purchasedReviewCredits,
          { limitDetails: bgResponse.limitDetails || null }
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
      if (sessionAtStart === reviewSessionId) {
        trackAnalytics('review_failed', {
          context: 'code_review',
          trigger: reviewTrigger,
          error_type: 'parse_error',
          duration_ms: Date.now() - reviewStartedAt
        });
      }
      return;
    }
    
    // Append filter summary to the review summary if files were filtered
    if (filterSummaryText) {
      data.review.summary = (data.review.summary || '') + '\n\n' + filterSummaryText;
    }

    // Start ThinkReviewGetAgentReviewsForPatch immediately after reviewPatchCode_1_1 returns (runs in parallel with panel render).
    let agentReviewsResultPromise = null;
    if (bgResponse.provider === 'cloud') {
      const hasApiAgents = Array.isArray(data.enabledReviewAgents) && data.enabledReviewAgents.length > 0;
      const stForAgents = await chrome.storage.local.get(['enabledReviewAgents']);
      const hasStorageAgents = Array.isArray(stForAgents.enabledReviewAgents) && stForAgents.enabledReviewAgents.length > 0;
      if (hasApiAgents || hasStorageAgents) {
        const { startAgentReviewsFetchForPatch } = await import(
          chrome.runtime.getURL('utils/fetch-agent-reviews-background.js')
        );
        agentReviewsResultPromise = startAgentReviewsFetchForPatch(
          filteredCodeContent,
          reviewId != null && reviewId !== '' ? reviewId : null
        );
      }
    }

    // Display the review results (use filtered patch — same string as reviewPatchCode_1_1 for agent checksums).
    // Ensure reviewFormat is on the review object for conditional rendering (API may also set top-level reviewFormat).
    if (!data.review.reviewFormat) {
      data.review.reviewFormat = data.reviewFormat || reviewFormat || 'severity';
    }
    displayIntegratedReview(
      data.review,
      filteredCodeContent,
      data.patchSize,
      data.subscriptionType,
      data.modelUsed,
      data.cached,
      bgResponse.provider,
      data.ollamaMeta,
      data.openrouterMeta,
      {
        enabledReviewAgents: data.enabledReviewAgents,
        mrId: reviewId,
        provider: bgResponse.provider,
        platform,
        agentReviewsResultPromise
      }
    );
    
    const findingsCount = countReviewFindings(data.review);
    const modelKey = data.modelUsed || data.ollamaMeta?.model || data.openrouterMeta?.model || '';
    if (modelKey) setAnalyticsContext({ model_key: modelKey });
    trackAnalytics('review_succeeded', {
      context: 'code_review',
      trigger: reviewTrigger,
      review_format: data.review.reviewFormat || reviewFormat,
      platform,
      cached: data.cached ? 1 : 0,
      provider: bgResponse.provider || 'cloud',
      model_key: modelKey,
      findings_count: findingsCount,
      duration_ms: Date.now() - reviewStartedAt,
      patch_size: data.patchSize || (typeof filteredCodeContent === 'string' ? filteredCodeContent.length : 0)
    });
    if (findingsCount === 0) {
      trackAnalytics('review_empty', {
        context: 'code_review',
        trigger: reviewTrigger,
        review_format: data.review.reviewFormat || reviewFormat,
        platform,
        model_key: modelKey
      });
    }
    
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
    if (sessionAtStart === reviewSessionId) {
      trackAnalytics('review_failed', {
        context: 'code_review',
        trigger: isAutoTriggered ? 'auto' : 'manual',
        error_type: classifyReviewError(error),
        duration_ms: Date.now() - reviewStartedAt
      });
    }
  } finally {
    // A stale/old-session run must not touch shared state (loading UI, isReviewInProgress,
    // pendingManualReview) — a newer session after PR navigation owns all of that now.
    if (sessionAtStart !== reviewSessionId) {
      return;
    }

    // Hide loading indicator when review completes
    try {
      const loadingModule = await import(chrome.runtime.getURL('components/popup-modules/button-loading-indicator.js'));
      loadingModule.hideButtonLoadingIndicator();
    } catch (error) {
      // Silently fail if module not available
    }

    // Reset flag when done
    isReviewInProgress = false;

    const pending = pendingManualReview;
    pendingManualReview = null;
    if (pending) {
      const reviewContent = document.getElementById('review-content');
      const hasReview = reviewContent && !reviewContent.classList.contains('gl-hidden');
      // Avoid a redundant cloud call if the in-flight run already produced a review, unless
      // the user explicitly asked to regenerate.
      if (pending.forceRegenerate || !hasReview) {
        fetchAndDisplayCodeReview(pending.forceRegenerate, false).catch((err) => {
          dbgWarn('Pending manual review failed:', err?.message || err);
        });
      }
    }
  }
}

// Toggle button functionality removed - using only arrow down and ThinkReview button

// Review count tracking functionality removed

/**
 * Toggles the review panel between minimized-to-button and normal states
 * The ThinkReview button is used to both maximize and minimize the panel
 * The arrow down button in the panel header can also be used to minimize the panel
 */
async function toggleReviewPanel() {
  dbgLog('toggleReviewPanel called');
  
  // Check if we're on a supported page first (before creating/opening panel)
  // For Azure DevOps and GitHub (SPAs), this ensures we're on a PR page
  if (!isSupportedPage()) {
    dbgLog('Not on a supported page, showing toast');
    try {
      const toastModule = await import(chrome.runtime.getURL('components/popup-modules/user-toast.js'));
      await toastModule.showUserToast({
        title: 'Open a pull request',
        message: 'Navigate to a PR page to generate an AI code review with ThinkReview.',
      });
    } catch (error) {
      dbgWarn('Failed to show user toast:', error);
    }
    return;
  }
  
  const panel = document.getElementById('gitlab-mr-integrated-review');
  const reviewBtn = document.getElementById('code-review-btn');
  
  dbgLog('Panel exists:', !!panel);
  
  if (!panel) {
    // If panel doesn't exist yet, create it and trigger review (user clicked ThinkReview button)
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

    const reviewContent = document.getElementById('review-content');
    const reviewError = document.getElementById('review-error');
    const hasReview = reviewContent && !reviewContent.classList.contains('gl-hidden');
    const hasError = reviewError && !reviewError.classList.contains('gl-hidden');
    const reviewPromise =
      !hasReview && !hasError ? fetchAndDisplayCodeReview(false, false) : null;

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

    if (reviewPromise) {
      try {
        await reviewPromise;
      } catch (e) {
        dbgWarn('Review fetch failed:', e?.message || e);
      }
    }

    // Feedback prompt only appears after/while the panel is open
    try {
      if (typeof window.maybeShowReviewPrompt === 'function') {
        await window.maybeShowReviewPrompt();
      }
    } catch (error) {
      dbgWarn('Failed to check review prompt after expanding panel:', error);
    }
  } else {
    // If panel is already visible, minimize it (even if review is in progress)
    panel.classList.remove('thinkreview-panel-minimized', 'thinkreview-panel-hidden', 'thinkreview-panel-minimized-to-button');
    panel.classList.add('thinkreview-panel-minimized-to-button');

    // Feedback prompt must not linger while the panel is closed
    try {
      if (window.reviewPrompt && typeof window.reviewPrompt.hideWhilePanelClosed === 'function') {
        window.reviewPrompt.hideWhilePanelClosed();
      }
    } catch (error) {
      dbgWarn('Failed to hide review prompt after minimizing panel:', error);
    }

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
          if (response.isLimitExceeded) {
            error.isLimitExceeded = true;
            error.dailyLimit = response.dailyLimit;
            error.currentCount = response.currentCount;
            error.purchasedReviewCredits = response.purchasedReviewCredits;
            error.limitDetails = response.limitDetails || null;
          }
          if (response.isAuthExpired) {
            error.isAuthExpired = true;
            showLoginPrompt({ sessionExpired: true });
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

      // Tear down any pending retry observer (and its timers) immediately so it
      // doesn't fire on the new page's DOM mutations.
      if (retryState.observer) {
        _teardownRetryObserver();
        dbgLog('Disconnected stale retryObserver on SPA navigation');
      }

      checkAndTriggerReviewForNewPR();
    }
  }, 1000);
  
  dbgLog('Started SPA navigation monitoring');
}

// Initialize when the page is loaded
async function initializeExtension() {
  // Prefetch trigger deps in parallel with platform detection so the button isn't
  // blocked on a second round-trip after shouldShowButton() returns.
  const settingsPromise = getLayoutSettings();
  const triggerModulePromise = import(chrome.runtime.getURL('components/layout-trigger.js')).catch((error) => {
    dbgWarn('Early layout-trigger prefetch failed:', error);
    return null;
  });

  await initializePlatformDetection();

  // Check if we should show the button (always true for Azure DevOps and GitHub, only on MR pages for GitLab)
  if (shouldShowButton()) {
    const platform = getCurrentPlatform();
    dbgLog('Initializing for platform:', platform);

    await injectButtons({ settingsPromise, triggerModulePromise });

    // If the trigger still didn't land (e.g. extension context warming up right after install/update),
    // watch for DOM changes and inject as soon as the body is mutated instead of guessing a delay.
    if (!areButtonsInjected()) {
      dbgWarn('Trigger not found after injectButtons(), observing DOM for retry...');

      retryState.observer = new MutationObserver(() => {
        // Debounce: coalesce rapid bursts of mutations into a single attempt.
        clearTimeout(retryState.debounceTimerId);
        retryState.debounceTimerId = setTimeout(async () => {
          retryState.debounceTimerId = null;

          if (areButtonsInjected()) {
            _teardownRetryObserver();
            return;
          }

          // Concurrency guard: skip if a previous async attempt is still in flight.
          if (retryState.isInjecting) return;
          retryState.isInjecting = true;
          try {
            await injectButtons();
            if (areButtonsInjected()) {
              _teardownRetryObserver();
            }
          } finally {
            // Always reset the flag, even if injectButtons() throws.
            retryState.isInjecting = false;
          }
        }, 150);
      });

      if (document.body) {
        retryState.observer.observe(document.body, { childList: true, subtree: true });
      }

      // Hard-stop: clear everything after 10 s if the page never settles.
      retryState.timeoutId = setTimeout(_teardownRetryObserver, 10_000);
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

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.panelTextSize) return;
  const panel = document.getElementById('gitlab-mr-integrated-review');
  if (!panel) return;
  try {
    const textSizeUrl = chrome.runtime.getURL('components/popup-modules/panel-text-size-widget.js');
    const { applyPanelTextSize } = await import(textSizeUrl);
    applyPanelTextSize(panel, changes.panelTextSize.newValue || 'medium');
  } catch (e) {
    dbgWarn('Failed to apply panel text size from storage:', e);
  }
});
