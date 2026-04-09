// bitbucket-api.js
// Bitbucket API service for fetching PR diff/patch (Cloud and Data Center). Used by background script.
import { dbgLog, dbgError } from '../utils/logger.js';
import { parseBitbucketPrDiffUrl, getBitbucketPrApiUrl } from '../utils/bitbucket-api-urls.js';

/** Returns true when diffUrl points to a Bitbucket Data Center REST API endpoint. */
function isDataCenterUrl(url) {
  return typeof url === 'string' && url.includes('/rest/api/1.0/');
}

/**
 * Build request headers for Bitbucket API (Basic auth when email+token, Bearer when token only).
 * @param {string|null} token
 * @param {string|null} email
 * @returns {{ 'Accept': string, 'Authorization'?: string }}
 */
function buildAuthHeaders(token, email) {
  const headers = { 'Accept': 'application/json' };
  if (!token) return headers;
  if (email) {
    try {
      const credentials = `${email}:${token}`;
      const encoded = btoa(unescape(encodeURIComponent(credentials)));
      headers['Authorization'] = `Basic ${encoded}`;
    } catch (e) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } else {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Fetch Bitbucket PR patch/diff content (Cloud or Data Center).
 *
 * Cloud flow: parse diff URL -> GET PR API -> use links.diff.href -> GET diff (avoids 302).
 * Data Center flow: direct GET of the /rest/api/1.0/...pull-requests/{id}/diff endpoint.
 *
 * @param {string} diffUrl - Diff URL (api.bitbucket.org for Cloud; {origin}/rest/api/1.0/... for DC)
 * @param {{ token: string|null, email: string|null }} credentials
 *   For Cloud: email = Atlassian account email, token = app password.
 *   For Data Center: email = username, token = password or personal access token.
 * @returns {Promise<{ success: true, content: string }|{ success: false, error: string, bitbucketAuthRequired: boolean }>}
 */
export async function fetchPatchContent(diffUrl, { token, email }) {
  const trimmedToken = token && String(token).trim() ? token.trim() : null;
  const trimmedEmail = (email != null && email !== '' && String(email).trim()) ? String(email).trim() : null;
  const headers = buildAuthHeaders(trimmedToken, trimmedEmail);

  try {
    if (isDataCenterUrl(diffUrl)) {
      // Bitbucket Data Center: direct GET of the diff endpoint (no redirect needed)
      dbgLog('Fetching Bitbucket Data Center diff from:', diffUrl, trimmedToken ? '(with auth)' : '(no token)');
      const response = await fetch(diffUrl, { headers: { ...headers, 'Accept': 'text/plain,*/*' } });
      if (!response.ok) {
        const authRequired = response.status === 401 || response.status === 403;
        const err = new Error(`Failed to fetch Bitbucket Data Center patch: ${response.status} ${response.statusText}`);
        err.bitbucketAuthRequired = authRequired;
        throw err;
      }
      const patchContent = await response.text();
      dbgLog('Successfully fetched Bitbucket Data Center diff, length:', patchContent.length);
      return { success: true, content: patchContent };
    }

    // Bitbucket Cloud: parse diff URL -> PR API -> follow links.diff.href
    const parsed = parseBitbucketPrDiffUrl(diffUrl);
    let urlToFetch = diffUrl;

    if (parsed) {
      const prApiUrl = getBitbucketPrApiUrl(parsed.workspace, parsed.repoSlug, parsed.prId);
      dbgLog('Fetching Bitbucket Cloud PR:', prApiUrl);
      const prRes = await fetch(prApiUrl, { headers });
      if (!prRes.ok) {
        const authRequired = prRes.status === 401 || prRes.status === 403;
        const err = new Error(`Failed to fetch Bitbucket PR: ${prRes.status} ${prRes.statusText}`);
        err.bitbucketAuthRequired = authRequired;
        throw err;
      }
      const prJson = await prRes.json();
      const diffHref = prJson?.links?.diff?.href;
      if (!diffHref) {
        throw new Error('Bitbucket PR response missing links.diff.href');
      }
      urlToFetch = diffHref;
      dbgLog('Fetching Bitbucket Cloud diff from links.diff.href');
    } else {
      dbgLog('Fetching Bitbucket diff from:', diffUrl, trimmedToken ? '(with auth)' : '(no token)');
    }

    const response = await fetch(urlToFetch, { headers: { ...headers, 'Accept': 'text/plain,*/*' } });
    if (!response.ok) {
      const authRequired = response.status === 401 || response.status === 403;
      const err = new Error(`Failed to fetch Bitbucket patch: ${response.status} ${response.statusText}`);
      err.bitbucketAuthRequired = authRequired;
      throw err;
    }
    const patchContent = await response.text();
    dbgLog('Successfully fetched Bitbucket diff, length:', patchContent.length);
    return { success: true, content: patchContent };
  } catch (error) {
    dbgError('Error fetching Bitbucket patch:', error?.message || String(error));
    const msg = String(error && error.message || '');
    const authRequired = (error && error.bitbucketAuthRequired === true) || /401|403|unauthorized|forbidden/i.test(msg);
    return {
      success: false,
      error: error?.message || msg || 'Request failed',
      bitbucketAuthRequired: authRequired
    };
  }
}
