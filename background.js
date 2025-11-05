// background.js
// Handles patch storage, downloads, and communication with content/popup

// Import CloudService statically since dynamic imports aren't allowed in service workers
import { CloudService } from './services/cloud-service.js';
// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[background]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[background]', ...args); }

// Set uninstall URL to redirect users to feedback page
chrome.runtime.setUninstallURL('https://thinkreview.dev/goodbye.html', () => {
  console.log('[GitLab MR Reviews][BG] Uninstall URL set successfully');
});

// OAuth constants
const AUTH_TOKEN_KEY = 'oauth_token';
const AUTH_USER_KEY = 'oauth_user';

// Helper function to fetch user info from Google
async function fetchUserInfo(token) {
  try {
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info');
    }
    
    return await userInfoResponse.json();
  } catch (error) {
    dbgWarn('Error fetching user info:', error);
    throw error;
  }
}

// Listen for web navigation events to detect Stripe checkout success
chrome.webNavigation.onCompleted.addListener((details) => {
  // Check if this is a Stripe checkout success URL
  const url = new URL(details.url);
  
  if (url.hostname === 'checkout.stripe.com' && url.pathname === '/success') {
    dbgLog('Detected Stripe checkout success navigation:', details.url);
    
    // Extract session ID and extension ID from URL parameters
    const params = new URLSearchParams(url.search);
    const sessionId = params.get('session_id');
    const extensionId = params.get('extension_id');
    
    if (sessionId && extensionId === chrome.runtime.id) {
      dbgLog('Valid Stripe success with session ID:', sessionId);
      
      // Update subscription status in local storage
      chrome.storage.local.set({
        'subscription': {
          status: 'active',
          sessionId: sessionId,
          timestamp: Date.now()
        }
      }, () => {
        dbgLog('Updated subscription status in local storage');
        
        // Open the success page in a new tab
        const successUrl = chrome.runtime.getURL(`success.html?session_id=${sessionId}`);
        chrome.tabs.create({ url: successUrl });
        
        // Close the Stripe checkout tab after a short delay
        setTimeout(() => {
          chrome.tabs.remove(details.tabId);
        }, 1000);
      });
    }
  }
}, {
  url: [{ hostEquals: 'checkout.stripe.com', pathEquals: '/success' }]
});
/**
 * Handles Google Sign-In flow
 * @returns {Promise<Object>} User data from Google Sign-In
 */
async function handleGoogleSignIn() {
  try {
    // Request an OAuth token from the Chrome Identity API
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
    
    if (!token) {
      throw new Error('Failed to get auth token');
    }
    
    // Use the token to get user info from Google
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }
    
    const userData = await response.json();
    
    // Sync user data with our backend using CloudService
    const syncedUser = await CloudService.syncUserData(userData);
    
    // Notify any listeners that sign-in is complete
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // Send message to content script
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GOOGLE_SIGNIN_COMPLETE', user: syncedUser });
        
        // Also execute a script to post a message to the window for the event listener in content.js
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (userData) => {
            window.postMessage({ type: 'GOOGLE_SIGNIN_COMPLETE', user: userData }, '*');
          },
          args: [syncedUser]
        }).catch(err => console.log('Failed to execute script:', err));
      }
    });
    
    return syncedUser;
  } catch (error) {
    // console.error('Google Sign-In error:', error);
    throw error;
  }
}

