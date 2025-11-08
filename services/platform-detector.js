// platform-detector.js
// Unified platform detector for GitLab and Azure DevOps

// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[Platform Detector]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[Platform Detector]', ...args); }

import { azureDevOpsDetector } from './azure-devops-detector.js';
import { errorReporter } from './error-reporter.js';

/**
 * Platform Detector Service
 * Detects whether the current page is GitLab MR or Azure DevOps PR
 */
export class PlatformDetector {
  constructor() {
    this.isInitialized = false;
    this.currentPlatform = null;
    this.currentPageInfo = null;
  }

  /**
   * Initialize the detector
   */
  init() {
    if (this.isInitialized) return;
    
    dbgLog('Initializing platform detector');
    this.isInitialized = true;
  }

  /**
   * Detect the current platform and page type
   * @returns {Object} Platform detection result
   */
  detectPlatform() {
    const result = {
      platform: null,
      pageType: null,
      isSupported: false,
      pageInfo: null
    };

    // Check for Azure DevOps first
    if (azureDevOpsDetector.isAzureDevOpsPRPage()) {
      result.platform = 'azure-devops';
      result.pageType = 'pull-request';
      result.isSupported = true;
      result.pageInfo = azureDevOpsDetector.extractPRInfo();
      
      dbgLog('Detected Azure DevOps pull request page:', result.pageInfo);
      return result;
    }

    // Check for GitLab
    if (this.isGitLabMRPage()) {
      result.platform = 'gitlab';
      result.pageType = 'merge-request';
      result.isSupported = true;
      result.pageInfo = this.extractGitLabMRInfo();
      
      dbgLog('Detected GitLab merge request page:', result.pageInfo);
      return result;
    }

    dbgLog('No supported platform detected');
    return result;
  }

  /**
   * Check if the current page is a GitLab merge request page
   * @returns {boolean} True if the current page is a GitLab MR page
   */
  isGitLabMRPage() {
    const url = window.location.href;
    const hostname = window.location.hostname;
    
    // Check if we're on GitLab domains
    const isGitLabDomain = hostname.includes('gitlab.com') || 
                          hostname.includes('gitlab.io') ||
                          this.isCustomGitLabDomain();
    
    if (!isGitLabDomain) {
      return false;
    }
    
    // Check if URL contains merge request path patterns
    const isMRPath = url.includes('/merge_requests/');
    
    // Check for GitLab specific elements
    const hasGitLabElements = !!(
      document.querySelector('.merge-request') || 
      document.querySelector('.merge-request-details') ||
      document.querySelector('.diff-files-holder') ||
      document.querySelector('.diffs') ||
      document.querySelector('.mr-state-widget')
    );
    
    return isMRPath && hasGitLabElements;
  }

  /**
   * Check if current domain is a custom GitLab domain
   * @returns {boolean} True if it's a custom GitLab domain
   */
  isCustomGitLabDomain() {
    // This would need to check against stored custom domains
    // For now, we'll use a simple heuristic
    const hostname = window.location.hostname;
    
    // Skip localhost and IP addresses for custom domain detection
    if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return true; // Assume localhost is GitLab for development
    }
    
    // Check if it looks like a GitLab instance (has GitLab-specific elements)
    const hasGitLabElements = !!(
      document.querySelector('.navbar-gitlab') ||
      document.querySelector('.gitlab-logo') ||
      document.querySelector('[data-testid="gitlab-logo"]') ||
      document.querySelector('.gl-logo')
    );
    
