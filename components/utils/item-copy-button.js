// item-copy-button.js
// Module for creating and handling copy buttons for review items

import { dbgWarn } from '../../utils/logger.js';
import { trackUserAction } from '../../utils/analytics-service.js';

/**
 * Creates the copy icon SVG element (safe DOM construction, no innerHTML)
 * @returns {SVGSVGElement}
 */
function createCopyIconSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.style.display = 'block';
  svg.style.visibility = 'visible';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z');
  path.setAttribute('fill', 'currentColor');
  path.style.fill = 'currentColor';
  svg.appendChild(path);
  return svg;
}

/**
 * Creates the checkmark success icon SVG element
 * @returns {SVGSVGElement}
 */
function createCheckmarkSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

/**
 * Creates the error icon SVG element
 * @returns {SVGSVGElement}
 */
function createErrorSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

/**
 * Clears all child nodes from an element
 * @param {HTMLElement} el
 */
function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Creates a copy button element with SVG icon
 * @returns {HTMLElement} The copy button element
 */
export function createCopyButton() {
  const button = document.createElement('button');
  button.className = 'thinkreview-item-copy-btn';
  button.type = 'button';
  button.title = 'Copy';
  // Add inline styles to ensure visibility even if CSS is overridden by platform styles
  button.style.display = 'flex';
  button.style.visibility = 'visible';
  button.style.opacity = '0.6';
  button.appendChild(createCopyIconSvg());
  return button;
}

/**
 * Plain text copy utilities
 * Modular functions for extracting plain text with preserved formatting
 */

// Block-level elements that should create line breaks
const BLOCK_ELEMENTS = ['div', 'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'section', 'article'];

/**
 * Creates indentation string for plain text based on indent level
 * @param {number} indentLevel - The level of indentation
 * @returns {string} Indentation string (2 spaces per level)
 */
function createPlainTextIndent(indentLevel) {
  return '  '.repeat(indentLevel);
}

/**
 * Processes an unordered list (<ul>) element for plain text copy
 * @param {HTMLElement} ulElement - The <ul> element to process
 * @param {Object} listContext - Current list context
 * @param {Function} processNode - Function to recursively process child nodes
 * @returns {string} Formatted plain text with bullet points
 */
function processPlainTextUnorderedList(ulElement, listContext, processNode) {
  const children = Array.from(ulElement.childNodes);
  let result = '';
  let itemNumber = 0;
  
  children.forEach((child, index) => {
    if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
      itemNumber++;
      const newContext = { 
        type: 'ul', 
        itemNumber: itemNumber, 
        indentLevel: listContext.indentLevel + 1 
      };
      const childText = processNode(child, newContext);
      
      // Add bullet point prefix with indentation
      const indent = createPlainTextIndent(listContext.indentLevel);
      const prefix = indent + '- ';
      
      if (index > 0) {
        result += '\n';
      }
      result += prefix + childText.trim();
    } else {
      // Process non-li children normally
      const childText = processNode(child, listContext);
      if (childText.trim()) {
        if (result && !result.endsWith('\n')) {
          result += '\n';
        }
        result += childText;
      }
    }
  });
  
  return result;
}

/**
 * Processes an ordered list (<ol>) element for plain text copy
 * @param {HTMLElement} olElement - The <ol> element to process
 * @param {Object} listContext - Current list context
 * @param {Function} processNode - Function to recursively process child nodes
 * @returns {string} Formatted plain text with numbered items
 */
function processPlainTextOrderedList(olElement, listContext, processNode) {
  const children = Array.from(olElement.childNodes);
  let result = '';
  let itemNumber = 0;
  
  // Get start attribute if present (for custom numbering start)
  const startAttr = olElement.getAttribute('start');
  const startNumber = startAttr ? parseInt(startAttr, 10) : 1;
  
  children.forEach((child, index) => {
    if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
      itemNumber++;
      const actualNumber = startNumber + itemNumber - 1;
      const newContext = { 
        type: 'ol', 
        itemNumber: actualNumber, 
        indentLevel: listContext.indentLevel + 1 
      };
      const childText = processNode(child, newContext);
      
      // Add numbered prefix with indentation
      const indent = createPlainTextIndent(listContext.indentLevel);
      const prefix = indent + actualNumber + '. ';
      
      if (index > 0) {
        result += '\n';
      }
      result += prefix + childText.trim();
    } else {
      // Process non-li children normally
      const childText = processNode(child, listContext);
      if (childText.trim()) {
        if (result && !result.endsWith('\n')) {
          result += '\n';
        }
        result += childText;
      }
    }
  });
  
  return result;
}

