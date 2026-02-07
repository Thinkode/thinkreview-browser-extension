// subscription-status.js
// Module for handling subscription status display in the popup
import { dbgLog, dbgWarn, dbgError } from '../../utils/logger.js';



/**
 * Subscription Status Module
 * Handles the display and management of subscription status in the popup
 */
export class SubscriptionStatusModule {
  /**
   * Initialize the subscription status module
   * @param {Object} options - Configuration options
   * @param {string} options.statusElementId - ID of the subscription status element
   * @param {string} options.paymentInfoElementId - ID of the payment info container element
   * @param {string} options.paymentDateElementId - ID of the payment date element
   */
  constructor(options = {}) {
    this.statusElementId = options.statusElementId || 'subscription-status';
    this.paymentInfoElementId = options.paymentInfoElementId || 'next-payment-info';
    this.paymentDateElementId = options.paymentDateElementId || 'next-payment-date';
    
    dbgLog('SubscriptionStatusModule initialized with options:', options);
  }

  /**
   * Update subscription status display
   * @param {string} subscriptionType - The subscription type: 'Professional', 'Teams', or 'Free' (case-insensitive)
   * @param {string|number|Date} currentPlanValidTo - The date when the current plan is valid until (single source of truth)
   * @param {boolean} cancellationRequested - Whether cancellation has been requested
   * @param {string} stripeCanceledDate - The date when subscription was cancelled
   */
  async updateStatus(subscriptionType, currentPlanValidTo, cancellationRequested = false, stripeCanceledDate = null) {
    const subscriptionStatusElement = document.getElementById(this.statusElementId);
    const nextPaymentInfoElement = document.getElementById(this.paymentInfoElementId);
    const nextPaymentDateElement = document.getElementById(this.paymentDateElementId);
    
    if (!subscriptionStatusElement) {
      dbgWarn('Subscription status element not found:', this.statusElementId);
      return;
    }

    // Check if subscription is Free (case-insensitive)
    const normalizedType = (subscriptionType || '').toLowerCase();
    if (!subscriptionType || normalizedType === 'free' || normalizedType.includes('free')) {
      this._displayFreeStatus(subscriptionStatusElement, nextPaymentInfoElement);
    } else {
      // Always check currentPlanValidTo first to determine if plan is active or expired
      const isPlanExpired = await this._isPlanExpired(currentPlanValidTo);
      
      if (isPlanExpired) {
        await this._displayExpiredStatus(
          subscriptionStatusElement, 
          nextPaymentInfoElement, 
          nextPaymentDateElement, 
          subscriptionType, 
          currentPlanValidTo
        );
      } else if (cancellationRequested) {
        await this._displayCancelledStatus(
          subscriptionStatusElement, 
          nextPaymentInfoElement, 
          nextPaymentDateElement, 
          subscriptionType, 
          currentPlanValidTo
        );
      } else {
        await this._displayPremiumStatus(
          subscriptionStatusElement, 
          nextPaymentInfoElement, 
          nextPaymentDateElement, 
          subscriptionType, 
          currentPlanValidTo
        );
      }
    }
  }

  /**
   * Check if the plan is expired based on currentPlanValidTo
   * @private
   * @param {string|number|Date} currentPlanValidTo - The date when the plan is valid until
   * @returns {boolean} - True if the plan is expired, false otherwise
   */
  async _isPlanExpired(currentPlanValidTo) {
    if (!currentPlanValidTo) {
      return false; // If no date, assume not expired
    }
    
    try {
      // Use date utility to check if expired
      const dateUtils = await import(chrome.runtime.getURL('utils/date-utils.js'));
      return dateUtils.isPast(currentPlanValidTo);
    } catch (error) {
      dbgWarn('Error parsing date :', error);
    }
  }

  /**
   * Display free subscription status
   * @private
   */
  _displayFreeStatus(statusElement, paymentInfoElement) {
    statusElement.textContent = 'Free Plan';
    statusElement.className = 'subscription-status free';
    
    if (paymentInfoElement) {
      paymentInfoElement.style.display = 'none';
    }
    
    dbgLog('Displayed free subscription status');
  }

  /**
   * Display expired subscription status
   * @private
   */
  async _displayExpiredStatus(statusElement, paymentInfoElement, paymentDateElement, subscriptionType, currentPlanValidTo) {
    // Format subscription type for display
    const displayType = subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1).toLowerCase();
    statusElement.textContent = `${displayType}`;
    statusElement.className = 'subscription-status expired';
    
