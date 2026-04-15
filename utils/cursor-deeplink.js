/**
 * Cursor IDE prompt deeplinks (see https://cursor.com/docs/reference/deeplinks).
 * Full URL must stay within Cursor's documented 8,000 character limit.
 */

const PROMPT_BASE = 'cursor://anysphere.cursor-deeplink/prompt';
const MAX_URL_LENGTH = 8000;
const TRUNCATION_SUFFIX = '\n\n[Truncated for Cursor link limit]';

/**
 * @param {string} promptText
 * @returns {{ href: string, truncated: boolean }}
 */
export function buildCursorPromptDeeplink(promptText) {
  const raw = String(promptText || '').trim();
  const u = new URL(PROMPT_BASE);
  if (!raw) {
    u.searchParams.set('text', '');
    return { href: u.toString(), truncated: false };
  }

  function urlLengthForText(text) {
    const url = new URL(PROMPT_BASE);
    url.searchParams.set('text', text);
    return url.toString().length;
  }

  if (urlLengthForText(raw) <= MAX_URL_LENGTH) {
    u.searchParams.set('text', raw);
    return { href: u.toString(), truncated: false };
  }

  let lo = 0;
  let hi = raw.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = raw.slice(0, mid) + TRUNCATION_SUFFIX;
    if (urlLengthForText(candidate) <= MAX_URL_LENGTH) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const text = raw.slice(0, lo) + TRUNCATION_SUFFIX;

  u.searchParams.set('text', text);
  return { href: u.toString(), truncated: true };
}