// Listen for extension icon clicks to open full page
chrome.action.onClicked.addListener((tab) => {
  dbgLog('[GitLab MR Reviews][BG] Extension icon clicked, opening full page');
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // Handle OAuth code exchange
  if (message.type === 'exchangeCode') {
    handleExchangeCode(message, sendResponse);
    return true; // Async response
  }
  
  // Handle get user request
  if (message.type === 'getUser') {
    handleGetUser(sendResponse);
    return true; // Async response
  }
  
  // Handle logout
  if (message.type === 'logout') {
    handleLogout(sendResponse);
    return true; // Async response
  }
  
  if (message.type === 'STORE_PATCH') {
    const { patchUrl, patchContent } = message;
    chrome.storage.local.get({ patches: [] }, (data) => {
      let patches = data.patches || [];
      // Remove old if duplicate
      patches = patches.filter(p => p.patchUrl !== patchUrl);
      patches.unshift({ patchUrl, patchContent, timestamp: Date.now() });
      // Limit to 20 recent patches
      patches = patches.slice(0, 20);
      chrome.storage.local.set({ patches });
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.type === 'GET_PATCHES') {
    chrome.storage.local.get({ patches: [] }, (data) => {
      sendResponse({ patches: data.patches });
    });
    return true;
  }
  if (message.type === 'DOWNLOAD_PATCH') {
    const { patchContent, patchUrl } = message;
    const filename = patchUrl.split('/').pop().replace(/\?.*$/, '') + '.patch';
    const blob = new Blob([patchContent], { type: 'text/x-patch' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename }, () => {
      URL.revokeObjectURL(url);
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_AI_RESPONSE') {
    const { patchContent, conversationHistory, mrId, mrUrl, language } = message;
    (async () => {
      try {
        const data = await CloudService.getConversationalResponse(patchContent, conversationHistory, mrId, mrUrl, language || 'English');
        dbgLog('[GitLab MR Reviews][BG] Conversational response received:', data);
        sendResponse({ success: true, data: data });
      } catch (err) {
        // Log error details for debugging
        // if (err.isRateLimit) {
        //   console.warn('[GitLab MR Reviews][BG] Rate limit reached for conversational review:', {
        //     message: err.rateLimitMessage,
        //     retryAfter: err.retryAfter,
        //     minutes: Math.ceil((err.retryAfter || 900) / 60)
        //   });
        // } else {
        //   console.warn('[GitLab MR Reviews][BG] Conversational review fetch error:', err.message);
        // }
        
        // Pass rate limit error properties if available
        const errorResponse = {
          success: false,
          error: err.message,
          isRateLimit: err.isRateLimit || false,
          rateLimitMessage: err.rateLimitMessage || null,
          retryAfter: err.retryAfter || null
        };
        
        sendResponse(errorResponse);
      }
    })();
    return true; // Keep channel open for async response
  } 
  
  // Handle code review request from content script to avoid CSP issues
  if (message.type === 'REVIEW_PATCH_CODE') {
    const { patchContent, mrId, mrUrl, language, platform, forceRegenerate } = message;
    const REVIEW_CODE_URL_V1_1 = 'https://us-central1-thinkgpt.cloudfunctions.net/reviewPatchCode_1_1';
    
    (async () => {
      try {
        // Validate patchContent before sending
        if (!patchContent || patchContent.trim().length === 0) {
          throw new Error('There are no code changes yet in this merge request. If you think this is a bug, please report it here: https://thinkreview.dev/bug-report');
        }

        // Get user email for the API requirement
        let email = null;
        try {
          const storageData = await new Promise((resolve) => {
            chrome.storage.local.get(['userData', 'user'], (result) => {
              resolve(result);
            });
          });
          
          let userData = storageData.userData;
          
          // If userData exists, use it
          if (userData && userData.email) {
            email = userData.email;
            dbgLog('[BG] Using userData email for review:', email);
          } else if (storageData.user) {
            // If userData doesn't exist but user does, try to parse it
            try {
              const parsedUser = JSON.parse(storageData.user);
              if (parsedUser && parsedUser.email) {
                email = parsedUser.email;
                dbgLog('[BG] Using parsed user email for review:', email);
              }
            } catch (parseError) {
              dbgWarn('[BG] Failed to parse user data for review:', parseError);
            }
          }
        } catch (storageError) {
          dbgWarn('[BG] Error getting user email for review:', storageError);
        }

        // Prepare request body
        const requestBody = {
          patchContent
        };
        
        // Include email (required for reviewPatchCode_1_1)
        if (email) {
          requestBody.email = email;
        }
        
        // Include mrUrl if provided
        if (mrUrl) {
          requestBody.mrUrl = mrUrl;
        }
        
        // Include language if provided and not the default
        if (language && language !== 'English') {
          requestBody.language = language;
        }
        
        // Include platform information if provided
        if (platform) {
          requestBody.platform = platform;
        }
        
        // Include mrId if provided for tracking
        if (mrId) {
          requestBody.mrId = mrId;
        }
        
        // Include forceRegenerate if true
        if (forceRegenerate) {
          requestBody.forceRegenerate = true;
        }

        // Send the patch for code review with authentication
        const res = await fetch(REVIEW_CODE_URL_V1_1, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        if (!res.ok) {
          const errorText = await res.text();
          
          // Handle daily limit exceeded specifically
          if (res.status === 429) {
            try {
              const errorData = JSON.parse(errorText);
              if (errorData.message === 'Reviews-limits-exceeded') {
                const limitError = new Error(`You've reached your daily limit of ${errorData.dailyLimit} reviews. Upgrade to continue reviewing code.`);
                limitError.isLimitExceeded = true;
                limitError.dailyLimit = errorData.dailyLimit;
                limitError.currentCount = errorData.currentCount;
                throw limitError;
              }
            } catch (parseError) {
              // If parsing fails or it's a different error, continue to regular error handling
              if (parseError.isLimitExceeded) {
                throw parseError;
              }
            }
          }
          
          // Try to parse JSON error message for better error handling
          let errorMessage = `HTTP ${res.status}: ${errorText}`;
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch (parseError) {
            // If parsing fails, use the original error text
          }
          throw new Error(errorMessage);
        }
        const data = await res.json();
        
        // Track the review if mrId is provided
        if (mrId) {
          // Review tracking is now handled automatically by the cloud function reviewPatchCode_1_1
          dbgLog('[GitLab MR Reviews][BG] Review completed for MR:', mrId);
        }
        
        sendResponse({ success: true, data });
      } catch (err) {
        console.warn('[GitLab MR Reviews][BG] Review fetch error:', err);
        sendResponse({ 
          success: false, 
          error: err.message,
          isLimitExceeded: err.isLimitExceeded || false,
          dailyLimit: err.dailyLimit,
          currentCount: err.currentCount
        });
      }
    })();
    return true; // Keep channel open
  }

  // Handle request to open extension page in a new tab
  if (message.type === 'OPEN_EXTENSION_PAGE') {
    console.log('[GitLab MR Reviews][BG] Opening extension page in new tab with auto sign-in');
    
    // Get the extension popup URL with auto sign-in parameter
    const extensionUrl = chrome.runtime.getURL('popup.html') + '?autoSignIn=true';
    
    // Open in a new tab
    chrome.tabs.create({ url: extensionUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        console.warn('[GitLab MR Reviews][BG] Error opening extension page:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[GitLab MR Reviews][BG] Extension page opened successfully in tab:', tab.id);
        sendResponse({ success: true, tabId: tab.id });
      }
    });
    
    return true; // Keep message channel open for async response
  }

  if (message.type === 'TRIGGER_GOOGLE_SIGNIN') {
    // Handle Google Sign-In request from content script (deprecated, keeping for backward compatibility)
    handleGoogleSignIn()
      .then(userData => {
        // Store user data in chrome.storage.local
        chrome.storage.local.set({ userData }, () => {
          console.log('User data stored successfully');
          
          // Reload the active tab to refresh the content
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.reload(tabs[0].id);
            }
          });
          
          sendResponse({ success: true, userData });
        });
      })
      .catch(error => {
        // console.error('Google Sign-In failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async response
  }
  
  // Handle request to get user data with subscription info
  if (message.type === 'GET_USER_DATA_WITH_SUBSCRIPTION') {
    dbgLog('[GitLab MR Reviews][BG] Getting user data with subscription');
    CloudService.getUserDataWithSubscription()
      .then(userData => {
        dbgLog('[GitLab MR Reviews][BG] User data retrieved:', userData);
        dbgLog('[GitLab MR Reviews][BG] Today review count:', userData.todayReviewCount);
        dbgLog('[GitLab MR Reviews][BG] Subscription type:', userData.stripeSubscriptionType);
        dbgLog('[GitLab MR Reviews][BG] Is free plan:', userData.stripeSubscriptionType === 'Free plan' || !userData.stripeSubscriptionType);
        dbgLog('[GitLab MR Reviews][BG] Is over limit:', userData.todayReviewCount > 10);
        
        // Store todayReviewCount and lastFeedbackPromptInteraction in chrome.storage for review prompt to use
        chrome.storage.local.set({ 
          todayReviewCount: userData.todayReviewCount || 0,
          lastFeedbackPromptInteraction: userData.lastFeedbackPromptInteraction || null
        }, () => {
          dbgLog('[GitLab MR Reviews][BG] Stored todayReviewCount:', userData.todayReviewCount);
          dbgLog('[GitLab MR Reviews][BG] Stored lastFeedbackPromptInteraction:', userData.lastFeedbackPromptInteraction);
        });
        
        // Make sure we're sending the complete userData object
        sendResponse({ status: 'success', userData: {
          userExists: userData.userExists,
          reviewCount: userData.reviewCount,
          todayReviewCount: userData.todayReviewCount || 0,
          stripeSubscriptionType: userData.stripeSubscriptionType || 'Free plan',
          currentPlanValidTo: userData.currentPlanValidTo,
          nextPaymentDate: userData.nextPaymentDate,
          lastFeedbackPromptInteraction: userData.lastFeedbackPromptInteraction || null,
          lastReviewDate: userData.lastReviewDate || null
        }});
      })
      .catch(error => {
        dbgWarn('[GitLab MR Reviews][BG] Error getting user data:', error);
        sendResponse({ status: 'error', error: error.message });
      });
    return true; // Keep the message channel open for async response
  }
  
  // Handle subscription upgrade request
  if (message.type === 'HANDLE_SUBSCRIPTION_UPGRADE') {
    const plan = message.plan || 'monthly';
    dbgLog(`[GitLab MR Reviews][BG] Handling subscription upgrade for plan: ${plan}`);
    
    // First check if user is logged in
    chrome.storage.local.get(['userData'], async (result) => {
      try {
        if (!result.userData || !result.userData.uid) {
          // User is not logged in, trigger sign in first
          dbgLog('[GitLab MR Reviews][BG] User not logged in, triggering sign in');
          const userData = await handleGoogleSignIn();
          
          if (userData) {
            // Now create checkout session
            const checkoutData = await CloudService.createCheckoutSession(plan);
            if (checkoutData && checkoutData.url) {
              // Open checkout URL in a new tab
              chrome.tabs.create({ url: checkoutData.url });
              sendResponse({ status: 'success' });
            } else {
              sendResponse({ status: 'error', error: 'Failed to create checkout session' });
            }
          } else {
            sendResponse({ status: 'error', error: 'User authentication failed' });
          }
        } else {
          // User is already logged in, create checkout session directly
          const checkoutData = await CloudService.createCheckoutSession(plan);
          if (checkoutData && checkoutData.url) {
            // Open checkout URL in a new tab
            chrome.tabs.create({ url: checkoutData.url });
            sendResponse({ status: 'success' });
          } else {
            sendResponse({ status: 'error', error: 'Failed to create checkout session' });
          }
        }
      } catch (error) {
        dbgWarn('[GitLab MR Reviews][BG] Error handling subscription upgrade:', error);
        sendResponse({ status: 'error', error: error.message });
      }
    });
    return true; // Keep the message channel open for async response
  }
  
  // Handle request to open the extension popup
  if (message.type === 'OPEN_POPUP') {
    dbgLog('[GitLab MR Reviews][BG] Opening extension popup');
    chrome.action.openPopup();
    return true;
  }

  // Handle request to open extension popup for Azure DevOps token configuration
  if (message.type === 'OPEN_EXTENSION_POPUP') {
    dbgLog('[GitLab MR Reviews][BG] Opening extension popup for Azure DevOps token configuration');
    
    // Open the extension popup page in a new tab
    const extensionUrl = chrome.runtime.getURL('popup.html');
    
    chrome.tabs.create({ url: extensionUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        dbgWarn('[GitLab MR Reviews][BG] Error opening extension popup:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        dbgLog('[GitLab MR Reviews][BG] Extension popup opened successfully in tab:', tab.id);
        sendResponse({ success: true, tabId: tab.id });
      }
    });
    
    return true; // Keep message channel open for async response
  }
});

// OAuth Handler Functions
async function handleExchangeCode(request, sendResponse) {
  try {
    dbgLog('Received code to exchange:', request.code);
    const FUNCTION_URL = 'https://us-central1-thinkgpt.cloudfunctions.net/exchangeGoogleCode';
    dbgLog('Calling Cloud Function for token exchange:', FUNCTION_URL);

    const resp = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: request.code })
    });
    const tokenData = await resp.json();
    dbgLog('Token exchange response:', tokenData);
    const tokens = tokenData.tokens || tokenData;
    
    if (!resp.ok || !tokens.access_token) {
      throw new Error(tokenData.error || 'Token exchange failed');
    }
    
    // Store token
    await chrome.storage.local.set({ [AUTH_TOKEN_KEY]: tokens.access_token });
    
    // Fetch user info
    const userInfo = await fetchUserInfo(tokens.access_token);
    
    // Sync with CloudService
    try {
      const syncedUser = await CloudService.syncUserData(userInfo);
      const userData = syncedUser.data && syncedUser.data.currentUser ? 
        syncedUser.data.currentUser : syncedUser;
      
      await chrome.storage.local.set({ 
        [AUTH_USER_KEY]: userData,
        user: JSON.stringify(userData),
        userData: userData
      });
      
      sendResponse({ success: true, user: userData, tokens });
    } catch (syncError) {
      dbgWarn('Failed to sync with CloudService, using basic user info:', syncError);
      await chrome.storage.local.set({ 
        [AUTH_USER_KEY]: userInfo,
        user: JSON.stringify(userInfo),
        userData: userInfo
      });
      sendResponse({ success: true, user: userInfo, tokens });
    }
  } catch (error) {
    dbgWarn('Error exchanging code for token:', error);
    sendResponse({ success: false, error: error.message || 'Token exchange failed' });
  }
}

