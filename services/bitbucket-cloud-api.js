// bitbucket-cloud-api.js
// Fetches PR diff/patch from Bitbucket Cloud (api.bitbucket.org).
// Auth: HTTP Basic using Atlassian account email + app-password.
// Flow: diff URL → PR API (to resolve links.diff.href) → GET diff text.
import { dbgLog, dbgError } from '../utils/logger.js';
import { parseBitbucketPrDiffUrl, getBitbucketPrApiUrl } from '../utils/bitbucket-api-urls.js';

/**
 * Build Basic auth headers for Bitbucket Cloud (email + app-password).
 * Falls back to Bearer when no email is provided.
 * @param {string|null} token
 * @param {string|null} email
 * @returns {Record<string, string>}
 */
function buildCloudAuthHeaders(token, email) {
  const headers = { 'Accept': 'application/json' };
  if (!token) return headers;
  if (email) {
    try {
      const encoded = btoa(unescape(encodeURIComponent(`${email}:${token}`)));
      headers['Authorization'] = `Basic ${encoded}`;
    } catch (_) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } else {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Fetch Bitbucket Cloud PR diff as unified patch text.
 *
 * @param {string} diffUrl - api.bitbucket.org diff URL
 * @param {{ token: string|null, email: string|null }} credentials
 * @returns {Promise<{ success: true, content: string } | { success: false, error: string, bitbucketAuthRequired: boolean, serverMessage: string|null }>}
 */
export async function fetchCloudPatchContent(diffUrl, { token, email }) {
  const trimmedToken = token && String(token).trim() ? token.trim() : null;
  const trimmedEmail = email && String(email).trim() ? String(email).trim() : null;
  const headers = buildCloudAuthHeaders(trimmedToken, trimmedEmail);

  try {
    // Resolve the actual diff URL via the PR API (avoids a 302 redirect on the direct diff URL)
    const parsed = parseBitbucketPrDiffUrl(diffUrl);
    let urlToFetch = diffUrl;

    if (parsed) {
      const prApiUrl = getBitbucketPrApiUrl(parsed.workspace, parsed.repoSlug, parsed.prId);
      dbgLog('Fetching Bitbucket Cloud PR:', prApiUrl);
      const prRes = await fetch(prApiUrl, { headers });
      if (!prRes.ok) {
        const authRequired = prRes.status === 401 || prRes.status === 403;
        let serverMessage = null;
        try { serverMessage = (await prRes.text()).trim() || null; } catch (_) {}
        const err = new Error(`Failed to fetch Bitbucket PR: ${prRes.status} ${prRes.statusText}`);
        err.bitbucketAuthRequired = authRequired;
        err.serverMessage = serverMessage;
        throw err;
      }
      const prJson = await prRes.json();
      const diffHref = prJson?.links?.diff?.href;
      if (!diffHref) throw new Error('Bitbucket PR response missing links.diff.href');
      urlToFetch = diffHref;
      dbgLog('Fetching Bitbucket Cloud diff from links.diff.href');
    } else {
      dbgLog('Fetching Bitbucket Cloud diff from:', diffUrl, trimmedToken ? '(with auth)' : '(no token)');
    }

    const response = await fetch(urlToFetch, { headers: { ...headers, 'Accept': 'text/plain,*/*' } });
    if (!response.ok) {
      const authRequired = response.status === 401 || response.status === 403;
      let serverMessage = null;
      try { serverMessage = (await response.text()).trim() || null; } catch (_) {}
      const err = new Error(`Failed to fetch Bitbucket patch: ${response.status} ${response.statusText}`);
      err.bitbucketAuthRequired = authRequired;
      err.serverMessage = serverMessage;
      throw err;
    }

    const content = await response.text();
    dbgLog('Successfully fetched Bitbucket Cloud diff, length:', content.length);
    return { success: true, content };
  } catch (error) {
    dbgError('Error fetching Bitbucket Cloud patch:', error?.message || String(error));
    const msg = String(error?.message || '');
    const authRequired = error?.bitbucketAuthRequired === true || /401|403|unauthorized|forbidden/i.test(msg);
    return { success: false, error: msg || 'Request failed', bitbucketAuthRequired: authRequired, serverMessage: error?.serverMessage || null };
  }
}
