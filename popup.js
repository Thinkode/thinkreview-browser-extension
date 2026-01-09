// popup.js
// Shows patch status and recent patches

// Import modules for better modularity
import { subscriptionStatus } from './components/popup-modules/subscription-status.js';
import { reviewCount } from './components/popup-modules/review-count.js';

// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[popup]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[popup]', ...args); }

// State management
let isInitialized = false;
let cloudServiceReady = false;
let pendingUserDataFetch = false; // Track if we need to fetch user data when CloudService becomes ready

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle review count refresh messages
  if (message.type === 'REVIEW_COUNT_UPDATED') {
    dbgLog('[popup] Received review count update:', message.count);
    updateReviewCount(message.count);
  }
  
  // Handle webapp auth sync - refresh popup when webapp login is detected
  if (message.type === 'WEBAPP_AUTH_SYNCED') {
    dbgLog('[popup] Received webapp auth sync notification, refreshing popup');
    // Refresh the UI reactively without full page reload
    (async () => {
      await updateUIForLoginStatus();
      // Force refresh user data to get latest info
      await forceRefreshUserData();

      // Dispatch custom event for reactive updates instead of reload
      window.dispatchEvent(new CustomEvent('thinkreview-auth-synced', {
        detail: { user: message.user }
      }));
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
      dbgLog('[popup] Force refreshing user data');
      cloudServiceReady = true;
      await fetchAndDisplayUserData();
      showSuccessState('Ready to generate AI reviews');
      return true;
    }
    return false;
  } catch (error) {
    dbgWarn('[popup] Error in force refresh:', error);
    return false;
  }
}

// Function to update subscription status display
// Uses consolidated fields: subscriptionType (Professional, Teams, or Free) and currentPlanValidTo
async function updateSubscriptionStatus(subscriptionType, currentPlanValidTo, cancellationRequested, stripeCanceledDate) {
  await subscriptionStatus.updateStatus(subscriptionType, currentPlanValidTo, cancellationRequested, stripeCanceledDate);
  
  // Show or hide cancel button based on subscription type, plan validity, and cancellation status
  dbgLog(`[popup] Updating cancel button visibility for subscriptionType: '${subscriptionType}', currentPlanValidTo: '${currentPlanValidTo}', cancellationRequested: '${cancellationRequested}'`);
  const cancelContainer = document.getElementById('cancel-subscription-container');
  if (cancelContainer) {
    // Check if plan is free, expired, or already cancelled
    // subscriptionType is case-insensitive: 'Professional', 'Teams', or 'Free'
    const normalizedType = (subscriptionType || '').toLowerCase();
    const isFreePlan = normalizedType === 'free' || normalizedType.includes('free');
    // Use date utility to check if expired
    let isExpired = false;
    if (currentPlanValidTo) {
      try {
        const dateUtils = await import(chrome.runtime.getURL('utils/date-utils.js'));
        isExpired = dateUtils.isPast(currentPlanValidTo);
      } catch (error) {
        // Fallback to simple comparison if import fails
        dbgWarn('[popup] Error importing date utils, using fallback:', error);
        isExpired = new Date(currentPlanValidTo) < new Date();
      }
    }
    const isCancelled = cancellationRequested === true;
    
    if (!isFreePlan && !isExpired && !isCancelled) {
      cancelContainer.style.display = 'block';
    } else {
      cancelContainer.style.display = 'none';
    }
  }
}