/**
 * Processes a list item (<li>) element for plain text copy
 * @param {HTMLElement} liElement - The <li> element to process
 * @param {Object} listContext - Current list context
 * @param {Function} processNode - Function to recursively process child nodes
 * @returns {string} Plain text content of the list item
 */
function processPlainTextListItem(liElement, listContext, processNode) {
  const children = Array.from(liElement.childNodes);
  let result = '';
  
  children.forEach((child) => {
    const childText = processNode(child, listContext);
    result += childText;
  });
  
  return result;
}

/**
 * Processes code block elements (.thinkreview-code-block) for plain text copy
 * Formats as markdown code blocks (```language\ncode\n```) and excludes the "Copy code" button
 * @param {HTMLElement} codeBlockElement - The .thinkreview-code-block element to process
 * @param {Object} listContext - Current list context
 * @param {Function} processNode - Function to recursively process child nodes
 * @returns {string} Plain text formatted as markdown code block
 */
function processPlainTextCodeBlock(codeBlockElement, listContext, processNode) {
  // Find the <pre><code> element inside the code block (skip the header with "Copy code" button)
  const codeElement = codeBlockElement.querySelector('pre code');
  if (!codeElement) {
    // Fallback: process children normally but skip the header
    const header = codeBlockElement.querySelector('.thinkreview-code-header');
    const pre = codeBlockElement.querySelector('pre');
    if (pre) {
      return processNode(pre, listContext);
    }
    return '';
  }
  
  // Extract the language from the code element's class
  const classList = codeElement.className || '';
  const langMatch = classList.match(/language-([\w-]+)/);
  const language = langMatch ? langMatch[1] : '';
  
  // Get the code content (text only, no HTML)
  const codeText = codeElement.textContent || '';
  
  // Format as markdown code block
  if (language && language !== 'text' && language !== 'plaintext') {
    return '\n```' + language + '\n' + codeText + '\n```\n';
  } else {
    return '\n```\n' + codeText + '\n```\n';
  }
}

/**
 * Processes inline code elements (<code>) for plain text copy
 * Wraps with backticks (`text`) and preserves existing line breaks
 * @param {HTMLElement} codeElement - The <code> element to process
 * @param {Object} listContext - Current list context
 * @param {Function} processNode - Function to recursively process child nodes
 * @returns {string} Plain text with backtick formatting, preserving existing line breaks
 */
function processPlainTextInlineCode(codeElement, listContext, processNode) {
  // Check if this code element is inside a <pre> block (block-level code)
  let parent = codeElement.parentElement;
  let isInsidePre = false;
  while (parent) {
    if (parent.tagName && parent.tagName.toLowerCase() === 'pre') {
      isInsidePre = true;
      break;
    }
    parent = parent.parentElement;
  }
  
  // If inside <pre>, treat as part of pre block (no special formatting)
  if (isInsidePre) {
    const children = Array.from(codeElement.childNodes);
    let result = '';
    children.forEach((child) => {
      result += processNode(child, listContext);
    });
    return result;
  }
  
  // Process as inline code - wrap with backticks
  const children = Array.from(codeElement.childNodes);
  let result = '';
  children.forEach((child) => {
    result += processNode(child, listContext);
  });
  
  // Remove leading and trailing newlines (inline code shouldn't have them)
  // But preserve internal whitespace and any existing newlines within the content
  result = result.replace(/^\n+/, '').replace(/\n+$/, '');
  
  // Wrap with backticks (`text`)
  // Preserve any leading/trailing spaces (but not newlines)
  const trimmed = result.trim();
  if (trimmed) {
    const leading = result.match(/^[ \t]*/)?.[0] || '';
    const trailing = result.match(/[ \t]*$/)?.[0] || '';
    return leading + '`' + trimmed + '`' + trailing;
  }
  
  return result;
}

/**
 * Processes block-level elements (div, p, headings, etc.) for plain text copy
 * @param {HTMLElement} element - The block element to process
 * @param {Object} listContext - Current list context
 * @param {Function} processNode - Function to recursively process child nodes
 * @returns {string} Plain text with preserved line breaks
 */
