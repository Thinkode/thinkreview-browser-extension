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
    alarms: { create: jest.fn(async () => {}), clear: jest.fn(async () => {}) },
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
  expect(api.alarms.create).toHaveBeenCalledWith('thinkreview-content-script-retry', { delayInMinutes: 1 });
  expect(api.alarms.clear).toHaveBeenCalledTimes(1);
  expect(api.tabs.query).toHaveBeenCalledWith({ url: config.matches });
  expect(api.scripting.executeScript).toHaveBeenLastCalledWith({ target: { tabId: 7 }, files: config.js });
});

test('persistent failure returns failure and retains a durable retry', async () => {
  const { api, reconcile, update } = setup(jest.fn(async () => failure()));
  await expect(update()).resolves.toEqual({ success: false, errors: ['registration failed'] });
  expect(reconcile).toHaveBeenCalledTimes(3);
  expect(api.alarms.clear).not.toHaveBeenCalled();
  expect(api.tabs.query).not.toHaveBeenCalled();
});

test('unexpected failure also retains the retry scheduled before registration', async () => {
  const { api, update } = setup(jest.fn(async () => { throw new Error('storage unavailable'); }));
  await expect(update()).resolves.toEqual({ success: false, errors: ['storage unavailable'] });
  expect(api.alarms.create).toHaveBeenCalledTimes(1);
  expect(api.alarms.clear).not.toHaveBeenCalled();
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
  await Promise.resolve();
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
  let stored = {};
  const api = {
    runtime: { onInstalled: event('install'), onStartup: event('startup'), onMessage: event('message'), getManifest: () => ({ version: 'test' }) },
    permissions: { onAdded: event('grant'), onRemoved: event('revoke'), contains: jest.fn(async () => true) },
    alarms: { onAlarm: event('alarm'), create: jest.fn(async () => {}), clear: jest.fn(async () => {}) },
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

test('fresh installation registers all default platforms and GitLab SPA entry pages', async () => {
  const { scripts, settle } = background();
  await settle();
  expect(scripts.size).toBe(4);
  expect([...scripts.values()].find(c => c.matches[0].includes('gitlab.com')).matches).toEqual(['https://gitlab.com/*']);
});

test('failed installation recovers on a later page load without browser restart', async () => {
  const { api, events, scripts, settle } = background();
  api.scripting.registerContentScripts.mockRejectedValue(new Error('API unavailable'));
  await expect(settle()).resolves.toMatchObject({ success: false });
  expect(scripts.size).toBe(0);
  api.scripting.registerContentScripts.mockImplementation(async configs => configs.forEach(c => scripts.set(c.id, c)));
  events.tab(7, { status: 'complete' });
  await expect(settle()).resolves.toMatchObject({ success: true });
  expect(scripts.size).toBe(4);
});

test('permission grants recover skipped registrations and revocation removes them', async () => {
  const { api, events, scripts, settle } = background();
  api.permissions.contains.mockResolvedValue(false);
  await settle();
  expect(scripts.size).toBe(0);
  api.permissions.contains.mockResolvedValue(true);
  await events.grant();
  expect(scripts.size).toBe(4);
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
  expect(api.alarms.clear).not.toHaveBeenCalled();
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