// Function to check if user is logged in with better error handling
function isUserLoggedIn() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user', 'userData'], (result) => {
      if (chrome.runtime.lastError) {
        dbgWarn('[popup] Error accessing storage:', chrome.runtime.lastError);
        resolve(false);
        return;
      }
      
      // Debug: Log the user data to see what fields are available
      dbgLog('[popup] User data from storage:', result);
      
      // Check both user and userData fields for backward compatibility
      // Supports both extension OAuth and webapp Firebase auth
      if (result.userData && result.userData.email) {
        dbgLog('[popup] Using userData object, auth source:', result.authSource || 'extension');
        resolve(true);
      } else if (result.user) {
        try {
          // Try to parse the user data to ensure it's valid
          const userData = JSON.parse(result.user);
          dbgLog('[popup] Using parsed user object:', userData);
          resolve(!!userData && !!userData.email);
        } catch (e) {
          dbgWarn('[popup] Failed to parse user data:', e);
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
        dbgLog(`[popup] CloudService not available, retrying in ${backoffTime/1000}s (attempt ${retryCount + 1}/${maxRetries})`);
        setTimeout(() => fetchAndDisplayUserData(retryCount + 1), backoffTime);
        return;
      } else {
        dbgWarn('[popup] CloudService not available after retries');
              showErrorState('Unable to load user data');
      updateReviewCount('error');
      await updateSubscriptionStatus('Free', null, false, null);
        return;
      }
    }
    
    // Double-check that CloudService is actually ready
    if (!cloudServiceReady) {
      cloudServiceReady = true; // Mark as ready since we have the service
      dbgLog('[popup] CloudService detected as ready during fetch');
    }
    const userData = await window.CloudService.getUserDataWithSubscription();
    updateReviewCount(userData.reviewCount);
    // Use consolidated fields: subscriptionType and cancellationRequested
    const subscriptionType = userData.subscriptionType || userData.stripeSubscriptionType || 'Free';
    const cancellationRequested = userData.cancellationRequested || false;
    await updateSubscriptionStatus(subscriptionType, userData.currentPlanValidTo, cancellationRequested, userData.stripeCanceledDate);
    dbgLog('[popup] User data updated:', userData);
    
    // Show success state if we got valid data
    if (userData.reviewCount !== null && userData.reviewCount !== undefined) {
      // showSuccessState('User data loaded successfully');
    }
  } catch (error) {
    dbgWarn('[popup] Error fetching user data:', error);
    if (retryCount < maxRetries) {
      // Use exponential backoff for retries (1s, 2s, 4s)
      const backoffTime = Math.pow(2, retryCount) * 500;
      dbgLog(`[popup] Retrying user data fetch in ${backoffTime/1000}s (attempt ${retryCount + 1}/${maxRetries})`);
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
    
    dbgLog('[popup] updateUIForLoginStatus - isLoggedIn:', isLoggedIn, 'cloudServiceReady:', cloudServiceReady, 'CloudService available:', !!window.CloudService);
    
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
      
      // Fetch review count if CloudService is ready
      if (cloudServiceReady && window.CloudService) {
        dbgLog('[popup] CloudService ready, fetching review count immediately');
        await fetchAndDisplayUserData();
        showSuccessState('Ready to generate AI reviews');
        pendingUserDataFetch = false; // Clear pending flag
      } else {
        // Mark that we need to fetch review count when CloudService becomes ready
        pendingUserDataFetch = true;
        dbgLog('[popup] CloudService not ready yet, marking review count fetch as pending. cloudServiceReady:', cloudServiceReady, 'CloudService available:', !!window.CloudService);
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
        privacyPolicyText.style.display = 'block';
      }
      clearStatusState();
      pendingUserDataFetch = false; // Clear pending fetch
    }
  } catch (error) {
    dbgWarn('[popup] Error updating UI for login status:', error);
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
    dbgLog('[popup] Initializing popup...');
    
    // Update UI based on login status
    await updateUIForLoginStatus();
    
    // Update current status
    updateCurrentStatus();
    
    // Check if CloudService is already ready and we have a pending fetch
    if (cloudServiceReady && window.CloudService && pendingUserDataFetch) {
      dbgLog('[popup] CloudService already ready during initialization, processing pending fetch');
      pendingUserDataFetch = false;
      await fetchAndDisplayUserData();
      showSuccessState('Ready to generate AI reviews');
    }
    
    isInitialized = true;
    dbgLog('[popup] Popup initialized successfully');
  } catch (error) {
    dbgWarn('[popup] Error initializing popup:', error);
    showErrorState('Failed to initialize popup');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Check if CloudService is already available before initialization
  if (window.CloudService) {
    cloudServiceReady = true;
    dbgLog('[popup] CloudService already available on popup load');
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
  
  // Set up Azure DevOps settings
  initializeAzureSettings();
  
  // Check if we should auto-trigger sign-in (from content script)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('autoSignIn') === 'true') {
    dbgLog('[popup] Auto sign-in requested, triggering Google Sign-In');
    
    // Wait a bit for the google-signin component to be ready
    setTimeout(() => {
      const googleSignInElement = document.querySelector('google-signin');
      if (googleSignInElement) {
        // Check if user is already signed in
        const isLoggedIn = isUserLoggedIn();
        isLoggedIn.then(loggedIn => {
          if (!loggedIn) {
            dbgLog('[popup] User not logged in, triggering sign-in button click');
            // Find the sign-in button inside the shadow DOM and click it
            const signInButton = googleSignInElement.shadowRoot?.querySelector('#signin');
            if (signInButton) {
              signInButton.click();
              dbgLog('[popup] Sign-in button clicked automatically');
            } else {
              dbgWarn('[popup] Could not find sign-in button in shadow DOM');
            }
          } else {
            dbgLog('[popup] User already logged in, skipping auto sign-in');
          }
        });
      } else {
        dbgWarn('[popup] Could not find google-signin element for auto sign-in');
      }
    }, 500); // Wait for component to be fully loaded
  }
  
  // Subscription component will be initialized when it's loaded
  
  
  // Listen for popup visibility changes (when popup is reopened)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && isInitialized) {
      dbgLog('[popup] Popup became visible, checking if review count needs refresh');
      
      // Force check CloudService availability
      if (window.CloudService && !cloudServiceReady) {
        cloudServiceReady = true;
        dbgLog('[popup] CloudService detected on visibility change');
      }
      
      // Add a small delay to ensure everything is loaded
      setTimeout(async () => {
        const isLoggedIn = await isUserLoggedIn();
        
        // Double check CloudService again after the delay
        if (window.CloudService && !cloudServiceReady) {
          cloudServiceReady = true;
          dbgLog('[popup] CloudService detected after delay on visibility change');
        }
        
        if (isLoggedIn) {
          // Force refresh user data when popup is reopened
          dbgLog('[popup] Popup reopened - force refreshing user data');
          await forceRefreshUserData();
        }
      }, 100);
    }
  });
  
  // Listen for sign-in state changes with improved event handling
  // Note: After successful sign-in, the page will reload, so this mainly handles sign-out
  document.addEventListener('signInStateChanged', async (event) => {
    dbgLog('[popup] Sign-in state changed:', event.detail);
    
    // Handle both camelCase and snake_case event details
    const isSignedIn = event.detail.signed_in || event.detail.signedIn;
    
    if (isSignedIn) {
      // User signed in - page will reload automatically after sign-in
      // This code path is for any edge cases where reload doesn't happen
      dbgLog('[popup] User signed in, refreshing UI');
      await updateUIForLoginStatus();
      
      // If CloudService is already ready, fetch review count immediately
      if (cloudServiceReady && window.CloudService) {
        dbgLog('[popup] CloudService ready, fetching review count immediately after sign-in');
        await fetchAndDisplayUserData();
        showSuccessState('Ready to generate AI reviews');
        pendingUserDataFetch = false;
      } else {
        // Mark that we need to fetch review count when CloudService becomes ready
        pendingUserDataFetch = true;
        dbgLog('[popup] CloudService not ready, marking review count fetch as pending after sign-in');
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
        privacyPolicyText.style.display = 'block';
      }
      clearStatusState();
      pendingUserDataFetch = false; // Clear pending fetch
    }
  });
  
  // Listen for sign-in errors
  document.addEventListener('signin-error', (event) => {
    dbgWarn('[popup] Sign-in error:', event.detail);
    showErrorState('Sign-in failed. Please try again.');
  });
  
  // Listen for sign-out errors
  document.addEventListener('signout-error', (event) => {
    dbgWarn('[popup] Sign-out error:', event.detail);
    showErrorState('Sign-out failed. Please try again.');
  });
  
  // Listen for CloudService ready event
  window.addEventListener('cloud-service-ready', async (event) => {
    dbgLog('[popup] CloudService ready event received');
    cloudServiceReady = true;
    
    // Check if user is logged in and fetch review count
    const isLoggedIn = await isUserLoggedIn();
    dbgLog('[popup] CloudService ready - isLoggedIn:', isLoggedIn, 'pendingUserDataFetch:', pendingUserDataFetch);
    
    if (isLoggedIn) {
      // If we have a pending review count fetch, handle it now
      if (pendingUserDataFetch) {
        dbgLog('[popup] Processing pending review count fetch');
        pendingUserDataFetch = false;
        await fetchAndDisplayUserData();
        showSuccessState('Ready to generate AI reviews');
      } else {
        // Otherwise, just fetch the review count normally
        dbgLog('[popup] No pending fetch, fetching review count normally');
        await fetchAndDisplayUserData();
      }
    }
  });
  
  // Listen for module loading errors
  window.addEventListener('modules-error', (event) => {
    dbgWarn('[popup] Module loading error:', event.detail);
    showErrorState('Failed to load extension modules');
  });
  
  // Set up the How it works button
  const howItWorksBtn = document.getElementById('how-it-works-btn');
  if (howItWorksBtn) {
    howItWorksBtn.addEventListener('click', () => {
      // Open the onboarding page in a new tab
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    });
  }
  
  // Set up the Need Help button
  const needHelpBtn = document.getElementById('need-help-btn');
  if (needHelpBtn) {
    needHelpBtn.addEventListener('click', () => {
      // Open the contact page in a new tab
      chrome.tabs.create({ url: 'https://thinkreview.dev/contact' });
    });
  }
  
  // Set up the Report a Bug button
  const reportBugBtn = document.getElementById('report-bug-btn');
  if (reportBugBtn) {
    reportBugBtn.addEventListener('click', () => {
      // Open the bug report page in a new tab
      chrome.tabs.create({ url: 'https://thinkreview.dev/bug-report' });
    });
  }
  
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
  
  // Initialize AI Provider settings
  initializeAIProviderSettings();
});

