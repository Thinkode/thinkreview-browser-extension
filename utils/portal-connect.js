const PORTAL_CONNECT_SLUGS = {
  github: 'github',
  gitlab: 'gitlab',
  bitbucket: 'bitbucket',
  azure: 'azure-devops',
};

/** Portal route that signs the user in if needed, then starts cloud OAuth. */
export function portalConnectUrl(platform) {
  const slug = PORTAL_CONNECT_SLUGS[platform];
  if (!slug) {
    throw new Error(`Unknown connect platform: ${platform}`);
  }
  return `https://portal.thinkreview.dev/connect/${slug}`;
}
