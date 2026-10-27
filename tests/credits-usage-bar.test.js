import { jest } from '@jest/globals';
import {
  resolveCreditsUsage,
  resolveDailyCapUsage,
  createCreditsUsageMeter,
  createDailyCapMeter,
  renderCreditsUsageMeter,
  markMonthlyPoolExhausted,
  markDailyCapExhausted
} from '../components/popup-modules/credits-usage-bar.js';

const FUTURE = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

describe('resolveCreditsUsage', () => {
  test('returns used and limit from stored quota', () => {
    expect(
      resolveCreditsUsage({ monthReviewCount: 12, reviewQuota: { monthlyLimit: 30, resetsAt: FUTURE } })
    ).toEqual({ used: 12, limit: 30, resetsAt: FUTURE });
  });

  test('is null when the pool size is unknown or not positive', () => {
    expect(resolveCreditsUsage({ monthReviewCount: 5 })).toBeNull();
    expect(resolveCreditsUsage({ monthReviewCount: 5, reviewQuota: { monthlyLimit: 0 } })).toBeNull();
    expect(resolveCreditsUsage({ monthReviewCount: 5, reviewQuota: { monthlyLimit: 'abc' } })).toBeNull();
  });

  test('missing or negative usage counts as 0', () => {
    expect(resolveCreditsUsage({ reviewQuota: { monthlyLimit: 30, resetsAt: FUTURE } }).used).toBe(0);
    expect(
      resolveCreditsUsage({ monthReviewCount: -3, reviewQuota: { monthlyLimit: 30, resetsAt: FUTURE } }).used
    ).toBe(0);
  });

  test('usage resets to 0 once the stored reset time has passed', () => {
    expect(
      resolveCreditsUsage({ monthReviewCount: 25, reviewQuota: { monthlyLimit: 30, resetsAt: PAST } }).used
    ).toBe(0);
  });
});

describe('resolveDailyCapUsage', () => {
  test('uses today’s count when the last review was today', () => {
    expect(
      resolveDailyCapUsage({
        todayReviewCount: 12,
        lastReviewDate: new Date().toISOString(),
        reviewQuota: { dailyCap: 50 }
      })
    ).toEqual({ used: 12, limit: 50, resetText: 'Resets tomorrow' });
  });

  test('ignores yesterday’s count', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(
      resolveDailyCapUsage({
        todayReviewCount: 40,
        lastReviewDate: yesterday.toISOString(),
        reviewQuota: { dailyCap: 50 }
      }).used
    ).toBe(0);
  });

  test('is null when the daily cap is missing or zero', () => {
    expect(resolveDailyCapUsage({ todayReviewCount: 4, lastReviewDate: new Date().toISOString() })).toBeNull();
    expect(resolveDailyCapUsage({
      todayReviewCount: 4,
      lastReviewDate: new Date().toISOString(),
      reviewQuota: { dailyCap: 0 }
    })).toBeNull();
  });
});

