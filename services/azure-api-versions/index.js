// Azure DevOps API version registry: supported versions 4.1–7.1
import { config as v41 } from './v4.1.js';
import { config as v50 } from './v5.0.js';
import { config as v60 } from './v6.0.js';
import { config as v70 } from './v7.0.js';
import { config as v71 } from './v7.1.js';

const VERSION_CONFIGS = {
  '4.1': v41,
  '5.0': v50,
  '6.0': v60,
  '7.0': v70,
  '7.1': v71
};

export const SUPPORTED_API_VERSIONS = Object.keys(VERSION_CONFIGS);

export const DEFAULT_API_VERSION = '7.1';

/**
 * Resolve the API version string to use for requests.
 * - If cachedVersion is in SUPPORTED_API_VERSIONS, return it.
 * - If cachedVersion is 7.2 or higher, return 7.1.
 * - Otherwise return DEFAULT_API_VERSION.
 * @param {string|null} cachedVersion - Version from storage (e.g. azureOnPremiseApiVersion)
 * @returns {string} API version for request query param
 */
export function getRequestApiVersion(cachedVersion) {
  if (cachedVersion && SUPPORTED_API_VERSIONS.includes(cachedVersion)) {
    return cachedVersion;
  }
  // 7.2+ detected but we only support up to 7.1
  if (cachedVersion && (cachedVersion === '7.2' || parseFloat(cachedVersion) > 7.1)) {
    return DEFAULT_API_VERSION;
  }
  return DEFAULT_API_VERSION;
}
