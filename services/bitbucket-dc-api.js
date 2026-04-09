// bitbucket-dc-api.js
// Fetches PR diff/patch from Bitbucket Data Center (self-hosted).
// Auth: Bearer token (HTTP access token). Basic auth is often disabled on DC instances.
// The DC diff endpoint always returns JSON (diffs/hunks/segments), never unified diff text,
// so responses are converted to unified patch format before being returned.
import { dbgLog, dbgError } from '../utils/logger.js';

/**
 * Build Bearer auth headers for Bitbucket Data Center.
 * HTTP access tokens are self-contained — no username is required.
 * @param {string|null} token
 * @returns {Record<string, string>}
 */
function buildDataCenterAuthHeaders(token) {
  const headers = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Convert Bitbucket Data Center diff JSON to unified diff (patch) format.
 *
 * DC diff JSON structure:
 *   { diffs: [ { source, destination, binary, hunks: [
 *     { sourceLine, sourceSpan, destinationLine, destinationSpan, context,
 *       segments: [ { type: 'CONTEXT'|'ADDED'|'REMOVED', lines: [{ line }] } ] }
 *   ] } ] }
 *
 * @param {Object} diffJson - Parsed JSON from /rest/api/1.0/…/pull-requests/{id}/diff
 * @returns {string} Unified diff text
 */
export function convertDataCenterDiffToUnifiedPatch(diffJson) {
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
      const srcStart = hunk.sourceLine      ?? 1;
      const srcSpan  = hunk.sourceSpan      ?? 0;
      const dstStart = hunk.destinationLine ?? 1;
      const dstSpan  = hunk.destinationSpan ?? 0;
      const ctx      = hunk.context ? ` ${hunk.context}` : '';
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
 * Fetch Bitbucket Data Center PR diff and return it as unified patch text.
 * Handles DC API pagination (isLastPage / nextPageStart) for large PRs.
 *
 * @param {string} diffUrl - {origin}/rest/api/1.0/…/pull-requests/{id}/diff
 * @param {{ token: string|null }} credentials
 * @returns {Promise<{ success: true, content: string } | { success: false, error: string, bitbucketAuthRequired: boolean, serverMessage: string|null }>}
 */
export async function fetchDataCenterPatchContent(diffUrl, { token }) {
  const trimmedToken = token && String(token).trim() ? token.trim() : null;
  const headers = buildDataCenterAuthHeaders(trimmedToken);

  try {
    const allDiffs = [];
    let fetchUrl = diffUrl;
    let pageCount = 0;
    const MAX_PAGES = 20;

    while (fetchUrl && pageCount < MAX_PAGES) {
      pageCount++;
      dbgLog(`Fetching Bitbucket Data Center diff (page ${pageCount}):`, fetchUrl, trimmedToken ? '(Bearer auth)' : '(no token)');

      const response = await fetch(fetchUrl, { headers });
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
      allDiffs.push(...(diffJson.diffs || diffJson.values || []));

      if (!diffJson.isLastPage && diffJson.nextPageStart != null) {
        const sep = diffUrl.includes('?') ? '&' : '?';
        fetchUrl = `${diffUrl}${sep}start=${diffJson.nextPageStart}`;
      } else {
        fetchUrl = null;
      }
    }

    const content = convertDataCenterDiffToUnifiedPatch({ diffs: allDiffs });
    dbgLog('Converted Bitbucket Data Center diff to unified patch, files:', allDiffs.length, 'length:', content.length);
    return { success: true, content };
  } catch (error) {
    dbgError('Error fetching Bitbucket Data Center patch:', error?.message || String(error));
    const msg = String(error?.message || '');
    const authRequired = error?.bitbucketAuthRequired === true || /401|403|unauthorized|forbidden/i.test(msg);
    return { success: false, error: msg || 'Request failed', bitbucketAuthRequired: authRequired, serverMessage: error?.serverMessage || null };
  }
}
