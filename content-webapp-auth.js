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
  
  // Logger functions - loaded dynamically to avoid module import issues in content scripts
  // Provide fallback functions immediately, then upgrade when logger loads
  // Check if variables already exist to avoid redeclaration errors (though IIFE should prevent this)
  var dbgLog = (...args) => { if (DEBUG) console.log('[ThinkReview Extension]', ...args); };
  var dbgWarn = (...args) => { if (DEBUG) console.warn('[ThinkReview Extension]', ...args); };
  var dbgError = (...args) => { if (DEBUG) console.error('[ThinkReview Extension]', ...args); };
  
  // Initialize logger functions with dynamic import
  (async () => {
    try {
      const loggerModule = await import(chrome.runtime.getURL('utils/logger.js'));
      dbgLog = loggerModule.dbgLog;
      dbgWarn = loggerModule.dbgWarn;
      dbgError = loggerModule.dbgError;
    } catch (error) {
      dbgWarn('Failed to load logger module, using console fallback:', error);
    }
  })();
  
  // Origin validation - imported from utils/origin-validator.js
  // Using dynamic import since content scripts can't use static ES6 imports
  let isValidOrigin;
  let originValidatorLoaded = false;
  
  // Load the origin validator utility
  (async () => {
    try {
      const module = await import(chrome.runtime.getURL('utils/origin-validator.js'));
      isValidOrigin = module.isValidOrigin;
      originValidatorLoaded = true;
      initializeContentScript();
    } catch (error) {
      dbgError('Failed to load origin validator utility:', error);
      // Don't initialize if we can't load the shared utility - ensures we always use the single source of truth
      dbgError('Content script initialization aborted due to missing origin validator');
    }
  })();
  
  function initializeContentScript() {
    if (!originValidatorLoaded) return;

    // Listen for request to open extension page — runs on any domain (including localhost)
    // so the button works in dev environments too. Low-risk: only opens a new tab.
    window.addEventListener('thinkreview-open-extension', () => {
      dbgLog('Received open-extension event from webapp');
      try {
        chrome.runtime.sendMessage({ type: 'OPEN_EXTENSION_PAGE' }, (response) => {
          if (chrome.runtime.lastError) {
            dbgWarn('Failed to open extension page:', chrome.runtime.lastError);
          } else {
            dbgLog('Open extension page response:', response);
          }
        });
      } catch (error) {
        dbgError('Error sending open-extension message:', error);
      }
    });

    const currentOrigin = window.location.hostname;
    const isAllowedOrigin = isValidOrigin(currentOrigin);
  
    if (!isAllowedOrigin) {
      dbgWarn('Content script loaded on unauthorized domain:', currentOrigin);
      return; // Don't run on wrong domain
    }
  
    dbgLog('Webapp auth content script loaded on:', currentOrigin);
  
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
        dbgWarn('Invalid user data structure:', userData);
        return;
      }
      
      // SECURITY: Check timestamp freshness
      if (timestamp && (Date.now() - timestamp > MAX_AUTH_AGE)) {
        dbgWarn('Auth data is stale, ignoring');
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
            dbgWarn('Failed to send auth message:', chrome.runtime.lastError);
          } else if (response && response.success) {
            dbgLog('Auth state synced to extension');
          }
        });
      } catch (error) {
        console.error('Error sending auth message:', error);
      }
    }
  
    // Listen for custom events from webapp (login only)
    window.addEventListener('thinkreview-auth-changed', (event) => {
      dbgLog('Received auth-changed event:', event.detail);
      
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
        
        // Validate the origin hostname using shared utility
        if (!isValidOrigin(eventHostname)) {
          dbgLog('Rejected postMessage from unauthorized origin:', event.origin);
          return; // Ignore messages from unauthorized origins
        }
        
        // Same-origin: event.origin must match window.location.origin to prevent spoofing
        if (event.origin !== window.location.origin) {
          dbgLog('Rejected postMessage from different origin:', event.origin, 'expected:', window.location.origin);
          return;
        }
      } catch (error) {
        // Invalid origin URL, reject
        dbgWarn('Invalid postMessage origin:', event.origin, error);
        return;
      }
      
      if (event.data && event.data.type === 'thinkreview-auth-state') {
        dbgLog('Received auth state via postMessage:', event.data);
        
        // Only handle login events, ignore logout (event.data.userData === null)
        if (event.data.userData !== null) {
          // Login/auth state change
          sendAuthToExtension(event.data.userData, event.data.timestamp);
        }
      }
    });
  
    dbgLog('Webapp auth listener initialized');
  }
})();

