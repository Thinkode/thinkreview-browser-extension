/**
 * Azure DevOps Services (cloud) hosts. Do not use hostname.includes() —
 * that also matches spoofed hosts like my-visualstudio.com.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
export function isAzureDevOpsServicesHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return host === 'dev.azure.com'
    || host.endsWith('.dev.azure.com')
    || host === 'visualstudio.com'
    || host.endsWith('.visualstudio.com');
}
