// popup.js
// Shows patch status and recent patches

// Timing constants (in milliseconds)
const TIMEOUT_AUTO_SIGNIN_WAIT = 500;
const TIMEOUT_SETTINGS_SCROLL = 400;
const TIMEOUT_HIGHLIGHT_ANIMATION = 2500;
const TIMEOUT_CLEAR_TOKEN_STATUS = 5000;
const TIMEOUT_TOAST_VISIBILITY = 1500;

// Import modules for better modularity
import { subscriptionStatus } from './components/popup-modules/subscription-status.js';
import { reviewCount } from './components/popup-modules/review-count.js';

import { dbgLog, dbgWarn, dbgError } from './utils/logger.js';
import { clampTemperature, clampTopP, clampTopK } from './utils/ollama-options.js';

// State management
let isInitialized = false;
let cloudServiceReady = false;
let pendingUserDataFetch = false; // Track if we need to fetch user data when CloudService becomes ready

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle review count refresh messages
  if (message.type === 'REVIEW_COUNT_UPDATED') {
    dbgLog('Received review count update:', message.count);
    updateReviewCount(message.count);
  }
  
  // Handle webapp auth sync - refresh popup when webapp login is detected
  if (message.type === 'WEBAPP_AUTH_SYNCED') {
    dbgLog('Received webapp auth sync notification, refreshing popup');
    // Refresh the UI to reflect the new login state
    (async () => {
      await updateUIForLoginStatus();
      // Force refresh user data to get latest info
      await forceRefreshUserData();

      window.location.reload();
    })();
    sendResponse({ success: true });
  }
});

// Function to show loading state
function showLoadingState() {
  const authenticatedContent = document.getElementById('authenticated-content');
  const statusDiv = document.getElementById('current-status');
  
  if (authenticatedContent) {
    authenticatedContent.style.display = 'block';
    authenticatedContent.classList.add('loading');
  }
  
  if (statusDiv) {
    statusDiv.textContent = 'Loading...';
    statusDiv.className = 'loading';
  }
}

// Function to show error state
function showErrorState(message) {
  const authenticatedContent = document.getElementById('authenticated-content');
  const statusDiv = document.getElementById('current-status');
  
  if (authenticatedContent) {
    authenticatedContent.style.display = 'block';
    authenticatedContent.classList.remove('loading');
  }
  
  if (statusDiv) {
    statusDiv.textContent = message || 'An error occurred';
    statusDiv.className = 'error';
  }
}

// Function to show success state
function showSuccessState(message) {
  const authenticatedContent = document.getElementById('authenticated-content');
  const statusDiv = document.getElementById('current-status');
  
  if (authenticatedContent) {
    authenticatedContent.style.display = 'block';
    authenticatedContent.classList.remove('loading');
  }
  
  if (statusDiv) {
    statusDiv.textContent = message || 'Success';
    statusDiv.className = 'success';
  }
}

// Function to clear status state
function clearStatusState() {
  const statusDiv = document.getElementById('current-status');
  if (statusDiv) {
    statusDiv.className = '';
  }
}

// Function to update review count display
function updateReviewCount(count) {
  reviewCount.updateCount(count);
}

// Function to force refresh user data (can be called when popup opens)
async function forceRefreshUserData() {
  try {
    const isLoggedIn = await isUserLoggedIn();
    if (isLoggedIn && window.CloudService) {
      dbgLog('Force refreshing user data');
      cloudServiceReady = true;
      await fetchAndDisplayUserData();
      showSuccessState('Ready to generate AI reviews - Navigate to a PR/MR page to start generating reviews');
      return true;
    }
    return false;
  } catch (error) {
    dbgWarn('Error in force refresh:', error);
    return false;
  }
}

// Function to update subscription status display
// Uses consolidated fields: subscriptionType (Professional, Teams, or Free) and currentPlanValidTo
async function updateSubscriptionStatus(subscriptionType, currentPlanValidTo, cancellationRequested, stripeCanceledDate, initialTrialEndDate = null) {
  await subscriptionStatus.updateStatus(subscriptionType, currentPlanValidTo, cancellationRequested, stripeCanceledDate, initialTrialEndDate);
  
  // Always show Manage Subscription button so users can upgrade or manage regardless of plan
  const cancelContainer = document.getElementById('cancel-subscription-container');
  if (cancelContainer) {
    cancelContainer.style.display = 'block';
  }
}

// Function to check if user is logged in with better error handling
function isUserLoggedIn() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user', 'userData'], (result) => {
      if (chrome.runtime.lastError) {
        dbgWarn('Error accessing storage:', chrome.runtime.lastError);
        resolve(false);
        return;
      }
      
      // Debug: Log the user data to see what fields are available
      dbgLog('User data from storage:', result);
      
      // Check both user and userData fields for backward compatibility
      // Supports both extension OAuth and webapp Firebase auth
      if (result.userData && result.userData.email) {
        dbgLog('Using userData object, auth source:', result.authSource || 'extension');
        resolve(true);
      } else if (result.user) {
        try {
          // Try to parse the user data to ensure it's valid
          const userData = JSON.parse(result.user);
          dbgLog('Using parsed user object:', userData);
          resolve(!!userData && !!userData.email);
        } catch (e) {
          dbgWarn('Failed to parse user data:', e);
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });
  });
}

// Function to fetch and display review count with retry logic
async function fetchAndDisplayUserData(retryCount = 0) {
  const maxRetries = 3;
  
  try {
    // Check if CloudService is available
    if (!window.CloudService) {
      if (retryCount < maxRetries) {
        // Use exponential backoff for retries (1s, 2s, 4s)
        const backoffTime = Math.pow(2, retryCount) * 500;
        dbgLog(`CloudService not available, retrying in ${backoffTime/1000}s (attempt ${retryCount + 1}/${maxRetries})`);
        setTimeout(() => fetchAndDisplayUserData(retryCount + 1), backoffTime);
        return;
      } else {
        dbgWarn('CloudService not available after retries');
              showErrorState('Unable to load user data');
      updateReviewCount('error');
      await updateSubscriptionStatus('Free', null, false, null);
        return;
      }
    }
    
    // Double-check that CloudService is actually ready
    if (!cloudServiceReady) {
      cloudServiceReady = true; // Mark as ready since we have the service
      dbgLog('CloudService detected as ready during fetch');
    }
    const userData = await window.CloudService.getUserDataWithSubscription();
    updateReviewCount(userData.reviewCount);
    // Use consolidated fields: subscriptionType and cancellationRequested
    const subscriptionType = userData.subscriptionType || userData.stripeSubscriptionType || 'Free';
    const cancellationRequested = userData.cancellationRequested || false;
    const initialTrialEndDate = userData.initialTrialEndDate || null;
    await updateSubscriptionStatus(subscriptionType, userData.currentPlanValidTo, cancellationRequested, userData.stripeCanceledDate, initialTrialEndDate);
    dbgLog('User data updated:', userData);
    
    // Show success state if we got valid data
    if (userData.reviewCount !== null && userData.reviewCount !== undefined) {
      // showSuccessState('User data loaded successfully');
    }
  } catch (error) {
    dbgWarn('Error fetching user data:', error);
    if (retryCount < maxRetries) {
      // Use exponential backoff for retries (1s, 2s, 4s)
      const backoffTime = Math.pow(2, retryCount) * 500;
      dbgLog(`Retrying user data fetch in ${backoffTime/1000}s (attempt ${retryCount + 1}/${maxRetries})`);
      setTimeout(() => fetchAndDisplayUserData(retryCount + 1), backoffTime);
    } else {
      showErrorState('Failed to load user data');
      updateReviewCount('error');
      await updateSubscriptionStatus('Free', null, false, null);
    }
  }
}

// Function to update UI based on login status with better state management
async function updateUIForLoginStatus() {
  try {
    showLoadingState();
    
    const isLoggedIn = await isUserLoggedIn();
    const authenticatedContent = document.getElementById('authenticated-content');
    const welcomeContent = document.getElementById('welcome-content');
    const loginPrompt = document.getElementById('login-prompt');
    const privacyPolicyText = document.getElementById('privacy-policy-text');
    
    dbgLog('updateUIForLoginStatus - isLoggedIn:', isLoggedIn, 'cloudServiceReady:', cloudServiceReady, 'CloudService available:', !!window.CloudService);
    
    if (isLoggedIn) {
      // User is logged in - show authenticated content, hide welcome, login prompt and privacy policy
      if (authenticatedContent) {
        authenticatedContent.style.display = 'block';
        authenticatedContent.classList.remove('loading');
      }
      if (welcomeContent) {
        welcomeContent.style.display = 'none';
      }
      if (loginPrompt) {
        loginPrompt.style.display = 'none';
      }
      if (privacyPolicyText) {
        privacyPolicyText.style.display = 'none';
      }
      // Show portal buttons row when logged in
      const portalButtonsRow = document.getElementById('portal-buttons-row');
      if (portalButtonsRow) {
        portalButtonsRow.style.display = 'flex';
      }
      
      // Fetch review count if CloudService is ready
      if (cloudServiceReady && window.CloudService) {
        dbgLog('CloudService ready, fetching review count immediately');
        await fetchAndDisplayUserData();
        showSuccessState('Ready to generate AI reviews - Navigate to a PR/MR page to start generating reviews');
        pendingUserDataFetch = false; // Clear pending flag
      } else {
        // Mark that we need to fetch review count when CloudService becomes ready
        pendingUserDataFetch = true;
        dbgLog('CloudService not ready yet, marking review count fetch as pending. cloudServiceReady:', cloudServiceReady, 'CloudService available:', !!window.CloudService);
        showLoadingState();
      }
    } else {
      // User is not logged in - show welcome content, login prompt and privacy policy, hide authenticated content
      if (authenticatedContent) {
        authenticatedContent.style.display = 'none';
        authenticatedContent.classList.remove('loading');
      }
      if (welcomeContent) {
        welcomeContent.style.display = 'block';
      }
      if (loginPrompt) {
        loginPrompt.style.display = 'block';
      }
      if (privacyPolicyText) {
        privacyPolicyText.style.display = 'flex';
      }
      // Hide portal buttons row when not logged in
      const portalButtonsRow = document.getElementById('portal-buttons-row');
      if (portalButtonsRow) {
        portalButtonsRow.style.display = 'none';
      }
      clearStatusState();
      pendingUserDataFetch = false; // Clear pending fetch
    }
  } catch (error) {
    dbgWarn('Error updating UI for login status:', error);
    showErrorState('Failed to check login status');
  }
}

// Function to update current status - shows generic ready message
// Actual page detection is handled by the content script
function updateCurrentStatus() {
  const statusDiv = document.getElementById('current-status');
  if (!statusDiv) return;
  
  // Just show a generic ready message - content script handles actual detection
  statusDiv.textContent = 'Ready to generate reviews';
  statusDiv.className = 'success';
}

