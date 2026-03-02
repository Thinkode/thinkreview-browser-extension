// review-markdown.js
// Utilities for building Markdown representations of review data

/**
 * Builds a Markdown string from the review data for copy-all.
 * @param {Object} review - The review data object
 * @returns {string} Formatted Markdown text
 */
export function buildReviewMarkdown(review) {
  if (!review) return '';

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

