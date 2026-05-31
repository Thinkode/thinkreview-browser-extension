export const EXTENSION_AUTH_TOKEN_KEY = 'extensionAuthToken';

const SESSION_STORAGE_KEYS = [
  EXTENSION_AUTH_TOKEN_KEY,
  'user',
  'userData',
  'oauth_token',
  'oauth_user',
  'authSource',
  'lastSynced',
];

export class AuthExpiredError extends Error {
  constructor(message = 'Session expired. Please sign in again.') {
    super(message);
    this.name = 'AuthExpiredError';
    this.status = 401;
    this.isAuthExpired = true;
  }
}

/**
 * Headers for ThinkReview cloud function requests (Bearer when token is stored).
 * @returns {Promise<Record<string, string>>}
 */
export async function getThinkReviewAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const stored = await chrome.storage.local.get([EXTENSION_AUTH_TOKEN_KEY]);
    const token = stored[EXTENSION_AUTH_TOKEN_KEY];
    if (token && typeof token === 'string') {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (_) {
    // Non-extension context or storage unavailable
  }
  return headers;
}

/** Clear extension session so UI treats the user as signed out. */
export async function clearExtensionAuthSession() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.remove(SESSION_STORAGE_KEYS);
}

/** Notify popup / content scripts that the session expired. */
export function notifyAuthSessionExpired() {
  try {
    chrome.runtime.sendMessage({ type: 'AUTH_SESSION_EXPIRED' }).catch(() => {});
  } catch (_) {
    // Non-extension context
  }
}

/** Clear local session and broadcast to extension UI. */
export async function handleUnauthorizedResponse() {
  await clearExtensionAuthSession();
  notifyAuthSessionExpired();
}

export function isAuthExpiredError(err) {
  return !!(err && (err.isAuthExpired || err.status === 401 || err.name === 'AuthExpiredError'));
}
