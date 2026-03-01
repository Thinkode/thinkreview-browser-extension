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

  // Root container - minWidth 0 allows overflow to work in flex/grid parents
  const suggestionElement = document.createElement('div');
  suggestionElement.className = 'thinkreview-code-suggestion';
  suggestionElement.style.marginTop = '4px';
  suggestionElement.style.minWidth = '0';
  suggestionElement.style.maxWidth = '100%';

  // Meta: file name + line range (if available)
  if (typeof startLine === 'number') {
    const meta = document.createElement('div');
    meta.className = 'thinkreview-suggestion-meta';
    meta.style.fontSize = '11px';
    meta.style.color = '#9ca3af';
    meta.style.overflowWrap = 'break-word';
    meta.style.wordBreak = 'break-word';

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
    descElement.style.overflowWrap = 'break-word';
    descElement.style.wordBreak = 'break-word';
    descElement.textContent = description;
    suggestionElement.appendChild(descElement);
  }

  // Code block - wrap in scroll container so long lines get horizontal scroll (not overflow)
  const codeScrollWrap = document.createElement('div');
  codeScrollWrap.className = 'thinkreview-suggestion-code-scroll';
  codeScrollWrap.style.overflowX = 'auto';
  codeScrollWrap.style.overflowY = 'auto';
  codeScrollWrap.style.maxWidth = '100%';
  codeScrollWrap.style.minWidth = '0';

  const codeBlock = document.createElement('pre');
  codeBlock.className = 'thinkreview-suggestion-code';
  codeBlock.style.backgroundColor = '#1a1a1a';
  codeBlock.style.color = '#e0e0e0';
  codeBlock.style.border = '1px solid #333333';
  codeBlock.style.padding = '8px';
  codeBlock.style.borderRadius = '4px';
  codeBlock.style.margin = '0';
  codeBlock.style.fontSize = '12px';
  codeBlock.style.fontFamily = 'monospace';
  codeBlock.style.whiteSpace = 'pre';

  const codeText = document.createTextNode(suggestedCode || '');
  codeBlock.appendChild(codeText);
  codeScrollWrap.appendChild(codeBlock);
  suggestionElement.appendChild(codeScrollWrap);

  return suggestionElement;
}


