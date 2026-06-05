import { dbgLog, dbgWarn, dbgError } from '../../utils/logger.js';
/**
 * Review Prompt Component
 * Modular component for handling user feedback prompts after generating reviews
 */
// Configuration
const REVIEW_PROMPT_CONFIG = {
  threshold: 5, // Show prompt after 5 total reviews
  chromeStoreUrl: 'https://chromewebstore.google.com/detail/thinkreview-ai-code-revie/bpgkhgbchmlmpjjpmlaiejhnnbkdjdjn/reviews',
  feedbackUrl: 'https://thinkreview.dev/extension-feedback.html', // Updated to new extension-specific feedback form
  // Only suppress the prompt for submits on/after this date (older submits are ignored)
  submitSuppressCutoffDate: '2026-06-07',
  storageKeys: {
    reviewCount: 'reviewCount',
    todayReviewCount: 'todayReviewCount'
    // Note: We no longer use localStorage/sessionStorage flags
    // The source of truth is Firestore's lastFeedbackPromptInteraction
    // which is cached in chrome.storage.local
  }
};

class ReviewPrompt {
  constructor(config = {}) {
    this.config = { ...REVIEW_PROMPT_CONFIG, ...config };
    this.isInitialized = false;
    this.eventListeners = new Map();
    this.messages = null; // Cache for fetched messages
    this.messagesFetchPromise = null; // Promise to prevent concurrent fetches
  }

  /**
   * Initialize the review prompt component
   * @param {string} containerId - ID of the container to inject the prompt into
   */
  init(containerId = 'gitlab-mr-integrated-review') {
    if (this.isInitialized) {
      dbgWarn('Already initialized');
      return;
    }

    this.containerId = containerId;
    this.isInitialized = true;
    
    dbgLog('Initialized with config:', this.config);
  }

  /**
   * Whether a prior submit should permanently hide the feedback prompt.
   * Submissions before submitSuppressCutoffDate are ignored so users see the updated prompt.
   * @param {Object} lastFeedbackPromptInteraction
   * @returns {boolean}
   */
  shouldSuppressForSubmit(lastFeedbackPromptInteraction) {
    if (!lastFeedbackPromptInteraction || lastFeedbackPromptInteraction.action !== 'submit') {
      return false;
    }

    if (!lastFeedbackPromptInteraction.date) {
      dbgLog('Submit has no date; treating as pre-cutoff and showing prompt');
      return false;
    }

    const submitDate = new Date(lastFeedbackPromptInteraction.date);
    const cutoffDate = new Date(`${this.config.submitSuppressCutoffDate}T00:00:00`);
    const suppress = submitDate >= cutoffDate;

    if (suppress) {
      dbgLog('Not showing prompt: User submitted feedback on or after', this.config.submitSuppressCutoffDate);
    } else {
      dbgLog('Ignoring submit before', this.config.submitSuppressCutoffDate, '- will check other conditions');
    }

    return suppress;
  }

  /**
   * Check if the review prompt should be shown
   * @param {number} reviewCount - Current number of reviews generated
   * @param {Object} lastFeedbackPromptInteraction - Last feedback prompt interaction data from Firestore
   * @returns {boolean} - True if prompt should be shown
   */
  shouldShow(reviewCount, lastFeedbackPromptInteraction = null) {
    // Check lastFeedbackPromptInteraction from Firestore (source of truth)
    if (lastFeedbackPromptInteraction && lastFeedbackPromptInteraction.action) {
      dbgLog('Last feedback prompt interaction from Firestore:', lastFeedbackPromptInteraction);
      
      // If action was "submit", only hide for submissions on/after the cutoff date
      if (this.shouldSuppressForSubmit(lastFeedbackPromptInteraction)) {
        return false;
      }
      
      // If action was "later", only show if more than 7 days have passed
      if (lastFeedbackPromptInteraction.action === 'later' && lastFeedbackPromptInteraction.date) {
        const lastInteractionDate = new Date(lastFeedbackPromptInteraction.date);
        const today = new Date();
        const daysSinceLastInteraction = Math.floor((today - lastInteractionDate) / (1000 * 60 * 60 * 24));
        
        dbgLog('Days since last "later" interaction:', daysSinceLastInteraction);
        
        if (daysSinceLastInteraction <= 7) {
          dbgLog('Not showing prompt: Less than 7 days since "later" (', daysSinceLastInteraction, 'days)');
          return false;
        } else {
          dbgLog('More than 7 days since "later", will check other conditions');
        }
      }
      
      // If action was "never", never show the prompt
      if (lastFeedbackPromptInteraction.action === 'never') {
        dbgLog('Not showing prompt: User selected "never ask again" in Firestore');
        return false;
      }
    }
    
    // Show prompt when review count reaches the threshold
    const shouldShow = reviewCount >= this.config.threshold;
    dbgLog('Should show prompt:', shouldShow, '(count:', reviewCount, '>=', this.config.threshold, ')');
    return shouldShow;
  }