// Initialize popup
async function initializePopup() {
  if (isInitialized) return;
  
  try {
    dbgLog('Initializing popup...');
    
    // Update UI based on login status
    await updateUIForLoginStatus();
    
    // Update current status
    updateCurrentStatus();
    
    // Check if CloudService is already ready and we have a pending fetch
    if (cloudServiceReady && window.CloudService && pendingUserDataFetch) {
      dbgLog('CloudService already ready during initialization, processing pending fetch');
      pendingUserDataFetch = false;
      await fetchAndDisplayUserData();
      showSuccessState('Ready to generate AI reviews - Navigate to a PR/MR page to start generating reviews');
    }
    
    isInitialized = true;
    dbgLog('Popup initialized successfully');
  } catch (error) {
    dbgWarn('Error initializing popup:', error);
    showErrorState('Failed to initialize popup');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Check if CloudService is already available before initialization
  if (window.CloudService) {
    cloudServiceReady = true;
    dbgLog('CloudService already available on popup load');
  }
  
  // Initialize popup
  await initializePopup();
  
  // Trigger immediate CloudService data fetch when popup opens
  await forceRefreshUserData();
  
  // Also trigger after a small delay as backup
  setTimeout(async () => {
    await forceRefreshUserData();
  }, 200); // Small delay to ensure everything is loaded
  
  // Set up domain settings
  initializeDomainSettings();
  
  // Set up auto-start review option
  initializeAutoStartReviewSettings();

  // Set up Azure DevOps settings
  initializeAzureSettings();
  
  // Check if we should auto-trigger sign-in (from content script)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('autoSignIn') === 'true') {
    dbgLog('Auto sign-in requested, triggering Google Sign-In');
    
    // Wait a bit for the google-signin component to be ready
    setTimeout(() => {
      const googleSignInElement = document.querySelector('google-signin');
      if (googleSignInElement) {
        // Check if user is already signed in
        const isLoggedIn = isUserLoggedIn();
        isLoggedIn.then(loggedIn => {
          if (!loggedIn) {
            dbgLog('User not logged in, triggering sign-in button click');
            // Find the sign-in button inside the shadow DOM and click it
            const signInButton = googleSignInElement.shadowRoot?.querySelector('#signin');
            if (signInButton) {
              signInButton.click();
              dbgLog('Sign-in button clicked automatically');
            } else {
              dbgWarn('Could not find sign-in button in shadow DOM');
            }
          } else {
            dbgLog('User already logged in, skipping auto sign-in');
          }
        });
      } else {
        dbgWarn('Could not find google-signin element for auto sign-in');
      }
    }, TIMEOUT_AUTO_SIGNIN_WAIT); // Wait for component to be fully loaded
  }

  // Check if we should scroll to a specific settings section
  const scrollToParam = urlParams.get('scrollTo');
  if (scrollToParam) {
    dbgLog('scrollTo param detected:', scrollToParam);
    // Wait for auth + provider settings to finish loading before scrolling
    setTimeout(() => {
      const target = document.getElementById(scrollToParam);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('settings-scroll-highlight');
        setTimeout(() => target.classList.remove('settings-scroll-highlight'), TIMEOUT_HIGHLIGHT_ANIMATION);
      } else {
        dbgWarn('scrollTo target not found:', scrollToParam);
      }
    }, TIMEOUT_SETTINGS_SCROLL);
  }
  
  // Subscription component will be initialized when it's loaded
  
  
  // Listen for popup visibility changes (when popup is reopened)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && isInitialized) {
      dbgLog('Popup became visible, checking if review count needs refresh');
      
      // Force check CloudService availability
      if (window.CloudService && !cloudServiceReady) {
        cloudServiceReady = true;
        dbgLog('CloudService detected on visibility change');
      }
      
      // Add a small delay to ensure everything is loaded
      setTimeout(async () => {
        const isLoggedIn = await isUserLoggedIn();
        
        // Double check CloudService again after the delay
        if (window.CloudService && !cloudServiceReady) {
          cloudServiceReady = true;
          dbgLog('CloudService detected after delay on visibility change');
        }
        
        if (isLoggedIn) {
          // Force refresh user data when popup is reopened
          dbgLog('Popup reopened - force refreshing user data');
          await forceRefreshUserData();
        }
      }, 100);
    }
  });
  
  // Listen for sign-in state changes with improved event handling
  // Note: After successful sign-in, the page will reload, so this mainly handles sign-out
  document.addEventListener('signInStateChanged', async (event) => {
    dbgLog('Sign-in state changed:', event.detail);
    
    // Handle both camelCase and snake_case event details
    const isSignedIn = event.detail.signed_in || event.detail.signedIn;
    
    if (isSignedIn) {
      // User signed in - page will reload automatically after sign-in
      // This code path is for any edge cases where reload doesn't happen
      dbgLog('User signed in, refreshing UI');
      await updateUIForLoginStatus();
      
      // Show portal buttons row when signed in
      const portalButtonsRow = document.getElementById('portal-buttons-row');
      if (portalButtonsRow) {
        portalButtonsRow.style.display = 'flex';
      }
      
      // If CloudService is already ready, fetch review count immediately
      if (cloudServiceReady && window.CloudService) {
        dbgLog('CloudService ready, fetching review count immediately after sign-in');
        await fetchAndDisplayUserData();
        showSuccessState('Ready to generate AI reviews - Navigate to a PR/MR page to start generating reviews');
        pendingUserDataFetch = false;
      } else {
        // Mark that we need to fetch review count when CloudService becomes ready
        pendingUserDataFetch = true;
        dbgLog('CloudService not ready, marking review count fetch as pending after sign-in');
      }
    } else {
      // User signed out - hide authenticated content, show welcome content, login prompt and privacy policy
      const authenticatedContent = document.getElementById('authenticated-content');
      const welcomeContent = document.getElementById('welcome-content');
      const loginPrompt = document.getElementById('login-prompt');
      const privacyPolicyText = document.getElementById('privacy-policy-text');
      if (authenticatedContent) {
        authenticatedContent.style.display = 'none';
        authenticatedContent.classList.remove('loading');
      }
      if (welcomeContent) {
        welcomeContent.style.display = 'block';
      }
      if (loginPrompt) {
        loginPrompt.style.display = 'block';
      }
      if (privacyPolicyText) {
        privacyPolicyText.style.display = 'flex';
      }
      // Hide portal buttons row when signed out
      const portalButtonsRow = document.getElementById('portal-buttons-row');
      if (portalButtonsRow) {
        portalButtonsRow.style.display = 'none';
      }
      clearStatusState();
      pendingUserDataFetch = false; // Clear pending fetch
    }
  });
  
  // Listen for sign-in errors
  document.addEventListener('signin-error', (event) => {
    dbgWarn('Sign-in error:', event.detail);
    showErrorState('Sign-in failed. Please try again.');
  });
  
  // Listen for sign-out errors
  document.addEventListener('signout-error', (event) => {
    dbgWarn('Sign-out error:', event.detail);
    showErrorState('Sign-out failed. Please try again.');
  });
  
  // Listen for CloudService ready event
  window.addEventListener('cloud-service-ready', async (event) => {
    dbgLog('CloudService ready event received');
    cloudServiceReady = true;
    
    // Check if user is logged in and fetch review count
    const isLoggedIn = await isUserLoggedIn();
    dbgLog('CloudService ready - isLoggedIn:', isLoggedIn, 'pendingUserDataFetch:', pendingUserDataFetch);
    
    if (isLoggedIn) {
      // If we have a pending review count fetch, handle it now
      if (pendingUserDataFetch) {
        dbgLog('Processing pending review count fetch');
        pendingUserDataFetch = false;
        await fetchAndDisplayUserData();
        showSuccessState('Ready to generate AI reviews - Navigate to a PR/MR page to start generating reviews');
      } else {
        // Otherwise, just fetch the review count normally
        dbgLog('No pending fetch, fetching review count normally');
        await fetchAndDisplayUserData();
      }
    }
  });
  
  // Listen for module loading errors
  window.addEventListener('modules-error', (event) => {
    dbgWarn('Module loading error:', event.detail);
    showErrorState('Failed to load extension modules');
  });
  
  // Set up the portal buttons
  const dashboardBtn = document.getElementById('dashboard-btn');
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await import('./utils/analytics-service.js');
        trackUserAction('dashboard_opened', { context: 'popup' }).catch(() => {});
      } catch (e) { /* silent */ }
      chrome.tabs.create({ url: 'https://portal.thinkreview.dev/dashboard' });
    });
  }
  
  const agentsBtn = document.getElementById('agents-btn');
  if (agentsBtn) {
    agentsBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await import('./utils/analytics-service.js');
        trackUserAction('agents_opened', { context: 'popup' }).catch(() => {});
      } catch (e) { dbgError('Failed to track agents_opened action:', e); }
      chrome.tabs.create({ url: 'https://portal.thinkreview.dev/agents' });
    });
  }
  
  const analyticsBtn = document.getElementById('analytics-btn');
  if (analyticsBtn) {
    analyticsBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await import('./utils/analytics-service.js');
        trackUserAction('analytics_opened', { context: 'popup' }).catch(() => {});
      } catch (e) { /* silent */ }
      chrome.tabs.create({ url: 'https://portal.thinkreview.dev/analytics' });
    });
  }
  
  const modelSelectionBtn = document.getElementById('model-selection-btn');
  if (modelSelectionBtn) {
    modelSelectionBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await import('./utils/analytics-service.js');
        trackUserAction('model_selection_opened', { context: 'popup' }).catch(() => {});
      } catch (e) { /* silent */ }
      chrome.tabs.create({ url: 'https://portal.thinkreview.dev/model-selection' });
    });
  }
  
  const scoringMetricsBtn = document.getElementById('scoring-metrics-btn');
  if (scoringMetricsBtn) {
    scoringMetricsBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await import('./utils/analytics-service.js');
        trackUserAction('scoring_metrics_opened', { context: 'popup' }).catch(() => {});
      } catch (e) { /* silent */ }
      chrome.tabs.create({ url: 'https://portal.thinkreview.dev/scoring-metrics' });
    });
  }
  
  // Set up the signout button in portal buttons row
  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await import('./utils/analytics-service.js');
        trackUserAction('signout_clicked', { context: 'popup' }).catch(() => {});
      } catch (e) { /* silent */ }
      // Find the google-signin component and trigger its signout
      const googleSignIn = document.querySelector('google-signin');
      if (googleSignIn && googleSignIn.shadowRoot) {
        const signoutButton = googleSignIn.shadowRoot.querySelector('#signout');
        if (signoutButton) {
          signoutButton.click();
        }
      }
    });
  }
  
  // Set up the Documentation button
  const howItWorksBtn = document.getElementById('how-it-works-btn');
  if (howItWorksBtn) {
    howItWorksBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await import('./utils/analytics-service.js');
        trackUserAction('documentation_opened', { context: 'popup' }).catch(() => {});
      } catch (e) { /* silent */ }
      chrome.tabs.create({ url: 'https://thinkreview.dev/docs' });
    });
  }
  
  // Set up the Need Help button
  const needHelpBtn = document.getElementById('need-help-btn');
  if (needHelpBtn) {
    needHelpBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await import('./utils/analytics-service.js');
        trackUserAction('need_help_clicked', { context: 'popup' }).catch(() => {});
      } catch (e) { /* silent */ }
      // Open the contact page in a new tab
      chrome.tabs.create({ url: 'https://thinkreview.dev/contact' });
    });
  }
  
  // Set up the Report a Bug button
  const reportBugBtn = document.getElementById('report-bug-btn');
  if (reportBugBtn) {
    reportBugBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await import('./utils/analytics-service.js');
        trackUserAction('bug_report_opened', { context: 'popup' }).catch(() => {});
      } catch (e) { /* silent */ }
      // Open the bug report page in a new tab
      chrome.tabs.create({ url: 'https://thinkreview.dev/bug-report' });
    });
  }

  const privacyFaqBtn = document.getElementById('privacy-faq-btn');
  if (privacyFaqBtn) {
    privacyFaqBtn.addEventListener('click', async () => {
      try {
        const { trackUserAction } = await import('./utils/analytics-service.js');
        trackUserAction('privacy_faq_opened', { context: 'popup' }).catch(() => {});
      } catch (e) { /* silent */ }
      chrome.tabs.create({ url: 'https://thinkreview.dev/privacy-faqs.html' });
    });
  }

  // Platform "Not working?" chips — platform-specific event names
  const platformNotWorkingLinks = [
    { id: 'not-working-github',    event: 'not_working_clicked_github' },
    { id: 'not-working-gitlab',    event: 'not_working_clicked_gitlab' },
    { id: 'not-working-azure',     event: 'not_working_clicked_azure' },
  ];
  platformNotWorkingLinks.forEach(({ id, event }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', async () => {
        try {
          const { trackUserAction } = await import('./utils/analytics-service.js');
          trackUserAction(event, { context: 'popup' }).catch(() => {});
        } catch (e) { /* silent */ }
      });
    }
  });

  // Platform "Setup guide" chips
  const platformSetupGuideLinks = [
    { id: 'setup-guide-github',    event: 'setup_guide_opened_github' },
    { id: 'setup-guide-gitlab',    event: 'setup_guide_opened_gitlab' },
    { id: 'setup-guide-azure',     event: 'setup_guide_opened_azure' },
    { id: 'setup-guide-bitbucket', event: 'setup_guide_opened_bitbucket' },
  ];
  platformSetupGuideLinks.forEach(({ id, event }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', async () => {
        try {
          const { trackUserAction } = await import('./utils/analytics-service.js');
          trackUserAction(event, { context: 'popup' }).catch(() => {});
        } catch (e) { /* silent */ }
      });
    }
  });
  
  // Set up the Manage Subscription button
  const cancelSubscriptionBtn = document.getElementById('cancel-subscription-btn');
  if (cancelSubscriptionBtn) {
    cancelSubscriptionBtn.addEventListener('click', () => {
      // Open the subscription management portal in a new tab
      chrome.tabs.create({ url: 'https://portal.thinkreview.dev/subscription' });
    });
  }
  
  // Initialize domain settings
  initializeDomainSettings();
  
  // Initialize Azure DevOps domain settings
  initializeAzureDevOpsDomainSettings();

  // Initialize GitHub Enterprise domain settings
  initializeGitHubEnterpriseDomainSettings();
  
  // Initialize Bitbucket settings (also called above after Azure)
  initializeBitbucketSettings();

  // Initialize Bitbucket Data Center (self-hosted) settings
  initializeBitbucketDataCenterSettings();
  
  // Initialize AI Provider settings
  initializeAIProviderSettings();

  // Initialize platform navigation (cards + back buttons + status badges)
  initializePlatformNavigation();

  // Initialize collapsible AI Provider header
  initializeAIProviderCollapsible();

});

