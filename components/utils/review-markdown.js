// review-markdown.js
// Utilities for building Markdown representations of review data

/**
 * Format a severity issue as markdown bullet
 * @param {Object} issue
 * @returns {string}
 */
function formatSeverityIssueMarkdown(issue) {
  if (!issue) return '';
  const title = issue.title || 'Untitled';
  const location = issue.filePath
    ? (typeof issue.startLine === 'number'
      ? (typeof issue.endLine === 'number' && issue.endLine !== issue.startLine
        ? `${issue.filePath}:${issue.startLine}-${issue.endLine}`
        : `${issue.filePath}:${issue.startLine}`)
      : issue.filePath)
    : '';
  const desc = String(issue.description || '').trim();
  const locLine = location ? ` (${location})` : '';
  return `- **${title}**${locLine}${desc ? `\n  ${desc}` : ''}`;
}

/**
 * Builds a Markdown string from the review data for copy-all.
 * @param {Object} review - The review data object
 * @returns {string} Formatted Markdown text
 */
export function buildReviewMarkdown(review) {
  if (!review) return '';

  // Severity layout
  if (review.reviewFormat === 'severity') {
    const sections = ['# AI Code Review'];

    if (review.prDescription) {
      sections.push(`## PR Description\n\n${review.prDescription}`);
    }

    if (Array.isArray(review.criticalIssues) && review.criticalIssues.length > 0) {
      const items = review.criticalIssues.map(formatSeverityIssueMarkdown).join('\n');
      sections.push(`## Critical Issues\n\n${items}`);
    }

    if (Array.isArray(review.highIssues) && review.highIssues.length > 0) {
      const items = review.highIssues.map(formatSeverityIssueMarkdown).join('\n');
      sections.push(`## High Issues\n\n${items}`);
    }

    if (Array.isArray(review.lowIssues) && review.lowIssues.length > 0) {
      const items = review.lowIssues.map(formatSeverityIssueMarkdown).join('\n');
      sections.push(`## Low Issues\n\n${items}`);
    }

    return sections.join('\n\n');
  }

  const sections = ['# AI Code Review'];

  // Quality Score
  if (review.metrics) {
    const m = review.metrics;
    const lines = ['## Quality Score', ''];
    if (m.overallScore != null) lines.push(`**Overall:** ${m.overallScore}`, '');
    if (m.codeQuality != null) lines.push(`- **Code Quality:** ${m.codeQuality}`);
    if (m.securityScore != null) lines.push(`- **Security:** ${m.securityScore}`);
    if (m.bestPracticesScore != null) lines.push(`- **Best Practices:** ${m.bestPracticesScore}`);
    sections.push(lines.join('\n'));
  }

  // Summary
  if (review.summary) {
    sections.push(`## Summary\n\n${review.summary}`);
  }

  // Suggestions
  if (review.suggestions && review.suggestions.length > 0) {
    const items = review.suggestions.map(s => `- ${String(s || '').trim()}`).join('\n');
    sections.push(`## Suggestions\n\n${items}`);
  }

  // Security Issues
  if (review.securityIssues && review.securityIssues.length > 0) {
    const items = review.securityIssues.map(s => `- ${String(s || '').trim()}`).join('\n');
    sections.push(`## Security Issues\n\n${items}`);
  }

  // Best Practices
  if (review.bestPractices && review.bestPractices.length > 0) {
    const items = review.bestPractices.map(s => `- ${String(s || '').trim()}`).join('\n');
    sections.push(`## Best Practices\n\n${items}`);
  }

  return sections.join('\n\n');
}
