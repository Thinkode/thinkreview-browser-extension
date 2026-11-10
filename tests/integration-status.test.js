import { cloudHostsFromIntegrations } from '../utils/integration-status.js';

describe('cloudHostsFromIntegrations', () => {
  it('marks a host connected only for its cloud OAuth or cloud profile', () => {
    expect(cloudHostsFromIntegrations({
      github: [{ authType: 'github_app', profile: 'github_cloud' }],
      gitlab: [{ authType: 'pat', profile: 'gitlab_self_hosted' }],
      bitbucket: [{ authType: 'bitbucket_oauth' }],
      azureDevOps: [{ authType: 'pat', profile: 'azure_server' }],
    })).toEqual({
      github: true,
      gitlab: false,
      bitbucket: true,
      azure: false,
    });
  });

  it('treats a cloud PAT as connected', () => {
    expect(cloudHostsFromIntegrations({
      azureDevOps: [{ authType: 'pat', profile: 'azure_dev' }],
      gitlab: [{ authType: 'pat', profile: 'gitlab_com' }],
    })).toMatchObject({ azure: true, gitlab: true, github: false });
  });
});
