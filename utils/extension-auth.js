export const EXTENSION_AUTH_TOKEN_KEY = 'extensionAuthToken';

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
