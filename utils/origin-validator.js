/**
 * Origin validation utility for ThinkReview extension
 * Validates hostnames against allowed origins with strict matching to prevent spoofing
 */

// Debug toggle: set to false to disable console logs in production
// Note: This should match the DEBUG value in background.js and content-webapp-auth.js
const DEBUG = true;

/**
 * Allowed origins for webapp authentication
 * Localhost is only included when DEBUG is true
 */
export const ALLOWED_ORIGINS = [
  'thinkreview.dev',
  'portal.thinkreview.dev',
  'app.thinkreview.dev',
  ...(DEBUG ? ['localhost', '127.0.0.1'] : [])
];

/**
 * Validates if a hostname is in the allowed origins list
 * Uses strict matching to prevent spoofing (e.g., 'evilthinkreview.dev' won't match 'thinkreview.dev')
 * 
 * @param {string} hostname - The hostname to validate
 * @param {boolean} debugMode - Optional DEBUG mode override (defaults to module DEBUG constant)
 * @returns {boolean} True if the hostname is allowed, false otherwise
 */
export function isValidOrigin(hostname, debugMode = DEBUG) {
  // Localhost is only allowed in DEBUG mode
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && !debugMode) {
    return false;
  }
  
  const allowedOrigins = [
    'thinkreview.dev',
    'portal.thinkreview.dev',
    'app.thinkreview.dev',
    ...(debugMode ? ['localhost', '127.0.0.1'] : [])
  ];
  
  return allowedOrigins.some(origin => {
    // Exact match
    if (hostname === origin) return true;
    
    // Proper subdomain check (e.g., subdomain.thinkreview.dev)
    if (origin !== 'localhost' && origin !== '127.0.0.1') {
      return hostname.endsWith('.' + origin);
    }
    
    // Localhost special cases
    return (origin === 'localhost' && 
            (hostname === 'localhost' || hostname === '127.0.0.1'));
  });
}

/**
 * Validates an origin URL string
 * 
 * @param {string} originUrl - The origin URL to validate (e.g., 'https://portal.thinkreview.dev')
 * @param {boolean} debugMode - Optional DEBUG mode override
 * @returns {boolean} True if the origin is allowed, false otherwise
 */
export function isValidOriginUrl(originUrl, debugMode = DEBUG) {
  try {
    const url = new URL(originUrl);
    return isValidOrigin(url.hostname, debugMode);
  } catch (error) {
    return false;
  }
}