function processPlainTextBlockElement(element, listContext, processNode) {
  const children = Array.from(element.childNodes);
  let result = '';
  
  children.forEach((child, index) => {
    const childText = processNode(child, listContext);
    
    // Only add newlines around block-level children, not inline elements
    // Check if this is a block-level child by checking if it's a block element
    const isBlockChild = child.nodeType === Node.ELEMENT_NODE && 
                         BLOCK_ELEMENTS.includes(child.tagName?.toLowerCase());
    
    // Add newline before block elements (except first child)
    // Only if the previous result doesn't already end with newline
    if (index > 0 && isBlockChild && childText && !result.endsWith('\n')) {
      result += '\n';
    }
    
    result += childText;
    
    // Add newline after block elements (except last child)
    // Only if the child text doesn't already end with newline
    if (index < children.length - 1 && isBlockChild && childText && !childText.endsWith('\n')) {
      result += '\n';
    }
  });
  
  return result;
}

/**
 * Normalizes plain text output
 * Trims lines (except list items), collapses multiple newlines
 * @param {string} text - Raw plain text
 * @returns {string} Normalized plain text
 */
function normalizePlainText(text) {
  return text
    .split('\n')
    .map(line => {
      // Don't trim lines that start with list markers (preserve indentation)
      if (/^\s*[-•*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        return line;
      }
      return line.trim();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
    .trim();
}

/**
 * Recursively processes a node and builds text with line breaks and list formatting for plain text copy
 * @param {Node} node - The node to process
 * @param {Object} listContext - Context about current list (type: 'ul'|'ol'|null, itemNumber: number, indentLevel: number)
 * @returns {string} Text with line breaks and list formatting
 */
function processNodeForPlainText(node, listContext = { type: null, itemNumber: 0, indentLevel: 0 }) {
  if (!node) return '';
  
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }
  
  if (node.nodeType === Node.ELEMENT_NODE) {
    const tagName = node.tagName.toLowerCase();
    
    // <br> tags become newlines
    if (tagName === 'br') {
      return '\n';
    }
    
    // Handle unordered lists
    if (tagName === 'ul') {
      return processPlainTextUnorderedList(node, listContext, processNodeForPlainText);
    }
    
    // Handle ordered lists
    if (tagName === 'ol') {
      return processPlainTextOrderedList(node, listContext, processNodeForPlainText);
    }
    
    // Handle list items
    if (tagName === 'li') {
      return processPlainTextListItem(node, listContext, processNodeForPlainText);
    }
    
    // Handle code block elements (.thinkreview-code-block) - must come before other checks
    if (node.classList && node.classList.contains('thinkreview-code-block')) {
      return processPlainTextCodeBlock(node, listContext, processNodeForPlainText);
    }
    
    // Handle inline code elements (<code> that's not inside <pre>)
    if (tagName === 'code') {
      return processPlainTextInlineCode(node, listContext, processNodeForPlainText);
    }
    
    // Handle block elements
    const isBlock = BLOCK_ELEMENTS.includes(tagName);
    if (isBlock) {
      return processPlainTextBlockElement(node, listContext, processNodeForPlainText);
    }
    
    // Handle other elements (inline elements, etc.)
    const children = Array.from(node.childNodes);
    let result = '';
    children.forEach((child) => {
      result += processNodeForPlainText(child, listContext);
    });
    return result;
  }
  
  return '';
}

/**
 * Extracts plain text from an element while preserving line breaks
 * Converts block elements and <br> tags to newlines
 * Handles bullet points (-) and numbered lists (1., 2., etc.)
 * @param {HTMLElement} element - The element to extract text from
 * @returns {string} Plain text with preserved line breaks and list formatting
 */
function extractPlainTextWithLineBreaks(element) {
  if (!element) return '';
  
  const text = processNodeForPlainText(element);
  return normalizePlainText(text);
}

/**
 * Copies an element's content as rich text (HTML format) with preserved styling
 * This function can be reused to copy any element with its styling preserved
 * @param {HTMLElement} element - The element to copy
 * @param {string} plainText - Plain text version for fallback
 * @returns {Promise<void>}
 * @throws {Error} If Clipboard API is not supported
 */
export async function copyAsRichText(element, plainText) {
  if (!navigator.clipboard || !navigator.clipboard.write) {
    throw new Error('Clipboard API not supported');
  }
  
  // Clone the element to preserve its structure
  const clone = element.cloneNode(true);
  
  // Apply computed styles to all elements in the clone
  const cloneNodes = [];
  const originalNodes = [];
  
  const cloneWalker = document.createTreeWalker(
    clone,
    NodeFilter.SHOW_ELEMENT,
    null
  );
  
  const originalWalker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT,
    null
  );
  
  cloneNodes.push(clone);
  originalNodes.push(element);
  
  let cloneNode, originalNode;
  while ((cloneNode = cloneWalker.nextNode()) && (originalNode = originalWalker.nextNode())) {
    cloneNodes.push(cloneNode);
    originalNodes.push(originalNode);
  }
  
  // Apply computed styles from original to clone nodes
  cloneNodes.forEach((cloneNode, index) => {
    if (index < originalNodes.length) {
      const originalNode = originalNodes[index];
      const computed = window.getComputedStyle(originalNode);
      
      // Apply key styling properties as inline styles
      const styleMap = [
        ['color', 'color'],
        ['background-color', 'backgroundColor'],
        ['font-size', 'fontSize'],
        ['font-family', 'fontFamily'],
        ['font-weight', 'fontWeight'],
        ['font-style', 'fontStyle'],
        ['text-decoration', 'textDecoration'],
        ['border', 'border'],
        ['border-color', 'borderColor'],
        ['border-width', 'borderWidth'],
        ['border-bottom', 'borderBottom'],
        ['padding', 'padding'],
        ['margin', 'margin'],
        ['border-radius', 'borderRadius'],
        ['line-height', 'lineHeight'],
        ['text-align', 'textAlign']
      ];
      
      styleMap.forEach(([cssProp, jsProp]) => {
        const value = computed.getPropertyValue(jsProp);
        if (value && value !== 'none' && value !== 'normal' && value !== '0px' && value.trim() !== '') {
          cloneNode.style.setProperty(cssProp, value);
        }
      });
      
      // Special handling for syntax highlighting tokens
      if (cloneNode.classList && cloneNode.classList.contains('token')) {
        const color = computed.getPropertyValue('color');
        if (color && color.trim() !== '') {
          cloneNode.style.color = color;
        }
      }
      
      // Handle code blocks
      if (cloneNode.tagName === 'PRE' || cloneNode.tagName === 'CODE') {
        const bgColor = computed.getPropertyValue('background-color');
        const borderColor = computed.getPropertyValue('border-color');
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor.trim() !== '') {
          cloneNode.style.backgroundColor = bgColor;
        }
        if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)' && borderColor.trim() !== '') {
          cloneNode.style.borderColor = borderColor;
        }
      }
    }
  });
  
  // Apply specific styling based on element type
  const isChatMessage = element.classList && element.classList.contains('chat-message');
  const isSummary = element.id === 'review-summary' || (element.classList && element.classList.contains('thinkreview-section-content'));
  const isReviewItem = element.classList && element.classList.contains('thinkreview-item-content');
  const isInReviewSection = element.closest && (
    element.closest('#review-summary') ||
    element.closest('#review-suggestions') ||
    element.closest('#review-security') ||
    element.closest('#review-practices')
  );
  
  if (isChatMessage) {
    // Chat message styling
    const isUserMessage = element.classList.contains('user-message');
    
    clone.style.setProperty('max-width', '80%');
    clone.style.setProperty('padding', '12px 16px');
    clone.style.setProperty('border-radius', '18px');
    clone.style.setProperty('word-wrap', 'break-word');
    clone.style.setProperty('line-height', '1.4');
    clone.style.setProperty('box-shadow', '0 1px 2px rgba(0, 0, 0, 0.1)');
    
    if (isUserMessage) {
      clone.style.setProperty('background-color', '#6b4fbb');
      clone.style.setProperty('color', 'white');
      clone.style.setProperty('border-bottom-right-radius', '4px');
    } else {
      clone.style.setProperty('background-color', '#2d2d2d');
      clone.style.setProperty('color', '#ffffff');
      clone.style.setProperty('border', '1px solid #404040');
      clone.style.setProperty('border-bottom-left-radius', '4px');
    }
  } else if (isSummary) {
    // Summary styling - preserve the summary-specific styles
    const computed = window.getComputedStyle(element);
    clone.style.setProperty('padding', computed.getPropertyValue('padding') || '8px 0');
    clone.style.setProperty('margin-bottom', computed.getPropertyValue('margin-bottom') || '16px');
    clone.style.setProperty('border-bottom', computed.getPropertyValue('border-bottom') || '1px solid #6b4fbb');
    clone.style.setProperty('color', computed.getPropertyValue('color'));
    clone.style.setProperty('line-height', computed.getPropertyValue('line-height') || '1.5');
  } else if (isReviewItem || isInReviewSection) {
    // Review list item styling - preserve the review item styles
    const computed = window.getComputedStyle(element);
    clone.style.setProperty('color', computed.getPropertyValue('color'));
    clone.style.setProperty('line-height', computed.getPropertyValue('line-height') || '1.5');
  }
  
  // Get the styled HTML
  const styledHTML = clone.outerHTML;
  
  // Create clipboard items with both HTML and plain text formats
  // plainText already has line breaks preserved from extractPlainTextWithLineBreaks
  const clipboardItem = new ClipboardItem({
    'text/html': new Blob([styledHTML], { type: 'text/html' }),
    'text/plain': new Blob([plainText], { type: 'text/plain' })
  });
  
  await navigator.clipboard.write([clipboardItem]);
}

