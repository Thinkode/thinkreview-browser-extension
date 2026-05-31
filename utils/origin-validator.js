/**
 * Origin validation utility for ThinkReview extension
 * Validates hostnames against allowed origins with strict matching to prevent spoofing
 */

/**
 * Allowed origins for webapp authentication (production only)
 */
export const ALLOWED_ORIGINS = [
  'thinkreview.dev',
  'portal.thinkreview.dev',
  'app.thinkreview.dev',
];

/**
 * Validates if a hostname is in the allowed origins list
 * Uses strict matching to prevent spoofing (e.g. 'evilthinkreview.dev' won't match 'thinkreview.dev')
 *
 * @param {string} hostname - The hostname to validate
 * @returns {boolean} True if the hostname is allowed, false otherwise
 */
export function isValidOrigin(hostname) {
  return ALLOWED_ORIGINS.some(origin => {
    // Exact match
    if (hostname === origin) return true;
    // Proper subdomain check (e.g. subdomain.thinkreview.dev)
    return hostname.endsWith('.' + origin);
  });
}

/**
 * Validates an origin URL string
 *
 * @param {string} originUrl - The origin URL to validate (e.g. 'https://portal.thinkreview.dev')
 * @returns {boolean} True if the origin is allowed, false otherwise
 */
export function isValidOriginUrl(originUrl) {
  try {
    const url = new URL(originUrl);
    return isValidOrigin(url.hostname);
  } catch (error) {
    return false;
  }
}
