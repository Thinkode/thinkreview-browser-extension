// integrated-review.js
// Component for displaying code review results directly in GitLab MR page
// Debug toggle: set to false to disable console logs in production
// Check if DEBUG already exists to avoid conflicts
if (typeof DEBUG === 'undefined') {
  var DEBUG = false;
}

// Logger functions - loaded dynamically to avoid module import issues in content scripts
// Provide fallback functions immediately, then upgrade when logger loads
// Check if variables already exist to avoid redeclaration errors
if (typeof dbgLog === 'undefined') {
  var dbgLog = (...args) => { if (DEBUG) console.log('[IntegratedReview]', ...args); };
}
if (typeof dbgWarn === 'undefined') {
  var dbgWarn = (...args) => { if (DEBUG) console.warn('[IntegratedReview]', ...args); };
}
if (typeof dbgError === 'undefined') {
  var dbgError = (...args) => { if (DEBUG) console.error('[IntegratedReview]', ...args); };
}

// Initialize logger functions with dynamic import
(async () => {
  try {
    // Use chrome.runtime.getURL for content scripts (same pattern as other dynamic imports)
    const loggerModule = await import(chrome.runtime.getURL('utils/logger.js'));
    // Upgrade to use the real logger functions
    dbgLog = loggerModule.dbgLog;
    dbgWarn = loggerModule.dbgWarn;
    dbgError = loggerModule.dbgError;
  } catch (error) {
    // Keep using fallback functions if logger fails to load
    dbgWarn('Failed to load logger module, using console fallback:', error);
  }
})();
// Import the CSS for the integrated review panel
const cssURL = chrome.runtime.getURL('components/integrated-review.css');
const linkElement = document.createElement('link');
linkElement.rel = 'stylesheet';
linkElement.href = cssURL;
document.head.appendChild(linkElement);

// Import review prompt CSS
const reviewPromptCssURL = chrome.runtime.getURL('components/review-prompt/review-prompt.css');
const reviewPromptLinkElement = document.createElement('link');
reviewPromptLinkElement.rel = 'stylesheet';
reviewPromptLinkElement.href = reviewPromptCssURL;
document.head.appendChild(reviewPromptLinkElement);

// Import item copy button CSS
const itemCopyButtonCssURL = chrome.runtime.getURL('components/utils/item-copy-button.css');
const itemCopyButtonLinkElement = document.createElement('link');
itemCopyButtonLinkElement.rel = 'stylesheet';
itemCopyButtonLinkElement.href = itemCopyButtonCssURL;
document.head.appendChild(itemCopyButtonLinkElement);

// Formatting utils
let markdownToHtml = null;
let preprocessAIResponse = null;
let applySimpleSyntaxHighlighting = null;
let setupCopyHandler = null;

// Copy button utils
let createCopyButton = null;
let copyItemContent = null;
let attachCopyButtonToItem = null;

// Badge utils
let createNewBadge = null;
// Cache the badge module loading promise to avoid repeated imports
const badgeModulePromise = (async () => {
  try {
    const module = await import('./utils/new-badge.js');
    createNewBadge = module.createNewBadge;
    dbgLog('Badge utils loaded');
    return module;
  } catch (e) {
    dbgWarn('Failed to load badge utils', e);
    return null;
  }
})();

async function initFormattingUtils() {
  try {
    const module = await import('./utils/formatting.js');
    markdownToHtml = module.markdownToHtml;
    preprocessAIResponse = module.preprocessAIResponse;
    applySimpleSyntaxHighlighting = module.applySimpleSyntaxHighlighting;
    setupCopyHandler = module.setupCopyHandler;
    setupCopyHandler();
    dbgLog('Formatting utils loaded');
  } catch (e) {
    dbgWarn('Failed to load formatting utils', e);
  }
}

async function initCopyButtonUtils() {
  try {
    const module = await import('./utils/item-copy-button.js');
    createCopyButton = module.createCopyButton;
    copyItemContent = module.copyItemContent;
    attachCopyButtonToItem = module.attachCopyButtonToItem;
    dbgLog('Copy button utils loaded');
  } catch (e) {
    dbgWarn('Failed to load copy button utils', e);
  }
}

// Badge utils are initialized via cached promise above
// The promise is already being resolved, we just need to wait for it when needed

initFormattingUtils();
initCopyButtonUtils();
// Badge utils loading is handled by the cached promise, no separate init needed

// Review prompt instance
let reviewPrompt = null;

// Make it accessible globally for debugging
window.reviewPrompt = null;

// Make enhanced loader functions globally accessible
window.startEnhancedLoader = startEnhancedLoader;
window.stopEnhancedLoader = stopEnhancedLoader;
window.updateLoaderStage = updateLoaderStage;

// Initialize review prompt component
async function initReviewPromptComponent() {
  try {
    // Dynamic import to avoid module loading issues
    const module = await import('./review-prompt/review-prompt.js');
    reviewPrompt = new module.ReviewPrompt({
      threshold: 5, // Show prompt after 5 daily reviews
      chromeStoreUrl: 'https://chromewebstore.google.com/detail/thinkreview-ai-code-revie/bpgkhgbchmlmpjjpmlaiejhnnbkdjdjn/reviews',
      feedbackUrl: 'https://thinkreview.dev/extension-feedback.html'
    });
    reviewPrompt.init('review-prompt-container');
    window.reviewPrompt = reviewPrompt; // Make accessible globally
    dbgLog('Review prompt component initialized with daily threshold of 5');
  } catch (error) {
    dbgWarn('Failed to initialize review prompt component:', error);
  }
}

// Initialize the review prompt component
initReviewPromptComponent();

// Conversation history
let conversationHistory = [];
let currentPatchContent = '';

/**
 * Clears the stored patch content and conversation history
 * This should be called when navigating to a new PR to free up memory
 * Also clears the chat log DOM so previous messages are not shown in the new review
 */
function clearPatchContentAndHistory() {
  currentPatchContent = '';
  conversationHistory = [];
  const chatLog = document.getElementById('chat-log');
  if (chatLog) {
    chatLog.innerHTML = '';
  }
  dbgLog('Cleared patch content and conversation history');
}

// Expose function for content.js to call when navigating to new PR
window.clearPatchContentAndHistory = clearPatchContentAndHistory;

// Enhanced loader functionality
let loaderStageInterval = null;
let currentLoaderStage = 0;
const loaderStages = ['fetching', 'analyzing', 'generating'];

/**
 * Starts the enhanced loader with progressive stages
 */
function startEnhancedLoader() {
  const loader = document.getElementById('review-loading');
  if (!loader || !loader.classList.contains('enhanced-loader')) return;
  
  // Reset to first stage
  currentLoaderStage = 0;
  updateLoaderStage('fetching');
  
  // Start progressive stage updates
  loaderStageInterval = setInterval(() => {
    if (currentLoaderStage < loaderStages.length - 1) {
      currentLoaderStage++;
      updateLoaderStage(loaderStages[currentLoaderStage]);
    }
  }, 2000); // Change stage every 2 seconds
}

/**
 * Updates the loader to show a specific stage
 * @param {string} stage - The stage to show ('fetching', 'analyzing', 'generating')
 */
function updateLoaderStage(stage) {
  const stages = document.querySelectorAll('.loader-stage');
  const progressText = document.querySelector('.progress-text');
  
  stages.forEach((stageElement, index) => {
    const stageName = stageElement.dataset.stage;
    
    // Remove all active/completed classes
    stageElement.classList.remove('active', 'completed');
    
    if (stageName === stage) {
      stageElement.classList.add('active');
    } else if (loaderStages.indexOf(stageName) < loaderStages.indexOf(stage)) {
      stageElement.classList.add('completed');
    }
  });
  
  // Update progress text based on stage
  const progressTexts = {
    'fetching': 'Retrieving PR code changes...',
    'analyzing': 'Analyzing code structure and patterns...',
    'generating': 'Generating comprehensive review feedback...'
  };
  
  if (progressText && progressTexts[stage]) {
    progressText.textContent = progressTexts[stage];
  }
}

/**
 * Stops the enhanced loader and cleans up intervals
 */
function stopEnhancedLoader() {
  if (loaderStageInterval) {
    clearInterval(loaderStageInterval);
    loaderStageInterval = null;
  }
}

/**
 * Preprocesses AI responses to clean up common formatting issues
 * @param {string} response - Raw AI response text
 * @returns {string} - Cleaned response text
 */
// moved to utils/formatting.js

