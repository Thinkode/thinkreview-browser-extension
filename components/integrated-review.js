// integrated-review.js
// Component for displaying code review results directly in GitLab MR page

console.log('[GitLab MR Reviews] Integrated review component loaded');

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

// Formatting utils
let markdownToHtml = null;
let preprocessAIResponse = null;
let applySimpleSyntaxHighlighting = null;
let setupCopyHandler = null;

async function initFormattingUtils() {
  try {
    const module = await import('./utils/formatting.js');
    markdownToHtml = module.markdownToHtml;
    preprocessAIResponse = module.preprocessAIResponse;
    applySimpleSyntaxHighlighting = module.applySimpleSyntaxHighlighting;
    setupCopyHandler = module.setupCopyHandler;
    setupCopyHandler();
    console.log('[IntegratedReview] Formatting utils loaded');
  } catch (e) {
    console.warn('[IntegratedReview] Failed to load formatting utils', e);
  }
}

initFormattingUtils();

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
    console.log('[IntegratedReview] Review prompt component initialized with daily threshold of 5');
  } catch (error) {
    console.warn('[IntegratedReview] Failed to initialize review prompt component:', error);
  }
}

// Initialize the review prompt component
initReviewPromptComponent();

// Conversation history
let conversationHistory = [];
let currentPatchContent = '';

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
 * @returns {HTMLElement} - The injected review panel element
 */
