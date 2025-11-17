/**
 * Review Prompt Component
 * Modular component for handling user feedback prompts after generating reviews
 */
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[popup]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[popup]', ...args); }
// Configuration
const REVIEW_PROMPT_CONFIG = {
  threshold: 5, // Show prompt after 5 daily reviews
  chromeStoreUrl: 'https://chromewebstore.google.com/detail/thinkreview-ai-code-revie/bpgkhgbchmlmpjjpmlaiejhnnbkdjdjn/reviews',
  feedbackUrl: 'https://thinkreview.dev/extension-feedback.html', // Updated to new extension-specific feedback form
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
  }

  /**
   * Initialize the review prompt component
   * @param {string} containerId - ID of the container to inject the prompt into
   */
  init(containerId = 'gitlab-mr-integrated-review') {
    if (this.isInitialized) {
      dbgWarn('[ReviewPrompt] Already initialized');
      return;
    }

    this.containerId = containerId;
    this.isInitialized = true;
    
    dbgLog('[ReviewPrompt] Initialized with config:', this.config);
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
      dbgLog('[ReviewPrompt] Last feedback prompt interaction from Firestore:', lastFeedbackPromptInteraction);
      
      // If action was "submit", never show the prompt
      if (lastFeedbackPromptInteraction.action === 'submit') {
        dbgLog('[ReviewPrompt] Not showing prompt: User already submitted feedback (action: submit)');
        return false;
      }
      
      // If action was "later", only show if more than 7 days have passed
      if (lastFeedbackPromptInteraction.action === 'later' && lastFeedbackPromptInteraction.date) {
        const lastInteractionDate = new Date(lastFeedbackPromptInteraction.date);
        const today = new Date();
        const daysSinceLastInteraction = Math.floor((today - lastInteractionDate) / (1000 * 60 * 60 * 24));
        
        dbgLog('[ReviewPrompt] Days since last "later" interaction:', daysSinceLastInteraction);
        
        if (daysSinceLastInteraction <= 7) {
          dbgLog('[ReviewPrompt] Not showing prompt: Less than 7 days since "later" (', daysSinceLastInteraction, 'days)');
          return false;
        } else {
          dbgLog('[ReviewPrompt] More than 7 days since "later", will check other conditions');
        }
      }
      
      // If action was "never", never show the prompt
      if (lastFeedbackPromptInteraction.action === 'never') {
        dbgLog('[ReviewPrompt] Not showing prompt: User selected "never ask again" in Firestore');
        return false;
      }
    }
    
    // Show prompt when review count reaches the threshold
    const shouldShow = reviewCount >= this.config.threshold;
    dbgLog('[ReviewPrompt] Should show prompt:', shouldShow, '(count:', reviewCount, '>=', this.config.threshold, ')');
    return shouldShow;
  }

  /**
   * Get the current daily review count from storage
   * @returns {Promise<number>} - Current daily review count
   */
  async getCurrentReviewCount() {
    return new Promise((resolve) => {
      // Get todayReviewCount from storage
      // This is kept up-to-date by the background service and incremented after each review
      chrome.storage.local.get([this.config.storageKeys.todayReviewCount], (result) => {
        const count = result[this.config.storageKeys.todayReviewCount] || 0;
        dbgLog('[ReviewPrompt] Got todayReviewCount from storage:', count);
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
      dbgLog('[ReviewPrompt] Current review count:', reviewCount, '| Threshold:', this.config.threshold);
      
      // Get lastFeedbackPromptInteraction from storage
      const lastFeedbackPromptInteraction = await new Promise((resolve) => {
        chrome.storage.local.get(['lastFeedbackPromptInteraction'], (result) => {
          resolve(result.lastFeedbackPromptInteraction || null);
        });
      });
      dbgLog('[ReviewPrompt] Last feedback prompt interaction from storage:', lastFeedbackPromptInteraction);
      
      if (this.shouldShow(reviewCount, lastFeedbackPromptInteraction)) {
        dbgLog('[ReviewPrompt] Conditions met, showing prompt');
        this.show(reviewCount);
        return true;
      } else {
        dbgLog('[ReviewPrompt] Conditions not met, not showing prompt');
      }
      
      return false;
    } catch (error) {
      dbgWarn('[ReviewPrompt] Error checking review prompt:', error);
      return false;
    }
  }

  /**
   * Show the review prompt
   * @param {number} reviewCount - The current review count to display
   */
  show(reviewCount = this.config.threshold) {
    const container = document.getElementById(this.containerId);
    if (!container) {
      dbgWarn('[ReviewPrompt] Container not found:', this.containerId);
      return;
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
    
    dbgLog('[ReviewPrompt] Prompt shown');
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
   * Create the review prompt HTML element
   * @param {number} reviewCount - The current review count to display
   * @returns {HTMLElement} - The prompt element
   */
  createPromptElement(reviewCount = this.config.threshold) {
    const promptDiv = document.createElement('div');
    promptDiv.id = 'review-prompt';
    promptDiv.className = 'gl-hidden';
    promptDiv.innerHTML = `
      <div class="gl-alert gl-alert-info gl-mt-4 review-prompt-modern">
        <div class="gl-alert-content">
          <div class="review-prompt-header">
            <div class="review-prompt-icon">🎉</div>
            <div>
              <p class="review-prompt-subtitle">We'd love to hear your feedback about ThinkReview</p>
            </div>
          </div>
          
          <div class="review-prompt-content">
            <p class="review-prompt-question">Please spend a minute to rate our extension</p>
            
            <div class="star-rating-container">
              <div class="star-rating" data-rating="0">
                <button class="star" data-value="1" type="button" aria-label="Rate 1 star">
                  <svg class="star-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
                  </svg>
                </button>
                <button class="star" data-value="2" type="button" aria-label="Rate 2 stars">
                  <svg class="star-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
                  </svg>
                </button>
                <button class="star" data-value="3" type="button" aria-label="Rate 3 stars">
                  <svg class="star-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
                  </svg>
                </button>
                <button class="star" data-value="4" type="button" aria-label="Rate 4 stars">
                  <svg class="star-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
                  </svg>
                </button>
                <button class="star" data-value="5" type="button" aria-label="Rate 5 stars">
                  <svg class="star-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
                  </svg>
                </button>
              </div>
              <div class="rating-labels">
                <span class="rating-label" data-rating="1">Poor</span>
                <span class="rating-label" data-rating="2">Fair</span>
                <span class="rating-label" data-rating="3">Good</span>
                <span class="rating-label" data-rating="4">Very Good</span>
                <span class="rating-label" data-rating="5">Excellent</span>
              </div>
            </div>
            
            <div class="review-prompt-actions">
              <button id="review-prompt-dismiss" class="review-prompt-btn review-prompt-btn-secondary">Maybe Later</button>
              <button id="review-prompt-submit" class="review-prompt-btn review-prompt-btn-primary" disabled>Submit</button>
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

    // Star rating system
    const starContainer = promptElement.querySelector('.star-rating');
    const stars = promptElement.querySelectorAll('.star');
    const ratingLabels = promptElement.querySelectorAll('.rating-label');
    
    // Add hover effects and click handlers for stars
    stars.forEach((star, index) => {
      const value = parseInt(star.getAttribute('data-value'));
      
      // Mouse enter - highlight stars up to this one
      const mouseEnterListener = () => {
        this.highlightStars(stars, value);
        this.showRatingLabel(ratingLabels, value);
      };
      
      // Mouse leave - reset to current rating
      const mouseLeaveListener = () => {
        const currentRating = parseInt(starContainer.getAttribute('data-rating')) || 0;
        this.highlightStars(stars, currentRating);
        this.hideRatingLabels(ratingLabels);
      };
      
      // Click - set rating
      const clickListener = (e) => {
        e.preventDefault();
        starContainer.setAttribute('data-rating', value);
        this.highlightStars(stars, value);
        
        // Enable the submit button
        const submitBtn = promptElement.querySelector('#review-prompt-submit');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.add('enabled');
        }
      };
      
      star.addEventListener('mouseenter', mouseEnterListener);
      star.addEventListener('mouseleave', mouseLeaveListener);
      star.addEventListener('click', clickListener);
      
      this.eventListeners.set(star, { mouseEnterListener, mouseLeaveListener, clickListener });
    });

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
        const starContainer = promptElement.querySelector('.star-rating');
        const rating = parseInt(starContainer.getAttribute('data-rating')) || 0;
        
        if (rating > 0) {
          this.handleRating(rating);
        }
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
   * Handle user rating selection
   * @param {number} rating - User's rating (1-5 stars)
   */
  async handleRating(rating) {
    dbgLog('[ReviewPrompt] User rated extension:', rating, 'stars');
    
    // Hide the prompt immediately
    this.hide();
    
    // Open URL immediately to avoid delaying user feedback experience
    if (rating >= 4) {
      // 4-5 stars: Direct to Chrome Web Store
      const redirectUrl = this.config.chromeStoreUrl;
      window.open(redirectUrl, '_blank');
      this.showThankYouMessage('Thank you for your positive feedback! Please leave a review on the Chrome Web Store.');
      
      // Track the interaction with the cloud function in the background (non-blocking)
      this.trackReviewPromptInteraction('submit', rating, redirectUrl)
        .catch(error => {
          // Silently handle errors to avoid affecting user experience
          dbgWarn('[ReviewPrompt] Background tracking failed:', error);
        });
    } else {
      // 1-3 stars: Direct to feedback form with email parameter
      // Get user email first
      const userEmail = await this.getUserEmail();
      const feedbackUrl = userEmail 
        ? `https://thinkreview.dev/extension-feedback.html?email=${encodeURIComponent(userEmail)}`
        : 'https://thinkreview.dev/extension-feedback.html';
      
      window.open(feedbackUrl, '_blank');
      this.showThankYouMessage('Thank you for your feedback! We\'d love to hear how we can improve.');
      
      // Track the interaction with the cloud function in the background (non-blocking)
      this.trackReviewPromptInteraction('submit', rating, feedbackUrl)
        .catch(error => {
          // Silently handle errors to avoid affecting user experience
          dbgWarn('[ReviewPrompt] Background tracking failed:', error);
        });
    }
    
    // Note: We no longer set localStorage/sessionStorage flags
    // The source of truth is now lastFeedbackPromptInteraction in Firestore
    // which gets updated via trackReviewPromptInteraction() below and cached in chrome.storage.local
    
    // Emit custom event
    this.emit('rated', { rating, reviewCount: this.getCurrentReviewCount() });
  }

  /**
   * Dismiss the review prompt (user clicked "Maybe Later")
   */
  dismiss() {
    this.hide();
    dbgLog('[ReviewPrompt] Prompt dismissed - tracking "later" action in Firestore');
    
    // Emit custom event
    this.emit('dismissed', { permanent: false });
    
    // Track the interaction with the cloud function in the background (non-blocking)
    // This updates Firestore with action='later' and current date
    // Next time user data is fetched, it will check if 7 days have passed
    this.trackReviewPromptInteraction('later')
      .catch(error => {
        // Silently handle errors to avoid affecting user experience
        dbgWarn('[ReviewPrompt] Background tracking failed:', error);
      });
  }

  /**
   * Dismiss the review prompt permanently (user clicked "Never")
   */
  dismissPermanently() {
    this.hide();
    dbgLog('[ReviewPrompt] Prompt dismissed permanently - tracking "never" action in Firestore');
    
    // Emit custom event
    this.emit('dismissed', { permanent: true });
    
    // Track the interaction with the cloud function in the background (non-blocking)
    // This updates Firestore with action='never'
    // User will never be prompted again on any device
    this.trackReviewPromptInteraction('never')
      .catch(error => {
        // Silently handle errors to avoid affecting user experience
        dbgWarn('[ReviewPrompt] Background tracking failed:', error);
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
      dbgLog('[ReviewPrompt] Local cache cleared - will be refreshed on next user data fetch');
    });
  }

  /**
   * Force show the prompt (for testing)
   */
  forceShow() {
    dbgLog('[ReviewPrompt] Force showing prompt');
    this.show();
  }

  /**
   * Highlight stars up to the given rating
   * @param {NodeList} stars - Star elements
   * @param {number} rating - Rating to highlight up to
   */
  highlightStars(stars, rating) {
    stars.forEach((star, index) => {
      const value = parseInt(star.getAttribute('data-value'));
      const starIcon = star.querySelector('.star-icon');
      
      if (value <= rating) {
        starIcon.setAttribute('fill', '#ffc107');
        starIcon.setAttribute('stroke', '#ffc107');
        star.classList.add('active');
      } else {
        starIcon.setAttribute('fill', 'none');
        starIcon.setAttribute('stroke', '#d1d5db');
        star.classList.remove('active');
      }
    });
  }

  /**
   * Show the rating label for the given rating
   * @param {NodeList} labels - Rating label elements
   * @param {number} rating - Rating to show label for
   */
  showRatingLabel(labels, rating) {
    labels.forEach(label => {
      const labelRating = parseInt(label.getAttribute('data-rating'));
      if (labelRating === rating) {
        label.classList.add('active');
      } else {
        label.classList.remove('active');
      }
    });
  }

  /**
   * Hide all rating labels
   * @param {NodeList} labels - Rating label elements
   */
  hideRatingLabels(labels) {
    labels.forEach(label => {
      label.classList.remove('active');
    });
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
    dbgLog('[ReviewPrompt] Configuration updated:', this.config);
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
   * @param {number} [rating] - The star rating (1-5) if action is 'submit'
   * @param {string} [redirectUrl] - The URL user was redirected to if action is 'submit'
   */
  async trackReviewPromptInteraction(action, rating = null, redirectUrl = null) {
    try {
      dbgLog('[ReviewPrompt] Tracking interaction:', { action, rating, redirectUrl });
      
      // Get user email from storage
      const email = await this.getUserEmail();
      
      if (!email) {
        dbgWarn('[ReviewPrompt] Cannot track interaction: No user email available');
        return;
      }
      
      // Ensure CloudService is available
      if (!window.CloudService) {
        try {
          // Try to import CloudService dynamically
          const module = await import(chrome.runtime.getURL('services/cloud-service.js'));
          window.CloudService = module.CloudService;
          dbgLog('[ReviewPrompt] CloudService loaded dynamically');
        } catch (importError) {
          dbgWarn('[ReviewPrompt] Failed to load CloudService:', importError);
          throw new Error('CloudService not available');
        }
      }
      
      // Use CloudService to track the interaction (follows architecture pattern)
      const data = await window.CloudService.trackReviewPromptInteraction(email, action, rating, redirectUrl);
      dbgLog('[ReviewPrompt] Interaction tracked successfully via CloudService:', data);
      
    } catch (error) {
      dbgWarn('[ReviewPrompt] Error tracking interaction:', error);
      // Don't throw the error to avoid disrupting the user experience
    }
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
          dbgWarn('[ReviewPrompt] Failed to parse user data:', parseError);
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
      dbgWarn('[ReviewPrompt] Error getting user email:', error);
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
    dbgLog('[ReviewPrompt] Component destroyed');
  }
}

// Export the class
export { ReviewPrompt };

// Also make it available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.ReviewPrompt = ReviewPrompt;
} 