/**
 * Copies content from an element to clipboard with visual feedback
 * For chat messages, summaries, and review items, preserves HTML formatting and styling (rich text)
 * For other elements, copies as plain text
 * @param {HTMLElement} element - The element containing the content to copy
 * @param {HTMLElement} button - The copy button element
 * @returns {Promise<void>}
 */
export async function copyItemContent(element, button) {
  if (!element) return;
  
  // Check if this is a chat message, summary, or review list item that should preserve styling
  const isChatMessage = element.classList && element.classList.contains('chat-message');
  const isSummary = element.id === 'review-summary' || (element.classList && element.classList.contains('thinkreview-section-content'));
  const isReviewItem = element.classList && element.classList.contains('thinkreview-item-content');
  const isInReviewSection = element.closest && (
    element.closest('#review-summary') ||
    element.closest('#review-suggestions') ||
    element.closest('#review-security') ||
    element.closest('#review-practices')
  );
  const shouldPreserveStyle = isChatMessage || isSummary || isReviewItem || isInReviewSection;
  
  // Extract plain text with preserved line breaks
  const text = extractPlainTextWithLineBreaks(element);
  
  if (!text.trim()) {
    return;
  }
  
  try {
    if (shouldPreserveStyle && navigator.clipboard && navigator.clipboard.write) {
      // Use the reusable rich text copy function
      await copyAsRichText(element, text);
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      // Use modern clipboard API for plain text (already has line breaks preserved)
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    
    // Show success feedback
    showCopySuccessFeedback(button);
    
    // Track copy action
    trackUserAction('copy_button', {
      context: 'review_item',
      location: 'integrated_panel'
    }).catch(() => {}); // Silently fail
  } catch (error) {
    dbgWarn('Failed to copy content:', error);
    
    // Fallback to plain text if HTML copy fails
    if (shouldPreserveStyle) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          showCopySuccessFeedback(button);
          
          // Track copy action (fallback success)
          trackUserAction('copy_button', {
            context: 'review_item',
            location: 'integrated_panel',
            method: 'fallback'
          }).catch(() => {}); // Silently fail
        } else {
          showCopyErrorFeedback(button);
        }
      } catch (fallbackError) {
        dbgWarn('Fallback copy also failed:', fallbackError);
        showCopyErrorFeedback(button);
      }
    } else {
      showCopyErrorFeedback(button);
    }
  }
}

