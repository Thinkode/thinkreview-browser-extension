import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createContentScriptRecovery } from '../utils/content-script-recovery.js';

const config = {
  id: 'review-github', matches: ['https://github.com/*'],
  js: ['content.js', 'components/integrated-review.js'], runAt: 'document_end',
};
const success = () => ({ success: true, configs: [config], errors: [] });
const failure = () => ({ success: false, configs: [], errors: ['registration failed'] });
function setup(reconcile = jest.fn(async () => success())) {
  const api = {
    runtime: { getManifest: () => ({ version: '2.3.18' }) },
    tabs: { query: jest.fn(async () => [{ id: 7, status: 'complete' }]) },
    scripting: { executeScript: jest.fn(async () => [{ result: {} }]) },
  };
  return { api, reconcile, update: createContentScriptRecovery(api, reconcile) };
}

test('retries transient failure, verifies success before responding, and activates open tabs', async () => {
  const reconcile = jest.fn().mockResolvedValueOnce(failure()).mockResolvedValueOnce(success());
  const { api, update } = setup(reconcile);
  await expect(update()).resolves.toEqual({ success: true, errors: [] });
  expect(reconcile).toHaveBeenCalledTimes(2);
  expect(api.tabs.query).toHaveBeenCalledWith({ url: config.matches });
  expect(api.scripting.executeScript).toHaveBeenLastCalledWith({ target: { tabId: 7 }, files: config.js });
});

test('persistent failure returns failure and leaves browser-event recovery enabled', async () => {
  const { api, reconcile, update } = setup(jest.fn(async () => failure()));
  await expect(update()).resolves.toEqual({ success: false, errors: ['registration failed'] });
  expect(reconcile).toHaveBeenCalledTimes(3);
  expect(update.needsRecovery()).toBe(true);
  expect(api.tabs.query).not.toHaveBeenCalled();
});

test('unexpected failure leaves recovery enabled without the alarms API', async () => {
  const { api, update } = setup(jest.fn(async () => { throw new Error('storage unavailable'); }));
  await expect(update()).resolves.toEqual({ success: false, errors: ['storage unavailable'] });
  expect(update.needsRecovery()).toBe(true);
  expect(api.alarms).toBeUndefined();
});

test('skips a tab only when both bundles are already running the current version', async () => {
  const { api, update } = setup();
  api.scripting.executeScript.mockResolvedValue([{ result: { content: '2.3.18', panel: '2.3.18' } }]);
  await update();
  expect(api.scripting.executeScript).toHaveBeenCalledTimes(1);
});

test('repairs partial injection and tolerates tabs closed during activation', async () => {
  const { api, update } = setup();
  api.tabs.query.mockResolvedValue([{ id: 7 }, { id: 8 }, { id: 9, discarded: true }, { id: 10, status: 'loading' }]);
  api.scripting.executeScript.mockImplementation(async options => {
    if (options.target.tabId === 8) throw new Error('tab closed');
    return [{ result: { content: '2.3.18' } }];
  });
  await expect(update()).resolves.toMatchObject({ success: true });
  expect(api.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: config.js });
  expect(api.scripting.executeScript).toHaveBeenCalledTimes(3);
});

test('serializes requests and reruns when settings change during registration', async () => {
  let release;
  const reconcile = jest.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValue(success());
  const { update } = setup(reconcile);
  const first = update();
  const second = update();
  expect(first).toBe(second);
  release(success());
  await first;
  expect(reconcile).toHaveBeenCalledTimes(2);
});

// Exercise the real background registration/event wiring without importing its
// network/review services. Failure injection models a broken fresh installation.
function background() {
  const events = {};
  const scripts = new Map();
  const event = name => ({ addListener(fn) { events[name] = fn; } });
  let stored = { gitlabDomains: ['https://code.example.com'] };
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const api = {
    runtime: { onInstalled: event('install'), onStartup: event('startup'), onMessage: event('message'), getManifest: () => ({ ...manifest, version: 'test' }) },
    permissions: { onAdded: event('grant'), onRemoved: event('revoke'), contains: jest.fn(async () => true) },
    storage: { onChanged: event('storage'), local: { get: jest.fn(async () => stored), set: jest.fn(async () => {}) } },
    tabs: { onUpdated: event('tab'), create: jest.fn(), query: jest.fn(async () => []) },
    scripting: {
      getRegisteredContentScripts: jest.fn(async () => [...scripts.values()]),
      registerContentScripts: jest.fn(async configs => configs.forEach(c => scripts.set(c.id, c))),
      updateContentScripts: jest.fn(async configs => configs.forEach(c => scripts.set(c.id, c))),
      unregisterContentScripts: jest.fn(async ({ ids }) => ids.forEach(id => scripts.delete(id))),
    },
  };
  const source = readFileSync(new URL('../background.js', import.meta.url), 'utf8')
    .split('// Dynamic Content Script Registration for Custom Domains')[1];
  const context = vm.createContext({ chrome: api, createContentScriptRecovery, URL, dbgLog() {}, dbgWarn() {}, trackUserActionSafe() {} });
  vm.runInContext(source, context);
  const settle = () => vm.runInContext('updateContentScripts()', context);
  return { api, events, scripts, settle, setStored(value) { stored = value; } };
}

