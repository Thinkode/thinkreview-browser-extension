import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const content = readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/integrated-review.js', import.meta.url), 'utf8');
const monitoring = content.slice(content.indexOf('function startSPANavigationMonitoring()'), content.indexOf('// Initialize when the page is loaded'));

function monitor() {
  let tick;
  let button = false;
  let supported = true;
  const ctx = {
    window: { location: { href: 'https://github.com/team/repo' } },
    chrome: { runtime: { id: 'extension' } },
    setInterval: jest.fn(fn => { tick = fn; return 1; }), clearInterval: jest.fn(),
    _teardownRetryObserver: jest.fn(),
    platformDetector: {}, initialPanelPending: false,
    isSupportedPage: jest.fn(() => supported),
    initializePlatformDetection: jest.fn(async () => { ctx.platformDetector = {}; }),
    shouldShowButton: jest.fn(() => supported),
    areButtonsInjected: jest.fn(() => button),
    injectButtons: jest.fn(async () => { button = true; }),
    document: { hidden: false, getElementById: jest.fn(() => null), addEventListener: jest.fn(), removeEventListener: jest.fn() },
    checkAndTriggerReviewForNewPR: jest.fn(async () => {}), dbgWarn: jest.fn(),
  };
  vm.createContext(ctx);
  vm.runInContext(monitoring + '\nstartSPANavigationMonitoring();', ctx);
  return { ctx, tick: () => tick(), removeButton() { button = false; }, setSupported(value) { supported = value; } };
}

test('restores a removed button even without a URL change', async () => {
  const { ctx, tick, removeButton } = monitor();
  await tick();
  expect(ctx.injectButtons).toHaveBeenCalledTimes(1);
  removeButton();
  await tick();
  expect(ctx.injectButtons).toHaveBeenCalledTimes(2);
});

test('detects late-rendered enterprise pages after initially unsupported detection', async () => {
  const { ctx, tick, setSupported } = monitor();
  setSupported(false);
  await tick();
  expect(ctx.injectButtons).not.toHaveBeenCalled();
  setSupported(true);
  await tick();
  expect(ctx.injectButtons).toHaveBeenCalledTimes(1);
  expect(ctx.checkAndTriggerReviewForNewPR).toHaveBeenCalledTimes(1);
});

test('retries failed platform initialization and handles SPA entry into a PR', async () => {
  const { ctx, tick } = monitor();
  ctx.platformDetector = null;
  ctx.window.location.href += '/pull/1';
  await tick();
  expect(ctx.initializePlatformDetection).toHaveBeenCalledTimes(1);
  expect(ctx._teardownRetryObserver).toHaveBeenCalledTimes(1);
  expect(ctx.checkAndTriggerReviewForNewPR).toHaveBeenCalledTimes(1);
});

test('stops polling after the extension context is invalidated', async () => {
  const { ctx, tick } = monitor();
  delete ctx.chrome.runtime.id;
  await tick();
  expect(ctx.clearInterval).toHaveBeenCalledWith(1);
  expect(ctx.injectButtons).not.toHaveBeenCalled();
});

test('does not try to create a panel on non-PR pages', async () => {
  const { ctx, tick } = monitor();
  ctx.isSupportedPage.mockReturnValue(false);
  await tick();
  await tick();
  expect(ctx.injectButtons).toHaveBeenCalledTimes(1);
  expect(ctx.checkAndTriggerReviewForNewPR).not.toHaveBeenCalled();
});

test('waits for initial panel startup before attempting panel recovery', async () => {
  const { ctx, tick } = monitor();
  ctx.initialPanelPending = true;
  await tick();
  expect(ctx.checkAndTriggerReviewForNewPR).not.toHaveBeenCalled();
  ctx.initialPanelPending = false;
  await tick();
  expect(ctx.checkAndTriggerReviewForNewPR).toHaveBeenCalledTimes(1);
});

test('does not overlap asynchronous UI recovery attempts', async () => {
  const { ctx, tick } = monitor();
  let release;
  ctx.injectButtons.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const first = tick();
  await tick();
  expect(ctx.injectButtons).toHaveBeenCalledTimes(1);
  release();
  await first;
});

test('both classic bundles can be injected repeatedly without redeclaration or duplicate listeners', async () => {
  const event = () => ({ addListener: jest.fn() });
  const storageChanged = event();
  const runtimeMessage = event();
  const ctx = {
    document, console, URL,
    location: { href: 'https://github.com/team/repo', hostname: 'github.com', pathname: '/team/repo' },
    chrome: {
      runtime: { id: 'extension', getManifest: () => ({ version: 'test' }), getURL: path => `chrome-extension://test/${path}`, onMessage: runtimeMessage },
      storage: { onChanged: storageChanged, local: { get: async () => ({}), set: async () => {} } },
    },
    setTimeout: jest.fn(), clearTimeout: jest.fn(), setInterval: jest.fn(), clearInterval: jest.fn(),
    MutationObserver: jest.fn(),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const scripts = [content, panel].map(source => new vm.Script(source, {
    importModuleDynamically: async () => { throw new Error('simulated unavailable module'); },
  }));
  scripts.forEach(script => script.runInContext(ctx));
  const listeners = storageChanged.addListener.mock.calls.length;
  const messages = runtimeMessage.addListener.mock.calls.length;
  scripts.forEach(script => script.runInContext(ctx));
  await Promise.resolve();
  expect(ctx.__thinkReviewContentVersion).toBe('test');
  expect(ctx.__thinkReviewPanelVersion).toBe('test');
  expect(storageChanged.addListener).toHaveBeenCalledTimes(listeners);
  expect(runtimeMessage.addListener).toHaveBeenCalledTimes(messages);
  expect(typeof ctx.fetchAndDisplayCodeReview).toBe('function');
  expect(typeof ctx.createIntegratedReviewPanel).toBe('function');
  expect(typeof ctx.displayIntegratedReview).toBe('function');
  expect(typeof ctx.showIntegratedReviewError).toBe('function');
});


test('skips platform imports and DOM recovery in hidden tabs', async () => {
  const { ctx, tick } = monitor();
  ctx.document.hidden = true;
  ctx.platformDetector = null;
  ctx.window.location.href += '/pull/1';
  await tick();
  await tick();
  expect(ctx.initializePlatformDetection).not.toHaveBeenCalled();
  expect(ctx.shouldShowButton).not.toHaveBeenCalled();
  expect(ctx.document.getElementById).not.toHaveBeenCalled();
  expect(ctx.injectButtons).not.toHaveBeenCalled();
});

test('visibility change immediately recovers navigation and a missing trigger', async () => {
  const { ctx, tick } = monitor();
  ctx.document.hidden = true;
  ctx.window.location.href += '/pull/1';
  await tick();
  const resume = ctx.document.addEventListener.mock.calls.find(([name]) => name === 'visibilitychange')[1];
  ctx.document.hidden = false;
  await resume();
  expect(ctx.injectButtons).toHaveBeenCalledTimes(1);
  expect(ctx.checkAndTriggerReviewForNewPR).toHaveBeenCalledTimes(1);
  delete ctx.chrome.runtime.id;
  await resume();
  expect(ctx.document.removeEventListener).toHaveBeenCalledWith('visibilitychange', resume);
});
