/**
 * Shared prompt text for "open in editor" flows (Cursor, VS Code Copilot, Claude Code, etc.).
 * The browser cannot see which folder the IDE has open; we only add page + MR/PR context.
 */

/**
 * @param {string} itemPlainText - Plain text of a single list item
 * @param {object} opts
 * @param {string} [opts.mrPageUrl] - Current MR/PR tab URL (hash stripped)
 * @param {string|null} [opts.reviewRequestLabel] - e.g. "MR #12", "PR #34"
 * @param {'suggestion'|'practice'|'security'} [opts.itemKind] - Which Review tab section this row came from
 * @returns {string}
 */
export function buildReviewSuggestionPromptBody(itemPlainText, {
  mrPageUrl = '',
  reviewRequestLabel = null,
  itemKind = 'suggestion'
}) {
  const applyLine =
    itemKind === 'practice'
      ? 'Apply this best-practice recommendation in that workspace:'
      : itemKind === 'security'
        ? 'Address this security finding in that workspace:'
        : 'Apply this code review suggestion in that workspace:';
  const lines = [
    'Assistant: Before changing any files, verify (e.g. via git remote and current branch) that this workspace is this PR/MR\'s repository and that the checked-out branch matches this PR\'s head/source branch. If the workspace is the wrong repo, or the branch does not match this PR, do not edit anything — stop and tell the user clearly to open the correct project and the PR\'s branch first, then retry. Never apply these changes in an unrelated workspace or on the wrong branch — that can damage the wrong codebase.',
    mrPageUrl ? `Review page (use this to match repo and confirm PR details): ${mrPageUrl}` : null,
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