test('built-in platforms load from the manifest with no added permissions', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const reviewScript = manifest.content_scripts.find(script => script.js.includes('content.js'));
  expect(reviewScript.matches).toEqual([
    'https://gitlab.com/*', 'https://github.com/*', 'https://dev.azure.com/*', 'https://*.visualstudio.com/*'
  ]);
  expect(reviewScript.run_at).toBe('document_end');
  const baseline = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  expect(baseline.permissions).toEqual(['storage', 'identity', 'scripting', 'activeTab']);
  const { api, scripts, settle, setStored } = background();
  setStored({});
  await settle();
  expect(scripts.size).toBe(0);
  expect(api.scripting.registerContentScripts).not.toHaveBeenCalled();
  expect(api.tabs.query).toHaveBeenCalledWith({ url: reviewScript.matches });
});

test('failed installation recovers on a later page load without browser restart', async () => {
  const { api, events, scripts, settle } = background();
  api.scripting.registerContentScripts.mockRejectedValue(new Error('API unavailable'));
  await expect(settle()).resolves.toMatchObject({ success: false });
  expect(scripts.size).toBe(0);
  api.scripting.registerContentScripts.mockImplementation(async configs => configs.forEach(c => scripts.set(c.id, c)));
  events.tab(7, { status: 'complete' });
  await expect(settle()).resolves.toMatchObject({ success: true });
  expect(scripts.size).toBe(1);
});

test('permission grants recover skipped registrations and revocation removes them', async () => {
  const { api, events, scripts, settle } = background();
  api.permissions.contains.mockResolvedValue(false);
  await settle();
  expect(scripts.size).toBe(0);
  api.permissions.contains.mockResolvedValue(true);
  await events.grant();
  expect(scripts.size).toBe(1);
  api.permissions.contains.mockResolvedValue(false);
  await events.revoke();
  expect(scripts.size).toBe(0);
});

test('manual registration responds asynchronously with actual failure', async () => {
  const { api, events, settle } = background();
  await settle();
  api.scripting.updateContentScripts.mockRejectedValue(new Error('cannot update'));
  const respond = jest.fn();
  expect(events.message({ type: 'UPDATE_CONTENT_SCRIPTS' }, {}, respond)).toBe(true);
  expect(respond).not.toHaveBeenCalled();
  await settle();
  expect(respond).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
});

test('verification catches registration silently failing to persist', async () => {
  const { api, settle } = background();
  api.scripting.registerContentScripts.mockResolvedValue();
  await expect(settle()).resolves.toMatchObject({ success: false });
  expect(api.alarms).toBeUndefined();
});

test('GitHub Enterprise storage changes trigger registration', async () => {
  const { events, setStored, scripts, settle } = background();
  await settle();
  setStored({ githubEnterpriseDomains: ['https://code.example.com'] });
  events.storage({ githubEnterpriseDomains: { newValue: ['https://code.example.com'] } }, 'local');
  await settle();
  expect([...scripts.values()].some(c => c.matches.includes('https://code.example.com/*'))).toBe(true);
});


test('healthy registrations do not reconcile or probe tabs on unrelated page loads', async () => {
  const { api, events, settle } = background();
  await settle();
  const queries = api.tabs.query.mock.calls.length;
  const reads = api.scripting.getRegisteredContentScripts.mock.calls.length;
  events.tab(8, { status: 'complete' });
  events.tab(9, { status: 'complete' });
  await Promise.resolve();
  expect(api.tabs.query).toHaveBeenCalledTimes(queries);
  expect(api.scripting.getRegisteredContentScripts).toHaveBeenCalledTimes(reads);
});


