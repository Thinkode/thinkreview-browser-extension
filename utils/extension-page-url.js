export const EXTENSION_PAGE_PLATFORMS = Object.freeze([
  'github-com',
  'github-enterprise',
  'gitlab-com',
  'gitlab-self-managed',
  'azure-cloud',
  'azure-server',
  'bitbucket',
  'bitbucket-dc',
]);

export function isExtensionPagePlatform(platform) {
  return EXTENSION_PAGE_PLATFORMS.includes(platform);
}

/** Settings page URL. Unknown platforms are dropped so a page cannot inject query values. */
export function extensionPageUrl(pageUrl, options = {}) {
  const params = new URLSearchParams();
  if (options.autoSignIn) params.set('autoSignIn', 'true');
  if (isExtensionPagePlatform(options.platform)) params.set('platform', options.platform);
  const query = params.toString();
  return query ? `${pageUrl}?${query}` : pageUrl;
}
