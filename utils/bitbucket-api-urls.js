// bitbucket-api-urls.js
// Shared Bitbucket API 2.0 URL parsing and construction. Used by background.js and bitbucket-detector.js.

const BITBUCKET_API_BASE = 'https://api.bitbucket.org/2.0';

/** Regex for .../repositories/{workspace}/{repoSlug}/pullrequests/{prId}/diff */
const PR_DIFF_PATH_REGEX = /\/repositories\/([^/]+)\/([^/]+)\/pullrequests\/(\d+)\/diff/;

/**
 * Parse a Bitbucket API diff URL into workspace, repoSlug, and prId.
 * @param {string} url - Full URL e.g. https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/diff
 * @returns {{ workspace: string, repoSlug: string, prId: string } | null}
 */
export function parseBitbucketPrDiffUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(PR_DIFF_PATH_REGEX);
  if (!match) return null;
  return { workspace: match[1], repoSlug: match[2], prId: match[3] };
}

/**
 * Build the Bitbucket API 2.0 PR endpoint URL (used to get links.diff.href).
 * @param {string} workspace
 * @param {string} repoSlug
 * @param {string} prId
 * @returns {string}
 */
export function getBitbucketPrApiUrl(workspace, repoSlug, prId) {
  return `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${prId}`;
}

/**
 * Build the Bitbucket API 2.0 diff URL (repositories/.../pullrequests/{id}/diff).
 * @param {string} workspace
 * @param {string} repoSlug
 * @param {string} prId
 * @returns {string}
 */
export function getBitbucketDiffApiUrl(workspace, repoSlug, prId) {
  return `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/diff`;
}