/**
 * Simple Markdown to HTML converter for basic formatting
 * @param {string} markdown - Markdown text to convert
 * @returns {string} - HTML string
 */
// moved to utils/formatting.js

// copy handler moved to utils/formatting.js and initialized in initFormattingUtils()

// applySimpleSyntaxHighlighting is provided by utils/formatting.js via dynamic import

// Toggle button removed as per user request - using only the arrow down button and AI Review button

/**
 * Creates and injects the integrated review panel into the GitLab MR page
 * @param {string} patchUrl - URL to the patch file
 * @returns {Promise<HTMLElement>} - The injected review panel element
 */
async function createIntegratedReviewPanel(patchUrl) {
  // Load refresh icon from centralized icons.js (use extension URL for content script context)
  const iconsModule = await import(chrome.runtime.getURL('assets/icons.js'));
  const refreshIconSvg = iconsModule.REFRESH_ICON_SVG;
  // Get logo URL
  const logoUrl = chrome.runtime.getURL('images/icon16.png');
  // Create the container for the review panel
  const container = document.createElement('div');
  container.id = 'gitlab-mr-integrated-review';
  container.className = 'thinkreview-panel-container thinkreview-panel-minimized-to-button';
  
  // Create the panel with unique styling classes to prevent theme conflicts
  container.innerHTML = `
    <div class="thinkreview-card gl-border-1 gl-border-gray-100">
      <div class="thinkreview-card-header gl-display-flex gl-justify-content-space-between gl-align-items-center">
        <div class="gl-display-flex gl-align-items-center thinkreview-card-title">
          <img src="${logoUrl}" alt="ThinkReview" class="thinkreview-header-logo">
          <span class="gl-font-weight-bold">ThinkReview</span>
          <a id="extension-version-link" class="thinkreview-version-link" href="https://thinkreview.dev/release-notes" target="_blank" title="View release notes">v<span id="extension-version-text">...</span></a>
          <span class="thinkreview-toggle-icon gl-ml-2" title="Minimize">▲</span>
        </div>
        <div class="thinkreview-header-actions">
          <span class="thinkreview-regenerate-btn-wrapper">
            <button id="regenerate-review-btn" class="thinkreview-regenerate-btn" aria-label="Regenerate review">
              ${refreshIconSvg}
            </button>
            <span class="thinkreview-regenerate-tooltip" aria-hidden="true">Regenerate review</span>
          </span>
          <select id="language-selector" class="thinkreview-language-dropdown" title="Select review language">
            <option value="English">English</option>
            <option value="Spanish">Español</option>
            <option value="French">Français</option>
            <option value="German">Deutsch</option>
            <option value="Chinese">中文</option>
            <option value="Japanese">日本語</option>
            <option value="Portuguese">Português</option>
            <option value="Russian">Русский</option>
            <option value="Arabic">العربية</option>
            <option value="Hindi">हिन्दी</option>
            <option value="Polish">Polski</option>
            <option value="Czech">Čeština</option>
            <option value="Dutch">Nederlands</option>
            <option value="Vietnamese">Tiếng Việt</option>
            <option value="Indonesian">Bahasa Indonesia</option>
            <option value="Romanian">Română</option>
            <option value="Italian">Italiano</option>
          </select>
          <button id="bug-report-btn" class="thinkreview-bug-report-btn" title="Report a Bug">
            Report a 🐞
          </button>
        </div>
      </div>
      <div class="thinkreview-card-body">
        <div id="review-loading" class="enhanced-loader gl-display-flex gl-align-items-center gl-justify-content-center gl-py-5">
          <div class="loader-container">
            <div class="loader-animation">
              <div class="loader-circle">
                <div class="loader-dot"></div>
                <div class="loader-dot"></div>
                <div class="loader-dot"></div>
              </div>
            </div>
            <div class="loader-content">
              <div class="loader-title">AI Code Review in Progress</div>
              <div class="loader-stages">
                <div class="loader-stage" data-stage="fetching">
                  <div class="stage-icon">📥</div>
                  <div class="stage-text">
                    <div class="stage-title">Fetching Patch Data</div>
                    <div class="stage-description">Retrieving code changes</div>
                  </div>
                </div>
                <div class="loader-stage" data-stage="analyzing">
                  <div class="stage-icon">🔍</div>
                  <div class="stage-text">
                    <div class="stage-title">Analyzing Code</div>
                    <div class="stage-description">Examining structure and patterns</div>
                  </div>
                </div>
                <div class="loader-stage" data-stage="generating">
                  <div class="stage-icon">✨</div>
                  <div class="stage-text">
                    <div class="stage-title">Generating Review</div>
                    <div class="stage-description">Creating comprehensive feedback</div>
                  </div>
                </div>
              </div>
              <div class="loader-progress">
                <div class="progress-bar">
                  <div class="progress-fill"></div>
                </div>
                <div class="progress-text">Retrieving patch data...</div>
              </div>
            </div>
          </div>
        </div>
        <div id="review-content" class="gl-hidden">
          <div id="review-scroll-container">
            <div id="review-prompt-container"></div>
            <div id="review-patch-size-banner" class="gl-mb-4 gl-hidden"></div>
            <div id="review-metrics-container" class="gl-mb-4"></div>
            <div id="review-summary-container" class="gl-mb-4">
              <div class="thinkreview-section-header-row">
                <h5 class="gl-font-weight-bold thinkreview-section-title">Summary</h5>
                <button type="button" id="generate-pr-description-btn" class="thinkreview-generate-pr-desc-btn" title="Generate a PR/MR description from this review">Generate PR description</button>
              </div>
              <div class="thinkreview-item-wrapper">
                <p id="review-summary" class="thinkreview-section-content"></p>
              </div>
            </div>
            <div id="review-suggestions-container" class="gl-mb-4">
              <h5 class="gl-font-weight-bold thinkreview-section-title">Suggestions</h5>
              <ul id="review-suggestions" class="gl-pl-5 thinkreview-section-list"></ul>
            </div>
            <div id="review-security-container" class="gl-mb-4">
              <h5 class="gl-font-weight-bold thinkreview-section-title">Security Issues</h5>
              <ul id="review-security" class="gl-pl-5 thinkreview-section-list"></ul>
            </div>
            <div id="review-practices-container" class="gl-mb-4">
              <h5 class="gl-font-weight-bold thinkreview-section-title">Best Practices</h5>
              <ul id="review-practices" class="gl-pl-5 thinkreview-section-list"></ul>
            </div>
            <div id="suggested-questions-container" class="gl-mb-4">
              <h5 class="gl-font-weight-bold thinkreview-section-title">Suggested Follow-up Questions</h5>
              <div id="suggested-questions" class="thinkreview-suggested-questions-list"></div>
            </div>
            <div id="initial-review-feedback-container" class="thinkreview-feedback-container gl-mb-4 gl-hidden">
              <div class="thinkreview-feedback-label">Was this review helpful?</div>
              <div class="thinkreview-feedback-buttons">
                <button class="thinkreview-feedback-btn thinkreview-thumbs-up-btn" data-rating="thumbs_up" title="Helpful">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" fill="currentColor"/>
                  </svg>
                </button>
                <button class="thinkreview-feedback-btn thinkreview-thumbs-down-btn" data-rating="thumbs_down" title="Not helpful">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
            <div id="chat-log" class="thinkreview-chat-log"></div>
          </div>
          <div id="chat-input-container" class="thinkreview-chat-input-container">
            <textarea id="chat-input" class="thinkreview-chat-input" placeholder="Ask a follow-up question..." maxlength="2000"></textarea>
            <div id="char-counter" class="thinkreview-char-counter">0/2000</div>
            <button id="chat-send-btn" class="thinkreview-chat-send-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-send-fill" viewBox="0 0 16 16">
                <path d="M15.964.686a.5.5 0 0 0-.65-.65L.767 5.855H.766l-.452.18a.5.5 0 0 0-.082.887l.41.26.001.002 4.995 3.178 3.178 4.995.002.002.26.41a.5.5 0 0 0 .886-.083l6-15Zm-1.833 1.89L6.637 10.07l-4.995-3.178 11.13-6.483Z"/>
              </svg>
            </button>
          </div>
        </div>
        <div id="review-error" class="gl-hidden">
          <div class="thinkreview-error-container">
            <div class="thinkreview-error-icon">⚠️</div>
            <div class="thinkreview-error-content">
              <div id="review-error-message" class="thinkreview-error-message">Failed to load code review.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="thinkreview-resize-handle" title="Drag to resize"></div>
  `;
  
  // Add the panel to the page
  document.body.appendChild(container);
  
  // Set extension version in the header
  try {
    const manifest = chrome.runtime.getManifest();
    const versionText = container.querySelector('#extension-version-text');
    if (versionText && manifest.version) {
      versionText.textContent = manifest.version;
    }
    
    // Add tracking to version link click
    const versionLink = container.querySelector('#extension-version-link');
    if (versionLink) {
      versionLink.addEventListener('click', async (e) => {
        // Track version link click
        try {
          const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
          analyticsModule.trackUserAction('version_link_clicked', {
            context: 'header',
            location: 'integrated_panel',
            version: manifest.version || 'unknown'
          }).catch(() => {}); // Silently fail
        } catch (error) {
          // Silently fail - analytics shouldn't break the extension
        }
      });
    }
  } catch (error) {
    dbgWarn('Failed to get extension version:', error);
    const versionText = container.querySelector('#extension-version-text');
    if (versionText) {
      versionText.textContent = '';
      const versionLink = container.querySelector('#extension-version-link');
      if (versionLink) {
        versionLink.style.display = 'none';
      }
    }
  }
  
  // Apply platform-specific styling
  applyPlatformSpecificStyling(container);
  
  // Initialize resize functionality
  initializeResizeHandle(container);
  
  // Add event listener for minimizing the panel
  const cardHeader = container.querySelector('.thinkreview-card-header');
  if (cardHeader) {
    cardHeader.addEventListener('click', async () => {
      // Only minimize to the button, don't toggle
      container.classList.remove('thinkreview-panel-minimized', 'thinkreview-panel-hidden');
      container.classList.add('thinkreview-panel-minimized-to-button');
      
      // Show score popup when panel is minimized
      try {
        const scorePopupModule = await import('./popup-modules/score-popup.js');
        scorePopupModule.showScorePopupIfMinimized();
      } catch (error) {
        // Silently fail if module not available
      }
      
      // Show loading indicator if review is in progress (check by seeing if loading element is visible)
      try {
        const reviewLoading = document.getElementById('review-loading');
        const isLoading = reviewLoading && !reviewLoading.classList.contains('gl-hidden');
        if (isLoading) {
          const loadingModule = await import('./popup-modules/button-loading-indicator.js');
          loadingModule.showButtonLoadingIndicator();
        }
      } catch (error) {
        // Silently fail if module not available
      }
      
      // Update the button arrow if it exists
      const reviewBtn = document.getElementById('code-review-btn');
      if (reviewBtn) {
        const arrowSpan = reviewBtn.querySelector('span:last-child');
        if (arrowSpan) {
          arrowSpan.textContent = '▲';
        }
      }
      
      // Save the state to localStorage
      localStorage.setItem('gitlab-mr-review-minimized-to-button', 'true');
    });
  }
  
  // Add event listener for the refresh button
  const refreshButton = document.getElementById('refresh-review-btn');
  if (refreshButton) {
    refreshButton.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering the header click event
      const reviewLoading = document.getElementById('review-loading');
      const reviewContent = document.getElementById('review-content');
      const reviewError = document.getElementById('review-error');
      
      // Show loading indicator
      reviewLoading.classList.remove('gl-hidden');
      reviewContent.classList.add('gl-hidden');
      reviewError.classList.add('gl-hidden');
      
      // Fetch and display the code review
      fetchAndDisplayCodeReview(patchUrl);
    });
  }
  
  // Set initial state based on localStorage
  const isMinimized = localStorage.getItem('gitlab-mr-review-minimized') === 'true';
  if (isMinimized) {
    container.classList.remove('thinkreview-panel-minimized-to-button');
    container.classList.add('thinkreview-panel-minimized');
  }
  
  // Set initial hidden state based on localStorage
  const isHidden = localStorage.getItem('gitlab-mr-review-hidden') === 'true';
  if (isHidden) {
    container.classList.remove('thinkreview-panel-minimized-to-button');
    container.classList.add('thinkreview-panel-hidden');
  }
  
  // Set initial minimized-to-button state based on localStorage
  const isMinimizedToButton = localStorage.getItem('gitlab-mr-review-minimized-to-button') === 'true';
  if (isMinimizedToButton) {
    // Already has thinkreview-panel-minimized-to-button class from initial creation
    
    // Update the button arrow if it exists
    const reviewBtn = document.getElementById('gitlab-mr-review-btn');
    if (reviewBtn) {
      const arrowSpan = reviewBtn.querySelector('span:last-child');
      if (arrowSpan) {
        arrowSpan.textContent = '▲';
      }
    }
    
    // No need to update the toggle icon in the header - it stays as a down arrow
  }
  
  // Add event listener for the bug report button first
  const bugReportButton = document.getElementById('bug-report-btn');
  if (bugReportButton) {
    bugReportButton.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent triggering the header click event
      dbgLog('Bug report button clicked');
      
      // Track bug report button click
      try {
        const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
        analyticsModule.trackUserAction('bug_report_clicked', {
          context: 'integrated_review_panel',
          location: 'header'
        }).catch(() => {});
      } catch (error) { /* silent */ }
      
      window.open('https://thinkreview.dev/bug-report', '_blank');
    });
  }
  
  // Fast tooltip for regenerate button (short delay vs native title)
  const regenerateWrapper = container.querySelector('.thinkreview-regenerate-btn-wrapper');
  if (regenerateWrapper) {
    let tooltipTimeout;
    const tooltipEl = regenerateWrapper.querySelector('.thinkreview-regenerate-tooltip');
    regenerateWrapper.addEventListener('mouseenter', () => {
      tooltipTimeout = setTimeout(() => {
        if (tooltipEl) tooltipEl.classList.add('thinkreview-tooltip-visible');
      }, 200);
    });
    regenerateWrapper.addEventListener('mouseleave', () => {
      clearTimeout(tooltipTimeout);
      if (tooltipEl) tooltipEl.classList.remove('thinkreview-tooltip-visible');
    });
  }

  // Add event listener for the regenerate review button
  const regenerateButton = document.getElementById('regenerate-review-btn');
  if (regenerateButton) {
    regenerateButton.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent triggering the header click event
      dbgLog('Regenerate review button clicked');
      
      // Track refresh action
      try {
        const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
        analyticsModule.trackUserAction('refresh_review', {
          context: 'regenerate_button',
          location: 'integrated_panel'
        }).catch(() => {}); // Silently fail
      } catch (error) {
        // Silently fail - analytics shouldn't break the extension
      }
      
      // Show loading state
      const reviewLoading = document.getElementById('review-loading');
      const reviewContent = document.getElementById('review-content');
      const reviewError = document.getElementById('review-error');
      
      if (reviewLoading) reviewLoading.classList.remove('gl-hidden');
      if (reviewContent) reviewContent.classList.add('gl-hidden');
      if (reviewError) reviewError.classList.add('gl-hidden');
      
      // Start the enhanced loader animation
      startEnhancedLoader();
      
      // Trigger the review with forceRegenerate=true
      if (typeof fetchAndDisplayCodeReview === 'function') {
        await fetchAndDisplayCodeReview(true); // Pass true to force regeneration
      } else {
        console.error('fetchAndDisplayCodeReview function not found');
      }
    });
  }

  // Block events from header-actions to prevent panel minimization
  // But allow clicks on the bug report button, regenerate button, and language selector to pass through
  const headerActions = container.querySelector('.thinkreview-header-actions');
  if (headerActions) {
    const blockEvent = (e) => {
      // Allow clicks on bug report button, regenerate button, and language selector
      if (e.target.id === 'bug-report-btn' || 
          e.target.closest('#bug-report-btn') ||
          e.target.id === 'regenerate-review-btn' || 
          e.target.closest('#regenerate-review-btn') ||
          e.target.id === 'language-selector' ||
          e.target.closest('#language-selector')) {
        return; // Don't block these events
      }
      e.stopPropagation();
    };
    
    // Block mouse and pointer events on the entire header-actions container
    headerActions.addEventListener('click', blockEvent, true);
    headerActions.addEventListener('mousedown', blockEvent, true);
    headerActions.addEventListener('mouseup', blockEvent, true);
  }

  // Add event listener for the language selector
  const languageSelector = container.querySelector('#language-selector');
  if (languageSelector) {
    // Load saved language preference
    const savedLanguage = getLanguagePreference();
    languageSelector.value = savedLanguage;
    
    // Comprehensive event blocking to prevent panel minimization
    const blockEvent = (e) => {
      e.stopPropagation(); // Prevent triggering the header click event
      e.stopImmediatePropagation(); // Stop other handlers on this element
    };
    
    // Block all mouse and pointer events
    languageSelector.addEventListener('click', blockEvent, true);
    languageSelector.addEventListener('mousedown', blockEvent, true);
    languageSelector.addEventListener('mouseup', blockEvent, true);
    languageSelector.addEventListener('pointerdown', blockEvent, true);
    languageSelector.addEventListener('pointerup', blockEvent, true);
    languageSelector.addEventListener('touchstart', blockEvent, true);
    languageSelector.addEventListener('touchend', blockEvent, true);
    
    // Save language preference when changed
    languageSelector.addEventListener('change', async (e) => {
      e.stopPropagation(); // Prevent triggering the header click event
      const selectedLanguage = e.target.value;
      
      // Track language change
      try {
        const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
        analyticsModule.trackUserAction('language_changed', {
          context: 'integrated_review_panel',
          language: selectedLanguage
        }).catch(() => {});
      } catch (error) { /* silent */ }
      
      setLanguagePreference(selectedLanguage);
      dbgLog('Language preference updated to:', selectedLanguage);
    });
  }
  
  return container;
}

