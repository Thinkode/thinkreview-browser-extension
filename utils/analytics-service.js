// analytics-service.js
// Google Analytics Measurement Protocol. Every hit includes session_id so GA4
// can attribute users/sessions (MP without session_id reports activeUsers = 0).

import { GA_MEASUREMENT_ID, GA_API_SECRET } from './env-config.js';

const GA_ENDPOINT = (GA_MEASUREMENT_ID && GA_API_SECRET)
  ? `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`
  : null;

const GA_EVENT_NAME_MAX = 40;
const GA_PARAM_NAME_MAX = 40;
const GA_PARAM_VALUE_MAX = 100;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const CONTEXT_CACHE_MS = 5000;

/** Mark these as key events in the GA4 Admin UI (code cannot mark them remotely). */
export const KEY_EVENT_COPY_BUTTON = 'copy_button';
export const KEY_EVENT_UPGRADE_BUTTON_CLICKED = 'upgrade_button_clicked';
export const KEY_EVENT_CHAT_MESSAGE_SENT = 'chat_message_sent';
export const KEY_EVENT_CREDIT_PACK_CHECKOUT = 'credit_pack_checkout_clicked';
export const KEY_EVENT_LIMIT_BANNER_VIEW_MY_USAGE = 'limit_reached_view_my_usage_clicked';
export const KEY_EVENT_TOUR_COMPLETED = 'panel_settings_tour_completed';

export const KEY_EVENTS = {
  COPY_BUTTON: KEY_EVENT_COPY_BUTTON,
  UPGRADE_BUTTON_CLICKED: KEY_EVENT_UPGRADE_BUTTON_CLICKED,
  CHAT_MESSAGE_SENT: KEY_EVENT_CHAT_MESSAGE_SENT,
  CREDIT_PACK_CHECKOUT: KEY_EVENT_CREDIT_PACK_CHECKOUT,
  LIMIT_REACHED_VIEW_USAGE: KEY_EVENT_LIMIT_BANNER_VIEW_MY_USAGE,
  TOUR_COMPLETED: KEY_EVENT_TOUR_COMPLETED
};

let cachedClientId = null;
let sessionState = null;
let contextOverlay = {};
let sharedContextCache = { at: 0, value: {} };

/**
 * Overlay params merged into every event (e.g. platform, model_key for the current review).
 * @param {Object} partial
 */
export function setAnalyticsContext(partial = {}) {
  const next = {};
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined || value === null || value === '') continue;
    next[key] = value;
  }
  contextOverlay = { ...contextOverlay, ...next };
}

/**
 * @param {string[]|null} [keys] - Keys to remove. Omit to clear the overlay.
 */
export function clearAnalyticsContext(keys) {
  if (!keys) {
    contextOverlay = {};
    return;
  }
  for (const key of keys) {
    delete contextOverlay[key];
  }
}

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
    return cachedClientId;
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

function sanitizeEventName(eventName) {
  const cleaned = String(eventName || 'unknown')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .slice(0, GA_EVENT_NAME_MAX);
  if (!cleaned) return 'unknown';
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `e_${cleaned}`.slice(0, GA_EVENT_NAME_MAX);
}

function sanitizeParamName(name) {
  const cleaned = String(name || 'param')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .slice(0, GA_PARAM_NAME_MAX);
  if (!cleaned) return 'param';
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `p_${cleaned}`.slice(0, GA_PARAM_NAME_MAX);
}

function sanitizeParamValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const str = String(value);
  return str.length > GA_PARAM_VALUE_MAX ? str.slice(0, GA_PARAM_VALUE_MAX) : str;
}

function normalizePlanTier(raw) {
  const s = String(raw || 'free').trim().toLowerCase();
  if (s === 'professional' || s === 'pro') return 'professional';
  if (s === 'lite') return 'lite';
  if (s === 'teams' || s === 'team') return 'teams';
  if (s === 'enterprise') return 'enterprise';
  if (s === 'free' || !s) return 'free';
  return s.slice(0, GA_PARAM_VALUE_MAX);
}

function inferPlatformFromLocation() {
  try {
    if (typeof location === 'undefined' || !location.hostname) return undefined;
    const host = location.hostname;
    if (host.includes('gitlab')) return 'gitlab';
    if (host.includes('github')) return 'github';
    if (host.includes('dev.azure') || host.includes('visualstudio')) return 'azure';
    if (host.includes('bitbucket')) return 'bitbucket';
  } catch {
    // background / popup have no PR host
  }
  return undefined;
}

