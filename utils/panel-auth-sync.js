/**
 * Helpers for picking up portal / webapp sign-in in the integrated review pane
 * without requiring a full page refresh.
 */

export const LOGIN_PROMPT_ID = 'review-login-prompt';
export const AUTH_POLL_INTERVAL_MS = 1500;
export const WEBAPP_AUTH_SYNCED_TYPE = 'WEBAPP_AUTH_SYNCED';

/**
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function isLoginPromptVisible(doc = document) {
  const el = doc.getElementById(LOGIN_PROMPT_ID);
  return !!(el && !el.classList.contains('gl-hidden'));
}

/**
 * True when a chrome.storage change payload looks like a successful login.
 * @param {Record<string, { newValue?: unknown }>} changes
 * @returns {boolean}
 */
export function storageChangeLooksLikeLogin(changes) {
  if (!changes || typeof changes !== 'object') return false;
  if (changes.userData?.newValue) return true;
  if (changes.oauth_user?.newValue) return true;

  const userVal = changes.user?.newValue;
  if (!userVal) return false;
  if (typeof userVal === 'object' && userVal.email) return true;
  if (typeof userVal === 'string') {
    try {
      const parsed = JSON.parse(userVal);
      return !!(parsed && parsed.email);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Watches for auth becoming available while the integrated-pane login prompt is showing.
 * @param {{
 *   isUserLoggedIn: () => boolean | Promise<boolean>,
 *   onAuthAvailable: () => unknown | Promise<unknown>,
 *   getDocument?: () => Document,
 *   setIntervalFn?: typeof setInterval,
 *   clearIntervalFn?: typeof clearInterval,
 * }} options
 */
export function createLoginAuthWatcher(options) {
  const {
    isUserLoggedIn,
    onAuthAvailable,
    getDocument = () => document,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  } = options;

  let pollId = null;
  let inFlight = false;

  function stopPoll() {
    if (pollId != null) {
      clearIntervalFn(pollId);
      pollId = null;
    }
  }

  async function handleAuthAvailable() {
    if (inFlight) return false;
    if (!isLoginPromptVisible(getDocument())) return false;

    inFlight = true;
    try {
      const loggedIn = await isUserLoggedIn();
      if (!loggedIn) return false;
      if (!isLoginPromptVisible(getDocument())) return false;
      stopPoll();
      await onAuthAvailable();
      return true;
    } finally {
      inFlight = false;
    }
  }

  function startPoll() {
    stopPoll();
    const tick = () => handleAuthAvailable();
    pollId = setIntervalFn(tick, AUTH_POLL_INTERVAL_MS);
    return tick();
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local') return;
    if (storageChangeLooksLikeLogin(changes)) {
      return handleAuthAvailable();
    }
  }

  function onRuntimeMessage(message) {
    if (message?.type === WEBAPP_AUTH_SYNCED_TYPE) {
      return handleAuthAvailable();
    }
  }

  return {
    startPoll,
    stopPoll,
    handleAuthAvailable,
    onStorageChanged,
    onRuntimeMessage,
    isPolling: () => pollId != null,
  };
}