// Expose for other scripts that may call it
window.createIntegratedReviewPanel = createIntegratedReviewPanel;

/**
 * Applies platform-specific styling based on the current platform and theme
 * @param {HTMLElement} container - The review panel container
 */
function applyPlatformSpecificStyling(container) {
  // Detect if we're on Azure DevOps
  const isAzureDevOps = window.location.hostname.includes('dev.azure.com') || 
                       window.location.hostname.includes('visualstudio.com');
  
  if (isAzureDevOps) {
    dbgLog('Detected Azure DevOps platform, applying Azure DevOps styling');
    
    // Detect Azure DevOps theme
    const theme = detectAzureDevOpsTheme();
    dbgLog('Detected Azure DevOps theme:', theme);
    
    // Apply theme-specific styling
    const cardBody = container.querySelector('.thinkreview-card-body');
    if (cardBody) {
      switch (theme) {
        case 'dark':
          cardBody.style.backgroundColor = '#1e1e1e';
          cardBody.style.color = '#ffffff';
          break;
        case 'high-contrast':
          cardBody.style.backgroundColor = '#000000';
          cardBody.style.color = '#ffffff';
          break;
        case 'light':
        default:
          // Default to dark theme for better readability
          cardBody.style.backgroundColor = '#1e1e1e';
          cardBody.style.color = '#ffffff';
          break;
      }
      
      // Apply text color to child elements for better contrast
      const textElements = cardBody.querySelectorAll('h5, p, li');
      // Use CSS variable for consistency with stylesheet
      const textColor = getComputedStyle(document.documentElement).getPropertyValue('--thinkreview-text-secondary').trim() || '#e0e0e0';
      textElements.forEach(element => {
        // Default to dark theme colors for better readability
        element.style.color = textColor;
      });
    }
    
    // Add Azure DevOps specific class for additional styling
    container.classList.add('azure-devops-platform');
    
    // Add theme-specific class for CSS targeting
    container.classList.add(`${theme}-theme`);
    container.setAttribute('data-theme', theme);
  } else {
    dbgLog('Detected GitLab platform, using GitLab styling');
    container.classList.add('gitlab-platform');
  }
}

