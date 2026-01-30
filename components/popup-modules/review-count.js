// review-count.js
// Module for handling review count display in the popup
import { dbgLog, dbgWarn, dbgError } from '../../utils/logger.js';



/**
 * Review Count Module
 * Handles the display and management of review counts in the popup
 */
export class ReviewCountModule {
  /**
   * Initialize the review count module
   * @param {Object} options - Configuration options
   * @param {string} options.countElementId - ID of the review count element
   * @param {string} options.containerElementId - ID of the review count container element
   */
  constructor(options = {}) {
    this.countElementId = options.countElementId || 'review-count';
    this.containerElementId = options.containerElementId || 'review-count-container';
    
    dbgLog('ReviewCountModule initialized with options:', options);
  }

  /**
   * Update review count display
   * @param {number} count - The number of reviews
   */
  updateCount(count) {
    const reviewCountElement = document.getElementById(this.countElementId);
    const containerElement = document.getElementById(this.containerElementId);
    
    if (!reviewCountElement) {
      dbgWarn('Review count element not found:', this.countElementId);
      return;
    }

    // Validate count input
    const validCount = this._validateCount(count);
    
    if (validCount === null) {
      this._hideReviewCount(reviewCountElement, containerElement);
      return;
    }

    // Update the display
    this._displayReviewCount(reviewCountElement, containerElement, validCount);
  }

  /**
   * Validate and normalize the count value
   * @private
   * @param {any} count - The count value to validate
   * @returns {number|null} - Valid count number or null if invalid
   */
  _validateCount(count) {
    // Handle null, undefined, or empty string
    if (count === null || count === undefined || count === '') {
      dbgLog('Count is null, undefined, or empty');
      return null;
    }

    // Convert to number if it's a string
    const numericCount = typeof count === 'string' ? parseInt(count, 10) : count;
    
    // Check if it's a valid number
    if (isNaN(numericCount) || numericCount < 0) {
      dbgWarn('Invalid count value:', count);
      return null;
    }

    return numericCount;
  }

  /**
   * Display the review count
   * @private
   * @param {HTMLElement} countElement - The count display element
   * @param {HTMLElement} containerElement - The container element
   * @param {number} count - The valid count number
   */
  _displayReviewCount(countElement, containerElement, count) {
    // Format the count display
    const displayText = this._formatCountText(count);
    countElement.textContent = displayText;
    
    // Show the container if it exists
    if (containerElement) {
      containerElement.style.display = 'block';
      containerElement.className = this._getCountClassName(count);
    }
    
    // Add appropriate styling class to the count element
    countElement.className = `review-count ${this._getCountStyleClass(count)}`;
    
    dbgLog('Displayed review count:', count, 'as:', displayText);
  }

  /**
   * Hide the review count display
   * @private
   * @param {HTMLElement} countElement - The count display element
   * @param {HTMLElement} containerElement - The container element
   */
  _hideReviewCount(countElement, containerElement) {
    countElement.textContent = '0';
    
    if (containerElement) {
      containerElement.style.display = 'none';
    }
    
    dbgLog('Hidden review count display');
  }

  /**
   * Format the count text for display
   * @private
   * @param {number} count - The count number
   * @returns {string} - Formatted display text
   */
  _formatCountText(count) {
    if (count === 0) {
      return '0';
    } else if (count === 1) {
      return '1';
    } else if (count < 1000) {
      return count.toString();
    } else if (count < 1000000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    } else {
      return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
  }

  /**
   * Get CSS class name for the container based on count
   * @private
   * @param {number} count - The count number
   * @returns {string} - CSS class name
   */
  _getCountClassName(count) {
    if (count === 0) {
      return 'review-count-container zero';
    } else if (count < 10) {
      return 'review-count-container low';
    } else if (count < 100) {
      return 'review-count-container medium';
    } else {
      return 'review-count-container high';
    }
  }

  /**
   * Get CSS class for styling based on count value
   * @private
   * @param {number} count - The count number
   * @returns {string} - CSS class name
   */
  _getCountStyleClass(count) {
    if (count === 0) {
      return 'zero';
    } else if (count < 10) {
      return 'low';
    } else if (count < 100) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  /**
   * Reset review count to zero
   */
  reset() {
    this.updateCount(0);
    dbgLog('Reset review count to zero');
  }

  /**
   * Show error state for review count
   */
  showError() {
    const reviewCountElement = document.getElementById(this.countElementId);
    const containerElement = document.getElementById(this.containerElementId);
    
    if (reviewCountElement) {
      reviewCountElement.textContent = '?';
      reviewCountElement.className = 'review-count error';
    }
    
    if (containerElement) {
      containerElement.style.display = 'block';
      containerElement.className = 'review-count-container error';
    }
    
    dbgLog('Displayed review count error');
  }

  /**
   * Increment the current count by a specified amount
   * @param {number} increment - Amount to increment (default: 1)
   */
  incrementCount(increment = 1) {
    const currentElement = document.getElementById(this.countElementId);
    if (currentElement) {
      const currentCount = parseInt(currentElement.textContent) || 0;
      this.updateCount(currentCount + increment);
    }
  }

  /**
   * Get the current displayed count
   * @returns {number} - Current count value
   */
  getCurrentCount() {
    const currentElement = document.getElementById(this.countElementId);
    if (currentElement) {
      return parseInt(currentElement.textContent) || 0;
    }
    return 0;
  }
}

// Create and export a default instance
export const reviewCount = new ReviewCountModule();

// For backward compatibility, also export the update function directly
export function updateReviewCount(count) {
  reviewCount.updateCount(count);
}