// Domain Management Functionality
const DEFAULT_DOMAINS = ['https://gitlab.com'];

function initializeDomainSettings() {
  loadDomains();
  setupDomainEventListeners();
}

function setupDomainEventListeners() {
  const addButton = document.getElementById('add-domain-btn');
  const domainInput = document.getElementById('domain-input');
  
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
  
  if (domains.length === 0) {
    domainList.innerHTML = '<div class="no-domains">No custom domains added</div>';
    return;
  }
  
  domainList.innerHTML = domains.map(domain => {
    const isDefault = DEFAULT_DOMAINS.includes(domain);
    const displayDomain = formatDomainForDisplay(domain);
    return `
      <div class="domain-item ${isDefault ? 'default' : ''}">
        <span class="domain-name">${displayDomain}</span>
        <div>
          ${isDefault ? '<span class="default-label">DEFAULT</span>' : ''}
          ${!isDefault ? `<button class="remove-domain-btn" data-domain="${domain}">Remove</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners to remove buttons
  domainList.querySelectorAll('.remove-domain-btn').forEach(button => {
    button.addEventListener('click', () => removeDomain(button.dataset.domain));
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
    
    // Show loading state
    const addButton = document.getElementById('add-domain-btn');
    const originalButtonText = addButton.textContent;
    addButton.textContent = 'Adding...';
    addButton.disabled = true;
    
    // Get current domains
    const result = await chrome.storage.local.get(['gitlabDomains']);
    const domains = result.gitlabDomains || DEFAULT_DOMAINS;
    
    if (domains.includes(domain)) {
      alert('Domain already exists');
      addButton.textContent = originalButtonText;
      addButton.disabled = false;
      return;
    }
    
    // Create origin pattern for permission request
    let originPattern;
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      const url = new URL(domain);
      originPattern = `${url.protocol}//${url.host}/*`;
    } else {
      originPattern = `https://${domain}/*`;
    }
    
    dbgLog(`[popup] Adding domain with pattern: ${originPattern}`);
    
    // Request permission for this domain
    const granted = await chrome.permissions.request({
      origins: [originPattern]
    });
    
    if (!granted) {
      alert('Permission not granted. The extension needs permission to access this domain.');
      addButton.textContent = originalButtonText;
      addButton.disabled = false;
      return;
    }
    
    // Add the domain to storage
    const updatedDomains = [...domains, domain];
    await chrome.storage.local.set({ gitlabDomains: updatedDomains });
    
    // Track custom domain in cloud asynchronously (fire-and-forget)
    // This runs in the background without blocking the domain addition
    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        dbgLog('[popup] User logged in, tracking custom domain in cloud (async)');
        window.CloudService.trackCustomDomains(domain, 'add')
          .then(() => dbgLog('[popup] Custom domain tracked successfully in cloud'))
          .catch(trackError => dbgWarn('[popup] Error tracking custom domain in cloud (non-critical):', trackError));
      } else {
        dbgLog('[popup] User not logged in or CloudService not available, skipping cloud tracking');
      }
    }).catch(err => dbgWarn('[popup] Error checking login status for cloud tracking:', err));
    
    // Explicitly trigger content script update via message to background
    chrome.runtime.sendMessage({ 
      type: 'UPDATE_CONTENT_SCRIPTS',
      domains: updatedDomains 
    });
    
    dbgLog('[popup] Domain added successfully:', domain);
    domainInput.value = '';
    addButton.textContent = originalButtonText;
    addButton.disabled = true;
    
    renderDomainList(updatedDomains);
    
    // Show success message
    showMessage('Domain added successfully! You may need to reload GitLab pages for changes to take effect.', 'success');
    
  } catch (error) {
    dbgWarn('[popup] Error adding domain:', error);
    alert(`Error adding domain: ${error.message}. Please try again.`);
    document.getElementById('add-domain-btn').textContent = 'Add';
    document.getElementById('add-domain-btn').disabled = false;
  } finally {
    // Reset flag to allow future calls
    isAddingDomain = false;
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
        dbgLog('[popup] User logged in, tracking custom domain removal in cloud (async)');
        window.CloudService.trackCustomDomains(domain, 'remove')
          .then(() => dbgLog('[popup] Custom domain removal tracked successfully in cloud'))
          .catch(trackError => dbgWarn('[popup] Error tracking custom domain removal in cloud (non-critical):', trackError));
      } else {
        dbgLog('[popup] User not logged in or CloudService not available, skipping cloud tracking');
      }
    }).catch(err => dbgWarn('[popup] Error checking login status for cloud tracking:', err));
    
    dbgLog('Domain removed:', domain);
    renderDomainList(updatedDomains);
    
    showMessage('Domain removed successfully!', 'success');
    
  } catch (error) {
    dbgWarn('Error removing domain:', error);
    alert('Error removing domain. Please try again.');
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
  
  // Input validation
  tokenInput.addEventListener('input', () => {
    const isValid = validateTokenInput(tokenInput.value.trim());
    saveButton.disabled = !isValid;
  });
}

