// code-suggestion-element.js
// Shared UI utility for rendering a code suggestion panel.
// This is platform-agnostic and can be reused for GitLab, Azure DevOps, GitHub, etc.

/**
 * Creates a DOM element representing a code suggestion.
 *
 * Expected suggestion shape:
 * - filePath: string
 * - startLine: number
 * - endLine?: number
 * - suggestedCode: string
 * - description?: string
 *
 * @param {Object} suggestion
 * @returns {HTMLElement} root suggestion element
 */
export function createCodeSuggestionElement(suggestion) {
  const {
    filePath,
    startLine,
    endLine,
    suggestedCode,
    description
  } = suggestion || {};

  // Root container
  const suggestionElement = document.createElement('div');
  suggestionElement.className = 'thinkreview-code-suggestion';
  suggestionElement.style.marginTop = '4px';

  // Meta: file name + line range (if available)
  if (typeof startLine === 'number') {
    const meta = document.createElement('div');
    meta.className = 'thinkreview-suggestion-meta';
    meta.style.fontSize = '11px';
    meta.style.color = '#9ca3af';

    const start = startLine;
    const end = typeof endLine === 'number' && endLine >= start ? endLine : start;
    const fileLabel = filePath || 'Unknown file';

    meta.textContent = `${fileLabel} — lines ${start}${end !== start ? '–' + end : ''}`;
    suggestionElement.appendChild(meta);
  }

  // Description
  if (description) {
    const descElement = document.createElement('div');
    descElement.className = 'thinkreview-suggestion-description';
    descElement.style.marginBottom = '8px';
    descElement.style.fontSize = '13px';
    descElement.style.color = '#e0e0e0';
    descElement.textContent = description;
    suggestionElement.appendChild(descElement);
  }

  // Code block - dark theme to match integrated panel
  const codeBlock = document.createElement('pre');
  codeBlock.className = 'thinkreview-suggestion-code';
  codeBlock.style.backgroundColor = '#1a1a1a';
  codeBlock.style.color = '#e0e0e0';
  codeBlock.style.border = '1px solid #333333';
  codeBlock.style.padding = '8px';
  codeBlock.style.borderRadius = '4px';
  codeBlock.style.overflow = 'auto';
  codeBlock.style.fontSize = '12px';
  codeBlock.style.fontFamily = 'monospace';

  const codeText = document.createTextNode(suggestedCode || '');
  codeBlock.appendChild(codeText);
  suggestionElement.appendChild(codeBlock);

  return suggestionElement;
}


