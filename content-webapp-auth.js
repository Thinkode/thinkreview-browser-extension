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
  const ALLOWED_ORIGINS = [
    'thinkreview.dev',
    'portal.thinkreview.dev',
    'app.thinkreview.dev',
    'localhost',
    '127.0.0.1'
  ];
  
  const currentOrigin = window.location.hostname;
  const isAllowedOrigin = ALLOWED_ORIGINS.some(origin => 
    currentOrigin === origin || 
    currentOrigin.includes(origin) || 
    currentOrigin.endsWith('.' + origin) ||
    (origin === 'localhost' && (currentOrigin === 'localhost' || currentOrigin === '127.0.0.1'))
  );
  
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
    // SECURITY: Verify origin before processing
    if (!isAllowedOrigin || !event.origin.includes(currentOrigin.split('.').slice(-2).join('.'))) {
      return; // Ignore messages from other origins
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