function isSignedInFromStorage(result) {
  if (result?.userData?.email) return true;
  if (!result?.user) return false;
  try {
    const parsed = typeof result.user === 'string' ? JSON.parse(result.user) : result.user;
    return !!(parsed && parsed.email);
  } catch {
    return false;
  }
}

async function loadSharedContext() {
  const now = Date.now();
  if (now - sharedContextCache.at < CONTEXT_CACHE_MS && sharedContextCache.value) {
    return sharedContextCache.value;
  }

  const shared = {};
  try {
    const result = await chrome.storage.local.get([
      'userSubscriptionData',
      'subscriptionType',
      'userData',
      'user',
      'code-review-format',
      'aiProvider'
    ]);
    const planRaw =
      result.userSubscriptionData?.userSubscriptionType ||
      result.subscriptionType ||
      'free';
    shared.plan_tier = normalizePlanTier(planRaw);
    shared.is_authenticated = isSignedInFromStorage(result) ? 1 : 0;
    shared.review_format = result['code-review-format'] === 'scoring' ? 'scoring' : 'severity';
    if (result.aiProvider) shared.ai_provider = String(result.aiProvider);
  } catch {
    shared.plan_tier = 'free';
    shared.is_authenticated = 0;
    shared.review_format = 'severity';
  }

  const platform = inferPlatformFromLocation();
  if (platform) shared.platform = platform;

  sharedContextCache = { at: now, value: shared };
  return shared;
}

async function getSessionParams() {
  const now = Date.now();
  if (
    sessionState &&
    now - sessionState.lastEventAt < SESSION_TIMEOUT_MS
  ) {
    const engagement = Math.max(1, Math.min(now - sessionState.lastEventAt, 3600000));
    sessionState.lastEventAt = now;
    try {
      await chrome.storage.local.set({
        ga_session_id: sessionState.id,
        ga_session_last_ts: now
      });
    } catch {
      // ignore
    }
    return {
      session_id: sessionState.id,
      engagement_time_msec: engagement
    };
  }

  try {
    const stored = await chrome.storage.local.get(['ga_session_id', 'ga_session_last_ts']);
    const lastTs = Number(stored.ga_session_last_ts) || 0;
    const storedId = Number(stored.ga_session_id) || 0;
    if (storedId && lastTs && now - lastTs < SESSION_TIMEOUT_MS) {
      const engagement = Math.max(1, Math.min(now - lastTs, 3600000));
      sessionState = { id: storedId, lastEventAt: now };
      await chrome.storage.local.set({ ga_session_last_ts: now });
      return { session_id: storedId, engagement_time_msec: engagement };
    }
  } catch {
    // ignore and start a new session
  }

  const id = now;
  sessionState = { id, lastEventAt: now };
  try {
    await chrome.storage.local.set({
      ga_session_id: id,
      ga_session_last_ts: now
    });
  } catch {
    // ignore
  }
  return {
    session_id: id,
    engagement_time_msec: 100
  };
}

function buildEventParams(eventParams, shared, session) {
  const merged = {
    ...shared,
    ...contextOverlay,
    ...eventParams,
    ...session
  };
  const params = {};
  for (const [rawKey, rawValue] of Object.entries(merged)) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const key = sanitizeParamName(rawKey);
    const value = sanitizeParamValue(rawValue);
    if (value === undefined) continue;
    params[key] = value;
  }
  return params;
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
    const [clientId, shared, session] = await Promise.all([
      getClientId(),
      loadSharedContext(),
      getSessionParams()
    ]);
    const name = sanitizeEventName(eventName);
    const params = buildEventParams(eventParams, shared, session);
    const payload = {
      client_id: clientId,
      timestamp_micros: String(Date.now() * 1000),
      events: [{
        name,
        params
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

/**
 * Same as trackUserAction; swallows errors so call sites stay one-liners.
 * @param {string} eventName
 * @param {Object} [params]
 */
export function trackUserActionSafe(eventName, params = {}) {
  return trackUserAction(eventName, params).catch(() => {});
}

export const AnalyticsService = {
  sendEvent,
  logToAnalytics,
  trackUserAction,
  trackUserActionSafe,
  setAnalyticsContext,
  clearAnalyticsContext,
  getClientId,
  KEY_EVENT_LIMIT_BANNER_VIEW_MY_USAGE,
  KEY_EVENTS
};
