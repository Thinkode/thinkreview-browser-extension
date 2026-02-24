import { dbgLog, dbgWarn, dbgError } from '../utils/logger.js';


// Cloud function URLs
const CLOUD_FUNCTIONS_BASE_URL = 'https://us-central1-thinkgpt.cloudfunctions.net';
const SYNC_USER_URL = `${CLOUD_FUNCTIONS_BASE_URL}/syncUserByEmailReviews`;
const REVIEW_CODE_URL = `${CLOUD_FUNCTIONS_BASE_URL}/reviewPatchCode`;
const REVIEW_CODE_URL_V1_1 = `${CLOUD_FUNCTIONS_BASE_URL}/reviewPatchCode_1_1`;
const SYNC_REVIEWS_URL = `${CLOUD_FUNCTIONS_BASE_URL}/syncCodeReviews`;
const GET_REVIEW_COUNT_URL = `${CLOUD_FUNCTIONS_BASE_URL}/getReviewCount`;
const GET_USER_DATA_URL = `${CLOUD_FUNCTIONS_BASE_URL}/ThinkReviewGetUserData`;
const GET_USER_SUBSCRIPTION_DATA_URL = `${CLOUD_FUNCTIONS_BASE_URL}/getUserSubscriptionDataThinkReview`;
const TRACK_REVIEW_PROMPT_INTERACTION_URL = `${CLOUD_FUNCTIONS_BASE_URL}/trackReviewPromptInteractionHTTP`;
const GET_REVIEW_PROMPT_MESSAGES_URL = `${CLOUD_FUNCTIONS_BASE_URL}/getReviewPromptMessagesThinkReview`;
const CREATE_CHECKOUT_SESSION_URL = `${CLOUD_FUNCTIONS_BASE_URL}/createCheckoutSessionThinkReview`;
const CANCEL_SUBSCRIPTION_URL = `${CLOUD_FUNCTIONS_BASE_URL}/cancelSubscriptionThinkReview`;
const CONVERSATIONAL_REVIEW_URL = `${CLOUD_FUNCTIONS_BASE_URL}/getConversationalReview`;
const CONVERSATIONAL_REVIEW_URL_V1_1 = `${CLOUD_FUNCTIONS_BASE_URL}/getConversationalReview_1_1`;
const TRACK_CUSTOM_DOMAINS_URL = `${CLOUD_FUNCTIONS_BASE_URL}/trackCustomDomainsThinkReview`;
const LOG_AZURE_DEVOPS_VERSION_URL = `${CLOUD_FUNCTIONS_BASE_URL}/logAzureDevOpsVersionThinkReview`;
const SUBMIT_REVIEW_FEEDBACK_URL = `${CLOUD_FUNCTIONS_BASE_URL}/submitReviewFeedback`;

/**
 * Cloud Service for GitLab MR Reviews
 * Handles synchronization with backend services
 */