describe('renderCreditsUsageMeter', () => {
  test('starts hidden', () => {
    expect(createCreditsUsageMeter().hidden).toBe(true);
  });

  test('shows the meter with value, width, reset date and progress attributes', () => {
    const meter = createCreditsUsageMeter();
    renderCreditsUsageMeter(meter, { used: 12, limit: 30, resetsAt: FUTURE });

    expect(meter.hidden).toBe(false);
    expect(meter.querySelector('.thinkreview-settings-usage-value').textContent).toBe('12 / 30');
    expect(meter.querySelector('.thinkreview-settings-usage-fill').style.width).toBe('40%');
    const track = meter.querySelector('.thinkreview-settings-usage-track');
    expect(track.getAttribute('aria-valuenow')).toBe('12');
    expect(track.getAttribute('aria-valuemax')).toBe('30');
    const reset = meter.querySelector('.thinkreview-settings-usage-reset');
    expect(reset.hidden).toBe(false);
    expect(reset.textContent).toMatch(/^Resets /);
  });

  test('hides the reset line when no reset date is known', () => {
    const meter = createCreditsUsageMeter();
    renderCreditsUsageMeter(meter, { used: 1, limit: 30 });
    expect(meter.querySelector('.thinkreview-settings-usage-reset').hidden).toBe(true);
  });

  test('uses warn styling at 80% and full styling at 100%', () => {
    const meter = createCreditsUsageMeter();
    const fill = meter.querySelector('.thinkreview-settings-usage-fill');

    renderCreditsUsageMeter(meter, { used: 24, limit: 30 });
    expect(fill.classList.contains('is-warn')).toBe(true);
    expect(fill.classList.contains('is-full')).toBe(false);

    renderCreditsUsageMeter(meter, { used: 30, limit: 30 });
    expect(fill.classList.contains('is-warn')).toBe(false);
    expect(fill.classList.contains('is-full')).toBe(true);
  });

  test('caps the width at 100% and formats fractional credits', () => {
    const meter = createCreditsUsageMeter();
    renderCreditsUsageMeter(meter, { used: 45.25, limit: 30 });
    expect(meter.querySelector('.thinkreview-settings-usage-fill').style.width).toBe('100%');
    expect(meter.querySelector('.thinkreview-settings-usage-track').getAttribute('aria-valuenow')).toBe('30');

    renderCreditsUsageMeter(meter, { used: 2.5, limit: 30 });
    expect(meter.querySelector('.thinkreview-settings-usage-value').textContent).toBe('2.5 / 30');
  });

  test('the daily meter is its own row under a separate title', () => {
    const monthly = createCreditsUsageMeter();
    const daily = createDailyCapMeter();
    renderCreditsUsageMeter(daily, { used: 20, limit: 50, resetText: 'Resets tomorrow' });

    expect(daily.classList.contains('thinkreview-settings-usage-daily')).toBe(true);
    expect(monthly.querySelector('.thinkreview-settings-usage-title').textContent).toBe('Credits this month');
    expect(daily.querySelector('.thinkreview-settings-usage-title').textContent).toBe('Credits today');
    expect(daily.querySelector('.thinkreview-settings-usage-value').textContent).toBe('20 / 50');
    expect(daily.querySelector('.thinkreview-settings-usage-fill').style.width).toBe('40%');
    expect(daily.querySelector('.thinkreview-settings-usage-reset').textContent).toBe('Resets tomorrow');
    expect(daily.querySelector('.thinkreview-settings-usage-track').getAttribute('aria-label')).toBe(
      'Review credits used today'
    );
  });

  test('hides the meter when there is no usage data and tolerates a missing meter', () => {
    const meter = createCreditsUsageMeter();
    renderCreditsUsageMeter(meter, { used: 1, limit: 30 });
    renderCreditsUsageMeter(meter, null);
    expect(meter.hidden).toBe(true);
    expect(() => renderCreditsUsageMeter(null, { used: 1, limit: 30 })).not.toThrow();
  });
});

describe('markMonthlyPoolExhausted', () => {
  let store;

  beforeEach(() => {
    store = { reviewQuota: { planType: 'free', monthlyLimit: 30, dailyCap: 10, resetsAt: FUTURE } };
    global.chrome = {
      storage: {
        local: {
          get: jest.fn(async (keys) => Object.fromEntries(keys.map((k) => [k, store[k]]))),
          set: jest.fn(async (values) => Object.assign(store, values))
        }
      }
    };
  });

  afterEach(() => {
    delete global.chrome;
  });

  test('marks the whole pool used and keeps the other quota fields', async () => {
    await markMonthlyPoolExhausted({ limit: 30 });
    expect(store.monthReviewCount).toBe(30);
    expect(store.reviewQuota).toEqual({
      planType: 'free',
      monthlyLimit: 30,
      dailyCap: 10,
      resetsAt: FUTURE
    });
  });

  test('prefers the reset time from the limit response', async () => {
    const resetsAt = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
    await markMonthlyPoolExhausted({ limit: 300, resetsAt });
    expect(store.reviewQuota.monthlyLimit).toBe(300);
    expect(store.reviewQuota.resetsAt).toBe(resetsAt);
  });

  test('works when no quota has been stored yet', async () => {
    store = {};
    await markMonthlyPoolExhausted({ limit: 30 });
    expect(resolveCreditsUsage(store)).toEqual({ used: 30, limit: 30, resetsAt: null });
  });

  test('ignores an invalid limit', async () => {
    await markMonthlyPoolExhausted({ limit: 'nope' });
    await markMonthlyPoolExhausted({ limit: 0 });
    expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
  });
});

describe('markDailyCapExhausted', () => {
  let store;

  beforeEach(() => {
    store = { reviewQuota: { planType: 'professional', monthlyLimit: 600, dailyCap: 50, resetsAt: FUTURE } };
    global.chrome = {
      storage: {
        local: {
          get: jest.fn(async (keys) => Object.fromEntries(keys.map((k) => [k, store[k]]))),
          set: jest.fn(async (values) => Object.assign(store, values))
        }
      }
    };
  });

  afterEach(() => {
    delete global.chrome;
  });

  test('marks today’s cap used and keeps the monthly pool', async () => {
    await markDailyCapExhausted({ limit: 50 });
    expect(store.todayReviewCount).toBe(50);
    expect(store.reviewQuota.monthlyLimit).toBe(600);
    expect(store.reviewQuota.dailyCap).toBe(50);
    expect(resolveDailyCapUsage(store)).toEqual({ used: 50, limit: 50, resetText: 'Resets tomorrow' });
  });

  test('ignores an invalid cap', async () => {
    await markDailyCapExhausted({ limit: 0 });
    expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
