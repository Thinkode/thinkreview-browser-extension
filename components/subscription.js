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
   * Set up subscription upgrade buttons
   */
  setupSubscriptionButtons() {
    dbgLog('[SubscriptionComponent] Setting up subscription buttons');
    
    // Get the buttons
    const monthlyBtn = document.getElementById('monthly-upgrade-btn');
    const annualBtn = document.getElementById('annual-upgrade-btn');
    
    if (!monthlyBtn || !annualBtn) {
      dbgWarn('[SubscriptionComponent] Subscription buttons not found in the DOM');
      return;
    }
    
    // Check if event listeners are already attached
    if (this.eventListenersAttached) {
      dbgLog('[SubscriptionComponent] Event listeners already attached, skipping');
      return;
    }
    
    // Store reference to handlers so they can be removed if needed
    this.monthlyClickHandler = () => this.handleUpgradeClick('monthly');
    this.annualClickHandler = () => this.handleUpgradeClick('annual');
    
    // First, remove any existing event listeners that might be attached
    monthlyBtn.removeEventListener('click', this.monthlyClickHandler);
    annualBtn.removeEventListener('click', this.annualClickHandler);
    
    // Add event listeners
    monthlyBtn.addEventListener('click', this.monthlyClickHandler);
    annualBtn.addEventListener('click', this.annualClickHandler);
    
    this.eventListenersAttached = true;
    dbgLog('[SubscriptionComponent] Event listeners attached');
  }

  /**
   * Handle upgrade button clicks
   * @param {string} plan - The subscription plan ('monthly' or 'annual')
   */
  async handleUpgradeClick(plan) {
    dbgLog(`[SubscriptionComponent] Handling ${plan} upgrade click`);
    
    try {
      // Check if user is logged in
      const isLoggedIn = await this.isUserLoggedIn();
      if (!isLoggedIn) {
        this.showMessage('Please sign in to upgrade your subscription', 'error');
        return;
      }
      
      // Check if CloudService is available
      if (!window.CloudService) {
        this.showMessage('Service not available. Please try again later.', 'error');
        return;
      }
      
      // Show loading state
      this.showLoadingState();
      this.showMessage(`Creating ${plan} subscription checkout...`, 'info');
      
      // Create checkout session
      const checkoutData = await window.CloudService.createCheckoutSession(plan);
      
      // Check for the complete checkout URL provided directly by the Stripe API
      if (checkoutData && checkoutData.url) {
        // The cloud function returns the complete checkout URL from Stripe
        dbgLog('[SubscriptionComponent] Redirecting to Stripe checkout URL:', checkoutData.url);
        
        // Open the checkout URL in a new tab
        window.open(checkoutData.url, '_blank');
        
        this.showMessage('Checkout opened in a new tab', 'info');
        // Restore button state after redirecting
        this.showErrorState(); // This just resets the UI state
      } else {
        throw new Error('Invalid checkout session data - missing checkout URL');
      }
      
    } catch (error) {
      dbgWarn('[SubscriptionComponent] Error creating checkout session:', error);
      this.showMessage('Failed to create checkout session', 'error');
      this.showErrorState('Failed to create checkout session');
    }
  }
}

// Create and export a singleton instance
const subscriptionComponent = new SubscriptionComponent();
export default subscriptionComponent;