// Domain Management Functionality
const DEFAULT_DOMAINS = ['https://gitlab.com'];

// Auto-start review option (default true)
function initializeAutoStartReviewSettings() {
  loadAutoStartReview();
  const onRadio = document.getElementById('auto-start-review-on');
  const offRadio = document.getElementById('auto-start-review-off');
  if (onRadio) {
    onRadio.addEventListener('change', async () => {
      if (onRadio.checked) {
        chrome.storage.local.set({ autoStartReview: true });
        try {
          const { trackUserAction } = await import('./utils/analytics-service.js');
          trackUserAction('auto_start_review_enabled', { context: 'popup' }).catch(() => {});
        } catch (e) { /* silent */ }
      }
    });
  }
  if (offRadio) {
    offRadio.addEventListener('change', async () => {
      if (offRadio.checked) {
        chrome.storage.local.set({ autoStartReview: false });
        try {
          const { trackUserAction } = await import('./utils/analytics-service.js');
          trackUserAction('auto_start_review_disabled', { context: 'popup' }).catch(() => {});
        } catch (e) { /* silent */ }
      }
    });
  }
  setupAutoStartInfoTooltips();
}

function setupAutoStartInfoTooltips() {
  const icons = document.querySelectorAll('.auto-start-info-icon');
  if (icons.length === 0) return;
  let tooltipEl = document.getElementById('auto-start-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'auto-start-tooltip';
    tooltipEl.className = 'auto-start-js-tooltip';
    document.body.appendChild(tooltipEl);
  }
  icons.forEach(icon => {
    icon.addEventListener('mouseenter', function showTooltip(e) {
      const text = this.getAttribute('data-tooltip');
      if (!text) return;
      tooltipEl.textContent = text;
      tooltipEl.classList.add('visible');
      const rect = this.getBoundingClientRect();
      tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
      tooltipEl.style.top = `${rect.top - 4}px`;
      tooltipEl.style.transform = 'translate(-50%, -100%)';
    });
    icon.addEventListener('mouseleave', function hideTooltip() {
      tooltipEl.classList.remove('visible');
    });
  });
}

async function loadAutoStartReview() {
  try {
    const result = await chrome.storage.local.get(['autoStartReview']);
    const enabled = result.autoStartReview !== false;
    const onRadio = document.getElementById('auto-start-review-on');
    const offRadio = document.getElementById('auto-start-review-off');
    if (onRadio) onRadio.checked = enabled;
    if (offRadio) offRadio.checked = !enabled;
  } catch (error) {
    dbgWarn('Error loading auto-start review setting:', error);
  }
}

function initializeDomainSettings() {
  loadDomains();
  setupDomainEventListeners();
}

function setupDomainEventListeners() {
  const addButton = document.getElementById('add-domain-btn');
  const domainInput = document.getElementById('domain-input');
  
  if (addButton && domainInput) {
    // Add domain button click
    addButton.addEventListener('click', addDomain);
    
    // Enter key in input field
    domainInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        addDomain();
      }
    });
    
    // Input validation
    domainInput.addEventListener('input', () => {
      const isValid = validateDomainInput(domainInput.value.trim());
      addButton.disabled = !isValid;
    });
  }
}

function validateDomainInput(domain) {
  if (!domain) return false;
  
  // Allow domains with or without protocol and port
  // Examples: gitlab.com, localhost:8083, http://localhost:8083, https://gitlab.example.com
  const domainRegex = /^(https?:\/\/)?(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|localhost)(:\d+)?(\/.*)?$/;
  return domainRegex.test(domain);
}

function normalizeDomain(input) {
  // Remove trailing slashes
  let normalized = input.replace(/\/+$/, '');
  
  // If it starts with http:// or https://, keep as is
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized;
  }
  
  // For localhost or domains with ports, default to http://
  if (normalized.includes('localhost') || /:\d+/.test(normalized)) {
    return `http://${normalized}`;
  }
  
  // For regular domains, default to https://
  return `https://${normalized}`;
}

function formatDomainForDisplay(domain) {
  // Remove https:// for cleaner display, but keep http:// to show it's not secure
  if (domain.startsWith('https://')) {
    return domain.replace('https://', '');
  }
  return domain;
}

async function loadDomains() {
  try {
    const result = await chrome.storage.local.get(['gitlabDomains']);
    const domains = result.gitlabDomains || DEFAULT_DOMAINS;
    renderDomainList(domains);
  } catch (error) {
    dbgWarn('Error loading domains:', error);
    renderDomainList(DEFAULT_DOMAINS);
  }
}

function renderDomainList(domains) {
  const domainList = document.getElementById('domain-list');

  domainList.replaceChildren();

  if (domains.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'no-domains';
    empty.textContent = 'No custom domains added';
    domainList.appendChild(empty);
    return;
  }

  domains.forEach(domain => {
    const isDefault = DEFAULT_DOMAINS.includes(domain);
    const displayDomain = formatDomainForDisplay(domain);

    const item = document.createElement('div');
    item.className = 'domain-item' + (isDefault ? ' default' : '');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'domain-name';
    nameSpan.textContent = displayDomain;

    const actionsDiv = document.createElement('div');
    if (isDefault) {
      const defaultLabel = document.createElement('span');
      defaultLabel.className = 'default-label';
      defaultLabel.textContent = 'DEFAULT';
      actionsDiv.appendChild(defaultLabel);
    } else {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-domain-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => removeDomain(domain));
      actionsDiv.appendChild(removeBtn);
    }

    item.appendChild(nameSpan);
    item.appendChild(actionsDiv);
    domainList.appendChild(item);
  });
}

// Flag to prevent duplicate calls
let isAddingDomain = false;

async function addDomain() {
  // Prevent duplicate calls
  if (isAddingDomain) {
    return;
  }
  
  const domainInput = document.getElementById('domain-input');
  const inputValue = domainInput.value.trim().toLowerCase();
  
  if (!validateDomainInput(inputValue)) {
    alert('Please enter a valid domain (e.g., gitlab.example.com, localhost:8083, http://localhost:8083)');
    return;
  }
  
  // Normalize the domain (store as full URL format for consistency)
  const domain = normalizeDomain(inputValue);
  
  try {
    // Set flag to prevent duplicate calls
    isAddingDomain = true;
    
    const addButton = document.getElementById('add-domain-btn');
    const originalButtonText = addButton.textContent;
    addButton.textContent = 'Adding...';
    addButton.disabled = true;

    let originPattern;
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      const url = new URL(domain);
      originPattern = `${url.protocol}//${url.host}/*`;
    } else {
      originPattern = `https://${domain}/*`;
    }

    dbgLog(`Adding domain with pattern: ${originPattern}`);

    // Firefox requires permissions.request in the same synchronous turn as the click (no await before this).
    const granted = await chrome.permissions.request({
      origins: [originPattern]
    });

    if (!granted) {
      alert('Permission not granted. The extension needs permission to access this domain.');
      addButton.textContent = originalButtonText;
      addButton.disabled = false;
      isAddingDomain = false;
      return;
    }

    const result = await chrome.storage.local.get(['gitlabDomains']);
    const domains = result.gitlabDomains || DEFAULT_DOMAINS;

    if (domains.includes(domain)) {
      alert('Domain already exists');
      addButton.textContent = originalButtonText;
      addButton.disabled = false;
      isAddingDomain = false;
      return;
    }

    // Add the domain to storage
    const updatedDomains = [...domains, domain];
    await chrome.storage.local.set({ gitlabDomains: updatedDomains });
    
    // Track custom domain in cloud asynchronously (fire-and-forget)
    // This runs in the background without blocking the domain addition
    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        dbgLog('User logged in, tracking custom domain in cloud (async)');
        window.CloudService.trackCustomDomains(domain, 'add')
          .then(() => dbgLog('Custom domain tracked successfully in cloud'))
          .catch(trackError => dbgWarn('Error tracking custom domain in cloud (non-critical):', trackError));
      } else {
        dbgLog('User not logged in or CloudService not available, skipping cloud tracking');
      }
    }).catch(err => dbgWarn('Error checking login status for cloud tracking:', err));
    
    // Explicitly trigger content script update via message to background
    chrome.runtime.sendMessage({ 
      type: 'UPDATE_CONTENT_SCRIPTS',
      domains: updatedDomains 
    });
    
    dbgLog('Domain added successfully:', domain);
    domainInput.value = '';
    addButton.textContent = originalButtonText;
    addButton.disabled = true;
    
    renderDomainList(updatedDomains);
    
    // Show success message
    showMessage('Domain added successfully! You may need to reload GitLab pages for changes to take effect.', 'success');
    
  } catch (error) {
    dbgWarn('Error adding domain:', error);
    alert(`Error adding domain: ${error.message}. Please try again.`);
    document.getElementById('add-domain-btn').textContent = 'Add';
    document.getElementById('add-domain-btn').disabled = false;
  } finally {
    // Reset flag to allow future calls
    isAddingDomain = false;
  }
}

// GitHub Enterprise (self-hosted) Domain Management
const GITHUB_ENTERPRISE_DEFAULT_DOMAINS = [];

function initializeGitHubEnterpriseDomainSettings() {
  loadGitHubEnterpriseDomains();
  setupGitHubEnterpriseDomainEventListeners();
}

function setupGitHubEnterpriseDomainEventListeners() {
  const addButton = document.getElementById('add-github-enterprise-domain-btn');
  const domainInput = document.getElementById('github-enterprise-domain-input');
  if (!addButton || !domainInput) return;

  addButton.addEventListener('click', addGitHubEnterpriseDomain);
  domainInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') addGitHubEnterpriseDomain();
  });
  domainInput.addEventListener('input', () => {
    addButton.disabled = !validateDomainInput(domainInput.value.trim());
  });
}

