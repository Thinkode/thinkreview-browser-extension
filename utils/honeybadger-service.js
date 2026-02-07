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
 * Safe configure + setContext helper; never throws.
 */
function safeConfigure(hb, apiKey, revision) {
  try {
    if (!hb || typeof hb.configure !== 'function') return false;
    hb.configure({
      apiKey,
      environment: 'production',
      revision: revision || '',
    });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Load and initialize Honeybadger SDK. Wrapped in error boundaries so vendor load/init failures never break the extension.
 * @returns {Promise<void>}
 */
async function initHoneybadger() {
  if (honeybadgerInitialized || !HONEYBADGER_API_KEY) return;

  try {
    const isServiceWorker = isServiceWorkerContext();
    const isContentScript = isContentScriptContext();
    const revision = typeof chrome?.runtime?.getManifest === 'function' ? chrome.runtime.getManifest().version : '';

    if (isServiceWorker) {
      // For ES module service workers, we need to load via fetch and eval
      try {
        const response = await fetch(chrome.runtime.getURL('vendor/honeybadger.ext.min.js'));
        if (!response.ok) return;
        const scriptText = await response.text();
        try {
          new Function(scriptText)();
        } catch (_) {
          return; // Vendor script execution failed
        }

        const hb = (typeof self !== 'undefined' && self.Honeybadger) ||
                   (typeof globalThis !== 'undefined' && globalThis.Honeybadger) ||
                   (typeof Honeybadger !== 'undefined' ? Honeybadger : null);

        if (hb && safeConfigure(hb, HONEYBADGER_API_KEY, revision)) {
          Honeybadger = hb;
          try {
            const userData = await chrome.storage.local.get(['userEmail', 'userId']);
            if (userData.userEmail || userData.userId) {
              Honeybadger.setContext({
                user_id: userData.userId || undefined,
                user_email: userData.userEmail || undefined,
              });
            }
          } catch (_) {}
          honeybadgerInitialized = true;
        }
      } catch (_) {
        // fetch/network or script load failed
      }
      return;
    }

    if (isContentScript || typeof window !== 'undefined') {
      return new Promise((resolve) => {
        try {
          if (typeof window === 'undefined') {
            resolve();
            return;
          }

          if (window.Honeybadger) {
            if (safeConfigure(window.Honeybadger, HONEYBADGER_API_KEY, revision)) {
              Honeybadger = window.Honeybadger;
              honeybadgerInitialized = true;
              chrome.storage?.local?.get(['userEmail', 'userId']).then((userData) => {
                try {
                  if (userData?.userEmail || userData?.userId) {
                    Honeybadger?.setContext?.({
                      user_id: userData.userId || undefined,
                      user_email: userData.userEmail || undefined,
                    });
                  }
                } catch (_) {}
              }).catch(() => {});
            }
            resolve();
            return;
          }

          const script = document.createElement('script');
          script.src = chrome.runtime.getURL('vendor/honeybadger.ext.min.js');
          script.onload = () => {
            try {
              if (window.Honeybadger && safeConfigure(window.Honeybadger, HONEYBADGER_API_KEY, revision)) {
                Honeybadger = window.Honeybadger;
                honeybadgerInitialized = true;
                chrome.storage?.local?.get(['userEmail', 'userId']).then((userData) => {
                  try {
                    if (userData?.userEmail || userData?.userId) {
                      Honeybadger?.setContext?.({
                        user_id: userData.userId || undefined,
                        user_email: userData.userEmail || undefined,
                      });
                    }
                  } catch (_) {}
                }).catch(() => {});
              }
            } catch (_) {}
            resolve();
          };
          script.onerror = () => resolve();
          (document.head || document.documentElement).appendChild(script);
        } catch (_) {
          resolve();
        }
      });
    }
  } catch (_) {
    // Top-level boundary: init must never throw
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

