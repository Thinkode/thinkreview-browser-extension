// analytics-service.js
// Google Analytics service using Measurement Protocol for browser extensions

// Configuration - Replace with your GA4 Measurement ID and API Secret
// Get these from: https://analytics.google.com/
const GA_MEASUREMENT_ID = 'G-HM2CWJREJ1'; // Your GA4 Measurement ID
const GA_API_SECRET = 'pekxL43pRVGKSOKuL155_g'; // Your Measurement Protocol API Secret
const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

// Cache for client ID
let cachedClientId = null;

/**
 * Get or create a unique client ID for this extension installation
 * @returns {Promise<string>} Client ID
 */
async function getClientId() {
  if (cachedClientId) {
    return cachedClientId;
  }

  try {
    // Try to get existing client ID from storage
    const result = await chrome.storage.local.get(['ga_client_id']);
    
    if (result.ga_client_id) {
      cachedClientId = result.ga_client_id;
      return cachedClientId;
    }

    // Generate new client ID (UUID v4 format)
    const newClientId = generateUUID();
    await chrome.storage.local.set({ ga_client_id: newClientId });
    cachedClientId = newClientId;
    return newClientId;
  } catch (error) {
    // Fallback: generate a client ID even if storage fails
    console.warn('[Analytics] Failed to get/set client ID from storage:', error);
    if (!cachedClientId) {
      cachedClientId = generateUUID();
    }
    return cachedClientId;
  }
}

/**
 * Generate a UUID v4
 * @returns {string} UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Check if we're running in a content script context (page context)
 * Content scripts run in page context and can't make direct fetch requests due to CORS
 */
function isContentScriptContext() {
  try {
    // Service workers (background scripts) don't have window
    if (typeof window === 'undefined') {
      return false;
    }
    
    // If we have window.location and it's not a chrome-extension:// URL,
    // we're likely in a content script running in a page context
    if (window.location && !window.location.href.startsWith('chrome-extension://') &&
        !window.location.href.startsWith('chrome://') &&
        !window.location.href.startsWith('moz-extension://')) {
      return true;
    }
  } catch (e) {
    // If we can't access window.location, assume we're not in content script
    return false;
  }
  return false;
}

/**
 * Send event to Google Analytics
 * @param {string} eventName - Event name
 * @param {Object} eventParams - Event parameters
 * @returns {Promise<void>}
 */
async function sendEvent(eventName, eventParams = {}) {
  try {
    const clientId = await getClientId();
    
    const payload = {
      client_id: clientId,
      events: [{
        name: eventName,
        params: {
          ...eventParams,
          // Add timestamp
          timestamp_micros: Date.now() * 1000
        }
      }]
    };

    // If we're in a content script context, route through background script to avoid CORS
    if (isContentScriptContext() && typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        // Send message to background script - it will handle the actual fetch
        chrome.runtime.sendMessage({
          type: 'SEND_ANALYTICS_EVENT',
          eventName: eventName,
          eventParams: eventParams
        }, (response) => {
          if (chrome.runtime.lastError) {
            // Silently fail - analytics shouldn't break the extension
            // Don't log to avoid console spam
          }
        });
        return; // Don't try direct fetch in content script
      } catch (error) {
        // Silently fail - analytics shouldn't break the extension
        // Don't log to avoid console spam
      }
    }

    // Direct fetch (works in background script, popup, etc.)
    const response = await fetch(GA_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn('[Analytics] Failed to send event:', response.status, response.statusText);
    }
  } catch (error) {
    // Silently fail - don't break the extension if analytics fails
    console.warn('[Analytics] Error sending event:', error);
  }
}

/**
 * Log debug event to Google Analytics
 * @param {string} level - Log level: 'log', 'warn', or 'error'
 * @param {string} component - Component/module name
 * @param {string} message - Log message
 * @param {Object} additionalData - Additional data to include
 */
export async function logToAnalytics(level, component, message, additionalData = {}) {
  // Truncate message to avoid payload size issues
  const truncatedMessage = message.length > 500 ? message.substring(0, 500) + '...' : message;
  
  const eventParams = {
    log_level: level,
    component: component || 'unknown',
    message: truncatedMessage,
    ...additionalData
  };
  
  // Use consistent event names for all log levels
  if (eventParams.log_level === 'error') {
    await sendEvent('extension_error', eventParams);
  }
  else if (eventParams.log_level === 'warn') {
    await sendEvent('extension_warn', eventParams);
  }
  else {
    await sendEvent('extension_log', eventParams);
  }
}

/**
 * Track key user actions/events
 * @param {string} eventName - Event name that describes the action (e.g., 'copy_button', 'refresh_review', 'ai_review_clicked')
 * @param {Object} params - Additional parameters (e.g., { context: 'review_item', location: 'integrated_panel' })
 */
export async function trackUserAction(eventName, params = {}) {
  await sendEvent(eventName, params);
}

export const AnalyticsService = {
  sendEvent,
  logToAnalytics,
  trackUserAction,
  getClientId
};

