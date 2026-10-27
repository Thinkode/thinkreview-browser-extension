import { classifySignInReturnUrl } from '../utils/signin-return.js';

describe('classifySignInReturnUrl', () => {
  it('labels known review hosts', () => {
    expect(classifySignInReturnUrl('https://github.com/org/repo/pull/1')).toMatchObject({
      kind: 'review',
      label: 'GitHub',
    });
    expect(classifySignInReturnUrl('https://gitlab.com/group/proj/-/merge_requests/4')).toMatchObject({
      label: 'GitLab',
    });
    expect(classifySignInReturnUrl('https://gitlab.acme.com/group/proj/-/merge_requests/4')).toMatchObject({
      label: 'GitLab',
    });
    expect(classifySignInReturnUrl('https://bitbucket.org/ws/repo/pull-requests/2')).toMatchObject({
      label: 'Bitbucket',
    });
    expect(classifySignInReturnUrl('https://dev.azure.com/org/project/_git/repo/pullrequest/9')).toMatchObject({
      label: 'Azure DevOps',
    });
    expect(classifySignInReturnUrl('https://org.visualstudio.com/project/_git/repo/pullrequest/9')).toMatchObject({
      label: 'Azure DevOps',
    });
  });

  it('accepts the extension page on Chrome and Firefox', () => {
    expect(classifySignInReturnUrl('chrome-extension://abc/popup.html')).toEqual({
      kind: 'extension',
      label: 'the extension',
    });
    expect(classifySignInReturnUrl('moz-extension://abc/popup.html?autoSignIn=true')).toEqual({
      kind: 'extension',
      label: 'the extension',
    });
  });

  it('rejects the portal and unrelated pages unless the extension content script is on them', () => {
    expect(classifySignInReturnUrl('https://portal.thinkreview.dev/signin-extension')).toBeNull();
    expect(classifySignInReturnUrl('https://mail.google.com/')).toBeNull();
    expect(classifySignInReturnUrl('javascript:alert(1)')).toBeNull();
    expect(classifySignInReturnUrl('https://git.corp.example/group/proj/-/merge_requests/3')).toMatchObject({
      kind: 'review',
      label: 'your review',
    });
    expect(classifySignInReturnUrl('https://git.corp.example/group/proj', {
      fromContentScript: true,
    })).toMatchObject({
      kind: 'review',
      label: 'your review',
    });
  });
});
