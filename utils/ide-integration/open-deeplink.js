/**
 * Open a custom-scheme or https URL from a content-script / page context without
 * navigating the host tab. Reusable for Cursor, VS Code, Claude Code, etc.
 *
 * @param {string} href
 */
export function openUrlWithTransientAnchor(href) {
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