/**
 * Detects the current Azure DevOps theme
 * @returns {string} The detected theme ('light', 'dark', 'high-contrast')
 */
function detectAzureDevOpsTheme() {
  // Check for data-theme attribute on body
  const bodyTheme = document.body.getAttribute('data-theme');
  if (bodyTheme) {
    return bodyTheme;
  }
  
  // Check for theme-related classes on body or html
  const bodyClasses = document.body.className;
  const htmlClasses = document.documentElement.className;
  
  if (bodyClasses.includes('dark') || htmlClasses.includes('dark')) {
    return 'dark';
  }
  
  if (bodyClasses.includes('high-contrast') || htmlClasses.includes('high-contrast')) {
    return 'high-contrast';
  }
  
  // Check for Azure DevOps specific theme indicators
  const themeIndicator = document.querySelector('[data-theme], [class*="theme"], [class*="dark"], [class*="light"]');
  if (themeIndicator) {
    const classes = themeIndicator.className;
    if (classes.includes('dark')) return 'dark';
    if (classes.includes('high-contrast')) return 'high-contrast';
    if (classes.includes('light')) return 'light';
  }
  
  // Check computed styles for dark theme indicators
  const bodyStyles = getComputedStyle(document.body);
  const backgroundColor = bodyStyles.backgroundColor;
  
  // If background is very dark, assume dark theme
  if (backgroundColor && backgroundColor.includes('rgb(30, 30, 30)') || backgroundColor.includes('rgb(0, 0, 0)')) {
    return 'dark';
  }
  
  // Default to light theme
  return 'light';
}

/**
 * Initializes the resize handle functionality for the review panel
 * @param {HTMLElement} container - The review panel container
 */
function initializeResizeHandle(container) {
  const resizeHandle = container.querySelector('.thinkreview-resize-handle');
  if (!resizeHandle) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  
  // Load saved width from localStorage (only if not minimized)
  const savedWidth = localStorage.getItem('gitlab-mr-review-width');
  if (savedWidth && !container.classList.contains('minimized')) {
    container.style.width = savedWidth + 'px';
  }
  
  const doResize = (e) => {
    const deltaX = startX - e.clientX;
    const newWidth = Math.max(300, Math.min(800, startWidth + deltaX)); // Min 300px, Max 800px
    container.style.width = newWidth + 'px';
  };

  const stopResize = () => {
    if (!isResizing) return;
    isResizing = false;
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
    container.classList.remove('resizing');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    const currentWidth = parseInt(getComputedStyle(container).width, 10);
    localStorage.setItem('gitlab-mr-review-width', currentWidth);
  };

  const startResize = (e) => {
    if (container.classList.contains('minimized') || container.classList.contains('minimized-to-button')) {
      return;
    }
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(getComputedStyle(container).width, 10);
    container.classList.add('resizing');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
  };

  resizeHandle.addEventListener('mousedown', startResize);
  resizeHandle.addEventListener('dragstart', (e) => e.preventDefault());
}

/**
 * Displays code review results in the integrated panel
 * @param {Object} review - The review results from the API
 */
/**
 * Appends a message to the chat log.
 * @param {string} sender - 'user' or 'ai'.
 * @param {string} message - The message content (can be HTML or Markdown).
 * @param {string} [aiResponseText] - Optional raw AI response text for feedback tracking (conversations only).
 * @param {boolean} [isTypingIndicator=false] - If true, treat as typing indicator (no copy button). Use instead of parsing content.
 */
function appendToChatLog(sender, message, aiResponseText = null, isTypingIndicator = false) {
  const chatLog = document.getElementById('chat-log');
  if (!chatLog) return;

  const messageWrapper = document.createElement('div');
  messageWrapper.className = `chat-message-wrapper gl-display-flex ${sender === 'user' ? 'user-message' : 'ai-message'}`;
  
  // Store aiResponse text in data attribute for feedback tracking
  if (aiResponseText && sender === 'ai') {
    messageWrapper.setAttribute('data-ai-response', aiResponseText);
  }

  // Create wrapper for message bubble to support copy button
  const messageBubbleWrapper = document.createElement('div');
  messageBubbleWrapper.className = 'thinkreview-item-wrapper chat-message-bubble-wrapper';

  const messageBubble = document.createElement('div');
  messageBubble.className = `chat-message ${sender === 'user' ? 'user-message' : 'ai-message'}`;

  // Convert Markdown to HTML for AI messages, keep user messages as plain text
  const formattedMessage = sender === 'ai' ? markdownToHtml(preprocessAIResponse(message)) : message;
  messageBubble.innerHTML = formattedMessage;

  messageBubbleWrapper.appendChild(messageBubble);
  
  // Add copy button to message (skip for typing indicators)
  if (!isTypingIndicator && attachCopyButtonToItem) {
    attachCopyButtonToItem(messageBubble, messageBubbleWrapper);
  }

  messageWrapper.appendChild(messageBubbleWrapper);
  
  // Add feedback buttons for AI messages (Gemini-style, small and subtle)
  if (sender === 'ai' && aiResponseText) {
    const feedbackContainer = document.createElement('div');
    feedbackContainer.className = 'thinkreview-feedback-container thinkreview-conversation-feedback';
    feedbackContainer.innerHTML = `
      <div class="thinkreview-feedback-buttons">
        <button class="thinkreview-feedback-btn thinkreview-thumbs-up-btn" data-rating="thumbs_up" title="Helpful">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" fill="currentColor"/>
          </svg>
        </button>
        <button class="thinkreview-feedback-btn thinkreview-thumbs-down-btn" data-rating="thumbs_down" title="Not helpful">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    `;
    messageWrapper.appendChild(feedbackContainer);
    
    // Setup feedback button handlers for this message
    setupFeedbackButtons(feedbackContainer, aiResponseText, null);
  }
  
  chatLog.appendChild(messageWrapper);

  // Apply syntax highlighting within this message
  applySimpleSyntaxHighlighting(messageBubble);

  // Auto-scroll the main review scroll container to the bottom
  const reviewScrollContainer = document.getElementById('review-scroll-container');
  if (reviewScrollContainer) {
    reviewScrollContainer.scrollTo({
      top: reviewScrollContainer.scrollHeight,
      behavior: 'smooth'
    });
  }
}


