// azure-devops-detector.js
// Detects Azure DevOps pull request pages and extracts relevant information

// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[Azure DevOps Detector]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[Azure DevOps Detector]', ...args); }

/**
 * Azure DevOps Detector Service
 * Handles detection of Azure DevOps pull request pages and extraction of PR information
 */
export class AzureDevOpsDetector {
  constructor() {
    this.isInitialized = false;
    this.currentPageInfo = null;
  }

  /**
   * Initialize the detector
   */
  init() {
    if (this.isInitialized) return;
    
    dbgLog('Initializing Azure DevOps detector');
    this.isInitialized = true;
  }

  /**
   * Check if the current page is an Azure DevOps pull request page
   * @returns {boolean} True if the current page is an Azure DevOps PR page
   */
  isAzureDevOpsPRPage() {
    const url = window.location.href;
    const hostname = window.location.hostname;
    
    // Check if we're on Azure DevOps domains
    const isAzureDevOpsDomain = hostname.includes('dev.azure.com') || 
                               hostname.includes('visualstudio.com');
    
    if (!isAzureDevOpsDomain) {
      return false;
    }
    
    // Check if URL contains pull request path patterns
    // This is sufficient and more reliable than DOM checks
    // URL patterns are consistent and available immediately in SPAs
    const isPRPath = url.includes('/pullrequest/') || 
                    url.includes('/pullRequest/');
    
    dbgLog('Azure DevOps PR detection:', {
      isAzureDevOpsDomain,
      isPRPath,
      url: url.substring(0, 100) + '...'
    });
    
    return isAzureDevOpsDomain && isPRPath;
  }

  /**
   * Extract pull request information from the current page
   * @returns {Object|null} Pull request information or null if not found
   */
  extractPRInfo() {
    if (!this.isAzureDevOpsPRPage()) {
      return null;
    }

    try {
      const prInfo = {
        url: window.location.href,
        hostname: window.location.hostname,
        prId: this.extractPRId(),
        title: this.extractPRTitle(),
        repository: this.extractRepositoryInfo(),
        organization: this.extractOrganization(),
        project: this.extractProject(),
        sourceBranch: this.extractSourceBranch(),
        targetBranch: this.extractTargetBranch(),
        status: this.extractPRStatus(),
        author: this.extractAuthor(),
        timestamp: Date.now()
      };

      dbgLog('Extracted PR info:', prInfo);
      return prInfo;
    } catch (error) {
      dbgWarn('Error extracting PR info:', error);
      return null;
    }
  }