function validateTokenInput(token) {
  if (!token) return false;
  
  // Azure DevOps PATs are typically base64 encoded strings
  // They usually start with a specific pattern and are 52 characters long
  // But we'll be more lenient and just check for reasonable length and characters
  const tokenRegex = /^[A-Za-z0-9+/=_-]{20,}$/;
  return tokenRegex.test(token);
}

async function loadAzureToken() {
  try {
    const result = await chrome.storage.local.get(['azureDevOpsToken']);
    const token = result.azureDevOpsToken;
    
    if (token) {
      // Show that token is saved (but don't display the actual token)
      updateTokenStatus('Token saved successfully', 'success');
      
      // Pre-fill the input with masked token for user reference
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
  
  if (!validateTokenInput(token)) {
    updateTokenStatus('Please enter a valid Azure DevOps Personal Access Token', 'error');
    return;
  }
  
  try {
    // Show loading state
    const originalButtonText = saveButton.textContent;
    saveButton.textContent = 'Saving...';
    saveButton.disabled = true;
    
    // Save token to storage
    await chrome.storage.local.set({ azureDevOpsToken: token });
    
    // Update UI
    updateTokenStatus('Token saved successfully', 'success');
    
    // Mask the token in the input field
    tokenInput.value = '••••••••••••••••••••••••••••••••••••••••••••••••••';
    tokenInput.type = 'password';
    
    // Reset button
    saveButton.textContent = originalButtonText;
    saveButton.disabled = true;
    
    dbgLog('Azure DevOps token saved successfully');
    
  } catch (error) {
    dbgWarn('Error saving Azure token:', error);
    updateTokenStatus('Error saving token. Please try again.', 'error');
    
    // Reset button
    saveButton.textContent = 'Save Token';
    saveButton.disabled = false;
  }
}

function updateTokenStatus(message, type) {
  const statusDiv = document.getElementById('token-status');
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = `token-status ${type}`;
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
      model: 'qwen3-coder:30b'
    };
    
    // Set the selected provider
    const providerRadio = document.getElementById(`provider-${provider}`);
    if (providerRadio) {
      providerRadio.checked = true;
    }
    
    // Show/hide Ollama config based on provider
    const ollamaConfig = document.getElementById('ollama-config');
    if (ollamaConfig) {
      ollamaConfig.style.display = provider === 'ollama' ? 'block' : 'none';
    }
    
    // Load Ollama config values
    const urlInput = document.getElementById('ollama-url');
    const modelSelect = document.getElementById('ollama-model');
    
    if (urlInput) urlInput.value = config.url;
    
    // If Ollama is the selected provider, fetch available models
    if (provider === 'ollama') {
      dbgLog('[popup] Ollama is selected provider, fetching available models...');
      await fetchAndPopulateModels(config.url, config.model);
    } else if (modelSelect) {
      // If not Ollama, just set the saved model value
      modelSelect.value = config.model;
    }
    
    dbgLog('[popup] AI Provider settings loaded:', { provider, config });
  } catch (error) {
    dbgWarn('[popup] Error loading AI Provider settings:', error);
  }
}

