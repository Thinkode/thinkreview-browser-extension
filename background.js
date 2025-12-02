// background.js
// Handles patch storage, downloads, and communication with content/popup

// Import services statically since dynamic imports aren't allowed in service workers
import { CloudService } from './services/cloud-service.js';
import { OllamaService } from './services/ollama-service.js';

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

/**
 * Track Ollama review in Firebase
 * @param {string} patchContent - The patch content
 * @param {string} mrId - Merge request ID
 * @param {string} mrUrl - Merge request URL
 * @param {Object} reviewData - The review data from Ollama
 * @param {string} model - The Ollama model used
 */
async function trackOllamaReview(patchContent, mrId, mrUrl, reviewData, model) {
  try {
    // Get user email from storage
    const storageData = await new Promise((resolve) => {
      chrome.storage.local.get(['userData', 'user'], (result) => {
        resolve(result);
      });
    });
    
    let email = null;
    
    // Extract email from userData or user
    if (storageData.userData && storageData.userData.email) {
      email = storageData.userData.email;
    } else if (storageData.user) {
      try {
        const parsedUser = JSON.parse(storageData.user);
        if (parsedUser && parsedUser.email) {
          email = parsedUser.email;
        }
      } catch (e) {
        console.warn('[BG] Failed to parse user data for Ollama tracking:', e);
      }
    }
    
    if (!email) {
      console.warn('[BG] No email found for Ollama review tracking');
      return;
    }
    
    dbgLog('[BG] Tracking Ollama review for email:', email);
    
    // Extract review object from response
    const review = reviewData.review || reviewData;
    
    // Calculate patch size
    const originalPatchSize = patchContent.length;
    const wasTruncated = originalPatchSize > 40000;
    const truncatedPatchSize = wasTruncated ? 40000 : originalPatchSize;
    
    const patchSize = {
      original: originalPatchSize,
      truncated: truncatedPatchSize,
      wasTruncated: wasTruncated
    };
    
    // Generate checksum (simple MD5-like hash using crypto.subtle)
    const encoder = new TextEncoder();
    const data = encoder.encode(`${patchContent}:${mrId}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const patchChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
    
    // Extract metrics from review
    const metrics = review.metrics || null;
    
    // Calculate review counts
    const reviewCounts = {
      suggestions: Array.isArray(review.suggestions) ? review.suggestions.length : 0,
      securityIssues: Array.isArray(review.securityIssues) ? review.securityIssues.length : 0,
      bestPractices: Array.isArray(review.bestPractices) ? review.bestPractices.length : 0,
      suggestedQuestions: Array.isArray(review.suggestedQuestions) ? review.suggestedQuestions.length : 0
    };
    
    // Send tracking request to Firebase
    const TRACK_OLLAMA_REVIEW_URL = 'https://us-central1-thinkgpt.cloudfunctions.net/trackOllamaReviewThinkReview';
    
    const response = await fetch(TRACK_OLLAMA_REVIEW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        mrId,
        mrUrl,
        review,
        metrics,
        reviewCounts,
        patchSize,
        patchChecksum,
        model
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to track Ollama review: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }
    
    const result = await response.json();
    dbgLog('[BG] Ollama review tracked successfully:', result);
  } catch (error) {
    console.warn('[BG] Error tracking Ollama review:', error);
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
  
  // Handle webapp auth state changes (from content script)
  if (message.type === 'webapp-auth-changed') {
    handleWebappAuthChanged(message, sender, sendResponse);
    return true; // Async response
  }
  
  if (message.type === 'GET_AI_RESPONSE') {
    const { patchContent, conversationHistory, mrId, mrUrl, language } = message;
    (async () => {
      try {
        // Get AI provider setting
        const settings = await chrome.storage.local.get(['aiProvider', 'ollamaConfig']);
        const provider = settings.aiProvider || 'cloud';
        
        dbgLog('[BG] Using AI provider for conversation:', provider);
        
        // Route to appropriate service based on provider
        if (provider === 'ollama') {
          // Use Ollama for conversational response
          try {
            const config = settings.ollamaConfig || { url: 'http://localhost:11434', model: 'qwen3-coder:30b' };
            
            dbgLog('[BG] Getting conversational response from Ollama:', config);
            
            const data = await OllamaService.getConversationalResponse(
              patchContent, 
              conversationHistory, 
              language || 'English',
              mrId, 
              mrUrl
            );
            
            dbgLog('[BG] Ollama conversational response completed successfully');
            sendResponse({ success: true, data: data, provider: 'ollama' });
            return;
          } catch (ollamaError) {
            console.warn('[BG] Ollama conversational response failed:', ollamaError.message);
            
            // Provide a helpful error message
            sendResponse({ 
              success: false, 
              error: ollamaError.message,
              provider: 'ollama',
              suggestion: 'Check if Ollama is running and configured correctly in extension settings.'
            });
            return;
          }
        }
        
        // Default: Use cloud service (Gemini)
        const data = await CloudService.getConversationalResponse(patchContent, conversationHistory, mrId, mrUrl, language || 'English');
        dbgLog('[GitLab MR Reviews][BG] Conversational response received:', data);
        
        sendResponse({ 
          success: true, 
          data: data, 
          provider: 'cloud' 
        });
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
    
    (async () => {
      // Get AI provider setting (declare outside try block so it's accessible in catch)
      let settings = { aiProvider: 'cloud', ollamaConfig: null };
      let provider = 'cloud';
      
      try {
        settings = await chrome.storage.local.get(['aiProvider', 'ollamaConfig']);
        provider = settings.aiProvider || 'cloud';
        
        dbgLog('[BG] Using AI provider:', provider);
        
        // Route to appropriate service based on provider
        if (provider === 'ollama') {
          // Use Ollama for local code review
          try {
            const config = settings.ollamaConfig || { url: 'http://localhost:11434', model: 'qwen3-coder:30b' };
            
            dbgLog('[BG] Reviewing with Ollama:', config);
            
            const data = await OllamaService.reviewPatchCode(patchContent, language, mrId, mrUrl);
            
            dbgLog('[BG] Ollama review completed successfully');
            
            // Track the review in Firebase (fire-and-forget)
            trackOllamaReview(patchContent, mrId, mrUrl, data, config.model).catch(err => {
              console.warn('[BG] Failed to track Ollama review in Firebase:', err.message);
            });
            
            sendResponse({ success: true, data, provider: 'ollama' });
            return;
          } catch (ollamaError) {
            console.warn('[BG] Ollama review failed:', ollamaError.message);
            
            // Provide a helpful error message
            sendResponse({ 
              success: false, 
              error: ollamaError.message,
              provider: 'ollama',
              suggestion: 'Check if Ollama is running and configured correctly in extension settings.'
            });
            return;
          }
        }
        
        // Default: Use cloud service (Gemini)
        // Validate patchContent before sending
        if (!patchContent || patchContent.trim().length === 0) {
          throw new Error('There are no code changes yet in this merge request. If you think this is a bug, please report it here: https://thinkreview.dev/bug-report');
        }

        // Use CloudService to review the patch code
        const data = await CloudService.reviewPatchCode(patchContent, language, mrId, mrUrl, forceRegenerate, platform);
        
        // Track the review if mrId is provided
        if (mrId) {
          // Review tracking is now handled automatically by the cloud function reviewPatchCode_1_1
          dbgLog('[GitLab MR Reviews][BG] Review completed for MR:', mrId);
        }
        
        sendResponse({ success: true, data, provider: 'cloud' });
      } catch (err) {
        console.warn('[GitLab MR Reviews][BG] Review fetch error:', err);
        sendResponse({ 
          success: false, 
          error: err.message,
          isLimitExceeded: err.isLimitExceeded || false,
          dailyLimit: err.dailyLimit,
          currentCount: err.currentCount,
          provider: settings.aiProvider || 'cloud'
        });
      }
    })();
    return true; // Keep channel open
  }

  // Handle request to fetch GitHub diff (to avoid CORS)
  if (message.type === 'FETCH_GITHUB_DIFF') {
    const { url } = message;
    (async () => {
      try {
        dbgLog('[BG] Fetching GitHub diff from:', url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch GitHub diff: ${response.status} ${response.statusText}`);
        }
        const diffContent = await response.text();
        dbgLog('[BG] Successfully fetched GitHub diff, length:', diffContent.length);
        sendResponse({ success: true, content: diffContent });
      } catch (error) {
        dbgWarn('[BG] Error fetching GitHub diff:', error);
        sendResponse({ success: false, error: error.message });
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
  
  // Handle request to refresh user data and update local storage
  if (message.type === 'REFRESH_USER_DATA_STORAGE') {
    dbgLog('[GitLab MR Reviews][BG] Refreshing user data and updating local storage');
    
    CloudService.refreshUserData()
      .then(userData => {
        dbgLog('[GitLab MR Reviews][BG] User data refreshed from CloudService:', userData);
        
        // Update chrome.storage.local with the data from CloudService
        chrome.storage.local.set(userData, () => {
          dbgLog('[GitLab MR Reviews][BG] Local storage updated:', userData);
          sendResponse({ 
            status: 'success', 
            data: userData,
            message: 'User data refreshed successfully' 
          });
        });
      })
      .catch(error => {
        dbgWarn('[GitLab MR Reviews][BG] Error refreshing user data:', error);
        sendResponse({ 
          status: 'error', 
          error: error.message 
        });
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
  
  // Handle feedback submission request
  if (message.type === 'SUBMIT_REVIEW_FEEDBACK') {
    const { email, feedbackType, aiResponse, mrUrl, rating, additionalFeedback } = message;
    
    (async () => {
      try {
        dbgLog('[GitLab MR Reviews][BG] Submitting feedback:', { 
          hasEmail: !!email,
          feedbackType,
          hasAiResponse: !!aiResponse,
          hasMrUrl: !!mrUrl,
          rating 
        });
        
        const data = await CloudService.submitReviewFeedback(
          email,
          feedbackType,
          aiResponse,
          mrUrl,
          rating,
          additionalFeedback
        );
        
        dbgLog('[GitLab MR Reviews][BG] Feedback submitted successfully:', data);
        sendResponse({ success: true, data: data });
      } catch (err) {
        dbgWarn('[GitLab MR Reviews][BG] Error submitting feedback:', err);
        sendResponse({ 
          success: false, 
          error: err.message || 'Failed to submit feedback' 
        });
      }
    })();
    
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

/**
 * Handle webapp auth state changes
 * SECURITY: Verifies sender origin before processing
 */
async function handleWebappAuthChanged(message, sender, sendResponse) {
  try {
    // SECURITY: Verify sender is from webapp domain
    const ALLOWED_ORIGINS = [
      'thinkreview.dev',
      'portal.thinkreview.dev',
      'app.thinkreview.dev',
      'localhost',
      '127.0.0.1'
    ];
    
    if (!sender.url) {
      dbgWarn('Webapp auth message missing sender URL');
      sendResponse({ success: false, error: 'Invalid sender' });
      return;
    }
    
    const senderUrl = new URL(sender.url);
    const isAllowedOrigin = ALLOWED_ORIGINS.some(origin => 
      senderUrl.hostname === origin ||
      senderUrl.hostname.includes(origin) || 
      senderUrl.hostname.endsWith('.' + origin) ||
      (origin === 'localhost' && (senderUrl.hostname === 'localhost' || senderUrl.hostname === '127.0.0.1'))
    );
    
    if (!isAllowedOrigin) {
      dbgWarn('Webapp auth message from unauthorized origin:', senderUrl.hostname);
      sendResponse({ success: false, error: 'Unauthorized origin' });
      return;
    }
    
    // SECURITY: Validate user data structure
    if (!message.userData || !message.userData.email || !message.userData.uid) {
      dbgWarn('Webapp auth message missing required user data');
      sendResponse({ success: false, error: 'Invalid user data' });
      return;
    }
    
    // SECURITY: Check timestamp freshness (optional, but recommended)
    const MAX_AUTH_AGE = 5 * 60 * 1000; // 5 minutes
    if (message.timestamp && (Date.now() - message.timestamp > MAX_AUTH_AGE)) {
      dbgWarn('Webapp auth data is stale, ignoring');
      sendResponse({ success: false, error: 'Stale auth data' });
      return;
    }
    
    dbgLog('Processing webapp auth change for user:', message.userData.email);
    
    // Sync user data with CloudService to get full user profile
    try {
      const syncedUser = await CloudService.syncUserData(message.userData);
      const userData = syncedUser.data && syncedUser.data.currentUser ? 
        syncedUser.data.currentUser : syncedUser;
      
      // Store in extension storage
      await chrome.storage.local.set({ 
        [AUTH_USER_KEY]: userData,
        user: JSON.stringify(userData),
        userData: userData,
        authSource: 'webapp',
        lastSynced: Date.now()
      });
      
      dbgLog('Webapp auth synced successfully');
      sendResponse({ success: true, user: userData });
    } catch (syncError) {
      dbgWarn('Failed to sync with CloudService, using basic user info:', syncError);
      
      // Fallback: store basic user info
      await chrome.storage.local.set({ 
        [AUTH_USER_KEY]: message.userData,
        user: JSON.stringify(message.userData),
        userData: message.userData,
        authSource: 'webapp',
        lastSynced: Date.now()
      });
      
      sendResponse({ success: true, user: message.userData });
    }
  } catch (error) {
    dbgWarn('Error handling webapp auth change:', error);
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
    
    // Add GitHub domains
    const githubDomains = [
      'https://github.com'
    ];
    
    const allDomains = [...gitlabDomains, ...azureDevOpsDomains, ...githubDomains];
    
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
      // Use a generic prefix since we now support multiple platforms
      const scriptId = `code-review-${domain.replace(/[^a-zA-Z0-9]/g, '-')}`;
      targetScriptIds.push(scriptId);
      
      // Check if this script ID already exists
      const scriptExists = existingScriptIds.includes(scriptId);
      
      // Parse the domain to create the correct match pattern
      let matchPattern;
      let originPattern;
      
      const hasProtocol = domain.startsWith('http://') || domain.startsWith('https://');
      const hasWildcard = domain.includes('*');
      
      if (hasWildcard) {
        // Normalize wildcard domains (e.g., https://*.visualstudio.com)
        const normalizedDomain = hasProtocol ? domain : `https://${domain}`;
        const suffixedDomain = normalizedDomain.endsWith('/*') ? normalizedDomain : `${normalizedDomain}/*`;
        originPattern = suffixedDomain;
        matchPattern = suffixedDomain;
      } else if (hasProtocol) {
        // Full URL provided (e.g., http://localhost:8083, https://gitlab.example.com)
        const url = new URL(domain);
        originPattern = `${url.protocol}//${url.host}/*`;
        
        // Create more inclusive match patterns for local instances
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          // For localhost, be more permissive with paths
          matchPattern = `${url.protocol}//${url.host}/*`;
          dbgLog(`Using permissive localhost pattern: ${matchPattern}`);
        } else if (url.hostname.includes('dev.azure.com') || url.hostname.includes('visualstudio.com')) {
          // Azure DevOps: match all pages (SPA - button always visible, but only works on PR pages)
          matchPattern = `${url.protocol}//${url.host}/*`;
        } else if (url.hostname === 'github.com' || url.hostname.endsWith('.github.com')) {
          // GitHub: match all pages (SPA - button always visible, but only works on PR pages)
          matchPattern = `${url.protocol}//${url.host}/*`;
        } else {
          // GitLab: match merge request pages only
          matchPattern = `${url.protocol}//${url.host}/*/merge_requests/*`;
        }
      } else {
        // Simple domain provided (e.g., gitlab.com, github.com)
        originPattern = `https://${domain}/*`;
        if (domain === 'github.com' || domain.endsWith('.github.com')) {
          // GitHub: match all pages (SPA - button always visible, but only works on PR pages)
          matchPattern = `https://${domain}/*`;
        } else {
          // GitLab: match merge request pages only
          matchPattern = `https://${domain}/*/merge_requests/*`;
        }
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
    // Check for both old and new script ID prefixes for backward compatibility
    const scriptsToRemove = registeredScripts
      .filter(script => 
        (script.id.startsWith('gitlab-mr-reviews-') || script.id.startsWith('code-review-')) && 
        !targetScriptIds.includes(script.id)
      )
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