  /**
   * Get the total review count from storage
   * @returns {Promise<number>} - Total review count across all time
   */
  async getCurrentReviewCount() {
    return new Promise((resolve) => {
      // Get total reviewCount from storage (not daily count)
      // This is kept up-to-date by the background service and incremented after each review
      chrome.storage.local.get([this.config.storageKeys.reviewCount], (result) => {
        const count = result[this.config.storageKeys.reviewCount] || 0;
        dbgLog('Got total reviewCount from storage:', count);
        resolve(count);
      });
    });
  }

  /**
   * Check and show the review prompt if conditions are met
   * @returns {Promise<boolean>} - True if prompt was shown
   */
  async checkAndShow() {
    try {
      const reviewCount = await this.getCurrentReviewCount();
      dbgLog('Total review count:', reviewCount, '| Threshold:', this.config.threshold);
      
      // Get lastFeedbackPromptInteraction from storage
      const lastFeedbackPromptInteraction = await new Promise((resolve) => {
        chrome.storage.local.get(['lastFeedbackPromptInteraction'], (result) => {
          resolve(result.lastFeedbackPromptInteraction || null);
        });
      });
      dbgLog('Last feedback prompt interaction from storage:', lastFeedbackPromptInteraction);
      
      if (this.shouldShow(reviewCount, lastFeedbackPromptInteraction)) {
        dbgLog('Conditions met, showing prompt');
        await this.show(reviewCount);
        return true;
      } else {
        dbgLog('Conditions not met, not showing prompt');
      }
      
      return false;
    } catch (error) {
      dbgWarn('Error checking review prompt:', error);
      return false;
    }
  }

  /**
   * Show the review prompt
   * @param {number} reviewCount - The current review count to display
   */
  async show(reviewCount = this.config.threshold) {
    const container = document.getElementById(this.containerId);
    if (!container) {
      dbgWarn('Container not found:', this.containerId);
      return;
    }

    // Fetch messages asynchronously (will use cache if already fetched)
    // This is non-blocking - if fetch fails, will use fallback messages
    try {
      await this.fetchMessages();
    } catch (error) {
      dbgWarn('Failed to fetch messages, using fallbacks:', error);
      // Continue with fallback messages
    }

    // Create the prompt HTML if it doesn't exist
    let promptElement = container.querySelector('#review-prompt');
    if (!promptElement) {
      promptElement = this.createPromptElement(reviewCount);
      
      // Add to the end of the container (original working approach)
      container.appendChild(promptElement);
    }

    // Show the prompt
    promptElement.classList.remove('gl-hidden');
    
    // Add event listeners
    this.addEventListeners(promptElement);
    
    dbgLog('Prompt shown');
  }