async function handleGetUser(sendResponse) {
  try {
    const data = await chrome.storage.local.get([AUTH_USER_KEY, AUTH_TOKEN_KEY]);
    sendResponse({ 
      isLoggedIn: !!data[AUTH_TOKEN_KEY],
      user: data[AUTH_USER_KEY],
      token: data[AUTH_TOKEN_KEY]
    });
  } catch (error) {
    dbgWarn('Error getting user:', error);
    sendResponse({ isLoggedIn: false, user: null });
  }
}

async function handleLogout(sendResponse) {
  try {
    // Get stored access token
    const data = await chrome.storage.local.get(AUTH_TOKEN_KEY);
    const token = data[AUTH_TOKEN_KEY];
    
    if (token) {
      // Revoke token server-side (best effort)
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token })
        });
      } catch (revokeErr) {
        dbgWarn('Token revocation failed (ignored):', revokeErr);
      }
    }
    
    // Clear local storage
    await chrome.storage.local.remove([AUTH_TOKEN_KEY, AUTH_USER_KEY, 'user', 'userData']);
    sendResponse({ success: true });
  } catch (error) {
    dbgWarn('Logout failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Dynamic Content Script Registration for Custom Domains
const DEFAULT_DOMAINS = ['https://gitlab.com'];

// Register content scripts for stored domains on startup
chrome.runtime.onStartup.addListener(updateContentScripts);
chrome.runtime.onInstalled.addListener((details) => {
  // Update content scripts
  updateContentScripts();
  
  // Open onboarding page on first install
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

// Listen for manual content script update requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_CONTENT_SCRIPTS') {
    updateContentScripts();
    sendResponse({ success: true });
  }
});

// Listen for domain changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.gitlabDomains) {
    dbgLog('GitLab domains changed, updating content scripts');
    updateContentScripts();
  }
});