test('removes legacy built-in registrations without registering duplicates', async () => {
  const { api, scripts, setStored, settle } = background();
  const legacy = {
    id: 'code-review-https---github-com', matches: ['https://github.com/*'], js: config.js,
  };
  scripts.set(legacy.id, legacy);
  setStored({ gitlabDomains: ['https://gitlab.com'], githubEnterpriseDomains: ['https://github.com'] });
  await settle();
  expect(api.scripting.registerContentScripts).not.toHaveBeenCalled();
  expect(scripts.size).toBe(0);
  expect(api.scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: [legacy.id] });
});

test('built-in open tabs still activate when custom registration APIs fail', async () => {
  const { api, settle } = background();
  api.scripting.getRegisteredContentScripts.mockRejectedValue(new Error('scripting API unavailable'));
  api.tabs.query.mockResolvedValue([{ id: 7 }]);
  api.scripting.executeScript = jest.fn(async () => [{ result: {} }]);
  await expect(settle()).resolves.toMatchObject({ success: false });
  expect(api.tabs.query.mock.calls[0][0].url).toContain('https://github.com/*');
  expect(api.scripting.executeScript).toHaveBeenLastCalledWith({
    target: { tabId: 7 },
    files: ['vendor/honeybadger.ext.min.js', 'content.js', 'vendor/diff.min.js', 'components/integrated-review.js'],
  });
});

test('Bitbucket Cloud stays opt-in and requires its existing host permission', async () => {
  const { api, scripts, setStored, settle } = background();
  setStored({ bitbucketAllowed: true });
  api.permissions.contains.mockResolvedValue(false);
  await settle();
  expect(scripts.size).toBe(0);
  api.permissions.contains.mockResolvedValue(true);
  await settle();
  expect([...scripts.values()].map(script => script.matches)).toEqual([['https://bitbucket.org/*']]);
});


test('distinct dot and hyphen origins get distinct IDs; aliases register once', async () => {
  const { api, scripts, setStored, settle } = background();
  setStored({ gitlabDomains: [
    'https://gitlab.example.com', 'https://gitlab-example.com',
    'gitlab.example.com/', 'https://GITLAB.EXAMPLE.COM/'
  ] });
  await expect(settle()).resolves.toMatchObject({ success: true });
  expect(api.scripting.registerContentScripts).toHaveBeenCalledTimes(2);
  expect(scripts.size).toBe(2);
  expect([...scripts.values()].map(script => script.matches[0])).toEqual([
    'https://gitlab.example.com/*', 'https://gitlab-example.com/*'
  ]);
  await settle();
  expect(api.scripting.registerContentScripts).toHaveBeenCalledTimes(2);
  expect(api.scripting.updateContentScripts).toHaveBeenCalledTimes(2);
});

test('keeps a working legacy custom script if migration to its normalized ID fails', async () => {
  const { api, scripts, setStored, settle } = background();
  const legacy = { id: 'code-review-https---gitlab-example-com', matches: ['https://gitlab.example.com/*'], js: config.js };
  scripts.set(legacy.id, legacy);
  setStored({ gitlabDomains: ['https://gitlab.example.com'] });
  api.scripting.registerContentScripts.mockRejectedValue(new Error('API unavailable'));
  await expect(settle()).resolves.toMatchObject({ success: false });
  expect(scripts.has(legacy.id)).toBe(true);
  expect(api.scripting.unregisterContentScripts).not.toHaveBeenCalled();
  api.scripting.registerContentScripts.mockImplementation(async configs => configs.forEach(c => scripts.set(c.id, c)));
  await expect(settle()).resolves.toMatchObject({ success: true });
  expect(scripts.has(legacy.id)).toBe(false);
  expect(scripts.size).toBe(1);
});


test('invalid saved domains do not block valid domains or keep retrying registration', async () => {
  const { api, events, scripts, setStored, settle } = background();
  setStored({
    gitlabDomains: [null, 12, {}, '', '  ', 'https://', 'https://host:invalid', '  https://gitlab.example.com/  '],
    azureDevOpsDomains: 'not-an-array', githubEnterpriseDomains: { bad: true }
  });
  await expect(settle()).resolves.toMatchObject({ success: true });
  expect([...scripts.values()].map(script => script.matches)).toEqual([['https://gitlab.example.com/*']]);
  expect(api.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
  const reads = api.scripting.getRegisteredContentScripts.mock.calls.length;
  // Healthy state avoids repeated background API work on subsequent page loads.
  events.tab(9, { status: 'complete' });
  await Promise.resolve();
  expect(api.scripting.getRegisteredContentScripts).toHaveBeenCalledTimes(reads);
});
