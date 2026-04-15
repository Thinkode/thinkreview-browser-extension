/**
 * Shared prompt text for "open in editor" flows (Cursor, VS Code Copilot, Claude Code, etc.).
 * The browser cannot see which folder the IDE has open; we only add page + MR/PR context.
 */

/**
 * @param {string} itemPlainText - Plain text of a single list item
 * @param {object} opts
 * @param {string} opts.ideDisplayName - e.g. "Cursor", "Visual Studio Code"
 * @param {string} [opts.mrPageUrl] - Current MR/PR tab URL (hash stripped)
 * @param {string|null} [opts.reviewRequestLabel] - e.g. "MR #12", "PR #34"
 * @param {'suggestion'|'practice'} [opts.itemKind] - Which Review tab section this row came from
 * @returns {string}
 */
export function buildReviewSuggestionPromptBody(itemPlainText, {
  ideDisplayName,
  mrPageUrl = '',
  reviewRequestLabel = null,
  itemKind = 'suggestion'
}) {
  const product = ideDisplayName || 'your editor';
  const applyLine =
    itemKind === 'practice'
      ? 'Apply this best-practice recommendation in that workspace:'
      : 'Apply this code review suggestion in that workspace:';
  const lines = [
    `Before editing: confirm ${product} has the local git repo open that corresponds to this merge request / pull request (same remote/project as below). If you are in the wrong workspace, open the correct folder first.`,
    mrPageUrl ? `Review page (use this to match repo/branch): ${mrPageUrl}` : null,
    reviewRequestLabel ? `Request: ${reviewRequestLabel}` : null,
    '',
    '---',
    '',
    applyLine,
    '',
    String(itemPlainText || '').trim()
  ];
  return lines.filter((x) => x !== null).join('\n');
}
