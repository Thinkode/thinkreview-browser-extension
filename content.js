// content.js
// Detects GitLab MR and Azure DevOps PR pages, fetches code changes, injects UI, and displays integrated code review
// Debug toggle: set to false to disable console logs in production

// Debug toggle: set to false to disable console logs in production
var DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log(...args); }
function dbgWarn(...args) { if (DEBUG) console.warn(...args); }

// Configuration constants
// Note: Daily review limit is now handled server-side via Firebase Remote Config
dbgLog('[Code Review Extension] Content script loaded on:', window.location.href);

// Track if a review request is in progress to prevent duplicates
let isReviewInProgress = false;

// Track current PR ID for detecting navigation to new PRs
let currentPRId = null;

// Import platform detection services
let platformDetector = null;
let azureDevOpsFetcher = null;
let AzureDevOpsAuthError = null;

// Import Azure DevOps token error module
let azureDevOpsTokenError = null;

// Initialize platform detection
async function initializePlatformDetection() {
  try {
    // Dynamically import platform detector
    const platformModule = await import(chrome.runtime.getURL('services/platform-detector.js'));
    platformDetector = platformModule.platformDetector;
    platformDetector.init();
    
    // Dynamically import Azure DevOps fetcher if needed
    const fetcherModule = await import(chrome.runtime.getURL('services/azure-devops-fetcher.js'));
    azureDevOpsFetcher = fetcherModule.azureDevOpsFetcher;
    
    // Dynamically import Azure DevOps API module for error handling
    const apiModule = await import(chrome.runtime.getURL('services/azure-devops-api.js'));
    AzureDevOpsAuthError = apiModule.AzureDevOpsAuthError;
    
    // Dynamically import Azure DevOps token error module
    const tokenErrorModule = await import(chrome.runtime.getURL('components/azure-devops-token-error.js'));
    azureDevOpsTokenError = tokenErrorModule;
    
    dbgLog('[Code Review Extension] Platform detection initialized');
  } catch (error) {
    dbgWarn('[Code Review Extension] Error initializing platform detection:', error);
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
  console.log('[Code Review Extension] Page information:', pageInfo);
}
// The integrated review component functions (createIntegratedReviewPanel, displayIntegratedReview, showIntegratedReviewError)
// are loaded from integrated-review.js which is included in the manifest.json

// Note: CloudService and Subscription components are imported dynamically when needed
// in the initSubscriptionComponent function



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
  let url = window.location.href;
  
  // GitHub uses .diff, GitLab uses .patch
  const extension = platformDetector && platformDetector.isOnGitHubPRPage() ? '.diff' : '.patch';
  
  if (!url.endsWith(extension)) {
    url = url.replace(/[#?].*$/, '') + extension;
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

function injectButtons() {
  if (document.getElementById('code-review-btns')) {
    dbgLog('[Code Review Extension] Buttons already injected');
    return;
  }
  
  dbgLog('[Code Review Extension] Injecting buttons');
  const container = document.createElement('div');
  container.id = 'code-review-btns';
  container.style.position = 'fixed';
  container.style.bottom = '24px';
  container.style.right = '24px';
  container.style.zIndex = '9999';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';

  // AI Review button
  const reviewBtn = document.createElement('button');
  reviewBtn.id = 'code-review-btn';
  reviewBtn.textContent = 'AI Review';
  reviewBtn.style.padding = '8px 12px';
  reviewBtn.style.background = '#6b4fbb';
  reviewBtn.style.color = 'white';
  reviewBtn.style.border = 'none';
  reviewBtn.style.borderRadius = '4px';
  reviewBtn.style.cursor = 'pointer';
  reviewBtn.style.display = 'flex';
  reviewBtn.style.alignItems = 'center';
  reviewBtn.style.justifyContent = 'center';
  reviewBtn.innerHTML = '<span style="margin-right: 5px;">AI Review</span><span style="font-size: 10px;">▼</span>';
  
  // Add click handler with debugging
  reviewBtn.onclick = function(event) {
    dbgLog('[Code Review Extension] AI Review button clicked!');
    event.preventDefault();
    event.stopPropagation();
    toggleReviewPanel();
  };

  container.appendChild(reviewBtn);
  document.body.appendChild(container);
  
  dbgLog('[Code Review Extension] Buttons injected successfully');
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
  
  dbgLog('[GitLab MR Reviews] Page detection:', { 
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
    dbgLog('[Code Review Extension] Detected new PR page:', {
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
    
    // Trigger new review
    setTimeout(() => {
      if (isSupportedPage()) {
        fetchAndDisplayCodeReview();
      }
    }, 500);
  } else if (currentPRId === null && newPRId) {
    // First time detecting a PR - just track it
    currentPRId = newPRId;
  }
}

/**
 * Injects the integrated review panel into the GitLab MR page
 */
async function injectIntegratedReviewPanel() {
  const panel = document.getElementById('gitlab-mr-integrated-review');
  
  // Check if the panel already exists
  if (panel) {
    dbgLog('[Code Review Extension] Integrated review panel already exists');
    // Check if we've navigated to a new PR
    checkAndTriggerReviewForNewPR();
    return;
  }
  
  // Check if we're on a supported page first
  if (!isSupportedPage()) {
    dbgLog('[Code Review Extension] Not on a supported page, skipping panel injection');
    return;
  }
  
  dbgLog('[Code Review Extension] Creating integrated review panel');
  // Create the review panel with the patch URL
  const patchUrl = getPatchUrl();
  await createIntegratedReviewPanel(patchUrl);
  
  dbgLog('[Code Review Extension] Integrated review panel created');
  
  // Track current PR ID
  currentPRId = getCurrentPRId();
  
  // Automatically trigger the code review after panel is created
  // DOM elements are available after appendChild
  fetchAndDisplayCodeReview();
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
        dbgLog('[content] User logged in via:', result.authSource || 'extension');
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
      dbgLog('[Content] Requesting background to open extension page for sign-in');
      
      // Ask background script to open the extension page (content scripts can't do this directly)
      chrome.runtime.sendMessage({ type: 'OPEN_EXTENSION_PAGE' }, (response) => {
        if (chrome.runtime.lastError) {
          dbgWarn('[Content] Error opening extension page:', chrome.runtime.lastError);
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
          
          // Add help text below the button
          const helpText = document.createElement('p');
          helpText.className = 'signin-help-text';
          helpText.innerHTML = '🚀 The Google sign-in popup will open automatically in the new tab';
          signInContainer.appendChild(helpText);
          
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
 * @param {number} dailyLimit - The daily review limit (optional, defaults to 15)
 */
function showUpgradeMessage(reviewCount, dailyLimit = 15) {
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
  
  // Create upgrade message
  const reviewSummary = document.getElementById('review-summary');
  if (reviewSummary) {
    // Load subscription section styles
    if (!document.getElementById('subscription-styles')) {
      const linkEl = document.createElement('link');
      linkEl.id = 'subscription-styles';
      linkEl.rel = 'stylesheet';
      linkEl.href = chrome.runtime.getURL('components/subscription-section.css');
      document.head.appendChild(linkEl);
    }
    
    // Load subscription section HTML
    fetch(chrome.runtime.getURL('components/subscription-section.html'))
      .then(response => response.text())
      .then(html => {
        reviewSummary.innerHTML = `
          <div class="gl-alert gl-alert-warning">
            <div class="gl-alert-content">
              <div class="gl-alert-title">Daily Review Limit Reached</div>
              <div class="gl-mb-3">
                You've used ${reviewCount} reviews today, which exceeds the free plan daily limit of ${dailyLimit} reviews.
              </div>
            </div>
          </div>
          ${html}
        `;
        
        // Add event listeners to the upgrade buttons
        const monthlyBtn = document.getElementById('monthly-upgrade-btn');
        const annualBtn = document.getElementById('annual-upgrade-btn');
        
        // Track if we've already initialized the subscription component in this content script instance
        // This helps prevent multiple initializations when script runs in different contexts
        window._subscriptionInitialized = window._subscriptionInitialized || false;
        
        // Initialize the SubscriptionComponent for content script
        const initSubscriptionComponent = () => {
          // Skip initialization if already done in this context
          if (window._subscriptionInitialized) {
            dbgLog('[Content] Subscription component already initialized in this context, skipping');
            return;
          }
          
          // Wait for CloudService to be available
          if (!window.CloudService) {
            // Import CloudService directly if not available
            import(chrome.runtime.getURL('services/cloud-service.js'))
              .then(module => {
                window.CloudService = module.CloudService;
                setupSubscriptionComponent();
              })
              .catch(error => {
                dbgWarn('[Content] Error importing CloudService:', error);
              });
          } else {
            setupSubscriptionComponent();
          }
          
          // Mark as initialized in this context to prevent duplicate initialization
          window._subscriptionInitialized = true;
        };
        
        // Setup the subscription component with required dependencies
        const setupSubscriptionComponent = () => {
          // Check if we already have an instance from another context
          if (window.subscriptionComponent && window.subscriptionComponent.initialized) {
            dbgLog('[Content] Using existing subscription component instance');
            configureSubscriptionComponent();
            return;
          }
          
          // Import the subscription component if not already available
          if (!window.subscriptionComponent) {
            import(chrome.runtime.getURL('components/subscription.js'))
              .then(module => {
                window.subscriptionComponent = module.default;
                configureSubscriptionComponent();
              })
              .catch(error => {
                dbgWarn('[Content] Error importing subscription component:', error);
              });
          } else {
            configureSubscriptionComponent();
          }
        };
        
        // Configure the subscription component with content-specific handlers
        const configureSubscriptionComponent = () => {
          const subscriptionSection = document.querySelector('.subscription-section');
          const monthlyBtn = document.getElementById('monthly-upgrade-btn');
          const annualBtn = document.getElementById('annual-upgrade-btn');
          
          if (!window.subscriptionComponent || !subscriptionSection || !monthlyBtn || !annualBtn) {
            dbgWarn('[Content] Missing required elements for subscription component');
            return;
          }
          
          // Define content-specific handlers for the subscription component
          window.subscriptionComponent.init({
            isUserLoggedIn: async () => {
              return new Promise((resolve) => {
                chrome.storage.local.get(['user', 'userData'], (result) => {
                  if (result.userData) {
                    resolve(true);
                  } else if (result.user) {
                    try {
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
            },
            showLoadingState: () => {
              // Disable both buttons and show spinner
              if (monthlyBtn) {
                monthlyBtn.disabled = true;
                monthlyBtn.innerHTML = `
                  <span class="gl-spinner gl-spinner-sm gl-mr-2"></span>
                  Processing payment...
                `;
              }
              if (annualBtn) {
                annualBtn.disabled = true;
              }
            },
            showErrorState: (errorMessage) => {
              // Re-enable buttons
              if (monthlyBtn) {
                monthlyBtn.disabled = false;
                monthlyBtn.innerHTML = 'Monthly Plan';
              }
              if (annualBtn) {
                annualBtn.disabled = false;
              }
            },
            showMessage: (message, type) => {
              // Show message in the subscription section
              const messageElement = document.createElement('div');
              messageElement.className = `gl-alert gl-alert-${type === 'error' ? 'danger' : 'info'} gl-mb-3`;
              messageElement.innerHTML = `
                <div class="gl-alert-content">
                  <div class="gl-alert-title">${type === 'error' ? 'Error' : 'Information'}</div>
                  <div>${message}</div>
                </div>
              `;
              subscriptionSection.insertBefore(messageElement, subscriptionSection.firstChild);
              
              // Auto-remove message after 5 seconds
              setTimeout(() => {
                messageElement.remove();
              }, 5000);
            }
          });
          
          // NOTE: Don't call setupSubscriptionButtons here - it's already called in the SubscriptionComponent's init method
        };
        
        // Initialize the subscription component
        initSubscriptionComponent();
      })
      .catch(error => {
        dbgWarn('[Content] Error loading subscription section:', error);
      });
    
    // Event listeners are now handled within the fetch promise
  }
  
  // Clear other sections
  const reviewSuggestions = document.getElementById('review-suggestions');
  const reviewSecurity = document.getElementById('review-security');
  const reviewPractices = document.getElementById('review-practices');
  
  if (reviewSuggestions) reviewSuggestions.innerHTML = '';
  if (reviewSecurity) reviewSecurity.innerHTML = '';
  if (reviewPractices) reviewPractices.innerHTML = '';
}

/**
 * Get Azure DevOps token from storage
 * @returns {Promise<string|null>} Azure DevOps token or null if not set
 */
async function getAzureDevOpsToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['azureDevOpsToken'], (result) => {
      if (chrome.runtime.lastError) {
        dbgWarn('[Code Review Extension] Error accessing Azure DevOps token storage:', chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve(result.azureDevOpsToken || null);
    });
  });
}

/**
 * Fetches code changes and sends them for AI review
 * Supports both GitLab (patch) and Azure DevOps (API) platforms
 */
async function fetchAndDisplayCodeReview(forceRegenerate = false) {
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
    dbgLog('[Code Review Extension] Failed to show loading indicator:', error);
  }
  
  try {
    // Check if the user is logged in first
    const loggedIn = await isUserLoggedIn();
    if (!loggedIn) {
      dbgLog('[Code Review Extension] User not logged in, showing login prompt');
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
      dbgLog('[Code Review Extension] Fetching GitHub diff through background script:', patchUrl);
      
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
      // Azure DevOps: fetch via API
        dbgLog('[Code Review Extension] Starting Azure DevOps code fetch');
        const azureToken = await getAzureDevOpsToken();
        if (!azureToken) {
          if (azureDevOpsTokenError) {
            azureDevOpsTokenError.showAzureDevOpsTokenError(stopEnhancedLoader);
          } else {
            // Fallback if module not loaded
            throw new Error('Azure DevOps token not configured. Please set your Personal Access Token in the extension popup.');
          }
          return;
        }

        dbgLog('[Code Review Extension] Azure token found, getting PR info');
        const prInfo = platformDetector.detectPlatform().pageInfo;
        dbgLog('[Code Review Extension] PR info:', prInfo);
        
        try {
          dbgLog('[Code Review Extension] Initializing Azure DevOps fetcher');
          await azureDevOpsFetcher.init(prInfo, azureToken);
          
          dbgLog('[Code Review Extension] Fetching code changes');
          const changes = await azureDevOpsFetcher.fetchCodeChanges();
          codeContent = azureDevOpsFetcher.toPatchString(changes);
          reviewId = prInfo.prId;
          
          dbgLog('[Code Review Extension] Azure DevOps changes fetched:', {
            fileCount: changes.files.length,
            totalLines: changes.totalLines
          });
        } catch (error) {
          // Check if it's an authentication/access error
          if (AzureDevOpsAuthError && error instanceof AzureDevOpsAuthError) {
            dbgLog('[Code Review Extension] Azure DevOps token authentication/access failed, showing token error UI');
            if (azureDevOpsTokenError) {
              const detailMessage = error.details?.userMessage || error.details?.rawMessage || error.message;
              azureDevOpsTokenError.showAzureDevOpsTokenError(stopEnhancedLoader, detailMessage);
            } else {
              // Fallback if module not loaded
              throw new Error('Azure DevOps token is invalid or expired. Please update your Personal Access Token in the extension popup.');
            }
            return;
          }
          // Re-throw other errors
          throw error;
        }
      
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
    
    // Start the enhanced loader if available
    if (typeof startEnhancedLoader === 'function') {
      startEnhancedLoader();
    }
    
    // Apply filtering for GitLab and GitHub patches (Azure DevOps changes are already filtered)
    let filteredCodeContent = codeContent;
    let filterSummaryText = null;
    
    if (platformDetector && (platformDetector.isOnGitLabMRPage() || platformDetector.isOnGitHubPRPage())) {
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
        dbgLog('[Code Review Extension] Filtered out', filterResult.removedFileCount, 'media/binary files:', filterResult.removedFiles);
      }
    }
    
    // Get the user's language preference from localStorage
    const language = localStorage.getItem('code-review-language') || 'English';
    
    // Get the full MR/PR URL
    const mrUrl = window.location.href;
    
    // Get platform for sending to background script
    const platform = getCurrentPlatform();
    
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
      // Check if it's a daily limit exceeded error
      if (bgResponse?.isLimitExceeded) {
        dbgLog('[Code Review Extension] Daily review limit exceeded');
        showUpgradeMessage(
          bgResponse.currentCount || bgResponse.dailyLimit, 
          bgResponse.dailyLimit || 15
        );
        return; // Exit early, don't show error
      }
      throw new Error(bgResponse?.error || 'Failed to review patch');
    }

    const data = bgResponse.data;
    dbgLog('[Code Review Extension] Code review completed successfully:', data);
    
    if (!data || data.status !== 'success' || !data.review) {
      throw new Error('Invalid response from code review service');
    }
    
    // Check if there was a JSON parsing error from the AI response
    if (data.review.parsingError === true) {
      dbgWarn('[Code Review Extension] JSON parsing error detected in review response');
      const errorMessage = data.review.errorMessage 
        ? `Unable to parse AI response: ${data.review.errorMessage}. Please try regenerating the review.`
        : 'The AI generated a response that could not be parsed. Please try regenerating the review or report this issue at https://thinkreview.dev/bug-report';
      showIntegratedReviewError(errorMessage);
      return;
    }
    
    // Append filter summary to the review summary if files were filtered
    if (filterSummaryText) {
      data.review.summary = (data.review.summary || '') + '\n\n' + filterSummaryText;
    }
    
    // Display the review results with patchSize and subscriptionTier if available
    displayIntegratedReview(data.review, codeContent, data.patchSize, data.subscriptionTier);
  } catch (error) {
    dbgWarn('[Code Review Extension] Error during code review:', error);
    
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
    
    showIntegratedReviewError(userFriendlyMessage);
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
  dbgLog('[Code Review Extension] toggleReviewPanel called');
  
  // Check if we're on a supported page first (before creating/opening panel)
  // For Azure DevOps and GitHub (SPAs), this ensures we're on a PR page
  if (!isSupportedPage()) {
    dbgLog('[Code Review Extension] Not on a supported page, showing alert');
    alert('Please navigate to a Pull Request page to generate an AI code review.');
    return;
  }
  
  const panel = document.getElementById('gitlab-mr-integrated-review');
  const reviewBtn = document.getElementById('code-review-btn');
  
  dbgLog('[Code Review Extension] Panel exists:', !!panel);
  
  if (!panel) {
    // If panel doesn't exist yet, create it (review will be triggered automatically)
    injectIntegratedReviewPanel();
    return;
  }
  
  // Toggle the panel state
  if (panel.classList.contains('thinkreview-panel-minimized-to-button')) {
    // If panel is minimized, maximize it
    panel.classList.remove('thinkreview-panel-minimized', 'thinkreview-panel-hidden', 'thinkreview-panel-minimized-to-button');
    
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
    
    // Hide loading indicator when panel is expanded
    try {
      const loadingModule = await import(chrome.runtime.getURL('components/popup-modules/button-loading-indicator.js'));
      loadingModule.hideButtonLoadingIndicator();
    } catch (error) {
      // Silently fail if module not available
    }
    
    // Update the button arrow to down arrow
    const arrowSpan = reviewBtn.querySelector('span:last-child');
    if (arrowSpan) {
      arrowSpan.textContent = '▼';
    }
    
    // Check if this is the first time expanding and no review has been generated yet
    const reviewContent = document.getElementById('review-content');
    const reviewError = document.getElementById('review-error');
    const hasReview = reviewContent && !reviewContent.classList.contains('gl-hidden');
    const hasError = reviewError && !reviewError.classList.contains('gl-hidden');
    
    // If no review has been generated yet (no content and no error), trigger the review
    if (!hasReview && !hasError) {
      fetchAndDisplayCodeReview();
    }
  } else {
    // If panel is already visible, minimize it
    panel.classList.remove('thinkreview-panel-minimized', 'thinkreview-panel-hidden', 'thinkreview-panel-minimized-to-button');
    panel.classList.add('thinkreview-panel-minimized-to-button');
    
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
    const arrowSpan = reviewBtn.querySelector('span:last-child');
    if (arrowSpan) {
      arrowSpan.textContent = '▲';
    }
  }
  
  // Save the state to localStorage
  localStorage.setItem('gitlab-mr-review-minimized-to-button', panel.classList.contains('thinkreview-panel-minimized-to-button'));
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
          resolve(response.data);
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
  
  dbgLog('[Code Review Extension] Started SPA navigation monitoring');
}

// Initialize when the page is loaded
async function initializeExtension() {
  // Initialize platform detection first
  await initializePlatformDetection();
  
  // Check if we should show the button (always true for Azure DevOps and GitHub, only on MR pages for GitLab)
  if (shouldShowButton()) {
    const platform = getCurrentPlatform();
    dbgLog('[Code Review Extension] Initializing for platform:', platform);
    
    injectButtons();
    
    // Start SPA navigation monitoring for GitHub and Azure DevOps sites
    // Check by site (domain) rather than platform, because platform is null on non-PR pages
    if (platformDetector && (platformDetector.isGitHubSite() || platformDetector.isAzureDevOpsSite())) {
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
      
      // Save the minimized state to localStorage
      localStorage.setItem('code-review-minimized-to-button', 'true');
    }, 1000);
  } else {
    dbgLog('[Code Review Extension] Current page does not need the button');
  }
}

// Initialize the extension
initializeExtension();