export class CloudService {
  /**
   * Synchronize user data with the backend
   * @param {Object} userData - User data from Google Sign In
   * @returns {Promise<Object>} - Response from the backend with user data
   */
  static async syncUserData(userData) {
    dbgLog('Syncing user data:', userData);
    
    if (!userData || !userData.email) {
      dbgWarn('Cannot sync user data: Missing email');
      return null;
    }
    
    try {
      // Prepare the payload for the cloud function
      const payload = {
        email: userData.email,
        uid: userData.id || userData.sub || userData.email.replace('@', '_at_'), // Use id, sub, or email-derived id
        userData: {
          name: userData.name,
          given_name: userData.given_name,
          family_name: userData.family_name,
          picture: userData.picture,
          email: userData.email,
          locale: userData.locale
        },
        source: 'extension'
      };
      
      // Ensure uid is not undefined or null
      if (!payload.uid) {
        payload.uid = `ext_${Date.now()}`; // Fallback to a timestamp-based ID
        dbgLog('Using fallback uid:', payload.uid);
      }
      
      dbgLog('Sending request to cloud function:', payload);
      
      // Make the API call to the cloud function
      const response = await fetch(SYNC_USER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      dbgLog('Cloud function response:', data);
      
      if (data.status === 'success' && data.data && data.data.currentUser) {
        // Store the server-side user ID for future reference
        const serverUser = data.data.currentUser;
        
        // Merge the server data with the local user data
        const mergedUserData = {
          ...userData,
          serverId: serverUser.id,
          lastSynced: new Date().toISOString()
        };
        
        // Store the merged user data in local storage
        await new Promise((resolve) => {
          chrome.storage.local.set({ user: JSON.stringify(mergedUserData) }, resolve);
        });
        
        return mergedUserData;
      } else {
        dbgWarn('Invalid response from cloud function:', data);
        return userData;
      }
    } catch (error) {
      dbgWarn('Error syncing user data:', error);
      return userData;
    }
  }
  
  /**
   * Get user data from the backend
   * @param {string} email - User email
   * @returns {Promise<Object>} - User data from the backend
   */
  static async getUserData(email) {
    dbgLog('Getting user data for:', email);
    
    if (!email) {
      dbgWarn('Cannot get user data: Missing email');
      return null;
    }
    
    // First try to get from local storage
    const localUser = await new Promise((resolve) => {
      chrome.storage.local.get(['user'], (result) => {
        if (result.user) {
          try {
            resolve(JSON.parse(result.user));
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
    
    // If we have a local user with the same email, return it
    if (localUser && localUser.email === email) {
      return localUser;
    }
    
    // Otherwise, try to get from the cloud function
    try {
      // Prepare the request payload
      const payload = {
        email: email,
        uid: 'query', // Just a placeholder for query operations
        source: 'extension'
      };
      
      // Make the API call to the cloud function
      const response = await fetch(SYNC_USER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'success' && data.data && data.data.currentUser) {
        return data.data.currentUser;
      } else {
        return null;
      }
    } catch (error) {
      dbgWarn('Error getting user data:', error);
      return localUser; // Fall back to local user if available
    }
  }
  
  /**
   * Save MR patch data to the backend
   * @param {Object} patchData - Patch data to save
   * @returns {Promise<Object>} - Response from the backend
   */
  static async savePatchData(patchData) {
    dbgLog('Saving patch data:', patchData);
    
    // Get the current user from local storage
    const user = await new Promise((resolve) => {
      chrome.storage.local.get(['user'], (result) => {
        if (result.user) {
          try {
            resolve(JSON.parse(result.user));
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
    
    // If there's no authenticated user, just store locally
    if (!user || !user.email) {
      dbgWarn('No authenticated user, storing patch data locally only');
      return patchData;
    }
    
    // For now, just return the patch data
    // In the future, this will send the patch data to the backend
    // associated with the user's account
    return patchData;
  }
  
  /**
   * Send patch content to the backend for code review using Gemini API
   * @param {string} patchContent - The patch content in git diff format
   * @param {string} [language] - Optional language preference for the review
   * @param {string} [mrId] - Optional merge request ID for tracking
   * @param {string} [mrUrl] - Optional merge request URL for tracking
   * @param {boolean} [forceRegenerate] - Optional flag to force regenerate review even if cached
   * @param {string} [platform] - Optional platform information ('gitlab' or 'azure-devops')
   * @returns {Promise<Object>} - Code review results from Gemini API
   */
  static async reviewPatchCode(patchContent, language = 'English', mrId = null, mrUrl = null, forceRegenerate = false, platform = null) {
    dbgLog('Sending patch for code review');
    
    if (!patchContent) {
      dbgWarn('Cannot review code: Missing patch content');
      return null;
    }
    
    // Get user email for the new API requirement
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
        dbgLog('Using userData email for review:', email);
      } else if (storageData.user) {
        // If userData doesn't exist but user does, try to parse it
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser && parsedUser.email) {
            email = parsedUser.email;
            dbgLog('Using parsed user email for review:', email);
          }
        } catch (parseError) {
          dbgWarn('Failed to parse user data for review:', parseError);
        }
      }
      
      if (!email) {
        dbgWarn('No user email found for review - this may cause the review to fail');
      }
    } catch (error) {
      dbgWarn('Error getting user email for review:', error);
    }
    
    try {
      const requestBody = {
        patchContent
      };
      
      // Include email (required for reviewPatchCode_Dev)
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
      
      // Include mrId if provided
      if (mrId) {
        requestBody.mrId = mrId;
      }
      
      // Include forceRegenerate if true
      if (forceRegenerate) {
        requestBody.forceRegenerate = true;
      }
      
      // Include platform information if provided
      if (platform) {
        requestBody.platform = platform;
      }
      
      const response = await fetch(REVIEW_CODE_URL_V1_1, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle daily limits and IP rate limiting specifically
        if (response.status === 429) {
          // 429 is used for daily limit exceeded
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.message === 'Reviews-limits-exceeded') {
              const limitError = new Error('Daily review limit exceeded');
              limitError.isLimitExceeded = true;
              limitError.dailyLimit = errorData.dailyLimit;
              limitError.currentCount = errorData.currentCount;
              throw limitError;
            }
          } catch (parseError) {
            // If not the limit exceeded error, fall through to generic error
            if (parseError.isLimitExceeded) {
              throw parseError;
            }
          }
        } else if (response.status === 403) {
          // 403 is used for IP rate limiting
          const rateLimitError = new Error('Rate limit reached');
          rateLimitError.isRateLimit = true;
          rateLimitError.rateLimitMessage = '🚫 Rate limit reached! You\'ve made too many requests in a short time. Please wait a few minutes before trying again. This helps us provide quality service to all users.';
          throw rateLimitError;
        }
        
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      // Log only metadata, not the actual review content
      dbgLog('Code review completed successfully:', {
        status: data?.status,
        hasReview: !!data?.review,
        reviewLength: data?.review?.response?.length || 0
      });
      return data;
    } catch (error) {
      dbgWarn('Error reviewing code:', error);
      throw error;
    }
  }

  /**
   * Send patch content and conversation history to the backend for a conversational code review response.
   * @param {string} patchContent - The patch content in git diff format.
   * @param {Array<Object>} conversationHistory - The history of the conversation.
   * @param {string} [mrId] - Optional merge request ID for tracking.
   * @param {string} [mrUrl] - Optional merge request URL for authentication.
   * @param {string} [language] - Optional language preference for the response.
   * @returns {Promise<Object>} - AI response from the backend.
   */
  static async getConversationalResponse(patchContent, conversationHistory, mrId = null, mrUrl = null, language = 'English') {
    dbgLog('Sending conversation for review');
    
    if (!patchContent || !conversationHistory) {
      dbgWarn('Cannot get conversational review: Missing patch content or history');
      return null;
    }
    
    // Get user email for tracking
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
        dbgLog('Using userData email for conversation tracking:', email);
      } else if (storageData.user) {
        // If userData doesn't exist but user does, try to parse it
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser && parsedUser.email) {
            email = parsedUser.email;
            dbgLog('Using parsed user email for conversation tracking:', email);
          }
        } catch (parseError) {
          dbgWarn('Failed to parse user data for conversation tracking:', parseError);
        }
      }
    } catch (error) {
      dbgWarn('Error getting user email for conversation tracking:', error);
    }
    
    try {
      const requestBody = {
        patchContent,
        conversationHistory
      };
      
      // Include mrUrl if provided
      if (mrUrl) {
        requestBody.mrUrl = mrUrl;
      }
      
      // Include email if available
      if (email) {
        requestBody.email = email;
      }
      
      // Include mrId if provided
      if (mrId) {
        requestBody.mrId = mrId;
      }
      
      // Include language if provided and not the default
      if (language && language !== 'English') {
        requestBody.language = language;
      }
      
      dbgLog('Sending conversational review request with tracking:', {
        hasEmail: !!email,
        hasMrId: !!mrId,
        hasMrUrl: !!mrUrl,
        conversationHistoryLength: conversationHistory.length,
        language: language
      });
      
      const response = await fetch(CONVERSATIONAL_REVIEW_URL_V1_1, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // Create the original error for logging
        const originalError = new Error(`HTTP error ${response.status}: ${errorText}`);
        
        // Handle rate limiting and daily limits specifically - add info to the error
        if (response.status === 429) {
          // 429 is used for daily limit exceeded
          try {
            const errorData = JSON.parse(errorText);
            
            // Check if it's a daily limit exceeded error
            if (errorData.message === 'Reviews-limits-exceeded') {
              originalError.isLimitExceeded = true;
              originalError.dailyLimit = errorData.dailyLimit;
              originalError.currentCount = errorData.currentCount;
              originalError.rateLimitMessage = 'Daily review limit exceeded';
            }
          } catch (parseError) {
            // If parsing fails, assume it's daily limit
            originalError.isLimitExceeded = true;
            originalError.rateLimitMessage = 'Daily review limit exceeded';
          }
        } else if (response.status === 403) {
          // 403 is used for IP rate limiting
          originalError.isRateLimit = true;
          originalError.rateLimitMessage = '🚫 Rate limit reached! You\'ve made too many requests in a short time. Please wait a few minutes before trying again. This helps us provide quality service to all users.';
        }
        
        throw originalError;
      }
      
      const data = await response.json();
      // Log only metadata, not the actual response content
      dbgLog('Conversational review completed successfully:', {
        status: data?.status,
        hasResponse: !!data?.response,
        responseLength: data?.response?.length || 0
      });
      return data;
    } catch (error) {
      dbgWarn('Error getting conversational review:', error);
      throw error;
    }
  }
  
  /**
   * Gets the current user's email from Chrome Identity API
   * @returns {Promise<string>} - Promise that resolves with the user's email
   */
  static async getUserEmail() {
    try {
      // Get user email from Chrome identity API
      const userInfo = await new Promise((resolve, reject) => {
        chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(userInfo);
          }
        });
      });
      
      if (!userInfo || !userInfo.email) {
        dbgWarn('No user email available');
        return null;
      }
      
      return userInfo.email;
    } catch (error) {
      dbgWarn('Error getting user email:', error);
      return null;
    }
  }
  
  /**
   * Syncs a code review to Firestore
   * @param {string} mrId - The merge request ID
   * @param {string} mrSubject - The merge request subject/title
   * @returns {Promise<Object>} - Promise that resolves with the sync result
   */

  /**
   * Get the current user's review count from the backend
   * @returns {Promise<number>} - Promise that resolves with the review count
   */
  static async getReviewCount() {
    dbgLog('Getting review count');
    
    try {
      // Get user data from chrome.storage.local - check both userData and user fields
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user'], (result) => {
          resolve(result);
        });
      });
      
      dbgLog('Storage data found:', {
        hasUserData: !!storageData.userData,
        hasUser: !!storageData.user,
        userDataKeys: storageData.userData ? Object.keys(storageData.userData) : [],
        userLength: storageData.user ? storageData.user.length : 0
      });
      
      let userData = storageData.userData;
      let email = null;
      
      // If userData exists, use it
      if (userData && userData.email) {
        email = userData.email;
        dbgLog('Using userData email:', email);
      } else if (storageData.user) {
        // If userData doesn't exist but user does, try to parse it
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser && parsedUser.email) {
            email = parsedUser.email;
            userData = parsedUser;
            dbgLog('Using parsed user email:', email);
          }
        } catch (parseError) {
          dbgWarn('Failed to parse user data:', parseError);
        }
      }
      
      if (!email) {
        dbgWarn('Cannot get review count: No user data in storage');
        return 0;
      }
      
      dbgLog('Getting review count for email:', email);
      
      const response = await fetch(GET_REVIEW_COUNT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      dbgLog('Review count retrieved successfully:', data);
      
      if (data.status === 'success') {
        return data.reviewCount || 0;
      } else {
        dbgWarn('Invalid response from getReviewCount:', data);
        return 0;
      }
    } catch (error) {
      dbgWarn('Error getting review count:', error);
      return 0;
    }
  }

  /**
   * Get comprehensive user data including subscription information
   * @returns {Promise<Object>} - Promise that resolves with user data including subscription info
   */
  static async getUserDataWithSubscription() {
    dbgLog('Getting comprehensive user data');
    
    try {
      // Get user data from chrome.storage.local - check both userData and user fields
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user'], (result) => {
          resolve(result);
        });
      });
      
      dbgLog('Storage data found:', {
        hasUserData: !!storageData.userData,
        hasUser: !!storageData.user,
        userDataKeys: storageData.userData ? Object.keys(storageData.userData) : [],
        userLength: storageData.user ? storageData.user.length : 0
      });
      
      let userData = storageData.userData;
      let email = null;
      
      // If userData exists, use it
      if (userData && userData.email) {
        email = userData.email;
        dbgLog('Using userData email:', email);
      } else if (storageData.user) {
        // If userData doesn't exist but user does, try to parse it
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser && parsedUser.email) {
            email = parsedUser.email;
            userData = parsedUser;
            dbgLog('Using parsed user email:', email);
          }
        } catch (parseError) {
          dbgWarn('Failed to parse user data:', parseError);
        }
      }
      
      if (!email) {
        dbgWarn('Cannot get user data: No user data in storage');
        return {
          userExists: false,
          reviewCount: 0,
          subscriptionType: 'Free',
          stripeSubscriptionType: null,
          currentPlanValidTo: null,
          cancellationRequested: false,
          planInterval: null
        };
      }
      
      dbgLog('Getting user data for email:', email);
      
      const response = await fetch(GET_USER_DATA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      dbgLog('User data retrieved successfully:', data);
      
      if (data.status !== 'success') {
        dbgWarn('Invalid response from getUserDataWithSubscription:', data);
        return {
          userExists: false,
          reviewCount: 0,
          todayReviewCount: data.todayReviewCount || 0,
          subscriptionType: 'Free',
          stripeSubscriptionType: null,
          currentPlanValidTo: null,
          cancellationRequested: false,
          planInterval: null,
          stripeCanceledDate: null,
          lastFeedbackPromptInteraction: null
        };
      }

      // At this point ThinkReviewGetUserData succeeded. Optionally enrich with
      // getUserSubscriptionDataThinkReview so Current Plan / Valid To match the
      // new subscription endpoint exactly.
      let subscriptionData = null;
      try {
        subscriptionData = await CloudService.getUserSubscriptionData(email);
        dbgLog('Subscription data retrieved for popup:', {
          hasData: !!subscriptionData,
          type: subscriptionData?.userSubscriptionType,
          validTo: subscriptionData?.currentPlanValidTo
        });
      } catch (subError) {
        dbgWarn('Error getting subscription data in getUserDataWithSubscription:', subError);
      }

      // Effective values for popup display:
      // - subscriptionType: prefer subscriptionData.userSubscriptionType
      //   (Professional/Teams/Lite/Free), else fall back to ThinkReviewGetUserData.
      // - currentPlanValidTo: prefer subscriptionData.currentPlanValidTo, else raw.
      const effectiveSubscriptionType =
        (subscriptionData && subscriptionData.userSubscriptionType) ||
        data.subscriptionType ||
        'Free';

      const effectiveCurrentPlanValidTo =
        (subscriptionData && subscriptionData.currentPlanValidTo) ||
        data.currentPlanValidTo ||
        null;

      return {
        userExists: data.userExists || false,
        reviewCount: data.reviewCount || 0,
        todayReviewCount: data.todayReviewCount || 0,

        // Current plan / period end for popup (driven by getUserSubscriptionDataThinkReview when available)
        subscriptionType: effectiveSubscriptionType,
        currentPlanValidTo: effectiveCurrentPlanValidTo,

        // Legacy / additional fields from ThinkReviewGetUserData
        stripeSubscriptionType: data.stripeSubscriptionType || null,
        cancellationRequested: data.cancellationRequested || false,
        planInterval: data.planInterval || null,
        stripeCanceledDate: data.stripeCanceledDate || null,
        lastFeedbackPromptInteraction: data.lastFeedbackPromptInteraction || null,
        lastReviewDate: data.lastReviewDate || null,

        // Expose subscription payload in case callers need the extra flags
        userSubscriptionData: subscriptionData || null,
        isUserOnInitialTrial: subscriptionData?.isUserOnInitialTrial ?? false,
        initialTrialEndDate: subscriptionData?.initialTrialEndDate || null,
        cancellationRequestedActivePlan: subscriptionData?.cancellationRequestedActivePlan ?? false,
        userSubscriptionStatus: subscriptionData?.userSubscriptionStatus || null
      };
    } catch (error) {
      dbgWarn('Error getting user data:', error);
      return {
        userExists: false,
        reviewCount: 0,
        todayReviewCount: 0,
        subscriptionType: 'Free',
        stripeSubscriptionType: null,
        currentPlanValidTo: null,
        cancellationRequested: false,
        planInterval: null,
        stripeCanceledDate: null
      };
    }
  }

  /**
   * Get user subscription data from the backend (getUserSubscriptionDataThinkReview).
   * @param {string} email - User email
   * @returns {Promise<Object>} - Subscription payload: isUserOnInitialTrial, userSubscriptionType, initialTrialEndDate?, userSubscriptionStatus?, currentPlanValidTo, cancellationRequestedActivePlan
   */
  static async getUserSubscriptionData(email) {
    dbgLog('Getting user subscription data for:', email ? `${email.slice(0, 3)}...` : 'none');

    if (!email) {
      dbgWarn('Cannot get subscription data: Missing email');
      return null;
    }

    try {
      const response = await fetch(GET_USER_SUBSCRIPTION_DATA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      dbgLog('Subscription data retrieved:', data?.status);

      if (data.status === 'success') {
        return {
          isUserOnInitialTrial: data.isUserOnInitialTrial ?? false,
          userSubscriptionType: data.userSubscriptionType ?? 'Free',
          initialTrialEndDate: data.initialTrialEndDate ?? null,
          userSubscriptionStatus: data.userSubscriptionStatus ?? null,
          currentPlanValidTo: data.currentPlanValidTo ?? null,
          cancellationRequestedActivePlan: data.cancellationRequestedActivePlan ?? false
        };
      }

      dbgWarn('Invalid response from getUserSubscriptionData:', data);
      return null;
    } catch (error) {
      dbgWarn('Error getting subscription data:', error);
      return null;
    }
  }

  /**
   * Refresh user data from the server - lightweight method for syncing storage
   * @returns {Promise<Object>} - Promise that resolves with updated user data (reviewCount, todayReviewCount, lastReviewDate, lastFeedbackPromptInteraction)
   */
  static async refreshUserData() {
    dbgLog('Refreshing user data from server');
    
    try {
      // Get user email from storage
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user'], (result) => {
          resolve(result);
        });
      });
      
      let email = null;
      
      // Try to get email from userData first
      if (storageData.userData && storageData.userData.email) {
        email = storageData.userData.email;
        dbgLog('Using userData email:', email);
      } else if (storageData.user) {
        // Try to parse user data
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser && parsedUser.email) {
            email = parsedUser.email;
            dbgLog('Using parsed user email:', email);
          }
        } catch (parseError) {
          dbgWarn('Failed to parse user data:', parseError);
        }
      }
      
      if (!email) {
        throw new Error('User not logged in - no email found');
      }
      
      dbgLog('Fetching user data for email:', email);
      
      // Call GET_USER_DATA_URL endpoint
      const response = await fetch(GET_USER_DATA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      dbgLog('User data fetched successfully:', data);
      
      if (data.status === 'success') {
        return {
          reviewCount: data.reviewCount || 0,
          todayReviewCount: data.todayReviewCount || 0,
          lastReviewDate: data.lastReviewDate || null,
          lastFeedbackPromptInteraction: data.lastFeedbackPromptInteraction || null
        };
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      dbgWarn('Error refreshing user data:', error);
      throw error;
    }
  }

  /**
   * Track user interaction with the review prompt
   * @param {string} email - User's email address
   * @param {string} action - The action taken ('submit', 'later', or 'never')
   * @param {number} [rating] - The star rating (1-5) if action is 'submit'
   * @param {string} [redirectUrl] - The URL user was redirected to if action is 'submit'
   * @returns {Promise<Object>} - Promise that resolves with the tracking result
   */
  static async trackReviewPromptInteraction(email, action, rating = null, redirectUrl = null) {
    dbgLog('Tracking review prompt interaction:', { email, action, rating, redirectUrl });
    
    try {
      if (!email) {
        throw new Error('Email is required');
      }

      if (!action) {
        throw new Error('Action is required');
      }

      if (!['submit', 'later', 'never'].includes(action)) {
        throw new Error('Invalid action type');
      }

      if (action === 'submit' && !rating) {
        throw new Error('Rating is required for submit action');
      }

      const payload = {
        email,
        action,
        metadata: {
          ...(rating && { rating }),
          ...(redirectUrl && { redirectUrl })
        }
      };

      dbgLog('Sending trackReviewPromptInteraction request:', payload);

      const response = await fetch(TRACK_REVIEW_PROMPT_INTERACTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      dbgLog('TrackReviewPromptInteraction response:', data);

      if (data.status === 'success') {
        return data;
      } else {
        throw new Error(data.message || 'Failed to track review prompt interaction');
      }

    } catch (error) {
      dbgWarn('Error tracking review prompt interaction:', error);
      throw error; // Re-throw so the caller can handle it
    }
  }

  /**
   * Get review prompt messages from Remote Config
   * @param {string} email - User's email for authentication
   * @returns {Promise<Object>} - Promise that resolves with messages object { subtitle, question }
   */
  static async getReviewPromptMessages(email) {
    dbgLog('Fetching review prompt messages:', { email });
    
    try {
      if (!email) {
        throw new Error('Email is required');
      }

      const payload = {
        email
      };

      dbgLog('Sending getReviewPromptMessages request:', payload);

      const response = await fetch(GET_REVIEW_PROMPT_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      dbgLog('GetReviewPromptMessages response:', data);

      if (data.status === 'success' && data.subtitle && data.question) {
        return {
          subtitle: data.subtitle,
          question: data.question
        };
      } else {
        throw new Error('Invalid response format from getReviewPromptMessages');
      }
    } catch (error) {
      dbgWarn('Error fetching review prompt messages:', error);
      throw error;
    }
  }

  /**
   * Create a checkout session for subscription upgrade
   * @param {string} plan - The subscription plan ('monthly' or 'annual')
   * @returns {Promise<Object>} - Response from the backend with session data
   */
  static async createCheckoutSession(plan) {
    dbgLog('Creating checkout session for plan:', plan);
    
    try {
      // Get user data from storage
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user'], (result) => {
          resolve(result);
        });
      });
      
      let userData = storageData.userData;
      let email = null;
  
      
      // If userData exists, use it
      if (userData && userData.email) {
        email = userData.email;
        // For Firebase Auth, we need to use the email directly since we don't have Firebase Auth UIDs
        // The cloud function will look up the user by email
        dbgLog('Using userData email for auth:', email);
      }
      else {      
       if (storageData.user) {
        // If userData doesn't exist but user does, try to parse it
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser && parsedUser.email) {
            email = parsedUser.email;
            // For Firebase Auth, we need to use the email directly
            userData = parsedUser;
            dbgLog('Using parsed user email for auth:', email);
          }
        } catch (parseError) {
          dbgWarn('Failed to parse user data:', parseError);
        }
      }
    }
      
      if (!email) {
        dbgWarn('Cannot create checkout session: No user data in storage');
        throw new Error('User not authenticated');
      }
      
      dbgLog('Creating checkout session for user:', { email, plan });
      
      const response = await fetch(CREATE_CHECKOUT_SESSION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan :plan,
          userId:email
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      dbgLog('Checkout session created successfully:', data);
      
      return data;
    } catch (error) {
      dbgWarn('Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Cancel user subscription
   * @returns {Promise<Object>} - Response from the backend with cancellation result
   */
  static async cancelSubscription() {
    dbgLog('Cancelling subscription');
    
    try {
      // Get user data from storage
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user'], (result) => {
          resolve(result);
        });
      });
      
      let userData = storageData.userData;
      let email = null;
      
      // If userData exists, use it
      if (userData && userData.email) {
        email = userData.email;
        dbgLog('Using userData email for cancellation:', email);
      } else if (storageData.user) {
        // If userData doesn't exist but user does, try to parse it
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser && parsedUser.email) {
            email = parsedUser.email;
            userData = parsedUser;
            dbgLog('Using parsed user email for cancellation:', email);
          }
        } catch (parseError) {
          dbgWarn('Failed to parse user data:', parseError);
        }
      }
      
      if (!email) {
        dbgWarn('Cannot cancel subscription: No user data in storage');
        throw new Error('User not authenticated');
      }
      
      dbgLog('Cancelling subscription for user:', { email });
      
      const response = await fetch(CANCEL_SUBSCRIPTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      dbgLog('Subscription cancelled successfully:', data);
      
      return data;
    } catch (error) {
      dbgWarn('Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Track custom GitLab domain for a user
   * @param {string} domain - The custom domain to track
   * @param {string} action - Action type: 'add' or 'remove'
   * @returns {Promise<Object>} - Response from the backend with tracking result
   */
  static async trackCustomDomains(domain, action = 'add') {
    dbgLog('Tracking custom domain:', { domain, action });
    
    try {
      // Get user data from storage
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user'], (result) => {
          resolve(result);
        });
      });
      
      let userData = storageData.userData;
      let email = null;
      
      // If userData exists, use it
      if (userData && userData.email) {
        email = userData.email;
        dbgLog('Using userData email for domain tracking:', email);
      } else if (storageData.user) {
        // If userData doesn't exist but user does, try to parse it
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser && parsedUser.email) {
            email = parsedUser.email;
            userData = parsedUser;
            dbgLog('Using parsed user email for domain tracking:', email);
          }
        } catch (parseError) {
          dbgWarn('Failed to parse user data:', parseError);
        }
      }
      
      if (!email) {
        dbgWarn('Cannot track custom domain: No user data in storage');
        throw new Error('User not authenticated');
      }
      
      dbgLog('Tracking custom domain for user:', { email, domain, action });
      
      const response = await fetch(TRACK_CUSTOM_DOMAINS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          domain,
          action
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      dbgLog('Custom domain tracked successfully:', data);
      
      return data;
    } catch (error) {
      dbgWarn('Error tracking custom domain:', error);
      throw error;
    }
  }

  /**
   * Log Azure DevOps (on-prem) server version check to the user's Settings/azure-info in the cloud.
   * Call only after a fresh version detection (when local storage had no valid azureOnPremise* fields).
   * @param {string} origin - e.g. window.location.origin
   * @param {string} version - Detected version display string
   * @param {string} [collection] - Collection/organization path segment
   * @param {string|null} [azureOnPremiseApiVersion] - API version (e.g. '7.1')
   * @param {string|null} [azureOnPremiseVersion] - Azure DevOps server version label (e.g. 'Azure DevOps Server 2022 Update 1')
   * @returns {Promise<Object>} Response from the backend
   */
  static async trackAzureDevOpsVersion(origin, version, collection = null, azureOnPremiseApiVersion = null, azureOnPremiseVersion = null) {
    dbgLog('Tracking Azure DevOps version:', { origin, version, collection, azureOnPremiseApiVersion, azureOnPremiseVersion });
    try {
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user'], (result) => resolve(result));
      });
      let email = null;
      if (storageData.userData && storageData.userData.email) {
        email = storageData.userData.email;
      } else if (storageData.user) {
        try {
          const parsed = JSON.parse(storageData.user);
          if (parsed && parsed.email) email = parsed.email;
        } catch (_) {}
      }
      if (!email) {
        dbgWarn('Cannot log Azure DevOps version: No user data in storage');
        return null;
      }
      const payload = { email, origin, version, collection };
      if (azureOnPremiseApiVersion != null) payload.azureOnPremiseApiVersion = azureOnPremiseApiVersion;
      if (azureOnPremiseVersion != null) payload.azureOnPremiseVersion = azureOnPremiseVersion;
      const response = await fetch(LOG_AZURE_DEVOPS_VERSION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      const data = await response.json();
      dbgLog('Azure DevOps version logged to cloud:', data);
      return data;
    } catch (err) {
      dbgWarn('Error logging Azure DevOps version to cloud (non-critical):', err);
      return null;
    }
  }

  /**
   * Track Ollama configuration
   * @param {boolean} enabled - Whether Ollama is enabled
   * @param {Object} config - Ollama configuration (url, model)
   * @returns {Promise<Object>} - Response from the backend
   */
  static async trackOllamaConfig(enabled, config = null) {
    dbgLog('Tracking Ollama config:', { enabled, config });
    
    const TRACK_OLLAMA_CONFIG_URL = 'https://us-central1-thinkgpt.cloudfunctions.net/trackOllamaConfigThinkReview';
    
    try {
      // Get user data from storage
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user'], (result) => {
          resolve(result);
        });
      });
      
      let userData = storageData.userData;
      let email = null;
      
      // If userData exists, use it
      if (userData && userData.email) {
        email = userData.email;
        dbgLog('Using userData email for Ollama config tracking:', email);
      } else if (storageData.user) {
        // If userData doesn't exist but user does, try to parse it
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser && parsedUser.email) {
            email = parsedUser.email;
            userData = parsedUser;
            dbgLog('Using parsed user email for Ollama config tracking:', email);
          }
        } catch (parseError) {
          dbgWarn('Failed to parse user data:', parseError);
        }
      }
      
      if (!email) {
        dbgWarn('Cannot track Ollama config: No user data in storage');
        throw new Error('User not authenticated');
      }
      
      dbgLog('Tracking Ollama config for user:', { email, enabled, config });
      
      const response = await fetch(TRACK_OLLAMA_CONFIG_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          enabled,
          config
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      dbgLog('Ollama config tracked successfully:', data);
      
      return data;
    } catch (error) {
      dbgWarn('Error tracking Ollama config:', error);
      throw error;
    }
  }

  /**
   * Submit feedback for a review or conversation
   * @param {string} email - User's email (required)
   * @param {string} type - Document type: 'conversation' or 'codereview' (required)
   * @param {string} aiResponse - AI response text to query conversation document (required when type is 'conversation')
   * @param {string} mrUrl - MR URL to query code review document (required when type is 'codereview')
   * @param {string} rating - Feedback rating: 'thumbs_up' or 'thumbs_down' (required)
   * @param {string} [additionalFeedback] - Additional feedback text (optional, only for thumbs_down)
   * @returns {Promise<Object>} - Response from the backend
   */
  static async submitReviewFeedback(email, type, aiResponse, mrUrl, rating, additionalFeedback = null) {
    dbgLog('Submitting review feedback:', { 
      email, 
      type,
      hasAiResponse: !!aiResponse,
      hasMrUrl: !!mrUrl,
      rating 
    });
    
    if (!email) {
      dbgWarn('Cannot submit feedback: Missing email');
      throw new Error('Email is required');
    }

    if (!type || (type !== 'conversation' && type !== 'codereview')) {
      dbgWarn('Cannot submit feedback: Invalid type');
      throw new Error('Type must be "conversation" or "codereview"');
    }

    if (type === 'codereview' && !mrUrl) {
      dbgWarn('Cannot submit feedback: Missing mrUrl for codereview type');
      throw new Error('mrUrl is required for codereview type');
    }

    if (type === 'conversation' && !aiResponse) {
      dbgWarn('Cannot submit feedback: Missing aiResponse for conversation type');
      throw new Error('aiResponse is required for conversation type');
    }

    if (!rating || (rating !== 'thumbs_up' && rating !== 'thumbs_down')) {
      dbgWarn('Cannot submit feedback: Invalid rating');
      throw new Error('Rating must be "thumbs_up" or "thumbs_down"');
    }

    try {
      const payload = {
        email,
        type,
        rating,
        additionalFeedback: rating === 'thumbs_down' ? (additionalFeedback || null) : null
      };

      // Add aiResponse or mrUrl based on type
      if (type === 'conversation') {
        payload.aiResponse = aiResponse;
      } else if (type === 'codereview') {
        payload.mrUrl = mrUrl;
      }

      dbgLog('Sending feedback request:', payload);

      const response = await fetch(SUBMIT_REVIEW_FEEDBACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      dbgLog('Feedback submitted successfully:', data);

      return data;
    } catch (error) {
      dbgWarn('Error submitting feedback:', error);
      throw error;
    }
  }
}
