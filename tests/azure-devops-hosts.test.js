import { isAzureDevOpsServicesHost } from '../utils/azure-devops-hosts.js';

describe('isAzureDevOpsServicesHost', () => {
  it('matches Azure DevOps Services hosts', () => {
    expect(isAzureDevOpsServicesHost('dev.azure.com')).toBe(true);
    expect(isAzureDevOpsServicesHost('thinkreview.visualstudio.com')).toBe(true);
    expect(isAzureDevOpsServicesHost('visualstudio.com')).toBe(true);
  });

  it('rejects substring spoofs and on-prem hosts', () => {
    expect(isAzureDevOpsServicesHost('my-visualstudio.com')).toBe(false);
    expect(isAzureDevOpsServicesHost('dev.azure.com.internal.corp')).toBe(false);
    expect(isAzureDevOpsServicesHost('tfs.mycompany.com')).toBe(false);
    expect(isAzureDevOpsServicesHost('')).toBe(false);
  });
});
