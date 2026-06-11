/**
 * ThinkReview self-hosted gateway helpers (Teams plan only).
 */

export function isTeamsSubscriptionType(subscriptionType) {
  return String(subscriptionType ?? '').trim().toLowerCase() === 'teams';
}

/**
 * @param {object} stored - chrome.storage.local snapshot or user payload
 * @returns {boolean}
 */
export function canUseEnterpriseGatewayFromStorage(stored) {
  const sub = stored?.userSubscriptionData;
  if (sub && typeof sub === 'object') {
    const type = sub.userSubscriptionType || stored?.subscriptionType;
    if (sub.userSubscriptionStatus && sub.userSubscriptionStatus !== 'active') {
      return false;
    }
    return isTeamsSubscriptionType(type);
  }
  const fallbackType = stored?.subscriptionType || stored?.userData?.subscriptionType;
  return isTeamsSubscriptionType(fallbackType);
}

export async function readCanUseEnterpriseGateway() {
  const stored = await chrome.storage.local.get([
    'userSubscriptionData',
    'userData',
    'subscriptionType',
  ]);
  return canUseEnterpriseGatewayFromStorage(stored);
}

export function normalizeGatewayBaseUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    const pathname = url.pathname.replace(/\/$/, '');
    return `${url.origin}${pathname === '' ? '' : pathname}`.replace(/\/$/, '');
  } catch (_) {
    return null;
  }
}

/**
 * Validate self-hosted gateway is configured before routing review traffic.
 * @param {string} aiProvider
 * @returns {Promise<{ ok: boolean, error?: string, provider?: string, suggestion?: string }>}
 */
export async function assertSelfHostedGatewayReady(aiProvider) {
  if (aiProvider !== 'self-hosted') {
    return { ok: true };
  }

  const stored = await chrome.storage.local.get([
    'gatewayBaseUrl',
    'userSubscriptionData',
    'userData',
    'subscriptionType',
  ]);

  if (!canUseEnterpriseGatewayFromStorage(stored)) {
    return {
      ok: false,
      error: 'ThinkReview Self-Hosted Gateway requires a Teams subscription.',
      provider: 'self-hosted',
      suggestion: 'Switch to ThinkReview Cloud or upgrade to Teams.',
    };
  }

  const baseUrl = normalizeGatewayBaseUrl(stored?.gatewayBaseUrl);
  if (!baseUrl) {
    return {
      ok: false,
      error: 'Configure your ThinkReview Self-Hosted Gateway URL in extension settings.',
      provider: 'self-hosted',
      suggestion: 'Open the popup, select ThinkReview Self-Hosted Gateway, and save your gateway URL.',
    };
  }

  return { ok: true };
}