/**
 * Creates and shows feedback popup for thumbs down
 * @param {string} aiResponse - AI response text (null for initial review)
 * @param {string} mrUrl - MR URL for querying code review (null for conversations)
 * @param {Function} onSubmit - Callback when feedback is submitted
 */
function showFeedbackPopup(aiResponse, mrUrl, onSubmit) {
  // Remove existing popup if any
  const existingPopup = document.getElementById('thinkreview-feedback-popup');
  if (existingPopup) {
    existingPopup.remove();
  }

  // Create popup overlay
  const overlay = document.createElement('div');
  overlay.id = 'thinkreview-feedback-popup-overlay';
  overlay.className = 'thinkreview-feedback-popup-overlay';
  
  // Create popup container
  const popup = document.createElement('div');
  popup.id = 'thinkreview-feedback-popup';
  popup.className = 'thinkreview-feedback-popup';
  
  popup.innerHTML = `
    <div class="thinkreview-feedback-popup-header">
      <h3>Help us improve</h3>
      <button class="thinkreview-feedback-popup-close" title="Close">×</button>
    </div>
    <div class="thinkreview-feedback-popup-body">
      <p>Please let us know what we can improve:</p>
      <textarea 
        id="thinkreview-feedback-textarea" 
        class="thinkreview-feedback-textarea" 
        placeholder="Your feedback helps us improve the quality of our reviews..."
        maxlength="1000"
      ></textarea>
      <div class="thinkreview-feedback-char-count">0/1000</div>
    </div>
    <div class="thinkreview-feedback-popup-footer">
      <button class="thinkreview-feedback-cancel-btn">Cancel</button>
      <button class="thinkreview-feedback-submit-btn">Submit</button>
    </div>
  `;
  
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  
  // Setup character counter
  const textarea = popup.querySelector('#thinkreview-feedback-textarea');
  const charCount = popup.querySelector('.thinkreview-feedback-char-count');
  
  const updateCharCount = () => {
    const length = textarea.value.length;
    charCount.textContent = `${length}/1000`;
    if (length > 900) {
      charCount.style.color = '#dc3545';
    } else if (length > 700) {
      charCount.style.color = '#ffc107';
    } else {
      charCount.style.color = '#6c757d';
    }
  };
  
  textarea.addEventListener('input', updateCharCount);
  
  // Close handlers
  const closePopup = () => {
    overlay.remove();
  };
  
  popup.querySelector('.thinkreview-feedback-popup-close').addEventListener('click', closePopup);
  popup.querySelector('.thinkreview-feedback-cancel-btn').addEventListener('click', closePopup);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closePopup();
    }
  });
  
  // Submit handler
  popup.querySelector('.thinkreview-feedback-submit-btn').addEventListener('click', () => {
    const feedbackText = textarea.value.trim();
    onSubmit(feedbackText);
    closePopup();
  });
  
  // Focus textarea
  setTimeout(() => textarea.focus(), 100);
}

/**
 * Sets up feedback button handlers
 * @param {HTMLElement} container - Container element with feedback buttons
 * @param {string} aiResponse - AI response text for querying conversation (null for initial review)
 * @param {string} mrUrl - MR URL for querying code review (null for conversations)
 */
function setupFeedbackButtons(container, aiResponse, mrUrl = null) {
  const thumbsUpBtn = container.querySelector('.thinkreview-thumbs-up-btn');
  const thumbsDownBtn = container.querySelector('.thinkreview-thumbs-down-btn');
  
  const setButtonSelected = (selectedBtn) => {
    // Remove selected state from both buttons
    thumbsUpBtn?.classList.remove('selected');
    thumbsDownBtn?.classList.remove('selected');
    
    // Add selected state to clicked button
    selectedBtn.classList.add('selected');
  };
  
  const handleFeedback = async (rating, clickedBtn) => {
    // Mark button as selected immediately for visual feedback
    setButtonSelected(clickedBtn);
    
    // Track feedback button click
    try {
      const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
      const feedbackType = mrUrl ? 'codereview' : 'conversation';
      analyticsModule.trackUserAction(rating === 'thumbs_up' ? 'thumbs_up_clicked' : 'thumbs_down_clicked', {
        context: feedbackType,
        location: 'integrated_panel'
      }).catch(() => {}); // Silently fail
    } catch (error) {
      // Silently fail - analytics shouldn't break the extension
    }
    
    // Get user email (fire-and-forget, don't block UI)
    chrome.storage.local.get(['userData'], (result) => {
      const userData = result.userData;
      
      if (!userData || !userData.email) {
        dbgWarn('User not logged in, cannot submit feedback');
        // Remove selection if user not logged in
        clickedBtn.classList.remove('selected');
        return;
      }
      
      let additionalFeedback = null;
      
      // Determine feedback type based on which parameter is provided
      const feedbackType = mrUrl ? 'codereview' : 'conversation';
      
      // If thumbs down, show popup for additional feedback
      if (rating === 'thumbs_down') {
        showFeedbackPopup(aiResponse, mrUrl, (feedbackText) => {
          additionalFeedback = feedbackText || null;
          // Fire-and-forget: submit feedback without blocking
          submitFeedback(userData.email, feedbackType, aiResponse, mrUrl, rating, additionalFeedback);
        });
      } else {
        // Thumbs up - submit directly (fire-and-forget)
        submitFeedback(userData.email, feedbackType, aiResponse, mrUrl, rating, additionalFeedback);
      }
    });
  };
  
  if (thumbsUpBtn) {
    thumbsUpBtn.addEventListener('click', () => {
      handleFeedback('thumbs_up', thumbsUpBtn);
    });
  }
  
  if (thumbsDownBtn) {
    thumbsDownBtn.addEventListener('click', () => {
      handleFeedback('thumbs_down', thumbsDownBtn);
    });
  }
}

/**
 * Submits feedback to cloud function (fire-and-forget)
 * @param {string} email - User email
 * @param {string} feedbackType - Document type: 'conversation' or 'codereview'
 * @param {string} aiResponse - AI response text for querying conversation (required for conversation type)
 * @param {string} mrUrl - MR URL for querying code review (required for codereview type)
 * @param {string} rating - 'thumbs_up' or 'thumbs_down'
 * @param {string} additionalFeedback - Additional feedback text (optional)
 */
function submitFeedback(email, feedbackType, aiResponse, mrUrl, rating, additionalFeedback) {
  // Log what we're sending for debugging
  dbgLog('Submitting feedback:', {
    hasEmail: !!email,
    feedbackType,
    hasAiResponse: !!aiResponse,
    hasMrUrl: !!mrUrl,
    rating
  });
  
  // Fire-and-forget: send message without waiting for response
  chrome.runtime.sendMessage(
    {
      type: 'SUBMIT_REVIEW_FEEDBACK',
      email,
      feedbackType: feedbackType,
      aiResponse,
      mrUrl,
      rating,
      additionalFeedback
    },
    (response) => {
      // Silently handle response (fire-and-forget)
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || 
                        (typeof chrome.runtime.lastError === 'string' ? chrome.runtime.lastError : JSON.stringify(chrome.runtime.lastError));
        dbgWarn('Error submitting feedback (fire-and-forget):', errorMsg);
        return;
      }
      
      if (response && response.success) {
        dbgLog('Feedback submitted successfully (fire-and-forget)');
      } else {
        const errorMsg = response?.error || 
                        (response?.message) ||
                        (typeof response === 'string' ? response : JSON.stringify(response));
        dbgWarn('Failed to submit feedback (fire-and-forget):', errorMsg);
      }
    }
  );
}

