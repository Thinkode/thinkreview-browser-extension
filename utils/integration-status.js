/**
 * Which cloud hosts have a portal integration (OAuth or a cloud PAT).
 * On-prem credentials do not count.
 *
 * @param {Record<string, Array<{ authType?: string, profile?: string }>>|null|undefined} integrations
 * @returns {{ github: boolean, gitlab: boolean, bitbucket: boolean, azure: boolean }}
 */
export function cloudHostsFromIntegrations(integrations) {
  const hosts = { github: false, gitlab: false, bitbucket: false, azure: false };
  if (!integrations || typeof integrations !== 'object') return hosts;

  const rows = (key) => (Array.isArray(integrations[key]) ? integrations[key] : []);
  const matches = (list, predicate) => list.some((row) => row && predicate(row));

  hosts.github = matches(
    rows('github'),
    (row) => row.authType === 'github_app' || row.profile === 'github_cloud'
  );
  hosts.gitlab = matches(
    rows('gitlab'),
    (row) => row.authType === 'gitlab_oauth' || row.profile === 'gitlab_com'
  );
  hosts.bitbucket = matches(
    rows('bitbucket'),
    (row) => row.authType === 'bitbucket_oauth' || row.profile === 'bitbucket_cloud'
  );
  hosts.azure = matches(
    rows('azureDevOps'),
    (row) =>
      row.authType === 'azure_devops_oauth' ||
      row.profile === 'azure_dev' ||
      row.profile === 'azure_visualstudio'
  );
  return hosts;
}

export function hasSavedValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Azure badges. A token saved in the extension counts as connected for cloud,
 * and the server page is ready only when that token and a domain are both saved.
 */
export function azureHostBadges({ portalConnected, localToken, serverDomains }) {
  const tokenSaved = hasSavedValue(localToken);
  const hasDomain = Array.isArray(serverDomains) && serverDomains.length > 0;
  return {
    cloud: portalConnected || tokenSaved ? 'connected' : 'connect',
    server: hasDomain && tokenSaved ? 'ready' : 'setup',
  };
}
