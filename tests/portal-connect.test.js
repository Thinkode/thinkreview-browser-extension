import { portalConnectUrl } from '../utils/portal-connect.js';

describe('portalConnectUrl', () => {
  it('points each cloud platform at the auto-start route', () => {
    expect(portalConnectUrl('github')).toBe('https://portal.thinkreview.dev/connect/github');
    expect(portalConnectUrl('gitlab')).toBe('https://portal.thinkreview.dev/connect/gitlab');
    expect(portalConnectUrl('bitbucket')).toBe('https://portal.thinkreview.dev/connect/bitbucket');
    expect(portalConnectUrl('azure')).toBe('https://portal.thinkreview.dev/connect/azure-devops');
  });

  it('rejects unknown platforms', () => {
    expect(() => portalConnectUrl('ghes')).toThrow('Unknown connect platform');
  });
});