/**
 * Shows success feedback on the copy button (checkmark icon)
 * @param {HTMLElement} button - The copy button element
 */
export function showCopySuccessFeedback(button) {
  clearElement(button);
  button.appendChild(createCheckmarkSvg());
  button.style.color = '#4ade80';

  setTimeout(() => {
    clearElement(button);
    button.appendChild(createCopyIconSvg());
    button.style.color = '';
  }, 2000);
}

/**
 * Shows error feedback on the copy button (error icon)
 * @param {HTMLElement} button - The copy button element
 */
export function showCopyErrorFeedback(button) {
  clearElement(button);
  button.appendChild(createErrorSvg());
  button.style.color = '#ef4444';

  setTimeout(() => {
    clearElement(button);
    button.appendChild(createCopyIconSvg());
    button.style.color = '';
  }, 2000);
}

/**
 * Attaches a copy button to a content element within a wrapper
 * @param {HTMLElement} contentElement - The element containing the content to copy
 * @param {HTMLElement} wrapperElement - The wrapper element that should contain both content and button
 * @returns {HTMLElement} The created copy button element
 */
export function attachCopyButtonToItem(contentElement, wrapperElement) {
  if (!contentElement || !wrapperElement) {
    dbgWarn('Cannot attach copy button: missing contentElement or wrapperElement');
    return null;
  }
  
  // Check if a copy button already exists in the wrapper
  const existingCopyBtn = wrapperElement.querySelector('.thinkreview-item-copy-btn');
  if (existingCopyBtn) {
    // Return the existing button to avoid duplicates
    return existingCopyBtn;
  }
  
  const copyBtn = createCopyButton();
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    copyItemContent(contentElement, copyBtn);
  });
  
  wrapperElement.appendChild(copyBtn);
  return copyBtn;
}
