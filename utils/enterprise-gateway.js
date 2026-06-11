/**
 * ThinkReview self-hosted gateway helpers.
 */

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

  const stored = await chrome.storage.local.get(['gatewayBaseUrl']);
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