/**
 * Handles sending a user message.
 * @param {string} messageText - The text of the user's message.
 */
async function handleSendMessage(messageText) {
  appendToChatLog('user', messageText);
  conversationHistory.push({ role: 'user', content: messageText });

  const chatInput = document.getElementById('chat-input');
  const sendButton = document.getElementById('chat-send-btn');
  chatInput.disabled = true;
  sendButton.disabled = true;

  // Random thinking messages for better UX
  const thinkingMessages = [
    '🤔 Thinking about your question...',
    '💭 Analyzing the code context...',
    '✨ Crafting a helpful response...',
    '🔍 Reviewing the relevant details...',
    '🧠 Processing your request...',
    '⚡ Working on your answer...'
  ];
  const randomMessage = thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)];
  
  appendToChatLog('ai', `<span class="gl-spinner gl-spinner-sm"></span> ${randomMessage}`, null, true);

  try {
    // Get the user's language preference
    const language = getLanguagePreference();
    
    // The `getAIResponse` function will be exposed by content.js
    const aiResponse = await window.getAIResponse(currentPatchContent, conversationHistory, language);

    // Remove typing indicator
    const chatLog = document.getElementById('chat-log');
    const spinner = chatLog.querySelector('.gl-spinner');
    if (spinner) {
      // Find the chat-message-wrapper by traversing up the DOM tree
      let messageWrapper = spinner.closest('.chat-message-wrapper');
      if (messageWrapper && messageWrapper.parentNode === chatLog) {
        chatLog.removeChild(messageWrapper);
      } else if (messageWrapper) {
        // Fallback: if found but not direct child, try remove() which is safer
        messageWrapper.remove();
      }
    }

    // Extract the response text with fallback handling
    // Handle the nested response structure: { status: "success", review: { response: "..." } }
    const responseText = aiResponse.review?.response || aiResponse.response || aiResponse.content || aiResponse;
    // Log only metadata, not the actual response text
    dbgLog('Response text extracted:', {
      hasResponse: !!responseText,
      responseLength: responseText?.length || 0
    });
    
    // Store raw response text for feedback querying (use original response before markdown processing)
    const rawResponseText = responseText;

    // Ensure copy button utils are loaded so the response has a copy button (e.g. for Generate PR description)
    if (!attachCopyButtonToItem) {
      await initCopyButtonUtils();
    }
    appendToChatLog('ai', responseText, rawResponseText);
    conversationHistory.push({ role: 'model', content: responseText });

  } catch (error) {
    // Log error details for debugging, but don't show the full error to users
    // if (error.isRateLimit) {
    //   console.warn('Rate limit reached for conversational review:', {
    //     message: error.rateLimitMessage,
    //     retryAfter: error.retryAfter,
    //     minutes: Math.ceil((error.retryAfter || 900) / 60)
    //   });
    // } else {
    //   console.error('Error getting AI response:', error.message);
    // }
    
    // Remove typing indicator
    const chatLog = document.getElementById('chat-log');
    const spinner = chatLog.querySelector('.gl-spinner');
    if (spinner) {
      // Find the chat-message-wrapper by traversing up the DOM tree
      let messageWrapper = spinner.closest('.chat-message-wrapper');
      if (messageWrapper && messageWrapper.parentNode === chatLog) {
        chatLog.removeChild(messageWrapper);
      } else if (messageWrapper) {
        // Fallback: if found but not direct child, try remove() which is safer
        messageWrapper.remove();
      }
    }
    
    // Check if this is a rate limit error
    let errorMessage = 'Sorry, something went wrong. Please try again.';
    if (error.isRateLimit) {
      errorMessage = '🚫 Rate limit reached! You\'ve made too many requests in a short time. Please wait a few minutes before trying again. This helps us provide quality service to all users.';
    } else if (error.message && (error.message.includes('429') || error.message.includes('403'))) {
      // Fallback for errors that might not have the proper error properties
      if (error.message.includes('403')) {
        errorMessage = '🚫 Rate limit reached! You\'ve made too many requests in a short time. Please wait a few minutes before trying again. This helps us provide quality service to all users.';
      } else {
        errorMessage = 'Daily review limit exceeded. Please upgrade to continue.';
      }
    }
    
    appendToChatLog('ai', errorMessage);
  } finally {
    chatInput.disabled = false;
    sendButton.disabled = false;
    chatInput.focus();
  }
}

