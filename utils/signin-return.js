/**
 * Decide which tab a portal sign-in can send the user back to.
 * Review hosts are GitHub, GitLab, Bitbucket, and Azure DevOps.
 * The extension's own page is also a valid return target.
 */

const PORTAL_HOSTS = new Set([
  'thinkreview.dev',
  'portal.thinkreview.dev',
  'app.thinkreview.dev',
]);

export function isThinkReviewPortalHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (PORTAL_HOSTS.has(host)) return true;
  return host.endsWith('.thinkreview.dev');
}

export function isExtensionPageUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:';
  } catch {
    return false;
  }
}

export function isKnownReviewHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || isThinkReviewPortalHost(host)) return false;
  if (host === 'github.com' || host.endsWith('.github.com')) return true;
  if (host === 'gitlab.com' || host.endsWith('.gitlab.com') || host.includes('gitlab')) return true;
  if (host === 'bitbucket.org' || host.endsWith('.bitbucket.org') || host.includes('bitbucket')) return true;
  if (host === 'dev.azure.com' || host.endsWith('.dev.azure.com')) return true;
  if (host === 'visualstudio.com' || host.endsWith('.visualstudio.com')) return true;
  return false;
}

export function looksLikeReviewPath(pathname) {
  const path = String(pathname || '').toLowerCase();
  return path.includes('/merge_requests/')
    || path.includes('/pull-requests/')
    || path.includes('/pullrequest/')
    || /\/pull\/\d+/.test(path);
}

export function returnLabelForHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host.includes('github')) return 'GitHub';
  if (host.includes('gitlab')) return 'GitLab';
  if (host.includes('bitbucket')) return 'Bitbucket';
  if (host.includes('dev.azure') || host.includes('visualstudio')) return 'Azure DevOps';
  return 'your review';
}

/**
 * @param {string} rawUrl
 * @param {{ fromContentScript?: boolean }} [options]
 * `fromContentScript` accepts a self-hosted review page the extension is already
 * running on. Otherwise only known review hosts and the extension page qualify.
 * @returns {{ kind: 'extension' | 'review', label: string, url?: string } | null}
 */
export function classifySignInReturnUrl(rawUrl, options = {}) {
  if (isExtensionPageUrl(rawUrl)) {
    return { kind: 'extension', label: 'the extension' };
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (isThinkReviewPortalHost(url.hostname)) return null;

  const known = isKnownReviewHost(url.hostname) || looksLikeReviewPath(url.pathname);
  if (!known && !options.fromContentScript) return null;

  return {
    kind: 'review',
    label: returnLabelForHost(url.hostname),
    url: url.toString(),
  };
}