async function loadGitHubEnterpriseDomains() {
  try {
    const result = await chrome.storage.local.get(['githubEnterpriseDomains']);
    const domains = result.githubEnterpriseDomains || GITHUB_ENTERPRISE_DEFAULT_DOMAINS;
    renderGitHubEnterpriseDomainList(domains);
  } catch (error) {
    dbgWarn('Error loading GitHub Enterprise domains:', error);
    renderGitHubEnterpriseDomainList(GITHUB_ENTERPRISE_DEFAULT_DOMAINS);
  }
}

function renderGitHubEnterpriseDomainList(domains) {
  const domainList = document.getElementById('github-enterprise-domain-list');
  if (!domainList) return;

  domainList.replaceChildren();

  if (!domains || domains.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'no-domains';
    empty.textContent = 'No custom domains added';
    domainList.appendChild(empty);
    return;
  }

  domains.forEach(domain => {
    const isDefault = GITHUB_ENTERPRISE_DEFAULT_DOMAINS.includes(domain);
    const displayDomain = formatDomainForDisplay(domain);

    const item = document.createElement('div');
    item.className = 'domain-item' + (isDefault ? ' default' : '');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'domain-name';
    nameSpan.textContent = displayDomain;

    const actionsDiv = document.createElement('div');
    if (isDefault) {
      const defaultLabel = document.createElement('span');
      defaultLabel.className = 'default-label';
      defaultLabel.textContent = 'DEFAULT';
      actionsDiv.appendChild(defaultLabel);
    } else {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-domain-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => removeGitHubEnterpriseDomain(domain));
      actionsDiv.appendChild(removeBtn);
    }

    item.appendChild(nameSpan);
    item.appendChild(actionsDiv);
    domainList.appendChild(item);
  });
}

let isAddingGitHubEnterpriseDomain = false;

async function addGitHubEnterpriseDomain() {
  if (isAddingGitHubEnterpriseDomain) return;

  const domainInput = document.getElementById('github-enterprise-domain-input');
  const addButton = document.getElementById('add-github-enterprise-domain-btn');
  const inputValue = domainInput?.value?.trim()?.toLowerCase() ?? '';

  if (!validateDomainInput(inputValue)) {
    alert('Please enter a valid domain (e.g., github.mycompany.com, https://github.mycompany.com)');
    return;
  }

  const domain = normalizeDomain(inputValue);

  try {
    isAddingGitHubEnterpriseDomain = true;
    const originalButtonText = addButton?.textContent ?? 'Add';
    if (addButton) {
      addButton.textContent = 'Adding...';
      addButton.disabled = true;
    }

    let originPattern;
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      const url = new URL(domain);
      originPattern = `${url.protocol}//${url.host}/*`;
    } else {
      originPattern = `https://${domain}/*`;
    }

    dbgLog(`Adding GitHub Enterprise domain with pattern: ${originPattern}`);

    // Firefox: permissions.request must run before any other await (user-gesture stack).
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) {
      alert('Permission not granted. The extension needs permission to access this domain.');
      if (addButton) {
        addButton.textContent = originalButtonText;
        addButton.disabled = false;
      }
      return;
    }

    const result = await chrome.storage.local.get(['githubEnterpriseDomains']);
    const domains = result.githubEnterpriseDomains || GITHUB_ENTERPRISE_DEFAULT_DOMAINS;

    if (domains.includes(domain)) {
      alert('Domain already exists');
      if (addButton) {
        addButton.textContent = originalButtonText;
        addButton.disabled = false;
      }
      return;
    }

    const updatedDomains = [...domains, domain];
    await chrome.storage.local.set({ githubEnterpriseDomains: updatedDomains });

    // Track custom domain in cloud asynchronously (fire-and-forget)
    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        dbgLog('User logged in, tracking GitHub Enterprise custom domain in cloud (async)');
        window.CloudService.trackCustomDomains(domain, 'add')
          .then(() => dbgLog('GitHub Enterprise custom domain tracked successfully in cloud'))
          .catch(trackError => dbgWarn('Error tracking GitHub Enterprise custom domain in cloud (non-critical):', trackError));
      } else {
        dbgLog('User not logged in or CloudService not available, skipping cloud tracking for GitHub Enterprise');
      }
    }).catch(err => dbgWarn('Error checking login status for GitHub Enterprise cloud tracking:', err));

    chrome.runtime.sendMessage({ type: 'UPDATE_CONTENT_SCRIPTS' });

    if (domainInput) domainInput.value = '';
    if (addButton) {
      addButton.textContent = originalButtonText;
      addButton.disabled = true;
    }

    renderGitHubEnterpriseDomainList(updatedDomains);
    showMessage('Domain added successfully! You may need to reload GitHub Enterprise pages for changes to take effect.', 'success');
  } catch (error) {
    dbgWarn('Error adding GitHub Enterprise domain:', error);
    alert(`Error adding domain: ${error.message}. Please try again.`);
    if (addButton) {
      addButton.textContent = 'Add';
      addButton.disabled = false;
    }
  } finally {
    isAddingGitHubEnterpriseDomain = false;
  }
}

async function removeGitHubEnterpriseDomain(domain) {
  if (!confirm(`Remove domain "${domain}"?`)) return;

  try {
    const result = await chrome.storage.local.get(['githubEnterpriseDomains']);
    const domains = result.githubEnterpriseDomains || GITHUB_ENTERPRISE_DEFAULT_DOMAINS;
    const updatedDomains = domains.filter(d => d !== domain);
    await chrome.storage.local.set({ githubEnterpriseDomains: updatedDomains });

    // Track custom domain removal in cloud asynchronously (fire-and-forget)
    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        dbgLog('User logged in, tracking GitHub Enterprise custom domain removal in cloud (async)');
        window.CloudService.trackCustomDomains(domain, 'remove')
          .then(() => dbgLog('GitHub Enterprise custom domain removal tracked successfully in cloud'))
          .catch(trackError => dbgWarn('Error tracking GitHub Enterprise custom domain removal in cloud (non-critical):', trackError));
      } else {
        dbgLog('User not logged in or CloudService not available, skipping cloud tracking for GitHub Enterprise removal');
      }
    }).catch(err => dbgWarn('Error checking login status for GitHub Enterprise cloud tracking:', err));

    renderGitHubEnterpriseDomainList(updatedDomains);
    showMessage('Domain removed successfully!', 'success');
  } catch (error) {
    dbgWarn('Error removing GitHub Enterprise domain:', error);
    alert('Error removing domain. Please try again.');
  }
}

async function removeDomain(domain) {
  if (DEFAULT_DOMAINS.includes(domain)) {
    alert('Cannot remove default domain');
    return;
  }
  
  if (!confirm(`Remove domain "${domain}"?`)) {
    return;
  }
  
  try {
    const result = await chrome.storage.local.get(['gitlabDomains']);
    const domains = result.gitlabDomains || DEFAULT_DOMAINS;
    
    const updatedDomains = domains.filter(d => d !== domain);
    await chrome.storage.local.set({ gitlabDomains: updatedDomains });
    
    // Track custom domain removal in cloud asynchronously (fire-and-forget)
    // This runs in the background without blocking the domain removal
    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        dbgLog('User logged in, tracking custom domain removal in cloud (async)');
        window.CloudService.trackCustomDomains(domain, 'remove')
          .then(() => dbgLog('Custom domain removal tracked successfully in cloud'))
          .catch(trackError => dbgWarn('Error tracking custom domain removal in cloud (non-critical):', trackError));
      } else {
        dbgLog('User not logged in or CloudService not available, skipping cloud tracking');
      }
    }).catch(err => dbgWarn('Error checking login status for cloud tracking:', err));
    
    dbgLog('Domain removed:', domain);
    renderDomainList(updatedDomains);
    
    showMessage('Domain removed successfully!', 'success');
    
  } catch (error) {
    dbgWarn('Error removing domain:', error);
    alert('Error removing domain. Please try again.');
  }
}

// Azure DevOps Domain Management: default cloud domains shown in list (like GitLab); custom on-prem stored separately
const AZURE_DEFAULT_DOMAINS = ['https://dev.azure.com', 'https://visualstudio.com'];

function initializeAzureDevOpsDomainSettings() {
  loadAzureDevOpsDomains();
  setupAzureDevOpsDomainEventListeners();
}

function setupAzureDevOpsDomainEventListeners() {
  const addButton = document.getElementById('add-azure-domain-btn');
  const domainInput = document.getElementById('azure-domain-input');
  if (!addButton || !domainInput) return;

  addButton.addEventListener('click', addAzureDevOpsDomain);
  domainInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') addAzureDevOpsDomain();
  });
  domainInput.addEventListener('input', () => {
    addButton.disabled = !validateDomainInput(domainInput.value.trim());
  });
}

async function loadAzureDevOpsDomains() {
  try {
    const result = await chrome.storage.local.get(['azureDevOpsDomains']);
    const customDomains = result.azureDevOpsDomains || [];
    renderAzureDevOpsDomainList(customDomains);
  } catch (error) {
    dbgWarn('Error loading Azure DevOps domains:', error);
    renderAzureDevOpsDomainList([]);
  }
}

function renderAzureDevOpsDomainList(customDomains) {
  const domainList = document.getElementById('azure-domain-list');
  if (!domainList) return;

  // Show default cloud domains first (like GitLab), then custom on-prem
  const displayList = [
    ...AZURE_DEFAULT_DOMAINS,
    ...(customDomains.filter(d => !AZURE_DEFAULT_DOMAINS.includes(d)))
  ];

  domainList.replaceChildren();

  if (displayList.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'no-domains';
    empty.textContent = 'No custom domains added';
    domainList.appendChild(empty);
    return;
  }

  displayList.forEach(domain => {
    const isDefault = AZURE_DEFAULT_DOMAINS.includes(domain);
    const displayDomain = formatDomainForDisplay(domain);

    const item = document.createElement('div');
    item.className = 'domain-item' + (isDefault ? ' default' : '');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'domain-name';
    nameSpan.textContent = displayDomain;

    const actionsDiv = document.createElement('div');
    if (isDefault) {
      const defaultLabel = document.createElement('span');
      defaultLabel.className = 'default-label';
      defaultLabel.textContent = 'DEFAULT';
      actionsDiv.appendChild(defaultLabel);
    } else {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-domain-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => removeAzureDevOpsDomain(domain));
      actionsDiv.appendChild(removeBtn);
    }

    item.appendChild(nameSpan);
    item.appendChild(actionsDiv);
    domainList.appendChild(item);
  });
}

let isAddingAzureDomain = false;

/**
 * Tracks Azure DevOps custom domain add/remove in cloud when user is logged in (fire-and-forget).
 * @param {string} domain - The domain that was added or removed
 * @param {'add'|'remove'} action - 'add' or 'remove'
 */
function trackAzureDevOpsDomainInCloud(domain, action) {
  const isAdd = action === 'add';
  const actionLabel = isAdd ? 'custom domain' : 'custom domain removal';
  isUserLoggedIn().then(isLoggedIn => {
    if (isLoggedIn && window.CloudService) {
      dbgLog(`User logged in, tracking ${actionLabel} in cloud (async)`);
      window.CloudService.trackCustomDomains(domain, action)
        .then(() => dbgLog(`${isAdd ? 'Custom domain' : 'Custom domain removal'} tracked successfully in cloud`))
        .catch(trackError => dbgWarn(`Error tracking ${actionLabel} in cloud (non-critical):`, trackError));
    } else {
      dbgLog('User not logged in or CloudService not available, skipping cloud tracking');
    }
  }).catch(err => dbgWarn('Error checking login status for cloud tracking:', err));
}

