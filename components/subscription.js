// subscription.js
// Handles subscription upgrade functionality for GitLab MR Reviews

// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[subscription]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[subscription]', ...args); }

/**
 * Subscription component for handling upgrade functionality
 */
class SubscriptionComponent {
  /**
   * Initialize the subscription component
   */
  constructor() {
    this.initialized = false;
    this.eventListenersAttached = false;
  }

  /**
   * Initialize the subscription component
   * @param {Object} dependencies - Dependencies needed by the component
   * @param {Function} dependencies.isUserLoggedIn - Function to check if user is logged in
   * @param {Function} dependencies.showLoadingState - Function to show loading state
   * @param {Function} dependencies.showErrorState - Function to show error state
   * @param {Function} dependencies.showMessage - Function to show messages
   */
  init(dependencies) {
    if (this.initialized) return;
    
    this.isUserLoggedIn = dependencies.isUserLoggedIn;
    this.showLoadingState = dependencies.showLoadingState;
    this.showErrorState = dependencies.showErrorState;
    this.showMessage = dependencies.showMessage;
    
    this.setupSubscriptionButtons();
    this.initialized = true;
    
    dbgLog('[SubscriptionComponent] Initialized');
  }

  /**
   * Set up subscription upgrade button
   */
  setupSubscriptionButtons() {
    dbgLog('[SubscriptionComponent] Setting up subscription button');
    
    // Get the button
    const upgradeBtn = document.getElementById('upgrade-btn');
    
    if (!upgradeBtn) {
      dbgWarn('[SubscriptionComponent] Subscription button not found in the DOM');
      return;
    }
    
    // Check if event listeners are already attached
    if (this.eventListenersAttached) {
      dbgLog('[SubscriptionComponent] Event listener already attached, skipping');
      return;
    }
    
    // Store reference to handler so it can be removed if needed
    this.upgradeClickHandler = () => this.handleUpgradeClick();
    
    // First, remove any existing event listener that might be attached
    upgradeBtn.removeEventListener('click', this.upgradeClickHandler);
    
    // Add event listener
    upgradeBtn.addEventListener('click', this.upgradeClickHandler);
    
    this.eventListenersAttached = true;
    dbgLog('[SubscriptionComponent] Event listener attached');
  }

  /**
   * Handle upgrade button click
   */
  async handleUpgradeClick() {
    dbgLog('[SubscriptionComponent] Handling upgrade click');
    
    try {
      // Redirect to the subscription portal
      const subscriptionPortalUrl = 'https://portal.thinkreview.dev/subscription';
      dbgLog('[SubscriptionComponent] Redirecting to subscription portal:', subscriptionPortalUrl);
      
      // Open the subscription portal in a new tab
      window.open(subscriptionPortalUrl, '_blank');
      
      this.showMessage('Redirecting to subscription portal...', 'info');
      // Restore button state after redirecting
      this.showErrorState(); // This just resets the UI state
      
    } catch (error) {
      dbgWarn('[SubscriptionComponent] Error redirecting to subscription portal:', error);
      this.showMessage('Failed to open subscription portal', 'error');
      this.showErrorState('Failed to open subscription portal');
    }
  }
}

// Create and export a singleton instance
const subscriptionComponent = new SubscriptionComponent();
export default subscriptionComponent;
