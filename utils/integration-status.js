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

const SELF_HOSTED_PROFILES = {
  github: 'github_enterprise',
  gitlab: 'gitlab_self_hosted',
  azureDevOps: 'azure_server',
};

function credentialLabel(row) {
  const raw = row.baseUrl || row.organizationUrl || row.customDomainHost || '';
  return String(raw).trim();
}

/**
 * Portal credentials for self-hosted hosts. A baseUrl such as a custom GitLab
 * domain counts even when the profile name varies.
 * @returns {{ github: string[], gitlab: string[], azure: string[], bitbucket: string[] }}
 */
export function selfHostedHostsFromIntegrations(integrations) {
  const empty = { github: [], gitlab: [], azure: [], bitbucket: [] };
  if (!integrations || typeof integrations !== 'object') return empty;
  const rows = (key) => (Array.isArray(integrations[key]) ? integrations[key] : []);

  const labelsFor = (key, profile, extra) => {
    const seen = new Set();
    rows(key).forEach((row) => {
      if (!row || row.authType === 'github_app' || row.authType === 'gitlab_oauth' || row.authType === 'bitbucket_oauth' || row.authType === 'azure_devops_oauth') {
        return;
      }
      const selfHosted = row.profile === profile || extra(row);
      if (!selfHosted) return;
      const label = credentialLabel(row) || row.profile || 'Saved token';
      seen.add(label);
    });
    return [...seen];
  };

  return {
    github: labelsFor('github', SELF_HOSTED_PROFILES.github, (row) => Boolean(row.baseUrl) && row.profile !== 'github_cloud'),
    gitlab: labelsFor('gitlab', SELF_HOSTED_PROFILES.gitlab, (row) => Boolean(row.baseUrl) && row.profile !== 'gitlab_com'),
    azure: labelsFor(
      'azureDevOps',
      SELF_HOSTED_PROFILES.azureDevOps,
      (row) => Boolean(row.baseUrl) && row.profile !== 'azure_dev' && row.profile !== 'azure_visualstudio'
    ),
    bitbucket: labelsFor('bitbucket', 'bitbucket_data_center', (row) => Boolean(row.baseUrl) && row.profile !== 'bitbucket_cloud'),
  };
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