    // Show expired date if available
    if (currentPlanValidTo && paymentInfoElement && paymentDateElement) {
      const formattedDate = await this._formatPaymentDate(currentPlanValidTo);
      
      if (formattedDate) {
        paymentDateElement.textContent = `Previous Plan Expired on ${formattedDate}`;
        paymentInfoElement.style.display = 'block';
        dbgLog('Displayed expired subscription status with expired date:', formattedDate);
      } else {
        paymentInfoElement.style.display = 'none';
        dbgLog('Displayed expired subscription status without expired date (invalid date)');
      }
    } else {
      if (paymentInfoElement) {
        paymentInfoElement.style.display = 'none';
      }
      dbgLog('Displayed expired subscription status without expired info');
    }
  }

  /**
   * Display cancelled subscription status
   * @private
   */
  async _displayCancelledStatus(statusElement, paymentInfoElement, paymentDateElement, subscriptionType, currentPlanValidTo) {
    // Format subscription type for display
    const displayType = subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1).toLowerCase();
    statusElement.textContent = `${displayType} Cancelled`;
    statusElement.className = 'subscription-status cancelled';
    
    // Show valid to date if available and valid
    if (currentPlanValidTo && paymentInfoElement && paymentDateElement) {
      const formattedDate = await this._formatPaymentDate(currentPlanValidTo);
      
      if (formattedDate) {
        paymentDateElement.textContent = formattedDate;
        paymentInfoElement.style.display = 'block';
        dbgLog('Displayed cancelled subscription status with valid to date:', formattedDate);
      } else {
        paymentInfoElement.style.display = 'none';
        dbgLog('Displayed cancelled subscription status without valid to date (invalid date)');
      }
    } else {
      if (paymentInfoElement) {
        paymentInfoElement.style.display = 'none';
      }
      dbgLog('Displayed cancelled subscription status without valid to info');
    }
  }

  /**
   * Display premium subscription status with valid to information
   * @private
   */
  async _displayPremiumStatus(statusElement, paymentInfoElement, paymentDateElement, subscriptionType, currentPlanValidTo) {
    // Format subscription type for display
    const displayType = subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1).toLowerCase();
    statusElement.textContent = `${displayType}`;
    statusElement.className = 'subscription-status premium';
    
    // Show valid to date if available
    if (currentPlanValidTo && paymentInfoElement && paymentDateElement) {
      const formattedDate = await this._formatPaymentDate(currentPlanValidTo);
      
      if (formattedDate) {
        paymentDateElement.textContent = formattedDate;
        paymentInfoElement.style.display = 'block';
        dbgLog('Displayed premium subscription status with valid to date:', formattedDate);
      } else {
        paymentInfoElement.style.display = 'none';
        dbgLog('Displayed premium subscription status without valid to date (invalid date)');
      }
    } else {
      if (paymentInfoElement) {
        paymentInfoElement.style.display = 'none';
      }
      dbgLog('Displayed premium subscription status without valid to info');
    }
  }

  /**
   * Format date from various input formats (used for both payment dates and valid to dates)
   * @private
   * @param {string|number|Date} dateValue - The date in various formats
   * @returns {Promise<string|null>} - Formatted date string or null if invalid
   */
  async _formatPaymentDate(dateValue) {
    try {
      if (!dateValue || dateValue === 'Invalid Date') {
        return null;
      }
      dbgLog('Processing date value:', dateValue, 'type:', typeof dateValue);
      
      // Use date utility to format date
      const dateUtils = await import(chrome.runtime.getURL('utils/date-utils.js'));
      const formattedDate = dateUtils.formatDate(dateValue);
      
      dbgLog('Formatted date:', formattedDate);
      return formattedDate;
    } catch (error) {
      dbgWarn('Error formatting date', error, 'Original value:', dateValue);
    }
  }

  /**
   * Reset subscription status to default (free)
   */
  reset() {
    this.updateStatus('free', null);
    dbgLog('Reset subscription status to free');
  }

  /**
   * Show error state for subscription status
   */
  showError() {
    const subscriptionStatusElement = document.getElementById(this.statusElementId);
    const nextPaymentInfoElement = document.getElementById(this.paymentInfoElementId);
    
    if (subscriptionStatusElement) {
      subscriptionStatusElement.textContent = 'Error';
      subscriptionStatusElement.className = 'subscription-status error';
    }
    
    if (nextPaymentInfoElement) {
      nextPaymentInfoElement.style.display = 'none';
    }
    
    dbgLog('Displayed subscription status error');
  }
}

// Create and export a default instance
export const subscriptionStatus = new SubscriptionStatusModule();

// For backward compatibility, also export the update function directly
export async function updateSubscriptionStatus(subscriptionType, currentPlanValidTo, cancellationRequested = false, stripeCanceledDate = null) {
  await subscriptionStatus.updateStatus(subscriptionType, currentPlanValidTo, cancellationRequested, stripeCanceledDate);
}