  /**
   * Hide the review prompt
   */
  hide() {
    const promptElement = document.getElementById('review-prompt');
    if (promptElement) {
      promptElement.classList.add('gl-hidden');
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} - Escaped HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Create the review prompt HTML element
   * @param {number} reviewCount - The current review count to display
   * @returns {HTMLElement} - The prompt element
   */
  createPromptElement(reviewCount = this.config.threshold) {
    // Fallback messages (hardcoded defaults)
    const DEFAULT_SUBTITLE = "We'd love to hear your feedback about ThinkReview";
    const DEFAULT_QUESTION = "Would you mind leaving us a quick review?";
    
    // Use fetched messages if available, otherwise use fallbacks
    const subtitle = (this.messages && this.messages.subtitle) ? this.messages.subtitle : DEFAULT_SUBTITLE;
    const question = (this.messages && this.messages.question) ? this.messages.question : DEFAULT_QUESTION;
    
    // Escape HTML to prevent XSS
    const escapedSubtitle = this.escapeHtml(subtitle);
    const escapedQuestion = this.escapeHtml(question);
    
    const promptDiv = document.createElement('div');
    promptDiv.id = 'review-prompt';
    promptDiv.className = 'gl-hidden';
    promptDiv.innerHTML = `
      <div class="gl-alert gl-alert-info gl-mt-4 review-prompt-modern">
        <div class="gl-alert-content">
          <div class="review-prompt-header">
            <div class="review-prompt-icon">🎉</div>
            <div>
              <p class="review-prompt-subtitle">${escapedSubtitle}</p>
            </div>
          </div>
          
          <div class="review-prompt-content">
            <p class="review-prompt-question">${escapedQuestion}</p>
            
            <div class="review-prompt-github-link">
              <a href="https://github.com/Thinkode/thinkreview-browser-extension" target="_blank" rel="noopener noreferrer">
                Star our Repo on Github
              </a>
            </div>
            
            <div class="review-prompt-actions">
              <button id="review-prompt-dismiss" class="review-prompt-btn review-prompt-btn-secondary">Maybe Later</button>
              <button id="review-prompt-submit" class="review-prompt-btn review-prompt-btn-primary">Leave a Review</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    return promptDiv;
  }

  /**
   * Add event listeners to the prompt
   * @param {HTMLElement} promptElement - The prompt element
   */
  addEventListeners(promptElement) {
    // Remove existing listeners to prevent duplicates
    this.removeEventListeners(promptElement);

    // Dismiss button
    const dismissBtn = promptElement.querySelector('#review-prompt-dismiss');
    if (dismissBtn) {
      const listener = (e) => {
        e.preventDefault();
        this.dismiss();
      };
      
      dismissBtn.addEventListener('click', listener);
      this.eventListeners.set(dismissBtn, listener);
    }

    // Submit button
    const submitBtn = promptElement.querySelector('#review-prompt-submit');
    if (submitBtn) {
      const listener = (e) => {
        e.preventDefault();
        this.handleSubmit();
      };
      
      submitBtn.addEventListener('click', listener);
      this.eventListeners.set(submitBtn, listener);
    }
  }

  /**
   * Remove event listeners from the prompt
   * @param {HTMLElement} promptElement - The prompt element
   */
  removeEventListeners(promptElement) {
    this.eventListeners.forEach((listeners, element) => {
      if (typeof listeners === 'function') {
        // Old style single listener
        element.removeEventListener('click', listeners);
      } else if (typeof listeners === 'object') {
        // New style multiple listeners
        if (listeners.mouseEnterListener) {
          element.removeEventListener('mouseenter', listeners.mouseEnterListener);
        }
        if (listeners.mouseLeaveListener) {
          element.removeEventListener('mouseleave', listeners.mouseLeaveListener);
        }
        if (listeners.clickListener) {
          element.removeEventListener('click', listeners.clickListener);
        }
      }
    });
    this.eventListeners.clear();
  }

  /**
   * Handle user choosing to leave a review
   */
  async handleSubmit() {
    dbgLog('User chose to leave a review');
    
    this.hide();
    
    const redirectUrl = this.config.chromeStoreUrl;
    window.open(redirectUrl, '_blank');
    this.showThankYouMessage('Thank you! Please leave a review on the Chrome Web Store.');
    
    this.trackReviewPromptInteraction('submit', null, redirectUrl)
      .catch(error => {
        dbgWarn('Background tracking failed:', error);
      });
    
    this.emit('rated', { reviewCount: this.getCurrentReviewCount() });
  }

  /**
   * Dismiss the review prompt (user clicked "Maybe Later")
   */
  dismiss() {
    this.hide();
    dbgLog('Prompt dismissed - tracking "later" action in Firestore');
    
    // Emit custom event
    this.emit('dismissed', { permanent: false });
    
    // Track the interaction with the cloud function in the background (non-blocking)
    // This updates Firestore with action='later' and current date
    // Next time user data is fetched, it will check if 7 days have passed
    this.trackReviewPromptInteraction('later')
      .catch(error => {
        // Silently handle errors to avoid affecting user experience
        dbgWarn('Background tracking failed:', error);
      });
  }

  /**
   * Dismiss the review prompt permanently (user clicked "Never")
   */
  dismissPermanently() {
    this.hide();
    dbgLog('Prompt dismissed permanently - tracking "never" action in Firestore');
    
    // Emit custom event
    this.emit('dismissed', { permanent: true });
    
    // Track the interaction with the cloud function in the background (non-blocking)
    // This updates Firestore with action='never'
    // User will never be prompted again on any device
    this.trackReviewPromptInteraction('never')
      .catch(error => {
        // Silently handle errors to avoid affecting user experience
        dbgWarn('Background tracking failed:', error);
      });
  }

  /**
   * Show a thank you message after rating
   * @param {string} message - Message to display
   */
  showThankYouMessage(message) {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Remove existing thank you message
    const existingMessage = container.querySelector('.review-thank-you-message');
    if (existingMessage) {
      existingMessage.remove();
    }

    // Create new thank you message
    const thankYouDiv = document.createElement('div');
    thankYouDiv.className = 'gl-alert gl-alert-success gl-mt-3 review-thank-you-message';
    thankYouDiv.innerHTML = `
      <div class="gl-alert-content">
        <div class="gl-alert-title">Thank you! 🙏</div>
        <div>${message}</div>
      </div>
    `;
    
    // Insert after the review prompt
    const reviewPrompt = container.querySelector('#review-prompt');
    if (reviewPrompt && reviewPrompt.parentNode) {
      reviewPrompt.parentNode.insertBefore(thankYouDiv, reviewPrompt.nextSibling);
      
      // Remove the message after 5 seconds
      setTimeout(() => {
        if (thankYouDiv.parentNode) {
          thankYouDiv.parentNode.removeChild(thankYouDiv);
        }
      }, 5000);
    }
  }

  /**
   * Reset all dismissal preferences (for testing)
   * Note: This only clears the local cache
   * The source of truth is in Firestore (lastFeedbackPromptInteraction)
   * To truly reset, you need to update Firestore via the cloud function
   */
  resetPreferences() {
    chrome.storage.local.remove(['lastFeedbackPromptInteraction'], () => {
      dbgLog('Local cache cleared - will be refreshed on next user data fetch');
    });
  }

  /**
   * Force show the prompt (for testing)
   */
  forceShow() {
    dbgLog('Force showing prompt');
    this.show();
  }

  /**
   * Comprehensive debugging function
   */
  async debugInfo() {
    dbgLog('=== ReviewPrompt Debug Info ===');
    dbgLog('Configuration:', this.config);
    dbgLog('Initialized:', this.isInitialized);
    dbgLog('Container ID:', this.containerId);
    
    const container = document.getElementById(this.containerId);
    dbgLog('Container found:', !!container);
    
    const reviewCount = await this.getCurrentReviewCount();
    dbgLog('Current review count:', reviewCount);
    
    // Get lastFeedbackPromptInteraction from storage
    const lastFeedbackPromptInteraction = await new Promise((resolve) => {
      chrome.storage.local.get(['lastFeedbackPromptInteraction'], (result) => {
        resolve(result.lastFeedbackPromptInteraction || null);
      });
    });
    dbgLog('Last feedback prompt interaction:', lastFeedbackPromptInteraction);
    
    const shouldShow = this.shouldShow(reviewCount, lastFeedbackPromptInteraction);
    dbgLog('Should show:', shouldShow);
    
    // Check storage directly
    chrome.storage.local.get([this.config.storageKeys.reviewCount], (result) => {
      dbgLog('Storage result:', result);
    });
    
    // Check CloudService
    dbgLog('CloudService available:', !!window.CloudService);
    if (window.CloudService) {
      try {
        const cloudCount = await window.CloudService.getReviewCount();
        dbgLog('CloudService review count:', cloudCount);
      } catch (error) {
        dbgLog('CloudService error:', error);
      }
    }
    
    dbgLog('=== End Debug Info ===');
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    dbgLog('Configuration updated:', this.config);
  }

  /**
   * Emit custom events
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   */
  emit(eventName, data) {
    const event = new CustomEvent(`review-prompt:${eventName}`, {
      detail: data,
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  /**
   * Track review prompt interaction with the cloud function
   * @param {string} action - The action taken ('submit', 'later', or 'never')
   * @param {number} [rating] - Optional rating if action is 'submit'
   * @param {string} [redirectUrl] - The URL user was redirected to if action is 'submit'
   */
  async trackReviewPromptInteraction(action, rating = null, redirectUrl = null) {
    try {
      dbgLog('Tracking interaction:', { action, rating, redirectUrl });
      
      // Get user email from storage
      const email = await this.getUserEmail();
      
      if (!email) {
        dbgWarn('Cannot track interaction: No user email available');
        return;
      }
      
      // Ensure CloudService is available
      if (!window.CloudService) {
        try {
          // Try to import CloudService dynamically
          const module = await import(chrome.runtime.getURL('services/cloud-service.js'));
          window.CloudService = module.CloudService;
          dbgLog('CloudService loaded dynamically');
        } catch (importError) {
          dbgWarn('Failed to load CloudService:', importError);
          throw new Error('CloudService not available');
        }
      }
      
      // Use CloudService to track the interaction (follows architecture pattern)
      const data = await window.CloudService.trackReviewPromptInteraction(email, action, rating, redirectUrl);
      dbgLog('Interaction tracked successfully via CloudService:', data);
      
    } catch (error) {
      dbgWarn('Error tracking interaction:', error);
      // Don't throw the error to avoid disrupting the user experience
    }
  }

  /**
   * Fetch review prompt messages from cloud function
   * @returns {Promise<Object|null>} - Promise that resolves with messages object { subtitle, question } or null if failed
   */
  async fetchMessages() {
    // Return cached messages if available
    if (this.messages) {
      dbgLog('Using cached messages');
      return this.messages;
    }

    // If already fetching, return the existing promise
    if (this.messagesFetchPromise) {
      dbgLog('Already fetching messages, waiting...');
      return this.messagesFetchPromise;
    }

    // Create new fetch promise
    this.messagesFetchPromise = (async () => {
      try {
        dbgLog('Fetching messages from cloud function');
        
        // Get user email
        const email = await this.getUserEmail();
        if (!email) {
          dbgWarn('Cannot fetch messages: No user email available');
          return null;
        }

        // Ensure CloudService is available
        if (!window.CloudService) {
          try {
            const module = await import(chrome.runtime.getURL('services/cloud-service.js'));
            window.CloudService = module.CloudService;
            dbgLog('CloudService loaded dynamically');
          } catch (importError) {
            dbgWarn('Failed to load CloudService:', importError);
            return null;
          }
        }

        // Fetch messages via CloudService
        const messages = await window.CloudService.getReviewPromptMessages(email);
        
        if (messages && messages.subtitle && messages.question) {
          this.messages = messages;
          dbgLog('Messages fetched successfully:', messages);
          return messages;
        } else {
          dbgWarn('Invalid messages format received');
          return null;
        }
      } catch (error) {
        dbgWarn('Error fetching messages:', error);
        return null;
      } finally {
        // Clear the fetch promise
        this.messagesFetchPromise = null;
      }
    })();

    return this.messagesFetchPromise;
  }

  /**
   * Get user email from storage or Chrome identity API
   * @returns {Promise<string|null>} - Promise that resolves with the user's email
   */
  async getUserEmail() {
    try {
      // First try to get from storage
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user'], (result) => {
          resolve(result);
        });
      });
      
      // Check userData first
      if (storageData.userData && storageData.userData.email) {
        return storageData.userData.email;
      }
      
      // Check user field (might be JSON string)
      if (storageData.user) {
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser && parsedUser.email) {
            return parsedUser.email;
          }
        } catch (parseError) {
          dbgWarn('Failed to parse user data:', parseError);
        }
      }
      
      // Fallback to Chrome identity API
      const userInfo = await new Promise((resolve, reject) => {
        chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(userInfo);
          }
        });
      });
      
      return userInfo?.email || null;
      
    } catch (error) {
      dbgWarn('Error getting user email:', error);
      return null;
    }
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    this.hide();
    this.removeEventListeners(document.getElementById('review-prompt'));
    this.eventListeners.clear();
    this.isInitialized = false;
    dbgLog('Component destroyed');
  }
}

// Export the class
export { ReviewPrompt };

// Also make it available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.ReviewPrompt = ReviewPrompt;
} 