function createIntegratedReviewPanel(patchUrl) {
  // Create the container for the review panel
  const container = document.createElement('div');
  container.id = 'gitlab-mr-integrated-review';
  container.className = 'thinkreview-panel-container thinkreview-panel-minimized-to-button';
  
  // Create the panel with unique styling classes to prevent theme conflicts
  container.innerHTML = `
    <div class="thinkreview-card gl-border-1 gl-border-gray-100">
      <div class="thinkreview-card-header gl-display-flex gl-justify-content-space-between gl-align-items-center">
        <div class="gl-display-flex gl-align-items-center thinkreview-card-title">
          <span class="gl-font-weight-bold">AI Code Review</span>
          <span class="thinkreview-toggle-icon gl-ml-2" title="Minimize">▲</span>
        </div>
        <div class="thinkreview-header-actions">
          <button id="regenerate-review-btn" class="thinkreview-regenerate-btn" title="Regenerate review">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.65 2.35C12.2 0.9 10.21 0 8 0C3.58 0 0.01 3.58 0.01 8C0.01 12.42 3.58 16 8 16C11.73 16 14.84 13.45 15.73 10H13.65C12.83 12.33 10.61 14 8 14C4.69 14 2 11.31 2 8C2 4.69 4.69 2 8 2C9.66 2 11.14 2.69 12.22 3.78L9 7H16V0L13.65 2.35Z" fill="currentColor"/>
            </svg>
          </button>
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
            <option value="Hungarian">Magyar</option>
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
            <div id="review-metrics-container" class="gl-mb-4"></div>
            <div id="review-summary-container" class="gl-mb-4">
              <h5 class="gl-font-weight-bold thinkreview-section-title">Summary</h5>
              <p id="review-summary" class="thinkreview-section-content"></p>
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
    bugReportButton.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering the header click event
      console.log('[IntegratedReview] Bug report button clicked');
      window.open('https://thinkreview.dev/bug-report', '_blank');
    });
  }
  
  // Add event listener for the regenerate review button
  const regenerateButton = document.getElementById('regenerate-review-btn');
  if (regenerateButton) {
    regenerateButton.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent triggering the header click event
      console.log('[IntegratedReview] Regenerate review button clicked');
      
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
        console.error('[IntegratedReview] fetchAndDisplayCodeReview function not found');
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
    languageSelector.addEventListener('change', (e) => {
      e.stopPropagation(); // Prevent triggering the header click event
      const selectedLanguage = e.target.value;
      setLanguagePreference(selectedLanguage);
      console.log('[IntegratedReview] Language preference updated to:', selectedLanguage);
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
    console.log('[IntegratedReview] Detected Azure DevOps platform, applying Azure DevOps styling');
    
    // Detect Azure DevOps theme
    const theme = detectAzureDevOpsTheme();
    console.log('[IntegratedReview] Detected Azure DevOps theme:', theme);
    
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
      textElements.forEach(element => {
        // Default to dark theme colors for better readability
        element.style.color = '#e0e0e0';
      });
    }
    
    // Add Azure DevOps specific class for additional styling
    container.classList.add('azure-devops-platform');
    
    // Add theme-specific class for CSS targeting
    container.classList.add(`${theme}-theme`);
    container.setAttribute('data-theme', theme);
  } else {
    console.log('[IntegratedReview] Detected GitLab platform, using GitLab styling');
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
  
  const startResize = (e) => {
    // Don't allow resizing when minimized
    if (container.classList.contains('minimized') || container.classList.contains('minimized-to-button')) {
      return;
    }
    
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(getComputedStyle(container).width, 10);
    
    // Add resizing class for visual feedback
    container.classList.add('resizing');
    
    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    
    e.preventDefault();
  };
  
  const doResize = (e) => {
    if (!isResizing) return;
    
    const deltaX = startX - e.clientX;
    const newWidth = Math.max(300, Math.min(800, startWidth + deltaX)); // Min 300px, Max 800px
    
    container.style.width = newWidth + 'px';
  };
  
  const stopResize = () => {
    if (!isResizing) return;
    
    isResizing = false;
    container.classList.remove('resizing');
    
    // Restore normal cursor and text selection
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    
    // Save the new width to localStorage
    const currentWidth = parseInt(getComputedStyle(container).width, 10);
    localStorage.setItem('gitlab-mr-review-width', currentWidth);
  };
  
  // Add event listeners
  resizeHandle.addEventListener('mousedown', startResize);
  document.addEventListener('mousemove', doResize);
  document.addEventListener('mouseup', stopResize);
  
  // Prevent drag ghost image
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
 */
function appendToChatLog(sender, message) {
  const chatLog = document.getElementById('chat-log');
  if (!chatLog) return;

  const messageWrapper = document.createElement('div');
  messageWrapper.className = `chat-message-wrapper gl-display-flex ${sender === 'user' ? 'user-message' : 'ai-message'}`;

  const messageBubble = document.createElement('div');
  messageBubble.className = `chat-message ${sender === 'user' ? 'user-message' : 'ai-message'}`;

  // Convert Markdown to HTML for AI messages, keep user messages as plain text
  const formattedMessage = sender === 'ai' ? markdownToHtml(preprocessAIResponse(message)) : message;
  messageBubble.innerHTML = formattedMessage;

  messageWrapper.appendChild(messageBubble);
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
  
  appendToChatLog('ai', `<span class="gl-spinner gl-spinner-sm"></span> ${randomMessage}`);

  try {
    // Get the user's language preference
    const language = getLanguagePreference();
    
    // The `getAIResponse` function will be exposed by content.js
    const aiResponse = await window.getAIResponse(currentPatchContent, conversationHistory, language);

    // Remove typing indicator
    const chatLog = document.getElementById('chat-log');
    const typingIndicator = chatLog.querySelector('.gl-spinner')?.parentNode.parentNode;
    if (typingIndicator) {
      chatLog.removeChild(typingIndicator);
    }

    // Extract the response text with fallback handling
    // Handle the nested response structure: { status: "success", review: { response: "..." } }
    const responseText = aiResponse.review?.response || aiResponse.response || aiResponse.content || aiResponse;
    console.log('[IntegratedReview] Response text to display:', responseText);
    
    appendToChatLog('ai', responseText);
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
    
    const chatLog = document.getElementById('chat-log');
    const typingIndicator = chatLog.querySelector('.gl-spinner')?.parentNode.parentNode;
    if (typingIndicator) {
      chatLog.removeChild(typingIndicator);
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

async function displayIntegratedReview(review, patchContent) {
  // Stop the enhanced loader
  stopEnhancedLoader();
  
  // Hide loading indicator on button when review completes
  try {
    const loadingModule = await import('./popup-modules/button-loading-indicator.js');
    loadingModule.hideButtonLoadingIndicator();
  } catch (error) {
    // Silently fail if module not available
    console.warn('[IntegratedReview] Failed to hide loading indicator:', error);
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

  // Hide loading indicator and other states, show the main content area
  reviewLoading.classList.add('gl-hidden');
  reviewError.classList.add('gl-hidden');
  if (tokenError) tokenError.classList.add('gl-hidden');
  if (loginPrompt) loginPrompt.classList.add('gl-hidden');
  reviewContent.classList.remove('gl-hidden');

  // Render quality scorecard if metrics are available
  if (reviewMetricsContainer) {
    reviewMetricsContainer.innerHTML = ''; // Clear previous content
    if (review.metrics) {
      try {
        const scorecardModule = await import('./quality-scorecard.js');
        const scorecardElement = scorecardModule.renderQualityScorecard(review.metrics);
        if (scorecardElement) {
          reviewMetricsContainer.appendChild(scorecardElement);
          reviewMetricsContainer.classList.remove('gl-hidden');
        } else {
          reviewMetricsContainer.classList.add('gl-hidden');
        }
      } catch (error) {
        console.warn('[IntegratedReview] Failed to load quality scorecard component:', error);
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
        console.warn('[IntegratedReview] Failed to load score popup module:', error);
      }
    }
    
    // Show notification indicator
    try {
      const notificationModule = await import('./popup-modules/button-notification.js');
      notificationModule.showButtonNotification();
    } catch (error) {
      console.warn('[IntegratedReview] Failed to load button notification module:', error);
    }
  }

  // Populate static review content
  reviewSummary.innerHTML = markdownToHtml(preprocessAIResponse(review.summary || 'No summary provided.'));
  // Highlight code in summary
  applySimpleSyntaxHighlighting(reviewSummary);

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

  /**
   * Scrolls to the chat log area smoothly
   */
  const scrollToChatArea = () => {
    const chatLog = document.getElementById('chat-log');
    const reviewScrollContainer = document.getElementById('review-scroll-container');
    if (chatLog && reviewScrollContainer) {
      // Scroll to the chat log element
      setTimeout(() => {
        chatLog.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Also ensure the scroll container scrolls to bottom
        reviewScrollContainer.scrollTo({
          top: reviewScrollContainer.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  };

  const populateList = (element, items, category) => {
    element.innerHTML = ''; // Clear previous items
    if (items && items.length > 0) {
      items.forEach(item => {
        const li = document.createElement('li');
        // Parse markdown so code fences become <pre><code> blocks
        const itemHtml = markdownToHtml(preprocessAIResponse(String(item || '')));
        li.innerHTML = itemHtml;
        
        // Make the item clickable
        li.classList.add('thinkreview-clickable-item');
        li.style.cursor = 'pointer';
        
        // Add click handler
        li.addEventListener('click', async () => {
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
          
          // Send the message to conversational review (it already handles scrolling via appendToChatLog)
          // But we'll also scroll to ensure visibility
          handleSendMessage(query);
          
          // Scroll to chat area after a short delay to ensure message is appended
          setTimeout(() => {
            scrollToChatArea();
          }, 200);
        });
        
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
    const staticQuestion = "Generate a detailed comment I can post on this Merge Request";
    const staticQuestionButton = document.createElement('button');
    staticQuestionButton.className = 'thinkreview-suggested-question-btn static-question';
    staticQuestionButton.textContent = staticQuestion;
    staticQuestionButton.setAttribute('data-question', staticQuestion);
    staticQuestionButton.setAttribute('title', 'Click to get a suggested MR comment');
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

  const sendMessage = () => {
    const messageText = chatInput.value.trim();
    if (messageText !== '' && messageText.length <= 2000) {
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

  // Update counter on input
  chatInput.addEventListener('input', updateCharCounter);
  
  // Initial counter update
  updateCharCounter();

  // Add click handlers for suggested questions
  const suggestedQuestionButtons = document.querySelectorAll('.thinkreview-suggested-question-btn');
  suggestedQuestionButtons.forEach(button => {
    button.addEventListener('click', () => {
      const question = button.getAttribute('data-question');
      if (question) {
        // Set the question in the input field
        chatInput.value = question;
        updateCharCounter();
        
        // Automatically send the message
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
          console.log('[IntegratedReview] User data refreshed before feedback check:', refreshResponse.data);
        } else {
          console.warn('[IntegratedReview] Failed to refresh user data:', refreshResponse.error);
        }
        
        // Now check if we should show the prompt (with fresh data in storage)
        await reviewPrompt.checkAndShow();
      } catch (error) {
        // console.warn('[IntegratedReview] Error checking review prompt:', error);
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
  const loginPrompt = document.getElementById('review-login-prompt');
  
  // Hide loading indicator and content
  reviewLoading.classList.add('gl-hidden');
  reviewContent.classList.add('gl-hidden');
  
  // Hide other error states
  if (tokenError) tokenError.classList.add('gl-hidden');
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
