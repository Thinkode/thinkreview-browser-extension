// item-copy-button.js
// Module for creating and handling copy buttons for review items

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
  button.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; visibility: visible;">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor" style="fill: currentColor !important;"/>
    </svg>
  `;
  return button;
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
  const clipboardItem = new ClipboardItem({
    'text/html': new Blob([styledHTML], { type: 'text/html' }),
    'text/plain': new Blob([plainText.trim()], { type: 'text/plain' })
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
  
  // Extract plain text for fallback
  const text = element.textContent || element.innerText || '';
  
  if (!text.trim()) {
    return;
  }
  
  try {
    if (shouldPreserveStyle && navigator.clipboard && navigator.clipboard.write) {
      // Use the reusable rich text copy function
      await copyAsRichText(element, text);
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      // Use modern clipboard API for plain text
      await navigator.clipboard.writeText(text.trim());
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text.trim();
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    
    // Show success feedback
    showCopySuccessFeedback(button);
  } catch (error) {
    console.warn('[ItemCopyButton] Failed to copy content:', error);
    
    // Fallback to plain text if HTML copy fails
    if (shouldPreserveStyle) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text.trim());
          showCopySuccessFeedback(button);
        } else {
          showCopyErrorFeedback(button);
        }
      } catch (fallbackError) {
        console.warn('[ItemCopyButton] Fallback copy also failed:', fallbackError);
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
function showCopySuccessFeedback(button) {
  const originalHTML = button.innerHTML;
  button.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/>
    </svg>
  `;
  button.style.color = '#4ade80';
  
  setTimeout(() => {
    button.innerHTML = originalHTML;
    button.style.color = '';
  }, 2000);
}

/**
 * Shows error feedback on the copy button (error icon)
 * @param {HTMLElement} button - The copy button element
 */
function showCopyErrorFeedback(button) {
  const originalHTML = button.innerHTML;
  button.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
    </svg>
  `;
  button.style.color = '#ef4444';
  
  setTimeout(() => {
    button.innerHTML = originalHTML;
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
    console.warn('[ItemCopyButton] Cannot attach copy button: missing contentElement or wrapperElement');
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