async function addAzureDevOpsDomain() {
  if (isAddingAzureDomain) return;

  const domainInput = document.getElementById('azure-domain-input');
  const addButton = document.getElementById('add-azure-domain-btn');
  const inputValue = domainInput?.value?.trim()?.toLowerCase() ?? '';

  if (!validateDomainInput(inputValue)) {
    alert('Please enter a valid domain (e.g., devops.companyname.com, https://devops.companyname.com)');
    return;
  }

  const domain = normalizeDomain(inputValue);

  try {
    isAddingAzureDomain = true;
    const originalButtonText = addButton?.textContent ?? 'Add';
    if (addButton) {
      addButton.textContent = 'Adding...';
      addButton.disabled = true;
    }

    let originPattern;
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      const url = new URL(domain);
      originPattern = `${url.protocol}//${url.host}/*`;
    } else {
      originPattern = `https://${domain}/*`;
    }

    // Firefox: permissions.request must run before any other await (user-gesture stack).
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) {
      alert('Permission not granted. The extension needs permission to access this domain.');
      if (addButton) {
        addButton.textContent = originalButtonText;
        addButton.disabled = false;
      }
      return;
    }

    const result = await chrome.storage.local.get(['azureDevOpsDomains']);
    const domains = result.azureDevOpsDomains || [];

    if (domains.includes(domain)) {
      alert('Domain already exists');
      if (addButton) {
        addButton.textContent = originalButtonText;
        addButton.disabled = false;
      }
      return;
    }

    const updatedCustomDomains = [...domains, domain];
    await chrome.storage.local.set({ azureDevOpsDomains: updatedCustomDomains });

    trackAzureDevOpsDomainInCloud(domain, 'add');

    chrome.runtime.sendMessage({ type: 'UPDATE_CONTENT_SCRIPTS' });

    if (domainInput) domainInput.value = '';
    if (addButton) {
      addButton.textContent = originalButtonText;
      addButton.disabled = true;
    }
    renderAzureDevOpsDomainList(updatedCustomDomains);
    showMessage('Domain added. You may need to reload Azure DevOps pages for changes to take effect.', 'success');
  } catch (error) {
    dbgWarn('Error adding Azure DevOps domain:', error);
    alert(`Error adding domain: ${error.message}. Please try again.`);
    if (addButton) {
      addButton.textContent = 'Add';
      addButton.disabled = false;
    }
  } finally {
    isAddingAzureDomain = false;
  }
}

async function removeAzureDevOpsDomain(domain) {
  if (!confirm(`Remove domain "${domain}"?`)) return;

  try {
    const result = await chrome.storage.local.get(['azureDevOpsDomains']);
    const customDomains = result.azureDevOpsDomains || [];
    const updatedCustomDomains = customDomains.filter(d => d !== domain);
    await chrome.storage.local.set({ azureDevOpsDomains: updatedCustomDomains });

    trackAzureDevOpsDomainInCloud(domain, 'remove');

    chrome.runtime.sendMessage({ type: 'UPDATE_CONTENT_SCRIPTS' });
    renderAzureDevOpsDomainList(updatedCustomDomains);
    showMessage('Domain removed successfully!', 'success');
  } catch (error) {
    dbgWarn('Error removing Azure DevOps domain:', error);
    alert('Error removing domain. Please try again.');
  }
}

// Bitbucket: Allow Bitbucket (request permission for page + API host, store bitbucketAllowed, trigger content script update)
const BITBUCKET_ORIGINS = ['https://bitbucket.org/*', 'https://api.bitbucket.org/*'];
const BITBUCKET_TOKEN_MASK = '••••••••••••••••••••••••••••••••••••••••••••••••••';

function initializeBitbucketSettings() {
  loadBitbucketState();
  loadBitbucketToken();
  const allowBtn = document.getElementById('allow-bitbucket-btn');
  if (allowBtn) {
    allowBtn.addEventListener('click', allowBitbucket);
  }
  const saveTokenBtn = document.getElementById('save-bitbucket-token-btn');
  const tokenInput = document.getElementById('bitbucket-token-input');
  const emailInput = document.getElementById('bitbucket-email-input');
  if (saveTokenBtn) saveTokenBtn.addEventListener('click', saveBitbucketToken);
  if (tokenInput) {
    tokenInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveBitbucketToken(); });
  }
  if (emailInput) {
    emailInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveBitbucketToken(); });
  }
}

async function loadBitbucketState() {
  try {
    const hasPermission = await chrome.permissions.contains({ origins: BITBUCKET_ORIGINS });
    const result = await chrome.storage.local.get(['bitbucketAllowed']);
    const allowed = result.bitbucketAllowed === true || hasPermission;

    if (allowed) {
      await chrome.storage.local.set({ bitbucketAllowed: true });
    }

    const allowSection = document.getElementById('bitbucket-allow-section');
    const enabledMessage = document.getElementById('bitbucket-enabled-message');
    const statusEl = document.getElementById('bitbucket-status');
    const allowBtn = document.getElementById('allow-bitbucket-btn');

    if (allowed) {
      if (allowSection) allowSection.style.display = 'none';
      if (enabledMessage) enabledMessage.style.display = 'flex';
      if (statusEl) statusEl.textContent = '';
    } else {
      if (allowSection) allowSection.style.display = 'flex';
      if (enabledMessage) enabledMessage.style.display = 'none';
      if (statusEl) statusEl.textContent = '';
      if (allowBtn) allowBtn.textContent = 'Allow Bitbucket';
    }
  } catch (error) {
    dbgWarn('Error loading Bitbucket state:', error);
  }
}

let isAllowingBitbucket = false;

async function allowBitbucket() {
  if (isAllowingBitbucket) return;
  const allowBtn = document.getElementById('allow-bitbucket-btn');
  const statusEl = document.getElementById('bitbucket-status');

  try {
    isAllowingBitbucket = true;
    if (allowBtn) {
      allowBtn.textContent = 'Adding...';
      allowBtn.disabled = true;
    }
    if (statusEl) statusEl.textContent = '';

    const granted = await chrome.permissions.request({ origins: BITBUCKET_ORIGINS });

    if (!granted) {
      if (statusEl) statusEl.textContent = 'Permission not granted.';
      if (allowBtn) {
        allowBtn.textContent = 'Allow Bitbucket';
        allowBtn.disabled = false;
      }
      return;
    }

    await chrome.storage.local.set({ bitbucketAllowed: true });
    chrome.runtime.sendMessage({ type: 'UPDATE_CONTENT_SCRIPTS' });

    loadBitbucketState();
    showMessage('Bitbucket enabled. Reload Bitbucket pages to use AI reviews.', 'success');
  } catch (error) {
    dbgWarn('Error allowing Bitbucket:', error);
    if (statusEl) statusEl.textContent = 'Error: ' + (error.message || 'Failed');
    if (allowBtn) {
      allowBtn.textContent = 'Allow Bitbucket';
      allowBtn.disabled = false;
    }
  } finally {
    isAllowingBitbucket = false;
  }
}

async function loadBitbucketToken() {
  try {
    const result = await chrome.storage.local.get(['bitbucketToken', 'bitbucketEmail']);
    const token = result.bitbucketToken;
    const email = result.bitbucketEmail;
    const statusEl = document.getElementById('bitbucket-token-status');
    const tokenInput = document.getElementById('bitbucket-token-input');
    const emailInput = document.getElementById('bitbucket-email-input');
    const saveBtn = document.getElementById('save-bitbucket-token-btn');
    if (token && String(token).trim()) {
      if (statusEl) {
        statusEl.textContent = 'Token saved';
        statusEl.className = 'token-status success';
      }
      if (tokenInput) {
        tokenInput.value = BITBUCKET_TOKEN_MASK;
        tokenInput.type = 'password';
      }
      if (emailInput) emailInput.value = (email != null && email !== undefined) ? String(email) : '';
    } else {
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.className = 'token-status';
      }
      if (emailInput) emailInput.value = (email != null && email !== undefined) ? String(email) : '';
    }
  } catch (error) {
    dbgWarn('Error loading Bitbucket token:', error);
  }
}

async function saveBitbucketToken() {
  const tokenInput = document.getElementById('bitbucket-token-input');
  const emailInput = document.getElementById('bitbucket-email-input');
  const saveBtn = document.getElementById('save-bitbucket-token-btn');
  const statusEl = document.getElementById('bitbucket-token-status');
  const tokenRaw = tokenInput?.value?.trim() ?? '';
  const email = emailInput?.value?.trim() ?? '';
  // If field shows the mask, keep existing token (user is only updating email or re-saving)
  const stored = await chrome.storage.local.get(['bitbucketToken', 'bitbucketEmail']);
  const existingToken = stored.bitbucketToken && String(stored.bitbucketToken).trim() ? stored.bitbucketToken.trim() : '';
  const token = (tokenRaw === BITBUCKET_TOKEN_MASK && existingToken) ? existingToken : tokenRaw;
  if (!token) {
    if (statusEl) {
      statusEl.textContent = 'Enter a token to save';
      statusEl.className = 'token-status error';
    }
    return;
  }
  try {
    if (saveBtn) saveBtn.textContent = 'Saving...';
    await chrome.storage.local.set({ bitbucketToken: token, bitbucketEmail: email || '' });
    if (statusEl) {
      statusEl.textContent = 'Token saved';
      statusEl.className = 'token-status success';
    }
    if (tokenInput) {
      tokenInput.value = BITBUCKET_TOKEN_MASK;
      tokenInput.type = 'password';
    }
    if (saveBtn) {
      saveBtn.textContent = 'Save Token';
      saveBtn.disabled = false;
    }
  } catch (error) {
    dbgWarn('Error saving Bitbucket token:', error);
    if (statusEl) {
      statusEl.textContent = 'Failed to save';
      statusEl.className = 'token-status error';
    }
    if (saveBtn) {
      saveBtn.textContent = 'Save Token';
      saveBtn.disabled = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Bitbucket Data Center (self-hosted) domain and credential management
// ---------------------------------------------------------------------------

const BITBUCKET_DC_TOKEN_MASK = '••••••••••••••••••••••••••••••••••••••••••••••••••';

function initializeBitbucketDataCenterSettings() {
  loadBitbucketDataCenterDomains();
  loadBitbucketDataCenterToken();
  setupBitbucketDataCenterEventListeners();
}

function setupBitbucketDataCenterEventListeners() {
  const addButton = document.getElementById('add-bitbucket-dc-domain-btn');
  const domainInput = document.getElementById('bitbucket-dc-domain-input');
  const saveTokenBtn = document.getElementById('save-bitbucket-dc-token-btn');
  const tokenInput = document.getElementById('bitbucket-dc-token-input');

  if (addButton && domainInput) {
    addButton.addEventListener('click', addBitbucketDataCenterDomain);
    domainInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addBitbucketDataCenterDomain(); });
    domainInput.addEventListener('input', () => {
      addButton.disabled = !validateDomainInput(domainInput.value.trim());
    });
  }

  if (saveTokenBtn) saveTokenBtn.addEventListener('click', saveBitbucketDataCenterToken);
  if (tokenInput) tokenInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveBitbucketDataCenterToken(); });
}

async function loadBitbucketDataCenterDomains() {
  try {
    const result = await chrome.storage.local.get(['bitbucketDataCenterDomains']);
    renderBitbucketDataCenterDomainList(result.bitbucketDataCenterDomains || []);
  } catch (error) {
    dbgWarn('Error loading Bitbucket Data Center domains:', error);
    renderBitbucketDataCenterDomainList([]);
  }
}

function renderBitbucketDataCenterDomainList(domains) {
  const domainList = document.getElementById('bitbucket-dc-domain-list');
  if (!domainList) return;

  domainList.replaceChildren();

  if (!domains || domains.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'no-domains';
    empty.textContent = 'No custom domains added';
    domainList.appendChild(empty);
    return;
  }

  domains.forEach(domain => {
    const displayDomain = formatDomainForDisplay(domain);

    const item = document.createElement('div');
    item.className = 'domain-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'domain-name';
    nameSpan.textContent = displayDomain;

    const actionsDiv = document.createElement('div');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-domain-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeBitbucketDataCenterDomain(domain));
    actionsDiv.appendChild(removeBtn);

    item.appendChild(nameSpan);
    item.appendChild(actionsDiv);
    domainList.appendChild(item);
  });
}

