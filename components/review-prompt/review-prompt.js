import { dbgLog, dbgWarn } from '../../utils/logger.js';
/**
 * Review Prompt Component
 * Compact inline CTA + two-step popup for store feedback
 */
const REVIEW_PROMPT_CONFIG = {
  threshold: 5, // Show prompt after 5 total reviews
  chromeStoreUrl: 'https://chromewebstore.google.com/detail/thinkreview-ai-code-revie/bpgkhgbchmlmpjjpmlaiejhnnbkdjdjn/reviews',
  firefoxStoreUrl: 'https://addons.mozilla.org/firefox/addon/thinkreview-code-review/reviews/',
  feedbackUrl: 'https://thinkreview.dev/extension-feedback.html',
  // Only suppress the prompt for submits on/after this date (older submits are ignored)
  submitSuppressCutoffDate: '2026-06-07',
  maxFeedbackLength: 2000,
  storageKeys: {
    reviewCount: 'reviewCount',
    todayReviewCount: 'todayReviewCount'
  }
};

const DEFAULT_SUBTITLE = "We'd love to hear your feedback about ThinkReview";
const DEFAULT_QUESTION = 'Would you mind leaving us a quick review?';
const DEFAULT_REWARD_MESSAGE =
  'Post your review on the Chrome Web Store or Firefox Add-ons and get 1 month of ThinkReview Lite free.';