function handleProviderChange(event) {
  const provider = event.target.value;
  const ollamaConfig = document.getElementById('ollama-config');
  
  if (ollamaConfig) {
    ollamaConfig.style.display = provider === 'ollama' ? 'block' : 'none';
  }
  
  // Auto-save provider selection
  chrome.storage.local.set({ aiProvider: provider }, () => {
    dbgLog('[popup] AI Provider changed to:', provider);
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
      
      dbgLog('[popup] Ollama selected, fetching available models...');
      fetchAndPopulateModels(url).catch(err => {
        dbgWarn('[popup] Error auto-fetching models (non-critical):', err);
      });
    }
    
    // Track provider change in cloud asynchronously (fire-and-forget)
    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        dbgLog('[popup] User logged in, tracking AI provider change in cloud (async)');
        // If switching to cloud, track Ollama as disabled
        if (provider === 'cloud') {
          window.CloudService.trackOllamaConfig(false, null)
            .then(() => dbgLog('[popup] Ollama disabled tracked successfully in cloud'))
            .catch(trackError => dbgWarn('[popup] Error tracking provider change in cloud (non-critical):', trackError));
        }
        // If switching to Ollama, it will be tracked when user saves the config
      } else {
        dbgLog('[popup] User not logged in or CloudService not available, skipping cloud tracking');
      }
    }).catch(err => dbgWarn('[popup] Error checking login status for cloud tracking:', err));
  });
}