let isAddingBitbucketDCDomain = false;

async function addBitbucketDataCenterDomain() {
  if (isAddingBitbucketDCDomain) return;

  const domainInput = document.getElementById('bitbucket-dc-domain-input');
  const addButton = document.getElementById('add-bitbucket-dc-domain-btn');
  const inputValue = domainInput?.value?.trim()?.toLowerCase() ?? '';

  if (!validateDomainInput(inputValue)) {
    alert('Please enter a valid domain (e.g., bitbucket.mycompany.com, https://bitbucket.mycompany.com)');
    return;
  }

  const domain = normalizeDomain(inputValue);

  try {
    isAddingBitbucketDCDomain = true;
    const originalButtonText = addButton?.textContent ?? 'Add';
    if (addButton) {
      addButton.textContent = 'Adding...';
      addButton.disabled = true;
    }

    let originPattern;
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      const url = new URL(domain);
      originPattern = `${url.protocol}//${url.host}/*`;
    } else {
      originPattern = `https://${domain}/*`;
    }

    dbgLog(`Adding Bitbucket Data Center domain with pattern: ${originPattern}`);

    // Firefox: permissions.request must run before any other await (user-gesture stack).
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) {
      alert('Permission not granted. The extension needs permission to access this domain.');
      if (addButton) {
        addButton.textContent = originalButtonText;
        addButton.disabled = false;
      }
      return;
    }

    const result = await chrome.storage.local.get(['bitbucketDataCenterDomains']);
    const domains = result.bitbucketDataCenterDomains || [];

    if (domains.includes(domain)) {
      alert('Domain already exists');
      if (addButton) {
        addButton.textContent = originalButtonText;
        addButton.disabled = false;
      }
      return;
    }

    const updatedDomains = [...domains, domain];
    await chrome.storage.local.set({ bitbucketDataCenterDomains: updatedDomains });

    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        window.CloudService.trackCustomDomains(domain, 'add')
          .catch(err => dbgWarn('Error tracking Bitbucket DC domain in cloud (non-critical):', err));
      }
    }).catch(err => dbgWarn('Error checking login for DC domain tracking:', err));

    chrome.runtime.sendMessage({ type: 'UPDATE_CONTENT_SCRIPTS' });

    if (domainInput) domainInput.value = '';
    if (addButton) {
      addButton.textContent = originalButtonText;
      addButton.disabled = true;
    }

    renderBitbucketDataCenterDomainList(updatedDomains);
    showMessage('Domain added. Reload your Bitbucket Data Center pages to use AI reviews.', 'success');
  } catch (error) {
    dbgWarn('Error adding Bitbucket Data Center domain:', error);
    alert(`Error adding domain: ${error.message}. Please try again.`);
    if (addButton) {
      addButton.textContent = 'Add';
      addButton.disabled = false;
    }
  } finally {
    isAddingBitbucketDCDomain = false;
  }
}

async function removeBitbucketDataCenterDomain(domain) {
  if (!confirm(`Remove domain "${domain}"?`)) return;

  try {
    const result = await chrome.storage.local.get(['bitbucketDataCenterDomains']);
    const domains = result.bitbucketDataCenterDomains || [];
    const updatedDomains = domains.filter(d => d !== domain);
    await chrome.storage.local.set({ bitbucketDataCenterDomains: updatedDomains });

    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        window.CloudService.trackCustomDomains(domain, 'remove')
          .catch(err => dbgWarn('Error tracking Bitbucket DC domain removal in cloud (non-critical):', err));
      }
    }).catch(err => dbgWarn('Error checking login for DC domain tracking:', err));

    chrome.runtime.sendMessage({ type: 'UPDATE_CONTENT_SCRIPTS' });
    renderBitbucketDataCenterDomainList(updatedDomains);
    showMessage('Domain removed successfully!', 'success');
  } catch (error) {
    dbgWarn('Error removing Bitbucket Data Center domain:', error);
    alert('Error removing domain. Please try again.');
  }
}

async function loadBitbucketDataCenterToken() {
  try {
    const result = await chrome.storage.local.get(['bitbucketDataCenterToken']);
    const token = result.bitbucketDataCenterToken;
    const statusEl = document.getElementById('bitbucket-dc-token-status');
    const tokenInput = document.getElementById('bitbucket-dc-token-input');

    if (token && String(token).trim()) {
      if (statusEl) {
        statusEl.textContent = 'Token saved';
        statusEl.className = 'token-status success';
      }
      if (tokenInput) {
        tokenInput.value = BITBUCKET_DC_TOKEN_MASK;
        tokenInput.type = 'password';
      }
    } else {
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.className = 'token-status';
      }
    }
  } catch (error) {
    dbgWarn('Error loading Bitbucket Data Center token:', error);
  }
}

async function saveBitbucketDataCenterToken() {
  const tokenInput = document.getElementById('bitbucket-dc-token-input');
  const saveBtn = document.getElementById('save-bitbucket-dc-token-btn');
  const statusEl = document.getElementById('bitbucket-dc-token-status');

  const tokenRaw = tokenInput?.value?.trim() ?? '';

  const stored = await chrome.storage.local.get(['bitbucketDataCenterToken']);
  const existingToken = stored.bitbucketDataCenterToken && String(stored.bitbucketDataCenterToken).trim() ? stored.bitbucketDataCenterToken.trim() : '';
  const token = (tokenRaw === BITBUCKET_DC_TOKEN_MASK && existingToken) ? existingToken : tokenRaw;

  if (!token) {
    if (statusEl) {
      statusEl.textContent = 'Enter an HTTP access token to save';
      statusEl.className = 'token-status error';
    }
    return;
  }

  try {
    if (saveBtn) saveBtn.textContent = 'Saving...';
    await chrome.storage.local.set({ bitbucketDataCenterToken: token });
    if (statusEl) {
      statusEl.textContent = 'Token saved';
      statusEl.className = 'token-status success';
    }
    if (tokenInput) {
      tokenInput.value = BITBUCKET_DC_TOKEN_MASK;
      tokenInput.type = 'password';
    }
    if (saveBtn) {
      saveBtn.textContent = 'Save';
      saveBtn.disabled = false;
    }
  } catch (error) {
    dbgWarn('Error saving Bitbucket Data Center token:', error);
    if (statusEl) {
      statusEl.textContent = 'Failed to save';
      statusEl.className = 'token-status error';
    }
    if (saveBtn) {
      saveBtn.textContent = 'Save';
      saveBtn.disabled = false;
    }
  }
}

