/**
 * GitHub Copilot Chat in VS Code — chat URL handler with prefilled prompt.
 * Format from VS Code / Copilot Chat: vscode://github.copilot-chat?prompt=...
 * Requires recent VS Code + GitHub Copilot Chat; may require Insiders on older builds.
 */

const OPEN_BASE = 'vscode://github.copilot-chat';
const MAX_URL_LENGTH = 8000;
const TRUNCATION_SUFFIX = '\n\n[Truncated for GitHub Copilot link limit]';

/**
 * @param {string} promptText
 * @returns {{ href: string, truncated: boolean }}
 */
export function buildGitHubCopilotPromptDeeplink(promptText) {
  const raw = String(promptText || '').trim();
  const u = new URL(OPEN_BASE);
  if (!raw) {
    u.searchParams.set('prompt', '');
    return { href: u.toString(), truncated: false };
  }

  function urlLengthForText(text) {
    const url = new URL(OPEN_BASE);
    url.searchParams.set('prompt', text);
    return url.toString().length;
  }

  if (urlLengthForText(raw) <= MAX_URL_LENGTH) {
    u.searchParams.set('prompt', raw);
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

  u.searchParams.set('prompt', text);
  return { href: u.toString(), truncated: true };
}
