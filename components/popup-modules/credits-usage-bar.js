/**
 * Monthly review-credit usage meter shown in the panel settings dropdown.
 *
 * Data comes from chrome.storage.local, written by the REFRESH_USER_DATA_STORAGE
 * background handler (ThinkReviewGetUserData): `monthReviewCount` (credits used this
 * calendar month) and `reviewQuota.monthlyLimit` / `reviewQuota.resetsAt` (the plan pool
 * the server enforces). The meter stays hidden until the pool size is known.
 */

const STORAGE_KEYS = ['monthReviewCount', 'reviewQuota'];
const WARN_RATIO = 0.8;

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Credits can be fractional; show at most one decimal. */
function formatCredits(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatResetDate(resetsAt) {
  const date = resetsAt ? new Date(resetsAt) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Resolve usage from stored values. When the stored reset time has passed, the month
 * rolled over since the last refresh, so usage is treated as 0 until the next refresh.
 * @returns {{used: number, limit: number, resetsAt: string|null}|null}
 */
export function resolveCreditsUsage(stored) {
  const limit = toFiniteNumber(stored?.reviewQuota?.monthlyLimit);
  if (limit === null || limit <= 0) return null;

  let used = toFiniteNumber(stored?.monthReviewCount);
  if (used === null || used < 0) used = 0;

  const resetsAt = stored?.reviewQuota?.resetsAt || null;
  const resetTime = resetsAt ? new Date(resetsAt).getTime() : NaN;
  if (Number.isFinite(resetTime) && Date.now() >= resetTime) used = 0;

  return { used, limit, resetsAt };
}

/**
 * Build the (initially hidden) meter element.
 * @returns {HTMLElement}
 */
export function createCreditsUsageMeter() {
  const meter = document.createElement('div');
  meter.className = 'thinkreview-settings-usage';
  meter.hidden = true;

  const head = document.createElement('div');
  head.className = 'thinkreview-settings-usage-head';

  const title = document.createElement('span');
  title.className = 'thinkreview-settings-usage-title';
  title.textContent = 'Credits this month';

  const value = document.createElement('span');
  value.className = 'thinkreview-settings-usage-value';

  head.append(title, value);

  const track = document.createElement('div');
  track.className = 'thinkreview-settings-usage-track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Review credits used this month');

  const fill = document.createElement('div');
  fill.className = 'thinkreview-settings-usage-fill';
  track.appendChild(fill);

  const reset = document.createElement('div');
  reset.className = 'thinkreview-settings-usage-reset';

  meter.append(head, track, reset);
  return meter;
}

/**
 * Render the meter. Pass null to hide it.
 * @param {HTMLElement|null} meter - element from createCreditsUsageMeter
 * @param {{used: number, limit: number, resetsAt?: string|null}|null} usage
 */
export function renderCreditsUsageMeter(meter, usage) {
  if (!meter) return;

  if (!usage) {
    meter.hidden = true;
    return;
  }

  const { used, limit, resetsAt } = usage;
  const ratio = Math.min(Math.max(used / limit, 0), 1);

  const track = meter.querySelector('.thinkreview-settings-usage-track');
  const fill = meter.querySelector('.thinkreview-settings-usage-fill');
  const value = meter.querySelector('.thinkreview-settings-usage-value');
  const reset = meter.querySelector('.thinkreview-settings-usage-reset');

  if (track) {
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(limit));
    track.setAttribute('aria-valuenow', String(Math.min(used, limit)));
  }
  if (fill) {
    fill.style.width = `${Math.round(ratio * 100)}%`;
    fill.classList.toggle('is-warn', ratio >= WARN_RATIO && ratio < 1);
    fill.classList.toggle('is-full', ratio >= 1);
  }
  if (value) {
    value.textContent = `${formatCredits(used)} / ${formatCredits(limit)}`;
  }
  if (reset) {
    const resetLabel = formatResetDate(resetsAt);
    reset.textContent = resetLabel ? `Resets ${resetLabel}` : '';
    reset.hidden = !resetLabel;
  }
  meter.hidden = false;
}

/** Read stored usage and render (or hide) the meter. */
export async function refreshCreditsUsageMeter(meter) {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEYS);
    renderCreditsUsageMeter(meter, resolveCreditsUsage(stored));
  } catch (error) {
    renderCreditsUsageMeter(meter, null);
  }
}

/**
 * Render the meter now and keep it in sync whenever the stored usage changes.
 * The listener removes itself once the meter is detached from the page.
 */
export function initCreditsUsageMeter(meter) {
  refreshCreditsUsageMeter(meter);

  const onChanged = (changes, area) => {
    if (!meter.isConnected) {
      chrome.storage.onChanged.removeListener(onChanged);
      return;
    }
    if (area !== 'local') return;
    if (STORAGE_KEYS.some((key) => key in changes)) {
      refreshCreditsUsageMeter(meter);
    }
  };
  chrome.storage.onChanged.addListener(onChanged);
}

/**
 * The server just rejected a review because the monthly pool is used up. Reflect that in
 * storage so every meter shows it as full immediately; the next user-data refresh
 * replaces these values with the server's.
 * @param {{limit: number, resetsAt?: string|null}} details
 */
export async function markMonthlyPoolExhausted({ limit, resetsAt = null }) {
  const poolLimit = toFiniteNumber(limit);
  if (poolLimit === null || poolLimit <= 0) return;

  const stored = await chrome.storage.local.get(['reviewQuota']);
  const previous =
    stored.reviewQuota && typeof stored.reviewQuota === 'object' ? stored.reviewQuota : {};
  await chrome.storage.local.set({
    monthReviewCount: poolLimit,
    reviewQuota: {
      ...previous,
      monthlyLimit: poolLimit,
      resetsAt: resetsAt || previous.resetsAt || null
    }
  });
}
