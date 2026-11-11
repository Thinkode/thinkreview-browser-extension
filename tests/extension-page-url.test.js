import { extensionPageUrl, isExtensionPagePlatform } from '../utils/extension-page-url.js';

const PAGE = 'chrome-extension://abc/popup.html';

describe('extensionPageUrl', () => {
  it('opens GitHub Enterprise Server with sign-in still requested', () => {
    expect(extensionPageUrl(PAGE, { autoSignIn: true, platform: 'github-enterprise' })).toBe(
      `${PAGE}?autoSignIn=true&platform=github-enterprise`
    );
  });

  it('keeps the existing sign-in URL when no platform is requested', () => {
    expect(extensionPageUrl(PAGE, { autoSignIn: true })).toBe(`${PAGE}?autoSignIn=true`);
  });

  it('drops platforms that are not a settings page', () => {
    expect(isExtensionPagePlatform('github-enterprise')).toBe(true);
    expect(isExtensionPagePlatform('https://evil.example')).toBe(false);
    expect(extensionPageUrl(PAGE, { autoSignIn: true, platform: 'popup.html?x=1' })).toBe(
      `${PAGE}?autoSignIn=true`
    );
  });
});