class ReviewPrompt {
  constructor(config = {}) {
    this.config = { ...REVIEW_PROMPT_CONFIG, ...config };
    this.isInitialized = false;
    this.eventListeners = new Map();
    this.messages = null;
    this.messagesFetchPromise = null;
    this.popupAutoOpenedForShow = false;
    this.pendingFeedbackText = '';
    this.popupOverlay = null;
    this.popupStep = 1;
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
   * Detect Firefox via the extension origin (moz-extension://).
   * @returns {boolean}
   */
  isFirefoxBrowser() {
    try {
      return chrome.runtime.getURL('').startsWith('moz-extension://');
    } catch {
      return false;
    }
  }

  /**
   * @returns {'chrome'|'firefox'}
   */
  getBrowserLabel() {
    return this.isFirefoxBrowser() ? 'firefox' : 'chrome';
  }

  /**
   * Store review URL for the current browser.
   * @returns {string}
   */
  getStoreReviewUrl() {
    return this.isFirefoxBrowser()
      ? this.config.firefoxStoreUrl
      : this.config.chromeStoreUrl;
  }

  /**
   * Human-readable store name for copy.
   * @returns {string}
   */
  getStoreDisplayName() {
    return this.isFirefoxBrowser() ? 'Firefox Add-ons' : 'the Chrome Web Store';
  }

  /**
   * Thank-you copy for the current browser store.
   * @returns {string}
   */
  getStoreReviewThankYouMessage() {
    return this.isFirefoxBrowser()
      ? 'Thank you! Please leave a review on Firefox Add-ons.'
      : 'Thank you! Please leave a review on the Chrome Web Store.';
  }

  /**
   * Whether a prior submit should permanently hide the feedback prompt.
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
   * @param {number} reviewCount
   * @param {Object} lastFeedbackPromptInteraction
   * @returns {boolean}
   */
  shouldShow(reviewCount, lastFeedbackPromptInteraction = null) {
    if (lastFeedbackPromptInteraction && lastFeedbackPromptInteraction.action) {
      dbgLog('Last feedback prompt interaction from Firestore:', lastFeedbackPromptInteraction);

      if (this.shouldSuppressForSubmit(lastFeedbackPromptInteraction)) {
        return false;
      }

      if (lastFeedbackPromptInteraction.action === 'later' && lastFeedbackPromptInteraction.date) {
        const lastInteractionDate = new Date(lastFeedbackPromptInteraction.date);
        const today = new Date();
        const daysSinceLastInteraction = Math.floor((today - lastInteractionDate) / (1000 * 60 * 60 * 24));

        dbgLog('Days since last "later" interaction:', daysSinceLastInteraction);

        if (daysSinceLastInteraction <= 7) {
          dbgLog('Not showing prompt: Less than 7 days since "later" (', daysSinceLastInteraction, 'days)');
          return false;
        }
        dbgLog('More than 7 days since "later", will check other conditions');
      }

      if (lastFeedbackPromptInteraction.action === 'never') {
        dbgLog('Not showing prompt: User selected "never ask again" in Firestore');
        return false;
      }
    }

    const shouldShow = reviewCount >= this.config.threshold;
    dbgLog('Should show prompt:', shouldShow, '(count:', reviewCount, '>=', this.config.threshold, ')');
    return shouldShow;
  }

  /**
   * @returns {Promise<number>}
   */
  async getCurrentReviewCount() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.config.storageKeys.reviewCount], (result) => {
        const count = result[this.config.storageKeys.reviewCount] || 0;
        dbgLog('Got total reviewCount from storage:', count);
        resolve(count);
      });
    });
  }

  /**
   * Check and show the review prompt if conditions are met
   * @returns {Promise<boolean>}
   */
  async checkAndShow() {
    try {
      const reviewCount = await this.getCurrentReviewCount();
      dbgLog('Total review count:', reviewCount, '| Threshold:', this.config.threshold);

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
      }

      dbgLog('Conditions not met, not showing prompt');
      return false;
    } catch (error) {
      dbgWarn('Error checking review prompt:', error);
      return false;
    }
  }

  /**
   * Show compact CTA and auto-open the two-step popup once per show cycle.
   * @param {number} reviewCount
   */
  async show(reviewCount = this.config.threshold) {
    const container = document.getElementById(this.containerId);
    if (!container) {
      dbgWarn('Container not found:', this.containerId);
      return;
    }

    try {
      await this.fetchMessages();
    } catch (error) {
      dbgWarn('Failed to fetch messages, using fallbacks:', error);
    }

    let promptElement = container.querySelector('#review-prompt');
    if (!promptElement) {
      promptElement = this.createPromptElement(reviewCount);
      container.appendChild(promptElement);
    } else {
      this.refreshInlineCtaCopy(promptElement);
    }

    promptElement.classList.remove('gl-hidden');
    this.addEventListeners(promptElement);

    if (!this.popupAutoOpenedForShow) {
      this.popupAutoOpenedForShow = true;
      this.openPopup(1);
    }

    dbgLog('Prompt shown');
  }

  /**
   * Hide the compact inline CTA
   */
  hide() {
    const promptElement = document.getElementById('review-prompt');
    if (promptElement) {
      promptElement.classList.add('gl-hidden');
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getSubtitle() {
    return (this.messages && this.messages.subtitle) ? this.messages.subtitle : DEFAULT_SUBTITLE;
  }

  getQuestion() {
    return (this.messages && this.messages.question) ? this.messages.question : DEFAULT_QUESTION;
  }

  isRewardEnabled() {
    return !!(this.messages && this.messages.rewardEnabled === true);
  }

  getRewardMessage() {
    if (!this.isRewardEnabled()) return '';
    if (this.messages && typeof this.messages.rewardMessage === 'string' && this.messages.rewardMessage.trim()) {
      return this.messages.rewardMessage.trim();
    }
    return DEFAULT_REWARD_MESSAGE;
  }

  /**
   * Compact inline CTA
   * @returns {HTMLElement}
   */
  createPromptElement() {
    const subtitle = this.escapeHtml(this.getSubtitle());
    const question = this.escapeHtml(this.getQuestion());

    const promptDiv = document.createElement('div');
    promptDiv.id = 'review-prompt';
    promptDiv.className = 'gl-hidden';
    promptDiv.innerHTML = `
      <div class="gl-alert gl-alert-info gl-mt-4 review-prompt-compact">
        <div class="gl-alert-content review-prompt-compact-inner">
          <div class="review-prompt-compact-copy">
            <p class="review-prompt-compact-subtitle">${subtitle}</p>
            <p class="review-prompt-compact-question">${question}</p>
          </div>
          <div class="review-prompt-compact-actions">
            <button type="button" id="review-prompt-open" class="review-prompt-btn review-prompt-btn-primary">
              Share feedback
            </button>
            <button type="button" id="review-prompt-dismiss" class="review-prompt-btn review-prompt-btn-secondary">
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    `;

    return promptDiv;
  }

  refreshInlineCtaCopy(promptElement) {
    const subtitleEl = promptElement.querySelector('.review-prompt-compact-subtitle');
    const questionEl = promptElement.querySelector('.review-prompt-compact-question');
    if (subtitleEl) subtitleEl.textContent = this.getSubtitle();
    if (questionEl) questionEl.textContent = this.getQuestion();
  }

  /**
   * @param {HTMLElement} promptElement
   */
  addEventListeners(promptElement) {
    this.removeEventListeners(promptElement);

    const dismissBtn = promptElement.querySelector('#review-prompt-dismiss');
    if (dismissBtn) {
      const listener = (e) => {
        e.preventDefault();
        this.dismiss();
      };
      dismissBtn.addEventListener('click', listener);
      this.eventListeners.set(dismissBtn, listener);
    }

    const openBtn = promptElement.querySelector('#review-prompt-open');
    if (openBtn) {
      const listener = (e) => {
        e.preventDefault();
        this.openPopup(1);
      };
      openBtn.addEventListener('click', listener);
      this.eventListeners.set(openBtn, listener);
    }
  }

  /**
   * @param {HTMLElement} promptElement
   */
  removeEventListeners(promptElement) {
    this.eventListeners.forEach((listeners, element) => {
      if (typeof listeners === 'function') {
        element.removeEventListener('click', listeners);
      } else if (typeof listeners === 'object') {
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
   * Open the two-step feedback popup
   * @param {1|2} step
   */
  openPopup(step = 1) {
    this.closePopup({ trackLater: false });
    this.popupStep = step;

    const overlay = document.createElement('div');
    overlay.id = 'thinkreview-store-feedback-overlay';
    overlay.className = 'thinkreview-store-feedback-overlay';
    overlay.innerHTML = this.buildPopupHtml(step);
    document.body.appendChild(overlay);
    this.popupOverlay = overlay;

    this.bindPopupEvents(overlay, step);

    if (step === 1) {
      const textarea = overlay.querySelector('#thinkreview-store-feedback-textarea');
      if (textarea) {
        if (this.pendingFeedbackText) {
          textarea.value = this.pendingFeedbackText;
          this.updateCharCount(overlay);
        }
        setTimeout(() => textarea.focus(), 100);
      }
    }
  }

  /**
   * @param {1|2} step
   * @returns {string}
   */
  buildPopupHtml(step) {
    const storeName = this.escapeHtml(this.getStoreDisplayName());
    if (step === 2) {
      const feedbackPreview = this.escapeHtml(this.pendingFeedbackText || '');
      const rewardEnabled = this.isRewardEnabled();
      const rewardMessage = this.escapeHtml(this.getRewardMessage());
      const rewardBlock = rewardEnabled && rewardMessage
        ? `<div class="thinkreview-store-feedback-reward">${rewardMessage}</div>`
        : '';

      return `
        <div class="thinkreview-store-feedback-popup" role="dialog" aria-modal="true">
          <div class="thinkreview-store-feedback-header">
            <h3>One last step</h3>
            <button type="button" class="thinkreview-store-feedback-close" title="Close" aria-label="Close">×</button>
          </div>
          <div class="thinkreview-store-feedback-body">
            <p>Spend about 10 seconds posting this feedback on ${storeName}.</p>
            ${rewardBlock}
            <label class="thinkreview-store-feedback-label" for="thinkreview-store-feedback-preview">Your feedback (copy &amp; paste)</label>
            <textarea
              id="thinkreview-store-feedback-preview"
              class="thinkreview-store-feedback-textarea"
              readonly
              rows="5"
            >${feedbackPreview}</textarea>
            <button type="button" class="thinkreview-store-feedback-copy-btn">Copy feedback</button>
          </div>
          <div class="thinkreview-store-feedback-footer">
            <button type="button" class="thinkreview-store-feedback-later-btn">Maybe Later</button>
            <button type="button" class="thinkreview-store-feedback-primary-btn">Post on ${storeName}</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="thinkreview-store-feedback-popup" role="dialog" aria-modal="true">
        <div class="thinkreview-store-feedback-header">
          <h3>Share your feedback</h3>
          <button type="button" class="thinkreview-store-feedback-close" title="Close" aria-label="Close">×</button>
        </div>
        <div class="thinkreview-store-feedback-body">
          <p>What did you like, or what should we improve? Your note helps us keep ThinkReview free and open source.</p>
          <textarea
            id="thinkreview-store-feedback-textarea"
            class="thinkreview-store-feedback-textarea"
            placeholder="Write a short review of your experience..."
            maxlength="${this.config.maxFeedbackLength}"
            rows="5"
          ></textarea>
          <div class="thinkreview-store-feedback-char-count">0/${this.config.maxFeedbackLength}</div>
        </div>
        <div class="thinkreview-store-feedback-footer">
          <button type="button" class="thinkreview-store-feedback-later-btn">Maybe Later</button>
          <button type="button" class="thinkreview-store-feedback-primary-btn" disabled>Submit feedback</button>
        </div>
      </div>
    `;
  }

  /**
   * @param {HTMLElement} overlay
   * @param {1|2} step
   */
  bindPopupEvents(overlay, step) {
    const closeBtn = overlay.querySelector('.thinkreview-store-feedback-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePopup({ trackLater: false }));
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closePopup({ trackLater: false });
      }
    });

    const laterBtn = overlay.querySelector('.thinkreview-store-feedback-later-btn');
    if (laterBtn) {
      laterBtn.addEventListener('click', () => this.dismiss());
    }

    if (step === 1) {
      const textarea = overlay.querySelector('#thinkreview-store-feedback-textarea');
      const submitBtn = overlay.querySelector('.thinkreview-store-feedback-primary-btn');

      if (textarea && submitBtn) {
        const onInput = () => {
          this.updateCharCount(overlay);
          submitBtn.disabled = textarea.value.trim().length === 0;
        };
        textarea.addEventListener('input', onInput);
        onInput();

        submitBtn.addEventListener('click', () => {
          this.handleFeedbackSubmit(textarea.value);
        });
      }
      return;
    }

    const copyBtn = overlay.querySelector('.thinkreview-store-feedback-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(this.pendingFeedbackText || '');
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy feedback';
          }, 1500);
        } catch (err) {
          dbgWarn('Clipboard copy failed:', err);
          const preview = overlay.querySelector('#thinkreview-store-feedback-preview');
          if (preview) {
            preview.focus();
            preview.select();
          }
        }
      });
    }

    const storeBtn = overlay.querySelector('.thinkreview-store-feedback-primary-btn');
    if (storeBtn) {
      storeBtn.addEventListener('click', () => this.handleStoreRedirect());
    }
  }

  /**
   * @param {HTMLElement} overlay
   */
  updateCharCount(overlay) {
    const textarea = overlay.querySelector('#thinkreview-store-feedback-textarea');
    const charCount = overlay.querySelector('.thinkreview-store-feedback-char-count');
    if (!textarea || !charCount) return;

    const length = textarea.value.length;
    const max = this.config.maxFeedbackLength;
    charCount.textContent = `${length}/${max}`;
    if (length > max * 0.9) {
      charCount.classList.add('thinkreview-store-feedback-char-count--warn');
    } else {
      charCount.classList.remove('thinkreview-store-feedback-char-count--warn');
    }
  }

  /**
   * Close popup without dismissing the CTA unless requested.
   * @param {{ trackLater?: boolean }} options
   */
  closePopup(options = {}) {
    if (this.popupOverlay) {
      this.popupOverlay.remove();
      this.popupOverlay = null;
    } else {
      const existing = document.getElementById('thinkreview-store-feedback-overlay');
      if (existing) existing.remove();
    }

    if (options.trackLater) {
      this.dismiss();
    }
  }

  /**
   * Step 1: send feedback to backend, then advance to step 2.
   * @param {string} feedbackText
   */
  async handleFeedbackSubmit(feedbackText) {
    const text = (feedbackText || '').trim();
    if (!text) return;

    const overlay = this.popupOverlay;
    const submitBtn = overlay && overlay.querySelector('.thinkreview-store-feedback-primary-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    try {
      await this.ensureCloudService();
      const email = await this.getUserEmail();
      if (!email) {
        throw new Error('No user email available');
      }

      await window.CloudService.submitExtensionFeedback(email, text, {
        source: 'extension_review_prompt',
        browser: this.getBrowserLabel()
      });

      this.pendingFeedbackText = text;

      // Keep local dismiss cache in sync with backend action: 'feedback'
      chrome.storage.local.set({
        lastFeedbackPromptInteraction: {
          action: 'feedback',
          feedbackText: text,
          date: new Date().toISOString()
        }
      });

      this.openPopup(2);
      this.emit('feedback-submitted', { reviewCount: await this.getCurrentReviewCount() });
    } catch (error) {
      dbgWarn('Failed to submit extension feedback:', error);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit feedback';
      }
      this.showInlineError(overlay, 'Could not send feedback. Please try again.');
    }
  }

  /**
   * @param {HTMLElement|null} overlay
   * @param {string} message
   */
  showInlineError(overlay, message) {
    if (!overlay) return;
    let err = overlay.querySelector('.thinkreview-store-feedback-error');
    if (!err) {
      err = document.createElement('div');
      err.className = 'thinkreview-store-feedback-error';
      const body = overlay.querySelector('.thinkreview-store-feedback-body');
      if (body) body.appendChild(err);
    }
    err.textContent = message;
  }

  /**
   * Step 2: open store reviews page and suppress future prompts.
   */
  async handleStoreRedirect() {
    dbgLog('User chose to leave a store review');

    const redirectUrl = this.getStoreReviewUrl();
    window.open(redirectUrl, '_blank');

    this.closePopup({ trackLater: false });
    this.hide();
    this.popupAutoOpenedForShow = false;
    this.showThankYouMessage(this.getStoreReviewThankYouMessage());

    chrome.storage.local.set({
      lastFeedbackPromptInteraction: {
        action: 'submit',
        feedbackText: this.pendingFeedbackText || null,
        date: new Date().toISOString()
      }
    });

    this.trackReviewPromptInteraction('submit', null, redirectUrl)
      .catch((error) => {
        dbgWarn('Background tracking failed:', error);
      });

    const reviewCount = await this.getCurrentReviewCount();
    this.emit('rated', { reviewCount });
  }

  /**
   * Dismiss CTA + popup (Maybe Later)
   */
  dismiss() {
    this.closePopup({ trackLater: false });
    this.hide();
    this.popupAutoOpenedForShow = false;
    dbgLog('Prompt dismissed - tracking "later" action in Firestore');

    this.emit('dismissed', { permanent: false });

    chrome.storage.local.set({
      lastFeedbackPromptInteraction: {
        action: 'later',
        date: new Date().toISOString()
      }
    });

    this.trackReviewPromptInteraction('later')
      .catch((error) => {
        dbgWarn('Background tracking failed:', error);
      });
  }

  /**
   * Permanently dismiss
   */
  dismissPermanently() {
    this.closePopup({ trackLater: false });
    this.hide();
    this.popupAutoOpenedForShow = false;
    dbgLog('Prompt dismissed permanently - tracking "never" action in Firestore');

    this.emit('dismissed', { permanent: true });

    chrome.storage.local.set({
      lastFeedbackPromptInteraction: {
        action: 'never',
        date: new Date().toISOString()
      }
    });

    this.trackReviewPromptInteraction('never')
      .catch((error) => {
        dbgWarn('Background tracking failed:', error);
      });
  }

  /**
   * @param {string} message
   */
  showThankYouMessage(message) {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const existingMessage = container.querySelector('.review-thank-you-message');
    if (existingMessage) {
      existingMessage.remove();
    }

    const thankYouDiv = document.createElement('div');
    thankYouDiv.className = 'gl-alert gl-alert-success gl-mt-3 review-thank-you-message';
    thankYouDiv.innerHTML = `
      <div class="gl-alert-content">
        <div class="gl-alert-title">Thank you!</div>
        <div>${this.escapeHtml(message)}</div>
      </div>
    `;

    const reviewPrompt = container.querySelector('#review-prompt');
    if (reviewPrompt && reviewPrompt.parentNode) {
      reviewPrompt.parentNode.insertBefore(thankYouDiv, reviewPrompt.nextSibling);

      setTimeout(() => {
        if (thankYouDiv.parentNode) {
          thankYouDiv.parentNode.removeChild(thankYouDiv);
        }
      }, 5000);
    }
  }

  resetPreferences() {
    this.popupAutoOpenedForShow = false;
    chrome.storage.local.remove(['lastFeedbackPromptInteraction'], () => {
      dbgLog('Local cache cleared - will be refreshed on next user data fetch');
    });
  }

  forceShow() {
    dbgLog('Force showing prompt');
    this.popupAutoOpenedForShow = false;
    this.show();
  }

  async debugInfo() {
    dbgLog('=== ReviewPrompt Debug Info ===');
    dbgLog('Configuration:', this.config);
    dbgLog('Initialized:', this.isInitialized);
    dbgLog('Container ID:', this.containerId);
    dbgLog('Messages:', this.messages);

    const container = document.getElementById(this.containerId);
    dbgLog('Container found:', !!container);

    const reviewCount = await this.getCurrentReviewCount();
    dbgLog('Current review count:', reviewCount);

    const lastFeedbackPromptInteraction = await new Promise((resolve) => {
      chrome.storage.local.get(['lastFeedbackPromptInteraction'], (result) => {
        resolve(result.lastFeedbackPromptInteraction || null);
      });
    });
    dbgLog('Last feedback prompt interaction:', lastFeedbackPromptInteraction);

    const shouldShow = this.shouldShow(reviewCount, lastFeedbackPromptInteraction);
    dbgLog('Should show:', shouldShow);
    dbgLog('=== End Debug Info ===');
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    dbgLog('Configuration updated:', this.config);
  }

  emit(eventName, data) {
    const event = new CustomEvent(`review-prompt:${eventName}`, {
      detail: data,
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  async ensureCloudService() {
    if (window.CloudService) return;
    const module = await import(chrome.runtime.getURL('services/cloud-service.js'));
    window.CloudService = module.CloudService;
    dbgLog('CloudService loaded dynamically');
  }

  /**
   * @param {string} action
   * @param {number|null} rating
   * @param {string|null} redirectUrl
   */
  async trackReviewPromptInteraction(action, rating = null, redirectUrl = null) {
    try {
      dbgLog('Tracking interaction:', { action, rating, redirectUrl });

      const email = await this.getUserEmail();
      if (!email) {
        dbgWarn('Cannot track interaction: No user email available');
        return;
      }

      await this.ensureCloudService();
      const data = await window.CloudService.trackReviewPromptInteraction(email, action, rating, redirectUrl);
      dbgLog('Interaction tracked successfully via CloudService:', data);
    } catch (error) {
      dbgWarn('Error tracking interaction:', error);
    }
  }

  /**
   * @returns {Promise<Object|null>}
   */
  async fetchMessages() {
    if (this.messages) {
      dbgLog('Using cached messages');
      return this.messages;
    }

    if (this.messagesFetchPromise) {
      dbgLog('Already fetching messages, waiting...');
      return this.messagesFetchPromise;
    }

    this.messagesFetchPromise = (async () => {
      try {
        dbgLog('Fetching messages from cloud function');

        const email = await this.getUserEmail();
        if (!email) {
          dbgWarn('Cannot fetch messages: No user email available');
          return null;
        }

        await this.ensureCloudService();
        const messages = await window.CloudService.getReviewPromptMessages(email);

        if (messages && messages.subtitle && messages.question) {
          this.messages = {
            subtitle: messages.subtitle,
            question: messages.question,
            rewardEnabled: messages.rewardEnabled === true,
            rewardMessage: typeof messages.rewardMessage === 'string' ? messages.rewardMessage : ''
          };
          dbgLog('Messages fetched successfully:', this.messages);
          return this.messages;
        }

        dbgWarn('Invalid messages format received');
        return null;
      } catch (error) {
        dbgWarn('Error fetching messages:', error);
        return null;
      } finally {
        this.messagesFetchPromise = null;
      }
    })();

    return this.messagesFetchPromise;
  }

  /**
   * @returns {Promise<string|null>}
   */
  async getUserEmail() {
    try {
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user'], (result) => {
          resolve(result);
        });
      });

      if (storageData.userData && storageData.userData.email) {
        return storageData.userData.email;
      }

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

  destroy() {
    this.closePopup({ trackLater: false });
    this.hide();
    this.removeEventListeners(document.getElementById('review-prompt'));
    this.eventListeners.clear();
    this.isInitialized = false;
    this.popupAutoOpenedForShow = false;
    dbgLog('Component destroyed');
  }
}

export { ReviewPrompt };

if (typeof window !== 'undefined') {
  window.ReviewPrompt = ReviewPrompt;
}
