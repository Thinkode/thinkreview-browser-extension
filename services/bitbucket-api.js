// bitbucket-api.js
// Router: delegates to the correct Bitbucket implementation based on URL.
//   Bitbucket Cloud      → services/bitbucket-cloud-api.js  (Basic auth, api.bitbucket.org)
//   Bitbucket Data Center → services/bitbucket-dc-api.js    (Bearer auth, /rest/api/1.0/)
// background.js imports only this file and calls fetchPatchContent() without needing
// to know which platform it is dealing with.
import { fetchCloudPatchContent } from './bitbucket-cloud-api.js';
import { fetchDataCenterPatchContent } from './bitbucket-dc-api.js';

/** Returns true when the URL points to a Bitbucket Data Center REST API endpoint. */
function isDataCenterUrl(url) {
  return typeof url === 'string' && url.includes('/rest/api/1.0/');
}

/**
 * Fetch Bitbucket PR diff as unified patch text (Cloud or Data Center).
 *
 * @param {string} diffUrl
 * @param {{ token: string|null, email: string|null }} credentials
 *   Cloud:       email = Atlassian account email, token = app-password
 *   Data Center: token = HTTP access token (email/username not used)
 * @returns {Promise<{ success: true, content: string } | { success: false, error: string, bitbucketAuthRequired: boolean, serverMessage: string|null }>}
 */
export async function fetchPatchContent(diffUrl, { token, email }) {
  if (isDataCenterUrl(diffUrl)) {
    return fetchDataCenterPatchContent(diffUrl, { token });
  }
  return fetchCloudPatchContent(diffUrl, { token, email });
}
