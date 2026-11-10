import { azureHostBadges, cloudHostsFromIntegrations, selfHostedHostsFromIntegrations } from '../utils/integration-status.js';

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

describe('azureHostBadges', () => {
  it('counts a token saved in the extension as a cloud connection', () => {
    expect(azureHostBadges({
      portalConnected: false,
      localToken: 'pat-value',
      serverDomains: [],
    })).toEqual({ cloud: 'connected', server: 'setup' });
  });

  it('marks the server ready only when a domain and a token are both saved', () => {
    expect(azureHostBadges({
      portalConnected: false,
      localToken: 'pat-value',
      serverDomains: ['devops.example.com'],
    })).toEqual({ cloud: 'connected', server: 'ready' });
    expect(azureHostBadges({
      portalConnected: true,
      localToken: '   ',
      serverDomains: ['devops.example.com'],
    })).toEqual({ cloud: 'connected', server: 'setup' });
  });
});

describe('selfHostedHostsFromIntegrations', () => {
  it('reads a self-hosted GitLab base URL and ignores gitlab.com OAuth', () => {
    expect(selfHostedHostsFromIntegrations({
      gitlab: [
        { authType: 'gitlab_oauth', profile: 'gitlab_com' },
        { authType: 'pat', profile: 'gitlab_self_hosted', baseUrl: 'https://afef-149-86-86-166.ngrok-free.app' },
      ],
      github: [{ authType: 'pat', profile: 'github_enterprise', baseUrl: 'https://github.example.com' }],
    })).toEqual({
      github: ['https://github.example.com'],
      gitlab: ['https://afef-149-86-86-166.ngrok-free.app'],
      azure: [],
      bitbucket: [],
    });
  });

  it('does not treat a cloud Azure DevOps URL as an on-prem server', () => {
    expect(selfHostedHostsFromIntegrations({
      azureDevOps: [
        { authType: 'pat', profile: 'azure_dev', baseUrl: 'https://dev.azure.com/myorg' },
        { authType: 'pat', profile: 'azure_server', baseUrl: 'https://devops.example.com/tfs/DefaultCollection' },
      ],
    }).azure).toEqual(['https://devops.example.com/tfs/DefaultCollection']);
  });
});
