// bitbucket-api.js
// Bitbucket API service for fetching PR diff/patch (Cloud and Data Center). Used by background script.
import { dbgLog, dbgError } from '../utils/logger.js';
import { parseBitbucketPrDiffUrl, getBitbucketPrApiUrl } from '../utils/bitbucket-api-urls.js';

/** Returns true when diffUrl points to a Bitbucket Data Center REST API endpoint. */
function isDataCenterUrl(url) {
  return typeof url === 'string' && url.includes('/rest/api/1.0/');
}

/**
 * Convert Bitbucket Data Center diff JSON to unified diff (patch) format.
 *
 * DC diff JSON structure:
 *   { diffs: [ { source, destination, binary, hunks: [ { sourceLine, sourceSpan,
 *     destinationLine, destinationSpan, context, segments: [ { type, lines: [{ line }] } ] } ] } ] }
 *
 * Segment types: CONTEXT → ' ', ADDED → '+', REMOVED → '-'
 *
 * @param {Object} diffJson - Parsed JSON from /rest/api/1.0/…/pull-requests/{id}/diff
 * @returns {string} Unified diff text
 */
function convertDataCenterDiffToUnifiedPatch(diffJson) {
  const output = [];
  const diffs = diffJson.diffs || diffJson.values || [];

  for (const diff of diffs) {
    const srcPath = diff.source?.toString ?? null;
    const dstPath = diff.destination?.toString ?? null;
    const aPath = srcPath || dstPath || 'unknown';
    const bPath = dstPath || srcPath || 'unknown';

    output.push(`diff --git a/${aPath} b/${bPath}`);

    if (diff.binary) {
      output.push(`Binary files a/${aPath} and b/${bPath} differ`);
      continue;
    }

    // New / deleted file markers
    if (!srcPath && dstPath) {
      output.push('new file mode 100644');
      output.push('--- /dev/null');
      output.push(`+++ b/${dstPath}`);
    } else if (srcPath && !dstPath) {
      output.push('deleted file mode 100644');
      output.push(`--- a/${srcPath}`);
      output.push('+++ /dev/null');
    } else {
      output.push(`--- a/${aPath}`);
      output.push(`+++ b/${bPath}`);
    }

    for (const hunk of (diff.hunks || [])) {
      const srcStart  = hunk.sourceLine      ?? 1;
      const srcSpan   = hunk.sourceSpan      ?? 0;
      const dstStart  = hunk.destinationLine ?? 1;
      const dstSpan   = hunk.destinationSpan ?? 0;
      const ctx       = hunk.context ? ` ${hunk.context}` : '';
      output.push(`@@ -${srcStart},${srcSpan} +${dstStart},${dstSpan} @@${ctx}`);

      for (const segment of (hunk.segments || [])) {
        const prefix = segment.type === 'ADDED' ? '+' : segment.type === 'REMOVED' ? '-' : ' ';
        for (const ln of (segment.lines || [])) {
          output.push(`${prefix}${ln.line ?? ''}`);
        }
      }
    }
  }

  return output.join('\n') + (output.length ? '\n' : '');
}

/**
 * Build request headers for Bitbucket Cloud (Basic auth: email + app-password).
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
 * Build request headers for Bitbucket Data Center (Bearer auth using HTTP access token).
 * DC HTTP access tokens are standalone — username is not needed for the Authorization header.
 * Basic auth is frequently disabled on DC instances; Bearer is the recommended approach.
 * @param {string|null} token - HTTP access token or password
 * @param {string|null} username - Stored for reference but not used in Bearer auth
 * @returns {{ 'Accept': string, 'Authorization'?: string }}
 */
function buildDataCenterAuthHeaders(token, username) {
  const headers = { 'Accept': 'application/json' };
  if (!token) return headers;
  headers['Authorization'] = `Bearer ${token}`;
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

  try {
    if (isDataCenterUrl(diffUrl)) {
      // Bitbucket Data Center: Bearer token auth; API always returns JSON (not unified diff text)
      const headers = buildDataCenterAuthHeaders(trimmedToken, trimmedEmail);
      dbgLog('Fetching Bitbucket Data Center diff from:', diffUrl, trimmedToken ? '(Bearer auth)' : '(no token)');

      // Collect all file diffs, handling DC pagination (isLastPage / nextPageStart)
      const allDiffs = [];
      let fetchUrl = diffUrl;
      let pageCount = 0;
      const MAX_PAGES = 20;

      while (fetchUrl && pageCount < MAX_PAGES) {
        pageCount++;
        const response = await fetch(fetchUrl, { headers: { ...headers, 'Accept': 'application/json' } });
        if (!response.ok) {
          const authRequired = response.status === 401 || response.status === 403;
          let serverMessage = null;
          try { serverMessage = (await response.text()).trim() || null; } catch (_) {}
          const err = new Error(`Failed to fetch Bitbucket Data Center patch: ${response.status} ${response.statusText}`);
          err.bitbucketAuthRequired = authRequired;
          err.serverMessage = serverMessage;
          throw err;
        }

        const diffJson = await response.json();
        const pageDiffs = diffJson.diffs || diffJson.values || [];
        allDiffs.push(...pageDiffs);

        // Advance to next page if available
        if (!diffJson.isLastPage && diffJson.nextPageStart != null) {
          const separator = fetchUrl.includes('?') ? '&' : '?';
          fetchUrl = `${diffUrl}${separator}start=${diffJson.nextPageStart}`;
        } else {
          fetchUrl = null;
        }
      }

      const patchContent = convertDataCenterDiffToUnifiedPatch({ diffs: allDiffs });
      dbgLog('Converted Bitbucket Data Center diff to unified patch, files:', allDiffs.length, 'length:', patchContent.length);
      return { success: true, content: patchContent };
    }

    // Bitbucket Cloud: Basic auth (email + app-password), parse diff URL -> PR API -> follow links.diff.href
    const headers = buildAuthHeaders(trimmedToken, trimmedEmail);
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
      let serverMessage = null;
      try { serverMessage = (await response.text()).trim() || null; } catch (_) {}
      const err = new Error(`Failed to fetch Bitbucket patch: ${response.status} ${response.statusText}`);
      err.bitbucketAuthRequired = authRequired;
      err.serverMessage = serverMessage;
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
      bitbucketAuthRequired: authRequired,
      serverMessage: error?.serverMessage || null
    };
  }
}