async function displayIntegratedReview(review, patchContent, patchSize = null, subscriptionType = null, modelUsed = null, isCached = false, provider = null, ollamaMeta = null) {
  // Ensure copy button utils are loaded
  if (!attachCopyButtonToItem) {
    await initCopyButtonUtils();
  }
  
  // Check if there was a JSON parsing error (safety check)
  if (review.parsingError === true) {
    dbgWarn('JSON parsing error detected in review object');
    const errorMessage = review.errorMessage 
      ? `Unable to parse AI response: ${review.errorMessage}. Please try regenerating the review.`
      : 'The AI generated a response that could not be parsed. Please try regenerating the review or report this issue at https://thinkreview.dev/bug-report';
    showIntegratedReviewError(errorMessage);
    return;
  }
  
  // Stop the enhanced loader
  stopEnhancedLoader();
  
  // Hide loading indicator on button when review completes
  try {
    const loadingModule = await import('./popup-modules/button-loading-indicator.js');
    loadingModule.hideButtonLoadingIndicator();
  } catch (error) {
    // Silently fail if module not available
    dbgWarn('Failed to hide loading indicator:', error);
  }

  const reviewLoading = document.getElementById('review-loading');
  const reviewContent = document.getElementById('review-content');
  const reviewError = document.getElementById('review-error');
  const tokenError = document.getElementById('review-azure-token-error');
  const loginPrompt = document.getElementById('review-login-prompt');

  // Static review elements
  const reviewSummary = document.getElementById('review-summary');
  const reviewSuggestions = document.getElementById('review-suggestions');
  const reviewSecurity = document.getElementById('review-security');
  const reviewPractices = document.getElementById('review-practices');
  const reviewMetricsContainer = document.getElementById('review-metrics-container');
  const patchSizeBanner = document.getElementById('review-patch-size-banner');

  // Hide loading indicator and other states, show the main content area
  reviewLoading.classList.add('gl-hidden');
  reviewError.classList.add('gl-hidden');
  if (tokenError) tokenError.classList.add('gl-hidden');
  if (loginPrompt) loginPrompt.classList.add('gl-hidden');
  reviewContent.classList.remove('gl-hidden');

  // Render patch size / metadata banner (Ollama-specific bar vs cloud bar)
  if (patchSizeBanner) {
    try {
      const metadataModule = await import('./review-metadata-bar.js');
      if (provider === 'ollama' && ollamaMeta) {
        metadataModule.renderOllamaMetadataBar(patchSizeBanner, ollamaMeta, {
          onSwitchToCloud() {
            document.dispatchEvent(new CustomEvent('thinkreview-switch-to-cloud'));
          },
          getModels() {
            return new Promise((resolve) => {
              chrome.runtime.sendMessage({ type: 'GET_OLLAMA_MODELS' }, (response) => {
                if (chrome.runtime.lastError || !response) {
                  resolve([]);
                  return;
                }
                resolve(response.models || []);
              });
            });
          },
          onModelChange(modelName) {
            document.dispatchEvent(new CustomEvent('thinkreview-ollama-model-changed', { detail: { model: modelName } }));
          }
        });
      } else {
        metadataModule.renderReviewMetadataBar(patchSizeBanner, patchSize, subscriptionType, modelUsed, isCached);
      }
    } catch (error) {
      dbgWarn('Failed to load review metadata bar:', error);
      patchSizeBanner.classList.add('gl-hidden');
    }
  }

  // Render quality scorecard if metrics are available
  if (reviewMetricsContainer) {
    // Clean up previous scorecard event listeners before clearing
    const previousScorecard = reviewMetricsContainer.querySelector('.thinkreview-quality-scorecard');
    if (previousScorecard && typeof previousScorecard._cleanupMetricListeners === 'function') {
      previousScorecard._cleanupMetricListeners();
    }
    
    reviewMetricsContainer.innerHTML = ''; // Clear previous content
    if (review.metrics) {
      try {
        const scorecardModule = await import('./quality-scorecard.js');
        
        // Define metric click handler
        const handleMetricClick = (metricName, score) => {
          // Map metric names to user-friendly labels
          const metricLabels = {
            'overall': 'Overall',
            'codeQuality': 'Code Quality',
            'security': 'Security',
            'bestPractices': 'Best Practices'
          };
          
          const metricLabel = metricLabels[metricName] || metricName;
          
          // Format the query asking about the score
          const query = `Why was the ${metricLabel} score ${score}? Can you explain what factors contributed to this score and provide specific recommendations on how to achieve a higher score?`;
          
          // Send the message to conversational review (scrolling is handled automatically by appendToChatLog)
          handleSendMessage(query);
        };
        
        const scorecardElement = scorecardModule.renderQualityScorecard(review.metrics, handleMetricClick);
        if (scorecardElement) {
          reviewMetricsContainer.appendChild(scorecardElement);
          reviewMetricsContainer.classList.remove('gl-hidden');
        } else {
          reviewMetricsContainer.classList.add('gl-hidden');
        }
      } catch (error) {
        dbgWarn('Failed to load quality scorecard component:', error);
        reviewMetricsContainer.classList.add('gl-hidden');
      }
    } else {
      reviewMetricsContainer.classList.add('gl-hidden');
    }
  }

  // Show score popup and notification indicator on AI Review button if panel is minimized
  const panel = document.getElementById('gitlab-mr-integrated-review');
  if (panel && panel.classList.contains('thinkreview-panel-minimized-to-button')) {
    // Show score popup if metrics are available
    if (review.metrics) {
      try {
        const scorePopupModule = await import('./popup-modules/score-popup.js');
        scorePopupModule.showScorePopupOnButton(review.metrics.overallScore);
      } catch (error) {
        dbgWarn('Failed to load score popup module:', error);
      }
    }
    
    // Show notification indicator
    try {
      const notificationModule = await import('./popup-modules/button-notification.js');
      notificationModule.showButtonNotification();
    } catch (error) {
      dbgWarn('Failed to load button notification module:', error);
    }
  }

  /**
   * Helper function to extract plain text from HTML content
   * @param {string} html - HTML string to extract text from
   * @returns {string} Plain text content
   */
  const extractPlainText = (html) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || '';
  };

  // Populate static review content
  const summaryHtml = markdownToHtml(preprocessAIResponse(review.summary || 'No summary provided.'));
  reviewSummary.innerHTML = summaryHtml;
  // Highlight code in summary
  applySimpleSyntaxHighlighting(reviewSummary);

  // Make the summary clickable
  reviewSummary.classList.add('thinkreview-clickable-item');
  reviewSummary.style.cursor = 'pointer';
  
  // Prevent clicks on nested links from triggering the summary click handler
  const summaryLinks = reviewSummary.querySelectorAll('a');
  summaryLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent the summary click handler from triggering
    });
  });
  
  // Add click handler for the summary
  reviewSummary.addEventListener('click', () => {
    // Extract plain text from the summary
    const summaryText = extractPlainText(summaryHtml).trim();
    
    // Format the query to ask for more details about the PR
    const query = `Can you provide more details about this PR Summary? ${summaryText}`;
    
    // Send the message to conversational review (scrolling is handled automatically by appendToChatLog)
    handleSendMessage(query);
  });

  // Add copy button to summary
  const summaryWrapper = reviewSummary.parentElement;
  if (summaryWrapper && summaryWrapper.classList.contains('thinkreview-item-wrapper') && attachCopyButtonToItem) {
    attachCopyButtonToItem(reviewSummary, summaryWrapper);
  }

  // Generate PR description button: send a dedicated prompt and show result in chat (attach once)
  const generatePrDescBtn = document.getElementById('generate-pr-description-btn');
  if (generatePrDescBtn && !generatePrDescBtn.dataset.prDescBound) {
    generatePrDescBtn.dataset.prDescBound = '1';
    generatePrDescBtn.addEventListener('click', async () => {
      // Track PR description generation
      try {
        const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
        analyticsModule.trackUserAction('generate_pr_description_clicked', {
          context: 'integrated_review_panel'
        }).catch(() => {});
      } catch (error) { /* silent */ }
      
      handleSendMessage('Write a concise PR/MR description suitable for the merge request description field. Output only the description text, ready to paste.');
    });
  }

  const populateList = (element, items, category) => {
    element.innerHTML = ''; // Clear previous items
    if (items && items.length > 0) {
      items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'thinkreview-list-item';
        
        // Create wrapper for content and copy button
        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'thinkreview-item-wrapper';
        
        // Create content div
        const contentDiv = document.createElement('div');
        contentDiv.className = 'thinkreview-item-content';
        // Parse markdown so code fences become <pre><code> blocks
        const itemHtml = markdownToHtml(preprocessAIResponse(String(item || '')));
        contentDiv.innerHTML = itemHtml;
        
        // Make the content clickable
        contentDiv.classList.add('thinkreview-clickable-item');
        contentDiv.style.cursor = 'pointer';
        
        // Add click handler for content
        contentDiv.addEventListener('click', async () => {
          // Track review item click
          try {
            const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
            analyticsModule.trackUserAction('review_item_clicked', {
              context: 'integrated_review_panel',
              category: category
            }).catch(() => {});
          } catch (error) { /* silent */ }
          
          // Extract plain text from the item
          const itemText = extractPlainText(itemHtml).trim();
          
          // Format the query based on category
          let query = '';
          if (category === 'suggestion') {
            query = `Can you provide more details about this suggestion? ${itemText}`;
          } else if (category === 'security') {
            query = `Can you provide more details about this security issue? ${itemText}`;
          } else if (category === 'practice') {
            query = `Can you provide more details about this best practice? ${itemText}`;
          } else {
            query = `Can you provide more details about this? ${itemText}`;
          }
          
          // Send the message to conversational review (scrolling is handled automatically by appendToChatLog)
          handleSendMessage(query);
        });
        
        // Append content to wrapper
        itemWrapper.appendChild(contentDiv);
        
        // Attach copy button to the wrapper
        if (attachCopyButtonToItem) {
          attachCopyButtonToItem(contentDiv, itemWrapper);
        }
        
        // Append wrapper to list item
        li.appendChild(itemWrapper);
        element.appendChild(li);
      });
      element.closest('.gl-mb-4').classList.remove('gl-hidden');
    } else {
      element.closest('.gl-mb-4').classList.add('gl-hidden');
    }
  };

  populateList(reviewSuggestions, review.suggestions, 'suggestion');
  populateList(reviewSecurity, review.securityIssues, 'security');
  populateList(reviewPractices, review.bestPractices, 'practice');
  // Highlight code within lists and entire scroll container
  const scrollContainer = document.getElementById('review-scroll-container');
  applySimpleSyntaxHighlighting(scrollContainer);

  // Populate suggested questions (limit to maximum 3 AI-generated + 1 static)
  const suggestedQuestionsContainer = document.getElementById('suggested-questions');
  if (suggestedQuestionsContainer) {
    suggestedQuestionsContainer.innerHTML = ''; // Clear previous questions
    
    // Add static question for generating MR comment
    // Full detailed prompt that will be sent when clicked
    const fullMRCommentPrompt = "Act as a senior software engineer reviewing this Pull Request. Provide a professional response ready to post. Address the author by name if it is available in the patch. Mention critical issues or actionable suggestions only if they are present; otherwise, provide a standard approval. Provide the comment text only, without preamble, emojis, or explanations.";
    // Shorter display text for the UI button
    const shortDisplayText = "Generate a comment I can post on this MR";
    
    const staticQuestionButton = document.createElement('button');
    staticQuestionButton.className = 'thinkreview-suggested-question-btn static-question';
    staticQuestionButton.setAttribute('data-question', fullMRCommentPrompt);
    staticQuestionButton.setAttribute('title', 'Click to generate a comment ready to post on this Merge Request');
    
    // Create button content wrapper
    const buttonContent = document.createElement('span');
    buttonContent.className = 'thinkreview-button-content';
    buttonContent.textContent = shortDisplayText;
    
    staticQuestionButton.appendChild(buttonContent);
    
    // Create "New Prompt" badge using the reusable module
    // Always await the cached promise to ensure deterministic badge creation
    (async () => {
      try {
        // Always await the promise to ensure the module is loaded before accessing createNewBadge
        const module = await badgeModulePromise;
        const badgeCreator = module?.createNewBadge || createNewBadge;
        
        // Create and append badge if module loaded successfully
        if (badgeCreator && !staticQuestionButton.querySelector('.thinkreview-new-badge')) {
          const newBadge = badgeCreator('New Prompt');
          staticQuestionButton.appendChild(newBadge);
        }
      } catch (error) {
        dbgWarn('Failed to load badge module for button:', error);
      }
    })();
    
    suggestedQuestionsContainer.appendChild(staticQuestionButton);
    
    // Add AI-generated questions (limit to maximum of 3)
    if (review.suggestedQuestions && review.suggestedQuestions.length > 0) {
      const questionsToShow = review.suggestedQuestions.slice(0, 3);
      questionsToShow.forEach((question, index) => {
        const questionButton = document.createElement('button');
        questionButton.className = 'thinkreview-suggested-question-btn';
        questionButton.textContent = question;
        questionButton.setAttribute('data-question', question);
        questionButton.setAttribute('title', 'Click to ask this question');
        suggestedQuestionsContainer.appendChild(questionButton);
      });
    }
    
    document.getElementById('suggested-questions-container').classList.remove('gl-hidden');
  }

  // Show initial review feedback buttons
  // Use mrUrl to query the review document
  const initialFeedbackContainer = document.getElementById('initial-review-feedback-container');
  if (initialFeedbackContainer) {
    // Get the full MR/PR URL
    const mrUrl = window.location.href;
    
    if (mrUrl) {
      initialFeedbackContainer.classList.remove('gl-hidden');
      // Pass mrUrl as the identifier (null for aiResponse)
      setupFeedbackButtons(initialFeedbackContainer, null, mrUrl);
    } else {
      dbgWarn('Cannot get mrUrl');
      initialFeedbackContainer.classList.add('gl-hidden');
    }
  }

  // Store patch content and initialize conversation history
  currentPatchContent = patchContent;
  const initialPrompt = `This is an AI code review. The summary is: "${review.summary}". I can answer questions about the suggestions, security issues, and best practices mentioned in the review. What would you like to know?`;
  
  // Initialize conversation history without the patch content
  // The patch is sent separately as patchContent, so we don't need it in the conversation history
  conversationHistory = [
    { role: 'user', content: 'Please perform a code review on the patch.' },
    { role: 'model', content: JSON.stringify(review) } // Store full review for context
  ];

  // Setup chat input
  let sendButton = document.getElementById('chat-send-btn');
  let chatInput = document.getElementById('chat-input');

  // Clone and replace nodes to clear any previous event listeners
  const newSendButton = sendButton.cloneNode(true);
  sendButton.parentNode.replaceChild(newSendButton, sendButton);
  sendButton = newSendButton;

  const newChatInput = chatInput.cloneNode(true);
  chatInput.parentNode.replaceChild(newChatInput, chatInput);
  chatInput = newChatInput;

  const sendMessage = async () => {
    const messageText = chatInput.value.trim();
    if (messageText !== '' && messageText.length <= 2000) {
      // Track chat message sent
      try {
        const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
        analyticsModule.trackUserAction('chat_message_sent', {
          context: 'integrated_review_panel',
          message_length: messageText.length
        }).catch(() => {});
      } catch (error) { /* silent */ }
      
      handleSendMessage(messageText);
      chatInput.value = '';
    } else if (messageText.length > 2000) {
      // Show a brief warning if message is too long
      const charCounter = document.getElementById('char-counter');
      const originalColor = charCounter.style.color;
      charCounter.style.color = '#dc3545';
      charCounter.textContent = 'Message too long!';
      setTimeout(() => {
        charCounter.style.color = originalColor;
        updateCharCounter();
      }, 2000);
    }
  };

  sendButton.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  // Character counter functionality
  const charCounter = document.getElementById('char-counter');
  const updateCharCounter = () => {
    const currentLength = chatInput.value.length;
    const maxLength = 2000;
    charCounter.textContent = `${currentLength}/${maxLength}`;
    
    // Change color based on character count
    if (currentLength > maxLength * 0.9) {
      charCounter.style.color = '#dc3545'; // Red when close to limit
    } else if (currentLength > maxLength * 0.7) {
      charCounter.style.color = '#ffc107'; // Yellow when getting close
    } else {
      charCounter.style.color = '#6c757d'; // Gray for normal
    }
  };

  // Debounce function to limit how often updateCharCounter runs
  // This prevents performance issues when typing quickly
  let charCounterTimeout = null;
  const debouncedUpdateCharCounter = () => {
    // Clear existing timeout
    if (charCounterTimeout) {
      clearTimeout(charCounterTimeout);
    }
    // Set new timeout - update after 150ms of no typing
    charCounterTimeout = setTimeout(updateCharCounter, 150);
  };

  // Update counter on input with debouncing for better performance
  chatInput.addEventListener('input', debouncedUpdateCharCounter);
  
  // Initial counter update
  updateCharCounter();

  // Add click handlers for suggested questions
  const suggestedQuestionButtons = document.querySelectorAll('.thinkreview-suggested-question-btn');
  suggestedQuestionButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const question = button.getAttribute('data-question');
      if (question) {
        // Track suggested question click
        try {
          const analyticsModule = await import(chrome.runtime.getURL('utils/analytics-service.js'));
          const isStaticQuestion = button.classList.contains('static-question');
          analyticsModule.trackUserAction('suggested_question_clicked', {
            context: 'integrated_review_panel',
            question_type: isStaticQuestion ? 'static' : 'dynamic'
          }).catch(() => {});
        } catch (error) { /* silent */ }
        
        // Set the question in the input field
        chatInput.value = question;
        updateCharCounter();
        
        // Automatically send the message (scrolling is handled automatically by appendToChatLog)
        sendMessage();
        
        // Optional: Remove the button after clicking to avoid duplicate questions
        button.style.opacity = '0.5';
        button.disabled = true;
      }
    });
  });

  // Check if we should show the review prompt
  setTimeout(async () => {
    if (reviewPrompt) {
      try {
        // Refresh user data from server before checking feedback prompt
        // This ensures we have the latest todayReviewCount and lastFeedbackPromptInteraction
        const refreshResponse = await chrome.runtime.sendMessage({ 
          type: 'REFRESH_USER_DATA_STORAGE' 
        });
        
        if (refreshResponse.status === 'success') {
          // Log only metadata, not full user data which may contain email
          dbgLog('User data refreshed before feedback check:', {
            hasEmail: !!refreshResponse.data?.email,
            todayReviewCount: refreshResponse.data?.todayReviewCount
          });
        } else {
          dbgWarn('Failed to refresh user data:', refreshResponse.error);
        }
        
        // Now check if we should show the prompt (with fresh data in storage)
        await reviewPrompt.checkAndShow();
      } catch (error) {
        // console.warn('Error checking review prompt:', error);
      }
    }
  }, 1000);
}

