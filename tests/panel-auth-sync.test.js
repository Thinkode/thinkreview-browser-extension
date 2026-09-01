/**
 * Unit tests for integrated-pane auth pickup (no page refresh after portal sign-in).
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  AUTH_POLL_INTERVAL_MS,
  LOGIN_PROMPT_ID,
  WEBAPP_AUTH_SYNCED_TYPE,
  createLoginAuthWatcher,
  isLoginPromptVisible,
  storageChangeLooksLikeLogin,
} from '../utils/panel-auth-sync.js';

function makeDoc({ visible = true } = {}) {
  document.body.innerHTML = '';
  const prompt = document.createElement('div');
  prompt.id = LOGIN_PROMPT_ID;
  if (!visible) prompt.classList.add('gl-hidden');
  document.body.appendChild(prompt);
  return document;
}

describe('isLoginPromptVisible', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is true when the login prompt is in the document and not hidden', () => {
    makeDoc({ visible: true });
    expect(isLoginPromptVisible(document)).toBe(true);
  });

  it('is false when the login prompt has gl-hidden', () => {
    makeDoc({ visible: false });
    expect(isLoginPromptVisible(document)).toBe(false);
  });

  it('is false when the login prompt is missing', () => {
    document.body.innerHTML = '';
    expect(isLoginPromptVisible(document)).toBe(false);
  });
});

describe('storageChangeLooksLikeLogin', () => {
  it('detects userData being set', () => {
    expect(storageChangeLooksLikeLogin({
      userData: { newValue: { email: 'a@b.com', uid: '1' } },
    })).toBe(true);
  });

  it('detects oauth_user being set', () => {
    expect(storageChangeLooksLikeLogin({
      oauth_user: { newValue: { email: 'a@b.com' } },
    })).toBe(true);
  });

  it('detects JSON user string with email', () => {
    expect(storageChangeLooksLikeLogin({
      user: { newValue: JSON.stringify({ email: 'a@b.com' }) },
    })).toBe(true);
  });

  it('ignores unrelated keys and empty payloads', () => {
    expect(storageChangeLooksLikeLogin({ panelTextSize: { newValue: 'large' } })).toBe(false);
    expect(storageChangeLooksLikeLogin({ userData: { newValue: null } })).toBe(false);
    expect(storageChangeLooksLikeLogin(null)).toBe(false);
    expect(storageChangeLooksLikeLogin({ user: { newValue: 'not-json' } })).toBe(false);
  });
});

describe('createLoginAuthWatcher', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function makeWatcher({ loggedIn = false, onAuthAvailable } = {}) {
    const intervals = [];
    const watcher = createLoginAuthWatcher({
      isUserLoggedIn: async () => loggedIn,
      onAuthAvailable: onAuthAvailable || (async () => {}),
      getDocument: () => document,
      setIntervalFn: (fn, ms) => {
        const id = intervals.length + 1;
        intervals.push({ id, fn, ms });
        return id;
      },
      clearIntervalFn: (id) => {
        const idx = intervals.findIndex((item) => item.id === id);
        if (idx !== -1) intervals.splice(idx, 1);
      },
    });
    return { watcher, intervals };
  }

  it('starts a review when WEBAPP_AUTH_SYNCED arrives while the prompt is visible', async () => {
    makeDoc({ visible: true });
    const onAuthAvailable = jest.fn(async () => {});
    const { watcher } = makeWatcher({ loggedIn: true, onAuthAvailable });

    await watcher.onRuntimeMessage({ type: WEBAPP_AUTH_SYNCED_TYPE, user: { email: 'a@b.com' } });

    expect(onAuthAvailable).toHaveBeenCalledTimes(1);
  });

  it('starts a review when storage reports a login while the prompt is visible', async () => {
    makeDoc({ visible: true });
    const onAuthAvailable = jest.fn(async () => {});
    const { watcher } = makeWatcher({ loggedIn: true, onAuthAvailable });

    await watcher.onStorageChanged({ userData: { newValue: { email: 'a@b.com' } } }, 'local');

    expect(onAuthAvailable).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the login prompt is not visible', async () => {
    makeDoc({ visible: false });
    const onAuthAvailable = jest.fn(async () => {});
    const { watcher } = makeWatcher({ loggedIn: true, onAuthAvailable });

    const started = await watcher.handleAuthAvailable();
    expect(started).toBe(false);
    expect(onAuthAvailable).not.toHaveBeenCalled();
  });

  it('does nothing when the user is still signed out', async () => {
    makeDoc({ visible: true });
    const onAuthAvailable = jest.fn(async () => {});
    const { watcher } = makeWatcher({ loggedIn: false, onAuthAvailable });

    const started = await watcher.handleAuthAvailable();
    expect(started).toBe(false);
    expect(onAuthAvailable).not.toHaveBeenCalled();
  });

  it('polls until login is detected, then stops', async () => {
    makeDoc({ visible: true });
    let loggedIn = false;
    const onAuthAvailable = jest.fn(async () => {});
    const intervals = [];
    const watcher = createLoginAuthWatcher({
      isUserLoggedIn: async () => loggedIn,
      onAuthAvailable,
      getDocument: () => document,
      setIntervalFn: (fn, ms) => {
        const id = intervals.length + 1;
        intervals.push({ id, fn, ms });
        return id;
      },
      clearIntervalFn: (id) => {
        const idx = intervals.findIndex((item) => item.id === id);
        if (idx !== -1) intervals.splice(idx, 1);
      },
    });

    await watcher.startPoll();
    expect(intervals[0]?.ms).toBe(AUTH_POLL_INTERVAL_MS);
    expect(onAuthAvailable).not.toHaveBeenCalled();

    loggedIn = true;
    await intervals[0].fn();

    expect(onAuthAvailable).toHaveBeenCalledTimes(1);
    expect(watcher.isPolling()).toBe(false);
  });

  it('ignores duplicate in-flight auth pickups', async () => {
    makeDoc({ visible: true });
    let resolveAuth;
    const onAuthAvailable = jest.fn(() => new Promise((resolve) => {
      resolveAuth = resolve;
    }));
    const { watcher } = makeWatcher({ loggedIn: true, onAuthAvailable });

    const first = watcher.handleAuthAvailable();
    const secondResult = await watcher.handleAuthAvailable();
    expect(secondResult).toBe(false);
    expect(onAuthAvailable).toHaveBeenCalledTimes(1);

    resolveAuth();
    await expect(first).resolves.toBe(true);
  });
});
