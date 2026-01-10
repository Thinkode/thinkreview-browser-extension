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
 * Copies content from an element to clipboard with visual feedback
 * @param {HTMLElement} element - The element containing the content to copy
 * @param {HTMLElement} button - The copy button element
 * @returns {Promise<void>}
 */
export async function copyItemContent(element, button) {
  if (!element) return;
  
  // Extract plain text from the element
  const text = element.textContent || element.innerText || '';
  
  if (!text.trim()) {
    return;
  }
  
  try {
    // Use modern clipboard API if available
    if (navigator.clipboard && navigator.clipboard.writeText) {
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
    showCopyErrorFeedback(button);
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
