// bitbucket-api-urls.js
// Shared Bitbucket API 2.0 (Cloud) and Data Center REST API URL parsing and construction.
// Used by background.js and bitbucket-detector.js.

const BITBUCKET_API_BASE = 'https://api.bitbucket.org/2.0';

/** Regex for .../repositories/{workspace}/{repoSlug}/pullrequests/{prId}/diff */
const PR_DIFF_PATH_REGEX = /\/repositories\/([^/]+)\/([^/]+)\/pullrequests\/(\d+)\/diff/;

/**
 * Regex for Bitbucket Data Center PR paths:
 *   /projects/{projectKey}/repos/{repoSlug}/pull-requests/{id}[/...]
 *   /users/{username}/repos/{repoSlug}/pull-requests/{id}[/...]
 */
const DC_PR_PATH_REGEX = /\/(projects|users)\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)/;

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

// ---------------------------------------------------------------------------
// Bitbucket Data Center (self-hosted) helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Bitbucket Data Center PR path into namespace type, namespace, repoSlug, and prId.
 * Supports:
 *   /projects/{projectKey}/repos/{repoSlug}/pull-requests/{id}[/...]
 *   /users/{username}/repos/{repoSlug}/pull-requests/{id}[/...]
 *
 * @param {string} pathname
 * @returns {{ namespaceType: 'projects'|'users', namespace: string, repoSlug: string, prId: string } | null}
 */
export function parseBitbucketDataCenterPrPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return null;
  const match = pathname.match(DC_PR_PATH_REGEX);
  if (!match) return null;
  return {
    namespaceType: match[1],
    namespace: match[2],
    repoSlug: match[3],
    prId: match[4]
  };
}

/**
 * Build the Bitbucket Data Center REST API 1.0 base URL for a given origin.
 * @param {string} origin - e.g. 'https://bitbucket.mycompany.com'
 * @returns {string}
 */
export function getBitbucketDataCenterApiBase(origin) {
  return `${origin}/rest/api/1.0`;
}

/**
 * Build the Bitbucket Data Center diff endpoint URL.
 * @param {string} origin - e.g. 'https://bitbucket.mycompany.com'
 * @param {'projects'|'users'} namespaceType
 * @param {string} namespace - projectKey or username
 * @param {string} repoSlug
 * @param {string} prId
 * @returns {string}
 */
export function getBitbucketDataCenterDiffApiUrl(origin, namespaceType, namespace, repoSlug, prId) {
  return `${getBitbucketDataCenterApiBase(origin)}/${namespaceType}/${namespace}/repos/${repoSlug}/pull-requests/${prId}/diff`;
}
