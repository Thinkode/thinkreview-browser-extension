// analytics-service.js
// Google Analytics service using Measurement Protocol with no-cors mode

import { GA_MEASUREMENT_ID, GA_API_SECRET } from './env-config.js';

const GA_ENDPOINT = (GA_MEASUREMENT_ID && GA_API_SECRET)
  ? `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`
  : null;

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
    const result = await chrome.storage.local.get(['ga_client_id']);
    
    if (result.ga_client_id) {
      cachedClientId = result.ga_client_id;
      return cachedClientId;
    }

    const newClientId = generateUUID();
    await chrome.storage.local.set({ ga_client_id: newClientId });
    cachedClientId = newClientId;
    return newClientId;
  } catch (error) {
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
 * Send event to Google Analytics using no-cors mode
 * @param {string} eventName - Event name
 * @param {Object} eventParams - Event parameters
 * @returns {Promise<void>}
 */
async function sendEvent(eventName, eventParams = {}) {
  if (!GA_ENDPOINT) return;
  
  try {
    const clientId = await getClientId();
    const payload = {
      client_id: clientId,
      events: [{
        name: eventName,
        params: {
          ...eventParams,
          timestamp_micros: Date.now() * 1000
        }
      }]
    };

    // Use 'no-cors' mode to bypass CORS preflight
    // Response will be opaque (can't read it), but that's fine for fire-and-forget analytics
    await fetch(GA_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    // Silently fail - analytics shouldn't break the extension
  }
}

/**
 * Log event to Google Analytics
 * @param {string} level - Log level: 'log', 'warn', or 'error'
 * @param {string} component - Component/module name
 * @param {string} message - Log message
 * @param {Object} additionalData - Additional data to include
 */
export async function logToAnalytics(level, component, message, additionalData = {}) {
  const truncatedMessage = message.length > 500 ? message.substring(0, 500) + '...' : message;
  
  const eventParams = {
    log_level: level,
    component: component || 'unknown',
    message: truncatedMessage,
    ...additionalData
  };
  
  let eventName = 'extension_log';
  if (level === 'error') eventName = 'extension_error';
  else if (level === 'warn') eventName = 'extension_warn';
  
  await sendEvent(eventName, eventParams);
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
