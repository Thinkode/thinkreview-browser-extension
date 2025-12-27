/**
 * Content script for ThinkReview webapp domain
 * Listens for Firebase auth state changes and notifies the extension
 * 
 * Security: This script only runs on trusted webapp domains
 */

(function() {
  'use strict';
  
  // Debug toggle: set to false to disable console logs in production
  const DEBUG = false;
  function dbgLog(...args) { if (DEBUG) console.log(...args); }
  function dbgWarn(...args) { if (DEBUG) console.warn(...args); }
  function dbgError(...args) { if (DEBUG) console.error(...args); }
  
  // SECURITY: Verify we're on the correct domain
  // Localhost is only allowed in DEBUG mode for security
  const ALLOWED_ORIGINS = [
    'thinkreview.dev',
    'portal.thinkreview.dev',
    'app.thinkreview.dev',
    ...(DEBUG ? ['localhost', '127.0.0.1'] : [])
  ];
  
  /**
   * Validates if a hostname is in the allowed origins list
   * Uses strict matching to prevent spoofing
   */
  function isValidOrigin(hostname) {
    // Localhost is only allowed in DEBUG mode
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && !DEBUG) {
      return false;
    }
    
    return ALLOWED_ORIGINS.some(origin => {
      // Exact match
      if (hostname === origin) return true;
      // For subdomains, check if hostname ends with '.' + origin
      if (hostname.endsWith('.' + origin)) return true;
      // Localhost special case (only if DEBUG is true, already checked above)
      if (origin === 'localhost' && (hostname === 'localhost' || hostname === '127.0.0.1')) return true;
      return false;
    });
  }
  
  const currentOrigin = window.location.hostname;
  const isAllowedOrigin = isValidOrigin(currentOrigin);
  
  if (!isAllowedOrigin) {
    console.warn('[ThinkReview Extension] Content script loaded on unauthorized domain:', currentOrigin);
    return; // Don't run on wrong domain
  }
  
  console.log('[ThinkReview Extension] Webapp auth content script loaded on:', currentOrigin);
  
  // Maximum age for auth data (5 minutes)
  const MAX_AUTH_AGE = 5 * 60 * 1000;
  
  /**
   * Validates user data structure
   */
  function validateUserData(userData) {
    if (!userData) return false;
    if (!userData.email || typeof userData.email !== 'string') return false;
    if (!userData.uid || typeof userData.uid !== 'string') return false;
    return true;
  }
  
  /**
   * Sends auth state to extension background script
   */
  function sendAuthToExtension(userData, timestamp) {
    // SECURITY: Validate data before sending
    if (!validateUserData(userData)) {
      console.warn('[ThinkReview Extension] Invalid user data structure:', userData);
      return;
    }
    
    // SECURITY: Check timestamp freshness
    if (timestamp && (Date.now() - timestamp > MAX_AUTH_AGE)) {
      console.warn('[ThinkReview Extension] Auth data is stale, ignoring');
      return;
    }
    
    try {
      chrome.runtime.sendMessage({
        type: 'webapp-auth-changed',
        userData: userData,
        timestamp: timestamp || Date.now(),
        origin: window.location.origin
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[ThinkReview Extension] Failed to send auth message:', chrome.runtime.lastError);
        } else if (response && response.success) {
          console.log('[ThinkReview Extension] Auth state synced to extension');
        }
      });
    } catch (error) {
      console.error('[ThinkReview Extension] Error sending auth message:', error);
    }
  }
  
  // Listen for custom events from webapp (login only)
  window.addEventListener('thinkreview-auth-changed', (event) => {
    console.log('[ThinkReview Extension] Received auth-changed event:', event.detail);
    
    // Only handle login events, ignore logout (event.detail === null)
    if (event.detail !== null) {
      // Login/auth state change
      sendAuthToExtension(event.detail, Date.now());
    }
  });
  
  // Listen for postMessage from webapp (backup method, login only)
  window.addEventListener('message', (event) => {
    // SECURITY: Parse and validate event.origin using the same strict logic as initial domain check
    try {
      const eventOriginUrl = new URL(event.origin);
      const eventHostname = eventOriginUrl.hostname;
      
      // Validate the origin hostname against ALLOWED_ORIGINS using exact same logic
      if (!isValidOrigin(eventHostname)) {
        dbgLog('[ThinkReview Extension] Rejected postMessage from unauthorized origin:', event.origin);
        return; // Ignore messages from unauthorized origins
      }
      
      // Additional check: for same-origin messages, event.origin should match window.location.origin
      // This prevents cross-origin spoofing even if hostname matches
      if (event.origin !== window.location.origin) {
        // Allow localhost/127.0.0.1 cross-origin only in DEBUG mode
        const isLocalhost = DEBUG && 
                           (currentOrigin === 'localhost' || currentOrigin === '127.0.0.1') &&
                           (eventHostname === 'localhost' || eventHostname === '127.0.0.1');
        if (!isLocalhost) {
          dbgLog('[ThinkReview Extension] Rejected postMessage from different origin:', event.origin, 'expected:', window.location.origin);
          return;
        }
      }
    } catch (error) {
      // Invalid origin URL, reject
      dbgWarn('[ThinkReview Extension] Invalid postMessage origin:', event.origin, error);
      return;
    }
    
    if (event.data && event.data.type === 'thinkreview-auth-state') {
      console.log('[ThinkReview Extension] Received auth state via postMessage:', event.data);
      
      // Only handle login events, ignore logout (event.data.userData === null)
      if (event.data.userData !== null) {
        // Login/auth state change
        sendAuthToExtension(event.data.userData, event.data.timestamp);
      }
    }
  });
  
  console.log('[ThinkReview Extension] Webapp auth listener initialized');
})();

