/**
 * URL normalization utilities for GitHub and GitLab PR/MR pages
 * Handles removal of path segments and query parameters to get base PR/MR URLs
 */

/**
 * GitHub PR URL suffixes that should be removed to get the base PR URL
 * These are common tabs/pages within a GitHub PR
 */
const GITHUB_PR_URL_SUFFIXES = [
  '/files',
  '/commits',
  '/checks',
  '/conversation',
  '/activity',
  '/review',
  '/reviews',
  '/files-changed',
  '/commits-changed'
];

/**
 * GitLab MR URL suffixes that should be removed to get the base MR URL
 * These are common tabs/pages within a GitLab MR
 */
const GITLAB_MR_URL_SUFFIXES = [
  '/diffs',
  '/commits',
  '/pipelines',
  '/notes',
  '/changes',
  '/merge_requests'
];

/**
 * Normalize a GitHub PR URL by removing path segments after the PR number
 * @param {string} url - The full GitHub PR URL
 * @returns {string} Normalized base PR URL
 */
export function normalizeGitHubPRUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Match pattern: /owner/repo/pull/{number}
    const prMatch = pathname.match(/^(\/[^\/]+\/[^\/]+\/pull\/\d+)/);
    
    if (!prMatch) {
      // Not a valid PR URL pattern, return original
      return url;
    }
    
    // Get the base PR path (e.g., /owner/repo/pull/45)
    const basePRPath = prMatch[1];
    
    // Reconstruct URL with base path only (remove hash and query params)
    urlObj.pathname = basePRPath;
    urlObj.hash = '';
    urlObj.search = '';
    
    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, return original
    console.warn('[URL Normalizer] Failed to normalize GitHub PR URL:', error);
    return url;
  }
}

/**
 * Normalize a GitLab MR URL by removing path segments after the MR number
 * @param {string} url - The full GitLab MR URL
 * @returns {string} Normalized base MR URL
 */
export function normalizeGitLabMRUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Match pattern: /owner/repo/-/merge_requests/{number} or /owner/repo/merge_requests/{number}
    const mrMatch = pathname.match(/^(\/[^\/]+\/[^\/]+(?:\/-\/)?merge_requests\/\d+)/);
    
    if (!mrMatch) {
      // Not a valid MR URL pattern, return original
      return url;
    }
    
    // Get the base MR path
    const baseMRPath = mrMatch[1];
    
    // Reconstruct URL with base path only (remove hash and query params)
    urlObj.pathname = baseMRPath;
    urlObj.hash = '';
    urlObj.search = '';
    
    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, return original
    console.warn('[URL Normalizer] Failed to normalize GitLab MR URL:', error);
    return url;
  }
}

/**
 * Normalize a URL based on the platform (GitHub or GitLab)
 * @param {string} url - The full PR/MR URL
 * @param {string} platform - Platform identifier ('github' or 'gitlab')
 * @returns {string} Normalized base PR/MR URL
 */
export function normalizePRUrl(url, platform) {
  if (platform === 'github') {
    return normalizeGitHubPRUrl(url);
  } else if (platform === 'gitlab') {
    return normalizeGitLabMRUrl(url);
  }
  
  // Unknown platform, return original URL
  return url;
}

/**
 * Get the list of known GitHub PR URL suffixes
 * @returns {string[]} Array of suffix strings
 */
export function getGitHubPRSuffixes() {
  return [...GITHUB_PR_URL_SUFFIXES];
}

/**
 * Get the list of known GitLab MR URL suffixes
 * @returns {string[]} Array of suffix strings
 */
export function getGitLabMRSuffixes() {
  return [...GITLAB_MR_URL_SUFFIXES];
}