async function updateContentScripts() {
  try {
    // Get current domains from storage
    const result = await chrome.storage.local.get(['gitlabDomains']);
    const gitlabDomains = result.gitlabDomains || DEFAULT_DOMAINS;
    
    // Add Azure DevOps domains
    const azureDevOpsDomains = [
      'https://dev.azure.com',
      'https://*.visualstudio.com'
    ];
    
    const allDomains = [...gitlabDomains, ...azureDevOpsDomains];
    
    dbgLog('Updating content scripts for domains:', allDomains);
    
    // Get existing registered scripts
    let registeredScripts = [];
    try {
      registeredScripts = await chrome.scripting.getRegisteredContentScripts();
      dbgLog('Current registered scripts:', registeredScripts.map(s => s.id));
    } catch (error) {
      dbgWarn('Error getting registered scripts:', error.message);
    }
    
    // Track script IDs we want to keep
    const targetScriptIds = [];
    // Track script IDs that already exist and need updating rather than creating
    const existingScriptIds = registeredScripts.map(script => script.id);
    
    // Register content scripts for each domain
    for (const domain of allDomains) {
      try {
        // Generate a safe script ID from the domain
        const scriptId = `gitlab-mr-reviews-${domain.replace(/[^a-zA-Z0-9]/g, '-')}`;
        targetScriptIds.push(scriptId);
        
        // Check if this script ID already exists
        const scriptExists = existingScriptIds.includes(scriptId);
        
        // Parse the domain to create the correct match pattern
        let matchPattern;
        let originPattern;
        
        if (domain.startsWith('http://') || domain.startsWith('https://')) {
          // Full URL provided (e.g., http://localhost:8083, https://gitlab.example.com)
          const url = new URL(domain);
          originPattern = `${url.protocol}//${url.host}/*`;
          
          // Create more inclusive match patterns for local instances
          if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
            // For localhost, be more permissive with paths
            matchPattern = `${url.protocol}//${url.host}/*`;
            dbgLog(`Using permissive localhost pattern: ${matchPattern}`);
          } else if (url.hostname === 'dev.azure.com') {
            // Azure DevOps: match all pages (SPA - button always visible, but only works on PR pages)
            matchPattern = `${url.protocol}//${url.host}/*`;
          } else if (url.hostname.includes('visualstudio.com')) {
            // Visual Studio Team Services: match all pages (SPA - button always visible, but only works on PR pages)
            matchPattern = `${url.protocol}//${url.host}/*`;
          } else {
            // GitLab: match merge request pages only
            matchPattern = `${url.protocol}//${url.host}/*/merge_requests/*`;
          }
        } else {
          // Simple domain provided (e.g., gitlab.com)
          originPattern = `https://${domain}/*`;
          matchPattern = `https://${domain}/*/merge_requests/*`;
        }
        
        // Check if we have permission for this domain
        const hasPermission = await chrome.permissions.contains({
          origins: [originPattern]
        });
        
        if (!hasPermission) {
          dbgLog(`No permission for ${originPattern}, content script won't be registered`);
          continue;
        }
        
        // Prepare script configuration
        const scriptConfig = {
          id: scriptId,
          matches: [matchPattern],
          js: ['components/integrated-review.js', 'content.js'],
          runAt: 'document_idle'
        };
        
        if (scriptExists) {
          // Update existing script instead of creating a new one
          await chrome.scripting.updateContentScripts([scriptConfig]);
          dbgLog(`Updated existing content script for domain: ${domain} (pattern: ${matchPattern})`);
        } else {
          // Register new script
          await chrome.scripting.registerContentScripts([scriptConfig]);
          dbgLog(`Registered new content script for domain: ${domain} (pattern: ${matchPattern})`);
        }
      } catch (error) {
        dbgWarn(`Failed to register content script for domain ${domain}:`, error);
        // console.error('Full error:', error);
      }
    }
    
    // Remove any scripts that are no longer needed
    const scriptsToRemove = registeredScripts
      .filter(script => script.id.startsWith('gitlab-mr-reviews-') && !targetScriptIds.includes(script.id))
      .map(script => script.id);
      
    if (scriptsToRemove.length > 0) {
      dbgLog('Removing unused content scripts:', scriptsToRemove);
      try {
        await chrome.scripting.unregisterContentScripts({ ids: scriptsToRemove });
      } catch (error) {
        dbgWarn('Error removing unused scripts:', error);
      }
    }
    
  } catch (error) {
    dbgWarn('Error updating content scripts:', error);
    // console.error('Full error:', error);
  }
}
