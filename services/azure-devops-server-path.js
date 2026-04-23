/**
 * Parse Azure DevOps Server (on-prem / TFS) pathname for REST collection root and team project.
 *
 * REST base is https://{host}/{collectionPath}/_apis/...
 * Team-project-scoped calls add /{teamProject}/ before _apis.
 *
 * Supports:
 * - /tfs/{Collection}/_git/{repo}/... → collectionPath tfs/{Collection}, teamProject null
 * - /tfs/{Collection}/{TeamProject}/_git/{repo}/... → teamProject set
 * - /{Collection}/_git/... (no IIS app segment) → collectionPath = first segment
 *
 * @param {string} pathname - window.location.pathname
 * @returns {{ collectionPath: string, teamProject: string | null }}
 */
export function parseAzureDevOpsServerPath(pathname) {
  const pathParts = (pathname || '').split('/').filter(Boolean);
  if (pathParts.length === 0) {
    return { collectionPath: '', teamProject: null };
  }

  if (pathParts[0].toLowerCase() === 'tfs' && pathParts.length >= 2 && pathParts[1] !== '_git') {
    const collectionPath = `${pathParts[0]}/${pathParts[1]}`;
    const afterCollection = pathParts[2];
    if (afterCollection == null || afterCollection === '_git') {
      return { collectionPath, teamProject: null };
    }
    return { collectionPath, teamProject: afterCollection };
  }

  const collectionPath = pathParts[0];
  const firstAfter = pathParts[1];
  if (firstAfter == null || firstAfter === '_git') {
    return { collectionPath, teamProject: null };
  }
  return { collectionPath, teamProject: firstAfter };
}
