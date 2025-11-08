// error-reporter.js
// Modular error reporting service for debugging detection issues across different GitLab versions
// This collects comprehensive environment data and sends it to cloud function for analysis

// Debug toggle
const DEBUG = true;
function dbgLog(...args) { if (DEBUG) console.log('[Error Reporter]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[Error Reporter]', ...args); }

/**
 * Error Reporter Service
 * Collects and reports detection issues to cloud function for debugging
 */
class ErrorReporter {
  constructor() {
    this.isInitialized = false;
    this.platformDetector = null;
  }

  /**
   * Initialize the error reporter with platform detector reference
   * @param {Object} platformDetectorInstance - Reference to platform detector
   */
  init(platformDetectorInstance) {
    this.platformDetector = platformDetectorInstance;
    this.isInitialized = true;
    dbgLog('Error reporter initialized');
  }

  /**
   * Helper function to safely check if DOM element exists
   * @param {string} selector - CSS selector
   * @returns {boolean|null} True if exists, false if not, null if error
   */
  elementExists(selector) {
    try {
      return !!document.querySelector(selector);
    } catch {
      return null;
    }
  }

  /**
   * Helper to safely get element's dataset
   * @param {string} selector - CSS selector
   * @returns {Object|null} Dataset object or null
   */
  getElementDataset(selector) {
    try {
      const element = document.querySelector(selector);
      return element?.dataset ? Object.assign({}, element.dataset) : null;
    } catch {
      return null;
    }
  }