async function fetchAndPopulateModels(url, savedModel = null) {
  if (!url) {
    dbgWarn('[popup] No URL provided for fetching models');
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
      dbgLog('[popup] Successfully loaded', modelsResult.models.length, 'models from Ollama');
    } else {
      modelSelect.innerHTML = '<option value="">⚠️ No models installed</option>';
      showOllamaStatus('⚠️ No models found. Install one with: ollama pull qwen3-coder:30b', 'error');
    }
  } catch (error) {
    dbgWarn('[popup] Error fetching models:', error);
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
        dbgWarn('[popup] Error fetching models:', modelsError);
        // Connection works but couldn't fetch models - still success
      }
    } else if (connectionResult.isCorsError) {
      showCorsInstructions();
    } else {
      showOllamaStatus('❌ Cannot connect to Ollama. Make sure it\'s running.', 'error');
    }
  } catch (error) {
    dbgWarn('[popup] Error testing Ollama connection:', error);
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
  
  try {
    const config = { url, model };
    
    await chrome.storage.local.set({ ollamaConfig: config });
    
    dbgLog('[popup] Ollama settings saved:', config);
    showOllamaStatus('✅ Settings saved successfully!', 'success');
    
    // Track Ollama configuration in cloud asynchronously (fire-and-forget)
    isUserLoggedIn().then(isLoggedIn => {
      if (isLoggedIn && window.CloudService) {
        dbgLog('[popup] User logged in, tracking Ollama config in cloud (async)');
        window.CloudService.trackOllamaConfig(true, config)
          .then(() => dbgLog('[popup] Ollama config tracked successfully in cloud'))
          .catch(trackError => dbgWarn('[popup] Error tracking Ollama config in cloud (non-critical):', trackError));
      } else {
        dbgLog('[popup] User not logged in or CloudService not available, skipping cloud tracking');
      }
    }).catch(err => dbgWarn('[popup] Error checking login status for cloud tracking:', err));
  } catch (error) {
    dbgWarn('[popup] Error saving Ollama settings:', error);
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
    dbgWarn('[popup] Error refreshing models:', error);
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
  
  dbgLog('[popup] Updated model select with', models.length, 'models');
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
  const startCommand = 'OLLAMA_ORIGINS="chrome-extension://*" ollama serve';
  
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
      
      <div style="font-weight: 600; margin-bottom: 6px; font-size: 12px;">1. Stop Ollama</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        <code style="flex: 1; background: #2a2a2a; padding: 6px 8px; border-radius: 4px; font-size: 10px; color: #00ff00; overflow-x: auto; white-space: nowrap;">${killCommand}</code>
        <button class="cors-copy-btn" data-command-type="kill" style="background: none; border: none; cursor: pointer; padding: 6px; color: #3b82f6; transition: all 0.3s ease-in-out; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Copy">
          ${copyIconSVG}
        </button>
      </div>
      
      <div style="font-weight: 600; margin-bottom: 6px; font-size: 12px;">2. Start with CORS</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <code style="flex: 1; background: #2a2a2a; padding: 6px 8px; border-radius: 4px; font-size: 10px; color: #00ff00; overflow-x: auto; white-space: nowrap;">${startCommand}</code>
        <button class="cors-copy-btn" data-command-type="start" style="background: none; border: none; cursor: pointer; padding: 6px; color: #3b82f6; transition: all 0.3s ease-in-out; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Copy">
          ${copyIconSVG}
        </button>
      </div>
      
      <div style="margin-top: 8px; padding: 8px; background: #f0f9ff; border-left: 3px solid #0ea5e9; font-size: 10px; color: #0c4a6e; border-radius: 2px;">
        💡 You can make it permanent by exporting <code style="background: #e0f2fe; padding: 2px 4px; border-radius: 2px;">OLLAMA_ORIGINS</code> in your bash/zsh profile. <a href="https://github.com/Thinkode/thinkreview-browser-extension/blob/main/OLLAMA_SETUP.md" target="_blank" style="color: #0ea5e9; text-decoration: underline;">Visit the full setup guide</a> for details.
      </div>
    </div>
  `;
  
  // Set the data-command attribute after innerHTML is set (avoids HTML escaping issues)
  const copyButtons = statusDiv.querySelectorAll('.cors-copy-btn');
  copyButtons.forEach(button => {
    const commandType = button.getAttribute('data-command-type');
    const command = commandType === 'kill' ? killCommand : startCommand;
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
        console.warn('Copy failed:', err);
        
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
