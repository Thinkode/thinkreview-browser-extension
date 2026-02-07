// honeybadger-service.js
// Honeybadger error tracking service for Chrome extension

import { HONEYBADGER_API_KEY } from './env-config.js';

let honeybadgerInitialized = false;
let Honeybadger = null;

/**
 * Check if we're in a service worker context (ES module)
 * @returns {boolean}
 */
function isServiceWorkerContext() {
  return typeof chrome !== 'undefined' && chrome.runtime && 
         typeof chrome.runtime.getBackgroundPage === 'undefined' &&
         typeof window === 'undefined';
}

/**
 * Check if we're in a content script context
 * @returns {boolean}
 */
function isContentScriptContext() {
  return typeof chrome !== 'undefined' && chrome.runtime && 
         typeof window !== 'undefined' &&
         !window.location.href.startsWith('chrome-extension://') &&
         !window.location.href.startsWith('moz-extension://');
}

/**
 * Load and initialize Honeybadger SDK
 * @returns {Promise<void>}
 */
async function initHoneybadger() {
  if (honeybadgerInitialized || !HONEYBADGER_API_KEY) return;

  try {
    const isServiceWorker = isServiceWorkerContext();
    const isContentScript = isContentScriptContext();
    
    if (isServiceWorker) {
      // For ES module service workers, we need to load via fetch and eval
      // This is the only way since importScripts() doesn't work with modules
      try {
        const response = await fetch(chrome.runtime.getURL('vendor/honeybadger.ext.min.js'));
        const scriptText = await response.text();
        // Use Function constructor to execute in global scope (self in service workers)
        // The script will set self.Honeybadger or globalThis.Honeybadger
        new Function(scriptText)();
        
        // Check both self and globalThis for Honeybadger
        const hb = (typeof self !== 'undefined' && self.Honeybadger) || 
                   (typeof globalThis !== 'undefined' && globalThis.Honeybadger) ||
                   (typeof Honeybadger !== 'undefined' ? Honeybadger : null);
        
        if (hb) {
          Honeybadger = hb;
          Honeybadger.configure({
            apiKey: HONEYBADGER_API_KEY,
            environment: 'production',
            revision: chrome.runtime.getManifest().version,
          });
          
          // Set user context if available
          try {
            const userData = await chrome.storage.local.get(['userEmail', 'userId']);
            if (userData.userEmail || userData.userId) {
              Honeybadger.setContext({
                user_id: userData.userId || undefined,
                user_email: userData.userEmail || undefined,
              });
            }
          } catch (e) {
            // Silently fail
          }
          
          honeybadgerInitialized = true;
        }
      } catch (e) {
        // Silently fail - Honeybadger is optional
      }
    } else if (isContentScript || typeof window !== 'undefined') {
      // Content scripts or extension pages: load via script tag
      return new Promise((resolve) => {
        if (typeof window === 'undefined') {
          resolve();
          return;
        }
        
        // Check if already loaded
        if (window.Honeybadger) {
          Honeybadger = window.Honeybadger;
          Honeybadger.configure({
            apiKey: HONEYBADGER_API_KEY,
            environment: 'production',
            revision: chrome.runtime.getManifest().version,
          });
          
          // Set user context
          chrome.storage.local.get(['userEmail', 'userId']).then((userData) => {
            if (userData.userEmail || userData.userId) {
              Honeybadger.setContext({
                user_id: userData.userId || undefined,
                user_email: userData.userEmail || undefined,
              });
            }
          }).catch(() => {});
          
          honeybadgerInitialized = true;
          resolve();
          return;
        }
        
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('vendor/honeybadger.ext.min.js');
        script.onload = () => {
          if (window.Honeybadger) {
            Honeybadger = window.Honeybadger;
            Honeybadger.configure({
              apiKey: HONEYBADGER_API_KEY,
              environment: 'production',
              revision: chrome.runtime.getManifest().version,
            });
            
            // Set user context
            chrome.storage.local.get(['userEmail', 'userId']).then((userData) => {
              if (userData.userEmail || userData.userId) {
                Honeybadger.setContext({
                  user_id: userData.userId || undefined,
                  user_email: userData.userEmail || undefined,
                });
              }
            }).catch(() => {});
            
            honeybadgerInitialized = true;
          }
          resolve();
        };
        script.onerror = () => resolve(); // Silently fail
        (document.head || document.documentElement).appendChild(script);
      });
    }
  } catch (error) {
    // Silently fail - Honeybadger is optional
  }
}

/**
 * Report an error to Honeybadger
 * @param {Error|string} error - Error object or error message
 * @param {Object} context - Additional context
 */
export function reportError(error, context = {}) {
  if (!honeybadgerInitialized || !Honeybadger) {
    return;
  }

  try {
    if (error instanceof Error) {
      Honeybadger.notify(error, { context });
    } else {
      Honeybadger.notify(error, {
        context: {
          level: 'error',
          ...context
        }
      });
    }
  } catch (e) {
    // Silently fail - Honeybadger shouldn't break logging
  }
}

/**
 * Report a message to Honeybadger
 * @param {string} message - Message to report
 * @param {Object} context - Additional context
 */
export function reportMessage(message, context = {}) {
  if (!honeybadgerInitialized || !Honeybadger) {
    return;
  }

  try {
    Honeybadger.notify(message, { context });
  } catch (e) {
    // Silently fail
  }
}

/**
 * Check if Honeybadger is initialized
 * @returns {boolean}
 */
export function isInitialized() {
  return honeybadgerInitialized && Honeybadger !== null;
}

// Initialize Honeybadger asynchronously
initHoneybadger().catch(() => {
  // Silently fail
});

export const HoneybadgerService = {
  initHoneybadger,
  reportError,
  reportMessage,
  isInitialized
};