/**
 * Shows an error message in the integrated review panel
 * @param {string} message - The error message to display
 */
function showIntegratedReviewError(message) {
  // Hide loading indicator on button when error occurs
  (async () => {
    try {
      const loadingModule = await import('./popup-modules/button-loading-indicator.js');
      loadingModule.hideButtonLoadingIndicator();
    } catch (error) {
      // Silently fail if module not available
    }
  })();
  // Stop the enhanced loader
  stopEnhancedLoader();
  
  const reviewLoading = document.getElementById('review-loading');
  const reviewContent = document.getElementById('review-content');
  const reviewError = document.getElementById('review-error');
  const reviewErrorMessage = document.getElementById('review-error-message');
  const tokenError = document.getElementById('review-azure-token-error');
  const bitbucketTokenError = document.getElementById('review-bitbucket-token-error');
  const loginPrompt = document.getElementById('review-login-prompt');
  
  // Hide loading indicator and content
  reviewLoading.classList.add('gl-hidden');
  reviewContent.classList.add('gl-hidden');
  
  // Hide other error states
  if (tokenError) tokenError.classList.add('gl-hidden');
  if (bitbucketTokenError) bitbucketTokenError.classList.add('gl-hidden');
  if (loginPrompt) loginPrompt.classList.add('gl-hidden');
  
  // Display error message (message is already user-friendly from content.js)
  reviewErrorMessage.textContent = message || 'Failed to load code review.';
  reviewError.classList.remove('gl-hidden');
}

/**
 * Get the user's language preference from localStorage
 * @returns {string} - The language preference (defaults to "English")
 */
function getLanguagePreference() {
  const savedLanguage = localStorage.getItem('code-review-language');
  return savedLanguage || 'English';
}

/**
 * Set the user's language preference in localStorage
 * @param {string} language - The language to save
 */
function setLanguagePreference(language) {
  localStorage.setItem('code-review-language', language);
}