function showMessage(text, type = 'info') {
  // Create a temporary message element
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
    max-width: 300px;
    text-align: center;
  `;
  message.textContent = text;
  
  document.body.appendChild(message);
  
  setTimeout(() => {
    if (document.body.contains(message)) {
      document.body.removeChild(message);
    }
  }, 3000);
}

// Azure DevOps Settings Functionality
function initializeAzureSettings() {
  loadAzureToken();
  setupAzureEventListeners();
}

function setupAzureEventListeners() {
  const saveButton = document.getElementById('save-token-btn');
  const tokenInput = document.getElementById('azure-token-input');
  
  // Save token button click
  saveButton.addEventListener('click', saveAzureToken);
  
  // Enter key in input field
  tokenInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      saveAzureToken();
    }
  });
}

async function loadAzureToken() {
  try {
    const result = await chrome.storage.local.get(['azureDevOpsToken']);
    const token = result.azureDevOpsToken;
    
    if (token) {
      clearTokenStatus();
      const tokenInput = document.getElementById('azure-token-input');
      if (tokenInput) {
        tokenInput.value = '••••••••••••••••••••••••••••••••••••••••••••••••••';
        tokenInput.type = 'password';
      }
    } else {
      updateTokenStatus('No token configured', 'info');
    }
  } catch (error) {
    dbgWarn('Error loading Azure token:', error);
    updateTokenStatus('Error loading token', 'error');
  }
}

async function saveAzureToken() {
  const tokenInput = document.getElementById('azure-token-input');
  const saveButton = document.getElementById('save-token-btn');
  const token = tokenInput.value.trim();
  
  const originalButtonText = saveButton.textContent;
  try {
    saveButton.textContent = 'Saving...';
    saveButton.disabled = true;

    await chrome.storage.local.set({ azureDevOpsToken: token });

    updateTokenStatus('Token saved successfully', 'success');
    setTimeout(clearTokenStatus, 5000);

    tokenInput.value = '••••••••••••••••••••••••••••••••••••••••••••••••••';
    tokenInput.type = 'password';

    dbgLog('Azure DevOps token saved successfully');
  } catch (error) {
    dbgWarn('Error saving Azure token:', error);
    updateTokenStatus('Error saving token. Please try again.', 'error');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = originalButtonText;
  }
}

function updateTokenStatus(message, type) {
  const statusDiv = document.getElementById('token-status');
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = `token-status ${type}`;
  }
}

function clearTokenStatus() {
  const statusDiv = document.getElementById('token-status');
  if (statusDiv) {
    statusDiv.textContent = '';
    statusDiv.className = 'token-status';
  }
}

// Subscription upgrade functionality has been moved to content.js and removed from popup

// AI Provider Management Functionality
function initializeAIProviderSettings() {
  loadAIProviderSettings();
  setupAIProviderEventListeners();
}

function setupAIProviderEventListeners() {
  const providerRadios = document.querySelectorAll('input[name="ai-provider"]');
  const testButton = document.getElementById('test-ollama-btn');
  const saveButton = document.getElementById('save-ollama-btn');
  const refreshModelsButton = document.getElementById('refresh-models-btn');
  
  // Provider selection change
  providerRadios.forEach(radio => {
    radio.addEventListener('change', handleProviderChange);
  });
  
  // Test Ollama connection
  if (testButton) {
    testButton.addEventListener('click', testOllamaConnection);
  }
  
  // Save Ollama settings
  if (saveButton) {
    saveButton.addEventListener('click', saveOllamaSettings);
  }
  
  // Refresh available models
  if (refreshModelsButton) {
    refreshModelsButton.addEventListener('click', refreshOllamaModels);
  }
}

async function loadAIProviderSettings() {
  try {
    const result = await chrome.storage.local.get(['aiProvider', 'ollamaConfig']);
    const provider = result.aiProvider || 'cloud';
    const config = result.ollamaConfig || {
      url: 'http://localhost:11434',
      model: 'qwen3-coder:30b',
      temperature: 0.3,
      top_p: 0.4,
      top_k: 90
    };
    
    // Set the selected provider
    const providerRadio = document.getElementById(`provider-${provider}`);
    if (providerRadio) {
      providerRadio.checked = true;
    }
    updateProviderCardSelection(provider);
    
    // Show/hide Ollama config based on provider
    const ollamaConfig = document.getElementById('ollama-config');
    if (ollamaConfig) {
      ollamaConfig.style.display = provider === 'ollama' ? 'block' : 'none';
    }
    // Show "Start review automatically" for all providers
    const autoStartSection = document.getElementById('auto-start-review-section');
    if (autoStartSection) {
      autoStartSection.style.display = 'flex';
    }
    
    // Load Ollama config values
    const urlInput = document.getElementById('ollama-url');
    const modelSelect = document.getElementById('ollama-model');
    const tempInput = document.getElementById('ollama-temperature');
    const topPInput = document.getElementById('ollama-top-p');
    const topKInput = document.getElementById('ollama-top-k');
    
    if (urlInput) urlInput.value = config.url;
    if (tempInput) tempInput.value = clampTemperature(config.temperature);
    if (topPInput) topPInput.value = clampTopP(config.top_p);
    if (topKInput) topKInput.value = clampTopK(config.top_k);
    
    // If Ollama is the selected provider, fetch available models
    if (provider === 'ollama') {
      dbgLog('Ollama is selected provider, fetching available models...');
      await fetchAndPopulateModels(config.url, config.model);
    } else if (modelSelect) {
      // If not Ollama, just set the saved model value
      modelSelect.value = config.model;
    }
    
    dbgLog('AI Provider settings loaded:', { provider, config });
  } catch (error) {
    dbgWarn('Error loading AI Provider settings:', error);
  }
}

function updateProviderCardSelection(provider) {
  const cloudCard = document.getElementById('provider-card-cloud');
  const ollamaCard = document.getElementById('provider-card-ollama');
  if (cloudCard) cloudCard.classList.toggle('is-selected', provider === 'cloud');
  if (ollamaCard) ollamaCard.classList.toggle('is-selected', provider === 'ollama');
}

function handleProviderChange(event) {
  const provider = event.target.value;
  updateProviderCardSelection(provider);
  const ollamaConfig = document.getElementById('ollama-config');
  
  if (ollamaConfig) {
    ollamaConfig.style.display = provider === 'ollama' ? 'block' : 'none';
  }
  const autoStartSection = document.getElementById('auto-start-review-section');
  if (autoStartSection) {
    autoStartSection.style.display = 'flex';
  }
  
  // Auto-save provider selection
  chrome.storage.local.set({ aiProvider: provider }, () => {
    dbgLog('AI Provider changed to:', provider);
    showOllamaStatus(
      provider === 'cloud' 
        ? '☁️ Using Cloud AI (Advanced Models)' 
        : '🖥️ Local Ollama selected - configure and test below',
      provider === 'cloud' ? 'success' : 'info'
    );
    
    // Automatically fetch models when Ollama is selected
    if (provider === 'ollama') {
      const urlInput = document.getElementById('ollama-url');
      const url = urlInput ? urlInput.value.trim() : 'http://localhost:11434';
      
      dbgLog('Ollama selected, fetching available models...');
      fetchAndPopulateModels(url).catch(err => {
        dbgWarn('Error auto-fetching models (non-critical):', err);
      });
    }
    
    // Track provider change in cloud asynchronously (fire-and-forget)
    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        dbgLog('User logged in, tracking AI provider change in cloud (async)');
        // If switching to cloud, track Ollama as disabled
        if (provider === 'cloud') {
          window.CloudService.trackOllamaConfig(false, null)
            .then(() => dbgLog('Ollama disabled tracked successfully in cloud'))
            .catch(trackError => dbgWarn('Error tracking provider change in cloud (non-critical):', trackError));
        }
        // If switching to Ollama, it will be tracked when user saves the config
      } else {
        dbgLog('User not logged in or CloudService not available, skipping cloud tracking');
      }
    }).catch(err => dbgWarn('Error checking login status for cloud tracking:', err));
  });
}

async function fetchAndPopulateModels(url, savedModel = null) {
  if (!url) {
    dbgWarn('No URL provided for fetching models');
    return;
  }
  
  const modelSelect = document.getElementById('ollama-model');
  if (!modelSelect) return;
  
  try {
    // Dynamically import OllamaService
    const { OllamaService } = await import(chrome.runtime.getURL('services/ollama-service.js'));
    
    // Check connection first
    const connectionResult = await OllamaService.checkConnection(url);
    
    if (!connectionResult.connected) {
      if (connectionResult.isCorsError) {
        // Show CORS-specific error with instructions
        modelSelect.innerHTML = '<option value="">🔒 CORS Error - Fix Required</option>';
        showCorsInstructions();
        return;
      }
      
      modelSelect.innerHTML = '<option value="">⚠️ Ollama not running</option>';
      showOllamaStatus('⚠️ Cannot connect to Ollama. Make sure it\'s running.', 'error');
      return;
    }
    
    // Fetch available models
    const modelsResult = await OllamaService.getAvailableModels(url);
    
    if (modelsResult.isCorsError) {
      // Show CORS-specific error with instructions
      modelSelect.innerHTML = '<option value="">🔒 CORS Error - Fix Required</option>';
      showCorsInstructions();
      return;
    }
    
    if (modelsResult.models.length > 0) {
      updateModelSelect(modelsResult.models);
      
      // If a saved model was provided, try to select it
      if (savedModel) {
        const modelExists = Array.from(modelSelect.options).some(opt => opt.value === savedModel);
        if (modelExists) {
          modelSelect.value = savedModel;
        }
      }
      
      showOllamaStatus(`✅ Found ${modelsResult.models.length} installed model(s)`, 'success');
      dbgLog('Successfully loaded', modelsResult.models.length, 'models from Ollama');
    } else {
      modelSelect.innerHTML = '<option value="">⚠️ No models installed</option>';
      showOllamaStatus('⚠️ No models found. Install one with: ollama pull qwen3-coder:30b', 'error');
    }
  } catch (error) {
    dbgWarn('Error fetching models:', error);
    modelSelect.innerHTML = '<option value="">❌ Error loading models</option>';
    showOllamaStatus(`❌ Failed to fetch models: ${error.message}`, 'error');
  }
}

async function testOllamaConnection() {
  const urlInput = document.getElementById('ollama-url');
  const url = urlInput.value.trim();
  
  if (!url) {
    showOllamaStatus('❌ Please enter a valid URL', 'error');
    return;
  }
  
  showOllamaStatus('🔄 Testing connection...', 'info');
  
  try {
    // Dynamically import OllamaService
    const { OllamaService } = await import(chrome.runtime.getURL('services/ollama-service.js'));
    
    const connectionResult = await OllamaService.checkConnection(url);
    
    if (connectionResult.connected) {
      showOllamaStatus('✅ Connection successful! Ollama is running.', 'success');
      
      // Try to fetch and update models
      try {
        const modelsResult = await OllamaService.getAvailableModels(url);
        if (modelsResult.isCorsError) {
          showCorsInstructions();
        } else if (modelsResult.models.length > 0) {
          updateModelSelect(modelsResult.models);
          showOllamaStatus(`✅ Connected! Found ${modelsResult.models.length} model(s).`, 'success');
        }
      } catch (modelsError) {
        dbgWarn('Error fetching models:', modelsError);
        // Connection works but couldn't fetch models - still success
      }
    } else if (connectionResult.isCorsError) {
      showCorsInstructions();
    } else {
      showOllamaStatus('❌ Cannot connect to Ollama. Make sure it\'s running.', 'error');
    }
  } catch (error) {
    dbgWarn('Error testing Ollama connection:', error);
    showOllamaStatus(`❌ Connection failed: ${error.message}`, 'error');
  }
}

async function saveOllamaSettings() {
  const urlInput = document.getElementById('ollama-url');
  const modelSelect = document.getElementById('ollama-model');
  
  const url = urlInput.value.trim();
  const model = modelSelect.value;
  
  if (!url) {
    showOllamaStatus('❌ Please enter a valid URL', 'error');
    return;
  }
  
  if (!model) {
    showOllamaStatus('❌ Please select a model', 'error');
    return;
  }
  
  const tempInput = document.getElementById('ollama-temperature');
  const topPInput = document.getElementById('ollama-top-p');
  const topKInput = document.getElementById('ollama-top-k');
  const temperature = clampTemperature(tempInput?.value);
  const topP = clampTopP(topPInput?.value);
  const topK = clampTopK(topKInput?.value);
  if (tempInput) tempInput.value = temperature;
  if (topPInput) topPInput.value = topP;
  if (topKInput) topKInput.value = topK;

  try {
    const config = { url, model, temperature, top_p: topP, top_k: topK };
    const { OllamaService } = await import(chrome.runtime.getURL('services/ollama-service.js'));
    const { contextLength, error: ctxError } = await OllamaService.getModelContextLength(url, model);
    if (contextLength != null) {
      config.OllamaModelcontextLength = contextLength;
      dbgLog('Ollama model context length saved:', contextLength);
    } else if (ctxError) {
      dbgWarn('Could not fetch model context length (will not truncate patch):', ctxError);
    }
    await chrome.storage.local.set({ ollamaConfig: config });
    dbgLog('Ollama settings saved:', config);
    showOllamaStatus('✅ Settings saved successfully!', 'success');
    
    // Track Ollama configuration in cloud asynchronously (fire-and-forget)
    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        dbgLog('User logged in, tracking Ollama config in cloud (async)');
        window.CloudService.trackOllamaConfig(true, config)
          .then(() => dbgLog('Ollama config tracked successfully in cloud'))
          .catch(trackError => dbgWarn('Error tracking Ollama config in cloud (non-critical):', trackError));
      } else {
        dbgLog('User not logged in or CloudService not available, skipping cloud tracking');
      }
    }).catch(err => dbgWarn('Error checking login status for cloud tracking:', err));
  } catch (error) {
    dbgWarn('Error saving Ollama settings:', error);
    showOllamaStatus('❌ Failed to save settings', 'error');
  }
}

async function refreshOllamaModels() {
  const urlInput = document.getElementById('ollama-url');
  const refreshButton = document.getElementById('refresh-models-btn');
  const url = urlInput.value.trim();
  
  if (!url) {
    showOllamaStatus('❌ Please enter a valid URL first', 'error');
    return;
  }
  
  // Show loading state
  refreshButton.disabled = true;
  refreshButton.style.animation = 'spin 1s linear infinite';
  showOllamaStatus('🔄 Fetching available models...', 'info');
  
  try {
    // Dynamically import OllamaService
    const { OllamaService } = await import(chrome.runtime.getURL('services/ollama-service.js'));
    
    const modelsResult = await OllamaService.getAvailableModels(url);
    
    if (modelsResult.isCorsError) {
      showCorsInstructions();
    } else if (modelsResult.models.length > 0) {
      updateModelSelect(modelsResult.models);
      showOllamaStatus(`✅ Found ${modelsResult.models.length} model(s)`, 'success');
    } else {
      showOllamaStatus('⚠️ No models found. Pull a model first: ollama pull codellama', 'error');
    }
  } catch (error) {
    dbgWarn('Error refreshing models:', error);
    showOllamaStatus(`❌ Failed to fetch models: ${error.message}`, 'error');
  } finally {
    // Reset button state
    refreshButton.disabled = false;
    refreshButton.style.animation = '';
  }
}

function updateModelSelect(models) {
  const modelSelect = document.getElementById('ollama-model');
  if (!modelSelect) return;
  
  const currentValue = modelSelect.value;
  
  // Clear existing options
  modelSelect.innerHTML = '';
  
  // Add models from Ollama
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model.name;
    option.textContent = model.name;
    modelSelect.appendChild(option);
  });
  
  // Restore previous selection if it exists
  if (currentValue && Array.from(modelSelect.options).some(opt => opt.value === currentValue)) {
    modelSelect.value = currentValue;
  }
  
  dbgLog('Updated model select with', models.length, 'models');
}

function showOllamaStatus(message, type = 'info') {
  const statusDiv = document.getElementById('ollama-status');
  if (!statusDiv) return;
  
  statusDiv.textContent = message;
  statusDiv.className = `ollama-status show ${type}`;
  
  // Auto-hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.classList.remove('show');
    }, 5000);
  }
}

function showCorsInstructions() {
  const statusDiv = document.getElementById('ollama-status');
  if (!statusDiv) return;
  
  const killCommand = 'killall ollama 2>/dev/null || true; killall Ollama 2>/dev/null || true; sleep 2';
  const killPsCommand = 'Stop-Process -Name ollama -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2';
  const startCommand = 'OLLAMA_ORIGINS="chrome-extension://*" ollama serve';
  const startPsCommand = '$env:OLLAMA_ORIGINS=\'chrome-extension://*\'; ollama serve';
  
  const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
    <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
  </svg>`;
  
  const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
  </svg>`;
  
  statusDiv.className = 'ollama-status show cors-error';
  statusDiv.innerHTML = `
    <div style="text-align: left;">
      <div style="font-weight: bold; margin-bottom: 10px; font-size: 14px;">🔒 CORS Error Detected</div>
      <div style="margin-bottom: 10px; font-size: 12px;">Ollama needs CORS enabled for browser extensions.</div>
      <div style="margin-bottom: 10px; font-size: 11px; line-height: 1.45; color: #64748b;">Run the commands below in <strong>Terminal</strong> (macOS/Linux) or <strong>PowerShell</strong> / <strong>Command Prompt</strong> (Windows) — not in the browser. On Windows, use <code style="font-size:10px;">taskkill</code> / <code style="font-size:10px;">$env:OLLAMA_ORIGINS=...</code> instead of <code style="font-size:10px;">killall</code>; see the setup guide.</div>
      
      <div style="font-weight: 600; margin-bottom: 4px; font-size: 12px;">1. Stop Ollama</div>
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">macOS / Linux</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <code style="flex: 1; background: #2a2a2a; padding: 6px 8px; border-radius: 4px; font-size: 10px; color: #00ff00; overflow-x: auto; white-space: nowrap;">${killCommand}</code>
        <button class="cors-copy-btn" data-command-type="kill" style="background: none; border: none; cursor: pointer; padding: 6px; color: #3b82f6; transition: all 0.3s ease-in-out; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Copy">
          ${copyIconSVG}
        </button>
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Windows (PowerShell)</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        <code style="flex: 1; background: #2a2a2a; padding: 6px 8px; border-radius: 4px; font-size: 10px; color: #00ff00; overflow-x: auto; white-space: nowrap;">${killPsCommand}</code>
        <button class="cors-copy-btn" data-command-type="kill-ps" style="background: none; border: none; cursor: pointer; padding: 6px; color: #3b82f6; transition: all 0.3s ease-in-out; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Copy">
          ${copyIconSVG}
        </button>
      </div>
      
      <div style="font-weight: 600; margin-bottom: 4px; font-size: 12px;">2. Start with CORS</div>
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">macOS / Linux</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <code style="flex: 1; background: #2a2a2a; padding: 6px 8px; border-radius: 4px; font-size: 10px; color: #00ff00; overflow-x: auto; white-space: nowrap;">${startCommand}</code>
        <button class="cors-copy-btn" data-command-type="start" style="background: none; border: none; cursor: pointer; padding: 6px; color: #3b82f6; transition: all 0.3s ease-in-out; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Copy">
          ${copyIconSVG}
        </button>
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Windows (PowerShell)</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <code style="flex: 1; background: #2a2a2a; padding: 6px 8px; border-radius: 4px; font-size: 10px; color: #00ff00; overflow-x: auto; white-space: nowrap;">${startPsCommand}</code>
        <button class="cors-copy-btn" data-command-type="start-ps" style="background: none; border: none; cursor: pointer; padding: 6px; color: #3b82f6; transition: all 0.3s ease-in-out; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Copy">
          ${copyIconSVG}
        </button>
      </div>
      
      <div style="margin-top: 6px; font-size: 11px; line-height: 1.45; color: #64748b;">
        <strong>Firefox browser:</strong> replace <code style="font-size:10px;">chrome-extension://*</code> with <code style="font-size:10px;">moz-extension://*</code> in the commands above.
      </div>
      <div style="margin-top: 8px; padding: 8px; background: #f0f9ff; border-left: 3px solid #0ea5e9; font-size: 10px; color: #0c4a6e; border-radius: 2px;">
        💡 <strong>Command Prompt:</strong> use <code style="background: #e0f2fe; padding: 2px 4px; border-radius: 2px;">taskkill</code> / <code style="background: #e0f2fe; padding: 2px 4px; border-radius: 2px;">set OLLAMA_ORIGINS=...</code> — see <a href="https://github.com/Thinkode/thinkreview-browser-extension/blob/main/OLLAMA_SETUP.md" target="_blank" style="color: #0ea5e9; text-decoration: underline;">OLLAMA_SETUP.md</a> for CMD steps and making <code style="background: #e0f2fe; padding: 2px 4px; border-radius: 2px;">OLLAMA_ORIGINS</code> permanent.
      </div>
    </div>
  `;
  
  // Set the data-command attribute after innerHTML is set (avoids HTML escaping issues)
  const copyButtons = statusDiv.querySelectorAll('.cors-copy-btn');
  const commandByType = {
    kill: killCommand,
    'kill-ps': killPsCommand,
    start: startCommand,
    'start-ps': startPsCommand
  };

  copyButtons.forEach(button => {
    const commandType = button.getAttribute('data-command-type');
    const command = commandByType[commandType];
    if (command == null) return;
    // Use setAttribute to properly set the attribute value without HTML escaping issues
    button.setAttribute('data-command', command);
    
    // Hover effects
    button.addEventListener('mouseenter', () => {
      button.style.color = '#2563eb';
      button.style.transform = 'scale(1.1)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.color = '#3b82f6';
      button.style.transform = 'scale(1)';
    });
    
    // Click handler
    button.addEventListener('click', () => {
      // getAttribute automatically decodes HTML entities, but since we set it via setAttribute,
      // it should already be the correct value
      const command = button.getAttribute('data-command');
      
      navigator.clipboard.writeText(command).then(() => {
        // Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
        
        // Change icon to checkmark
        button.innerHTML = checkIconSVG;
        button.style.color = '#22c55e';
        button.style.transform = 'scale(1.2)';
        
        setTimeout(() => {
          button.style.transform = 'scale(1)';
        }, 100);
        
        // Revert back after 1.5 seconds
        setTimeout(() => {
          button.innerHTML = copyIconSVG;
          button.style.color = '#3b82f6';
        }, 1500);
        
        // Show toast notification
        const toast = document.createElement('div');
        toast.textContent = '✅ Copied to clipboard!';
        toast.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #22c55e; color: white; padding: 12px 20px; border-radius: 6px; font-weight: 500; z-index: 10000; box-shadow: 0 4px 6px rgba(0,0,0,0.1); animation: slideInRight 0.3s ease-out;';
        document.body.appendChild(toast);
        
        setTimeout(() => {
          toast.style.transition = 'opacity 0.3s ease-out';
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }, 1500);
      }).catch(err => {
        dbgWarn('Copy failed:', err);
        
        // Show error state
        button.style.color = '#ef4444';
        setTimeout(() => {
          button.style.color = '#3b82f6';
        }, 1500);
      });
    });
  });
}

// Add CSS animation for spinner
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// =====================================================================
// PLATFORM NAVIGATION
// =====================================================================

const PLATFORM_IDS = ['github', 'gitlab', 'azure', 'bitbucket', 'bitbucket-dc'];

// Card definitions: id → { platform view to open, optional scroll target id }
const PLATFORM_CARDS = [
  { cardId: 'card-github-com',          platform: 'github',        scrollTarget: null },
  { cardId: 'card-github-enterprise',   platform: 'github',        scrollTarget: 'github-enterprise-subsection' },
  { cardId: 'card-gitlab-com',          platform: 'gitlab',        scrollTarget: null },
  { cardId: 'card-gitlab-self-managed', platform: 'gitlab',        scrollTarget: 'gitlab-self-managed-subsection' },
  { cardId: 'card-azure-cloud',         platform: 'azure',         scrollTarget: null },
  { cardId: 'card-azure-server',        platform: 'azure',         scrollTarget: 'azure-server-subsection' },
  { cardId: 'card-bitbucket',           platform: 'bitbucket',     scrollTarget: null },
  { cardId: 'card-bitbucket-dc',        platform: 'bitbucket-dc',  scrollTarget: null },
];

function initializePlatformNavigation() {
  // Platform card click → show detail view, optionally scroll to subsection
  PLATFORM_CARDS.forEach(({ cardId, platform, scrollTarget }) => {
    const card = document.getElementById(cardId);
    if (card) {
      card.addEventListener('click', () => showPlatformView(platform, scrollTarget));
    }
  });

  // Back buttons → return to platform home
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => showPlatformHome());
  });

  // Compute and render status badges on load
  computePlatformStatuses();
}

function showPlatformHome() {
  const home = document.getElementById('platform-home');
  if (home) {
    home.style.display = 'block';
    home.classList.remove('platform-home-returning');
    void home.offsetWidth; // force reflow to restart animation
    home.classList.add('platform-home-returning');
  }
  PLATFORM_IDS.forEach(platform => {
    const view = document.getElementById(`platform-view-${platform}`);
    if (view) view.style.display = 'none';
  });
  // Refresh badges when returning home
  computePlatformStatuses();
}

function showPlatformView(platform, scrollTarget = null) {
  const home = document.getElementById('platform-home');
  if (home) home.style.display = 'none';

  PLATFORM_IDS.forEach(p => {
    const view = document.getElementById(`platform-view-${p}`);
    if (view) {
      if (p === platform) {
        view.style.display = 'block';
        // Restart animation
        view.style.animation = 'none';
        void view.offsetWidth;
        view.style.animation = '';
        // Scroll to subsection if specified
        if (scrollTarget) {
          requestAnimationFrame(() => {
            const target = document.getElementById(scrollTarget);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
      } else {
        view.style.display = 'none';
      }
    }
  });
}

async function computePlatformStatuses() {
  try {
    const result = await chrome.storage.local.get([
      'azureToken',
      'customDomains',                  // GitLab custom domains
      'azureCustomDomains',             // Azure on-prem domains
      'githubEnterpriseDomains',
      'bitbucketToken',
      'bitbucketEmail',
      'bitbucketEnabled',
      'bitbucketDataCenterDomains',
      'bitbucketDataCenterToken',
    ]);

    // Cloud variants: always ready, no setup required
    setBadge('github-com',  'ready');
    setBadge('gitlab-com',  'ready');
    setBadge('azure-cloud', 'ready');

    // GitHub Enterprise Server: ready once at least one domain is saved
    const ghesdomains = result.githubEnterpriseDomains;
    const ghesReady = Array.isArray(ghesdomains) && ghesdomains.length > 0;
    setBadge('github-enterprise', ghesReady ? 'ready' : 'setup');

    // GitLab Self-Managed: ready once at least one custom domain is saved
    const gitlabDomains = result.customDomains;
    const gitlabSMReady = Array.isArray(gitlabDomains) && gitlabDomains.length > 0;
    setBadge('gitlab-self-managed', gitlabSMReady ? 'ready' : 'setup');

    // Azure DevOps Server: ready once at least one custom domain is saved
    const azureDomains = result.azureCustomDomains;
    const azureServerReady = Array.isArray(azureDomains) && azureDomains.length > 0;
    setBadge('azure-server', azureServerReady ? 'ready' : 'setup');

    // Bitbucket Cloud: requires explicit permission grant + token
    const bitbucketConfigured = result.bitbucketEnabled &&
      (result.bitbucketToken || result.bitbucketEmail);
    setBadge('bitbucket', bitbucketConfigured ? 'ready' : 'setup');

    // Bitbucket Data Center: ready when at least one domain is saved with a token
    const dcDomains = result.bitbucketDataCenterDomains;
    const dcReady = Array.isArray(dcDomains) && dcDomains.length > 0 &&
      result.bitbucketDataCenterToken && String(result.bitbucketDataCenterToken).trim();
    setBadge('bitbucket-dc', dcReady ? 'ready' : 'setup');
  } catch (err) {
    dbgWarn('Error computing platform statuses:', err);
  }
}

function setBadge(platform, status) {
  const badge = document.getElementById(`badge-${platform}`);
  if (!badge) return;
  if (status === 'ready') {
    badge.textContent = '✓ Ready';
    badge.className = 'platform-badge platform-badge-ready';
  } else {
    badge.textContent = '⚙ Setup needed';
    badge.className = 'platform-badge platform-badge-setup';
  }
}

// =====================================================================
// COLLAPSIBLE AI PROVIDER SECTION
// =====================================================================

function initializeAIProviderCollapsible() {
  const toggle = document.getElementById('ai-provider-toggle');
  const body = document.getElementById('ai-provider-body');
  if (!toggle || !body) return;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    body.style.display = expanded ? 'none' : 'block';
  });
}