  /**
   * Helper to get array of script src URLs
   * @param {string} filter - Optional filter string
   * @param {number} limit - Max number of URLs to return
   * @returns {Array} Array of script URLs
   */
  getScriptSources(filter = '', limit = 10) {
    try {
      return Array.from(document.querySelectorAll('script[src]'))
        .map(s => s.src)
        .filter(src => !filter || src.includes(filter))
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Helper to get array of stylesheet href URLs
   * @param {string} filter - Optional filter string
   * @param {number} limit - Max number of URLs to return
   * @returns {Array} Array of stylesheet URLs
   */
  getStylesheetHrefs(filter = '', limit = 5) {
    try {
      return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map(l => l.href)
        .filter(href => !filter || href.includes(filter))
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Helper function to safely get meta tag content
   * @param {string} name - Meta tag name attribute
   * @param {string} property - Meta tag property attribute
   * @returns {string|null} Meta tag content or null
   */
  getMetaContent(name, property) {
    try {
      if (name) {
        return document.querySelector(`meta[name="${name}"]`)?.content ?? null;
      }
      if (property) {
        return document.querySelector(`meta[property="${property}"]`)?.content ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Helper to safely extract MR ID
   * @returns {string|null} MR ID or null
   */
  safeMRId() {
    try {
      // Try to extract from pathname
      const pathParts = window.location.pathname.split('/');
      const mrIndex = pathParts.indexOf('merge_requests');
      
      if (mrIndex !== -1 && mrIndex + 1 < pathParts.length) {
        return pathParts[mrIndex + 1];
      }
      
      const matches = window.location.pathname.match(/\/merge_requests\/(\d+)/);
      return matches && matches[1] ? matches[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Helper to safely get platform detector info
   * @returns {Object|null} Platform detector state or null
   */
  getPlatformDetectorInfo() {
    try {
      if (!this.platformDetector) return null;
      
      return {
        isInitialized: this.platformDetector.isInitialized ?? null,
        currentPlatform: this.platformDetector.getCurrentPlatform?.() ?? null,
        detectionResult: this.platformDetector.detectPlatform?.() ?? null,
        isCurrentPageSupported: this.platformDetector.isCurrentPageSupported?.() ?? null,
        isAzureDevOpsSite: this.platformDetector.isAzureDevOpsSite?.() ?? null
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Helper to get custom domains from storage
   * @returns {Promise<Array>} Array of custom domains
   */
  async getCustomDomains() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['gitlabDomains'], (result) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(result.gitlabDomains ?? []);
          }
        });
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Collect comprehensive debug information about the current page
   * @param {string} issueType - Type of issue (e.g., 'detection_failure', 'platform_init_error')
   * @param {string} errorMessage - Human-readable error message
   * @param {Object} additionalData - Any additional context-specific data
   * @returns {Promise<Object>} Debug information object
   */
  async collectDebugInfo(issueType, errorMessage, additionalData = {}) {
    try {
      dbgLog('Collecting debug info for:', issueType);

      // Collect all data with defensive coding
      const debugInfo = {
        // Timestamp & Basic Info
        timestamp: Date.now(),
        issueType: issueType ?? 'unknown',
        errorMessage: errorMessage ?? 'No error message provided',
        
        // URL Information (usually always available)
        url: {
          full: window.location?.href ?? null,
          protocol: window.location?.protocol ?? null,
          hostname: window.location?.hostname ?? null,
          port: window.location?.port ?? null,
          pathname: window.location?.pathname ?? null,
          search: window.location?.search ?? null,
          hash: window.location?.hash ?? null
        },
        
        // Path Analysis - Critical for debugging different GitLab URL patterns
        pathAnalysis: {
          hasSlashMergeRequestsSlash: window.location?.pathname?.includes('/merge_requests/') ?? null,
          hasSlashMergeRequests: window.location?.pathname?.includes('/merge_requests') ?? null,
          hasDashSlashMergeRequests: window.location?.pathname?.includes('/-/merge_requests') ?? null,
          pathParts: window.location?.pathname?.split('/') ?? [],
          mrIdFromPath: this.safeMRId()
        },
        
        // DOM Detection Results - Shows which elements are present
        domElements: {
          hasMergeRequest: this.elementExists('.merge-request'),
          hasMergeRequestDetails: this.elementExists('.merge-request-details'),
          hasDiffFilesHolder: this.elementExists('.diff-files-holder'),
          hasDiffs: this.elementExists('.diffs'),
          hasMrStateWidget: this.elementExists('.mr-state-widget'),
          hasNavbarGitlab: this.elementExists('.navbar-gitlab'),
          hasGitlabLogo: this.elementExists('.gitlab-logo'),
          hasGlLogo: this.elementExists('.gl-logo'),
          hasGitlabTestId: this.elementExists('[data-testid="gitlab-logo"]'),
          // Extended detection for different GitLab versions
          hasMergeRequestContainer: this.elementExists('.merge-request-container'),
          hasMrWidget: this.elementExists('.mr-widget'),
          hasMrWidgetHeader: this.elementExists('.mr-widget-header'),
          hasMrTabs: this.elementExists('.merge-request-tabs'),
          hasNavTabs: this.elementExists('.nav-tabs'),
          hasChangesTab: this.elementExists('[data-testid="changes-tab"]'),
          hasDiffTab: this.elementExists('.diff-tab'),
          // Vue-based UI indicators (newer GitLab)
          hasVueComponents: this.elementExists('[data-v-]'),
          hasVueApp: this.elementExists('#js-vue-mr-discussions, [data-qa-selector="merge_request_container"]')
        },
        
        // Platform Detector State
        platformDetector: this.getPlatformDetectorInfo(),
        
        // Document Metadata
        document: {
          title: document?.title ?? null,
          charset: document?.characterSet ?? null,
          referrer: document?.referrer ?? null,
          readyState: document?.readyState ?? null
        },
        
        // Meta Tags - Can contain GitLab version info
        metaTags: {
          generator: this.getMetaContent('generator', null),
          description: this.getMetaContent('description', null),
          ogSiteName: this.getMetaContent(null, 'og:site_name')
        },
        
        // Custom Domain Configuration (async - awaited)
        customDomains: await this.getCustomDomains(),
        
        // Extension State
        extensionInfo: {
          version: chrome.runtime?.getManifest?.()?.version ?? null,
          contentScriptLoaded: true,
          debugMode: typeof DEBUG !== 'undefined' ? DEBUG : null
        },
        
        // Browser Info
        browserInfo: {
          userAgent: navigator?.userAgent ?? null,
          language: navigator?.language ?? null,
          platform: navigator?.platform ?? null
        },

        // GitLab JavaScript Globals (window.gon) - Often contains exact version
        gitlabGlobals: {
          gonExists: typeof window.gon !== 'undefined',
          gitlabVersion: window.gon?.gitlab_version ?? null,
          apiVersion: window.gon?.api_version ?? null,
          relativeUrlRoot: window.gon?.relative_url_root ?? null,
          gitlabUrl: window.gon?.gitlab_url ?? null,
          features: window.gon?.features ?? null,
          currentUserId: window.gon?.current_user_id ?? null
        },

        // Body Classes - Indicates UI framework version
        bodyClasses: {
          classList: (() => {
            try {
              return Array.from(document.body?.classList ?? []);
            } catch {
              return [];
            }
          })(),
          hasGlPage: document.body?.classList?.contains('gl-page') ?? null,
          hasUiIndigo: document.body?.classList?.contains('ui-indigo') ?? null,
          hasNavSidebar: document.body?.classList?.contains('nav-sidebar') ?? null,
          dataPage: document.body?.getAttribute('data-page') ?? null,
          dataProject: document.body?.getAttribute('data-project') ?? null
        },

        // Data Attributes - MR ID and project context
        dataAttributes: {
          appData: this.getElementDataset('#content-body, .content-wrapper'),
          mrData: this.getElementDataset('[data-mr-id], [data-merge-request-id]'),
          projectData: this.getElementDataset('[data-project-id]')
        },

        // Loaded Scripts - Version in asset filenames
        loadedScripts: {
          gitlabScripts: this.getScriptSources('gitlab', 10),
          hasWebpackChunks: !!document.querySelector('script[src*="webpack"]'),
          totalScriptCount: (() => {
            try {
              return document.querySelectorAll('script').length;
            } catch {
              return null;
            }
          })()
        },

        // Loaded Styles - CSS framework version
        loadedStyles: {
          gitlabStylesheets: this.getStylesheetHrefs('gitlab', 5),
          hasGitlabUI: !!document.querySelector('link[href*="gitlab-ui"]')
        },

        // Timing Information - Understand SPA behavior
        timing: {
          performanceNow: performance?.now() ?? null,
          domContentLoadedFired: document.readyState === 'complete' || document.readyState === 'interactive',
          navigationStart: performance?.timing?.navigationStart ?? null,
          domLoading: performance?.timing?.domLoading ?? null,
          domInteractive: performance?.timing?.domInteractive ?? null,
          timeSinceLoad: (() => {
            try {
              return performance?.timing?.navigationStart 
                ? Date.now() - performance.timing.navigationStart 
                : null;
            } catch {
              return null;
            }
          })()
        },

        // Viewport & Visibility - Responsive design issues
        viewport: {
          width: window.innerWidth ?? null,
          height: window.innerHeight ?? null,
          devicePixelRatio: window.devicePixelRatio ?? null,
          documentVisible: document.visibilityState === 'visible',
          documentHidden: document.hidden ?? null
        },

        // Additional context-specific data
        additionalData: additionalData ?? {}
      };
      
      dbgLog('Debug info collected successfully');
      return debugInfo;
      
    } catch (error) {
      // If the entire collection fails, return minimal info
      dbgWarn('Failed to collect debug info:', error);
      return {
        timestamp: Date.now(),
        issueType: issueType ?? 'unknown',
        errorMessage: errorMessage ?? 'No error message',
        collectionError: error.message,
        url: {
          full: window.location?.href ?? 'unknown'
        },
        additionalData: additionalData ?? {}
      };
    }
  }

  /**
   * Check if user should report errors (only if reviewCount is 0 or doesn't exist)
   * @returns {Promise<boolean>} True if should report, false otherwise
   */
  async shouldReportErrors() {
    try {
      const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['userData', 'user', 'todayReviewCount'], (result) => {
          if (chrome.runtime.lastError) {
            resolve({});
          } else {
            resolve(result);
          }
        });
      });

      // Try to get reviewCount from userData
      let reviewCount = null;
      
      if (storageData.userData?.reviewCount !== undefined) {
        reviewCount = storageData.userData.reviewCount;
      } else if (storageData.user) {
        // Try parsing user field
        try {
          const parsedUser = JSON.parse(storageData.user);
          if (parsedUser?.reviewCount !== undefined) {
            reviewCount = parsedUser.reviewCount;
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Also check todayReviewCount as a fallback
      if (reviewCount === null && storageData.todayReviewCount !== undefined) {
        reviewCount = storageData.todayReviewCount;
      }

      // Report only if reviewCount is 0, null, or undefined
      const shouldReport = reviewCount === 0 || reviewCount === null || reviewCount === undefined;
      
      dbgLog('Error reporting check:', {
        reviewCount,
        shouldReport,
        hasUserData: !!storageData.userData,
        hasTodayReviewCount: storageData.todayReviewCount !== undefined
      });

      return shouldReport;
      
    } catch (error) {
      dbgWarn('Error checking if should report:', error);
      // If check fails, don't report to be safe
      return false;
    }
  }

  /**
   * Report a detection issue to the cloud function
   * Only reports if user has 0 reviews or reviewCount doesn't exist
   * @param {string} issueType - Type of issue
   * @param {string} errorMessage - Error message
   * @param {Object} additionalData - Additional context
   * @returns {Promise<void>}
   */
  async reportIssue(issueType, errorMessage, additionalData = {}) {
    try {
      dbgLog('Reporting issue:', issueType);
      
      // Check if user should report errors
      const shouldReport = await this.shouldReportErrors();
      if (!shouldReport) {
        dbgLog('Skipping error report: user has reviewCount > 0');
        return Promise.resolve();
      }
      
      // Collect debug info
      const debugInfo = await this.collectDebugInfo(issueType, errorMessage, additionalData);
      
      // Send to background script which will forward to cloud function
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'LOG_DETECTION_ISSUE',
          data: debugInfo
        }, (response) => {
          if (chrome.runtime.lastError) {
            dbgWarn('Failed to send detection issue:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else if (response?.success) {
            dbgLog('Detection issue logged successfully');
            resolve(response);
          } else {
            dbgWarn('Failed to log detection issue:', response?.error);
            reject(new Error(response?.error || 'Unknown error'));
          }
        });
      });
      
    } catch (error) {
      dbgWarn('Error reporting issue:', error);
      // Don't throw - we don't want error reporting to break the extension
      return Promise.resolve();
    }
  }
}

// Create and export a singleton instance
export const errorReporter = new ErrorReporter();