    return hasGitLabElements;
  }

  /**
   * Extract GitLab merge request information
   * @returns {Object|null} Merge request information
   */
  extractGitLabMRInfo() {
    if (!this.isGitLabMRPage()) {
      return null;
    }

    try {
      const mrInfo = {
        url: window.location.href,
        hostname: window.location.hostname,
        mrId: this.extractGitLabMRId(),
        title: this.extractGitLabMRTitle(),
        repository: this.extractGitLabRepository(),
        sourceBranch: this.extractGitLabSourceBranch(),
        targetBranch: this.extractGitLabTargetBranch(),
        status: this.extractGitLabMRStatus(),
        author: this.extractGitLabMRAuthor(),
        timestamp: Date.now()
      };

      dbgLog('Extracted GitLab MR info:', mrInfo);
      return mrInfo;
    } catch (error) {
      dbgWarn('Error extracting GitLab MR info:', error);
      
      // Report MR info extraction error
      if (errorReporter && errorReporter.isInitialized) {
        errorReporter.reportIssue('info_extraction_error', 'Error extracting GitLab MR info', {
          error: error.message,
          stack: error.stack
        }).catch(() => {
          // Silently fail if error reporting fails
        });
      }
      
      return null;
    }
  }

  /**
   * Extract GitLab merge request ID
   * @returns {string|null} Merge request ID
   */
  extractGitLabMRId() {
    const pathParts = window.location.pathname.split('/');
    const mrIndex = pathParts.indexOf('merge_requests');
    
    if (mrIndex !== -1 && mrIndex + 1 < pathParts.length) {
      return pathParts[mrIndex + 1];
    }
    
    const matches = window.location.pathname.match(/\/merge_requests\/(\d+)/);
    return matches && matches[1] ? matches[1] : null;
  }

  /**
   * Extract GitLab merge request title
   * @returns {string} Merge request title
   */
  extractGitLabMRTitle() {
    const titleElement = document.querySelector('.detail-page-header-title') ||
                        document.querySelector('.merge-request-title');
    
    if (titleElement) {
      return titleElement.textContent.trim();
    }
    
    const pageTitle = document.title;
    if (pageTitle) {
      return pageTitle.split('·')[0].trim();
    }
    
    return 'Unknown MR';
  }

  /**
   * Extract GitLab repository information
   * @returns {Object} Repository information
   */
  extractGitLabRepository() {
    const pathParts = window.location.pathname.split('/');
    const projectIndex = pathParts.findIndex(part => part === 'merge_requests') - 1;
    
    if (projectIndex > 0) {
      const projectPath = pathParts.slice(1, projectIndex + 1).join('/');
      return {
        name: projectPath,
        fullName: projectPath
      };
    }
    
    return {
      name: 'Unknown Repository',
      fullName: 'Unknown Repository'
    };
  }

  /**
   * Extract GitLab source branch
   * @returns {string|null} Source branch name
   */
  extractGitLabSourceBranch() {
    const sourceBranchElement = document.querySelector('.source-branch') ||
                               document.querySelector('.mr-source-branch');
    
    if (sourceBranchElement) {
      return sourceBranchElement.textContent?.trim();
    }
    
    return null;
  }

  /**
   * Extract GitLab target branch
   * @returns {string|null} Target branch name
   */
  extractGitLabTargetBranch() {
    const targetBranchElement = document.querySelector('.target-branch') ||
                               document.querySelector('.mr-target-branch');
    
    if (targetBranchElement) {
      return targetBranchElement.textContent?.trim();
    }
    
    return null;
  }

  /**
   * Extract GitLab merge request status
   * @returns {string} MR status
   */
  extractGitLabMRStatus() {
    const statusElement = document.querySelector('.mr-status') ||
                         document.querySelector('.merge-request-status');
    
    if (statusElement) {
      return statusElement.textContent?.trim();
    }
    
    return 'Unknown';
  }

  /**
   * Extract GitLab merge request author
   * @returns {string|null} MR author
   */
  extractGitLabMRAuthor() {
    const authorElement = document.querySelector('.mr-author') ||
                         document.querySelector('.merge-request-author');
    
    if (authorElement) {
      return authorElement.textContent?.trim();
    }
    
    return null;
  }

  /**
   * Get current platform
   * @returns {string|null} Current platform ('gitlab' or 'azure-devops')
   */
  getCurrentPlatform() {
    const detection = this.detectPlatform();
    return detection.platform;
  }

  /**
   * Check if current page is supported
   * @returns {boolean} True if current page is supported
   */
  isCurrentPageSupported() {
    const detection = this.detectPlatform();
    return detection.isSupported;
  }

  /**
   * Check if we're on an Azure DevOps site (regardless of being on a PR page)
   * @returns {boolean} True if on Azure DevOps domain
   */
  isAzureDevOpsSite() {
    const hostname = window.location.hostname;
    return hostname.includes('dev.azure.com') || hostname.includes('visualstudio.com');
  }

  /**
   * Get page information for debugging
   * @returns {Object} Page information
   */
  getPageInfo() {
    const detection = this.detectPlatform();
    return {
      ...detection,
      url: window.location.href,
      pathname: window.location.pathname,
      host: window.location.host,
      protocol: window.location.protocol,
      documentTitle: document.title
    };
  }

  /**
   * Check if the page has changed and update cached info
   * @returns {boolean} True if page info has changed
   */
  hasPageChanged() {
    const currentDetection = this.detectPlatform();
    const hasChanged = !this.currentPageInfo || 
                      this.currentPageInfo.url !== currentDetection.pageInfo?.url ||
                      this.currentPageInfo.platform !== currentDetection.platform;
    
    if (hasChanged) {
      this.currentPageInfo = currentDetection;
    }
    
    return hasChanged;
  }
}

// Create and export a singleton instance
export const platformDetector = new PlatformDetector();