  /**
   * Extract pull request ID from URL or page elements
   * @returns {string|null} Pull request ID
   */
  extractPRId() {
    // Try to extract from URL first
    const urlMatch = window.location.pathname.match(/\/pullrequest\/(\d+)/i);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Try to extract from page elements
    const prIdElement = document.querySelector('[data-testid="pull-request-id"]') ||
                       document.querySelector('.pr-id') ||
                       document.querySelector('[aria-label*="Pull Request"]');
    
    if (prIdElement) {
      const text = prIdElement.textContent || prIdElement.getAttribute('aria-label') || '';
      const match = text.match(/(?:PR|Pull Request|#)\s*(\d+)/i);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Extract pull request title
   * @returns {string} Pull request title
   */
  extractPRTitle() {
    // Try multiple selectors for PR title
    const titleSelectors = [
      '[data-testid="pull-request-title"]',
      '.repos-pr-header h1',
      '.pr-header h1',
      '.pr-details-header h1',
      '.pull-request-header h1',
      'h1[aria-label*="pull request"]',
      '.pr-title'
    ];

    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const title = element.textContent?.trim();
        if (title) {
          return title;
        }
      }
    }

    // Fallback to page title
    const pageTitle = document.title;
    if (pageTitle) {
      return pageTitle.split('·')[0].trim();
    }

    return 'Unknown Pull Request';
  }

  /**
   * Extract repository information
   * @returns {Object} Repository information
   */
  extractRepositoryInfo() {
    const url = window.location.href;
    
    // Extract from URL pattern: /_git/{repository}
    const gitMatch = url.match(/\/_git\/([^\/]+)/);
    if (gitMatch) {
      return {
        name: gitMatch[1],
        fullName: gitMatch[1]
      };
    }

    // Try to extract from page elements
    const repoElement = document.querySelector('[data-testid="repository-name"]') ||
                       document.querySelector('.repo-name') ||
                       document.querySelector('.repository-name');
    
    if (repoElement) {
      const repoName = repoElement.textContent?.trim();
      if (repoName) {
        return {
          name: repoName,
          fullName: repoName
        };
      }
    }

    return {
      name: 'Unknown Repository',
      fullName: 'Unknown Repository'
    };
  }

  /**
   * Extract organization name from URL
   * @returns {string} Organization name
   */
  extractOrganization() {
    const url = window.location.href;
    
    // For dev.azure.com: https://dev.azure.com/{organization}
    const devAzureMatch = url.match(/dev\.azure\.com\/([^\/]+)/);
    if (devAzureMatch) {
      return devAzureMatch[1];
    }

    // For visualstudio.com: https://{organization}.visualstudio.com
    const vsMatch = url.match(/([^\.]+)\.visualstudio\.com/);
    if (vsMatch) {
      return vsMatch[1];
    }

    return 'Unknown Organization';
  }

  /**
   * Extract project name from URL
   * @returns {string} Project name
   */
  extractProject() {
    const url = window.location.href;
    
    // Extract from URL pattern: /{organization}/{project}/_git
    const projectMatch = url.match(/\/[^\/]+\/([^\/]+)\/_git/);
    if (projectMatch) {
      return projectMatch[1];
    }

    return 'Unknown Project';
  }

  /**
   * Extract source branch name
   * @returns {string|null} Source branch name
   */
  extractSourceBranch() {
    const branchSelectors = [
      '[data-testid="source-branch"]',
      '.source-branch',
      '.pr-source-branch',
      '[aria-label*="source branch"]'
    ];

    for (const selector of branchSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const branch = element.textContent?.trim();
        if (branch) {
          return branch;
        }
      }
    }

    return null;
  }

  /**
   * Extract target branch name
   * @returns {string|null} Target branch name
   */
  extractTargetBranch() {
    const branchSelectors = [
      '[data-testid="target-branch"]',
      '.target-branch',
      '.pr-target-branch',
      '[aria-label*="target branch"]'
    ];

    for (const selector of branchSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const branch = element.textContent?.trim();
        if (branch) {
          return branch;
        }
      }
    }

    return null;
  }

  /**
   * Extract pull request status
   * @returns {string} PR status
   */
  extractPRStatus() {
    const statusSelectors = [
      '[data-testid="pr-status"]',
      '.pr-status',
      '.pull-request-status',
      '[aria-label*="status"]'
    ];

    for (const selector of statusSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const status = element.textContent?.trim();
        if (status) {
          return status;
        }
      }
    }

    return 'Unknown';
  }

  /**
   * Extract pull request author
   * @returns {string|null} PR author
   */
  extractAuthor() {
    const authorSelectors = [
      '[data-testid="pr-author"]',
      '.pr-author',
      '.pull-request-author',
      '[aria-label*="author"]'
    ];

    for (const selector of authorSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const author = element.textContent?.trim();
        if (author) {
          return author;
        }
      }
    }

    return null;
  }

  /**
   * Get page information for debugging
   * @returns {Object} Page information
   */
  getPageInfo() {
    return {
      url: window.location.href,
      pathname: window.location.pathname,
      host: window.location.host,
      protocol: window.location.protocol,
      isAzureDevOpsPRPage: this.isAzureDevOpsPRPage(),
      documentTitle: document.title,
      relevantElements: {
        prHeader: !!document.querySelector('[data-testid="pull-request-header"]'),
        prTitle: !!document.querySelector('[data-testid="pull-request-title"]'),
        prId: !!document.querySelector('[data-testid="pull-request-id"]'),
        repoName: !!document.querySelector('[data-testid="repository-name"]')
      }
    };
  }

  /**
   * Check if the page has changed and update cached info
   * @returns {boolean} True if page info has changed
   */
  hasPageChanged() {
    const currentInfo = this.getPageInfo();
    const hasChanged = !this.currentPageInfo || 
                      this.currentPageInfo.url !== currentInfo.url ||
                      this.currentPageInfo.pathname !== currentInfo.pathname;
    
    if (hasChanged) {
      this.currentPageInfo = currentInfo;
    }
    
    return hasChanged;
  }
}

// Create and export a singleton instance
export const azureDevOpsDetector = new AzureDevOpsDetector();
