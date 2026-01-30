// github-detector.js
// Detects GitHub pull request pages and extracts relevant information
import { dbgLog, dbgWarn, dbgError } from '../utils/logger.js';



/**
 * GitHub Detector Service
 * Handles detection of GitHub pull request pages and extraction of PR information
 */

/**
 * Parse GitHub PR URL path into owner, repo, and PR number.
 * Matches typical patterns like: /owner/repo/pull/123 or /owner/repo/pull/123/files
 *
 * @param {string} pathname - window.location.pathname
 * @returns {{ owner: string, repo: string, prNumber: string } | null}
 */
function parseGitHubPRFromPath(pathname) {
  // Single source of truth for GitHub PR URL structure
  // GitHub PR URLs: /owner/repo/pull/{number}[/*]
  const match = pathname.match(/\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (!match) {
    return null;
  }

  const [, owner, repo, prNumber] = match;
  return { owner, repo, prNumber };
}

export class GitHubDetector {
  constructor() {
    this.isInitialized = false;
    this.currentPageInfo = null;
  }

  /**
   * Initialize the detector
   */
  init() {
    if (this.isInitialized) return;
    
    dbgLog('Initializing GitHub detector');
    this.isInitialized = true;
  }

  /**
   * Check if the current page is a GitHub pull request page
   * @returns {boolean} True if the current page is a GitHub PR page
   */
  isGitHubPRPage() {
    const url = window.location.href;
    const hostname = window.location.hostname;
    
    // Check if we're on GitHub domains
    const isGitHubDomain = hostname === 'github.com' || hostname.endsWith('.github.com');
    
    if (!isGitHubDomain) {
      return false;
    }
    
    // Check if URL contains pull request path pattern
    // GitHub PR URLs: /owner/repo/pull/{number}
    const prInfo = parseGitHubPRFromPath(window.location.pathname);
    const isPRPath = !!prInfo;
    
    dbgLog('GitHub PR detection:', {
      isGitHubDomain,
      isPRPath,
      url: url.substring(0, 100) + '...'
    });
    
    return isGitHubDomain && isPRPath;
  }

  /**
   * Extract pull request information from the current page
   * @returns {Object|null} Pull request information or null if not found
   */
  extractPRInfo() {
    if (!this.isGitHubPRPage()) {
      return null;
    }

    try {
      const prInfo = {
        url: window.location.href,
        hostname: window.location.hostname,
        prId: this.extractPRId(),
        title: this.extractPRTitle(),
        repository: this.extractRepositoryInfo(),
        owner: this.extractOwner(),
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
   * Extract pull request ID from URL
   * @returns {string|null} Pull request ID
   */
  extractPRId() {
    // Extract from URL pattern: /owner/repo/pull/{number}
    const prInfo = parseGitHubPRFromPath(window.location.pathname);
    if (prInfo) {
      return prInfo.prNumber;
    }

    return null;
  }

  /**
   * Extract pull request title
   * @returns {string} Pull request title
   */
  extractPRTitle() {
    // Primary: Use page title (more reliable than DOM)
    const pageTitle = document.title;
    if (pageTitle) {
      // Remove " · Pull Request #123 · owner/repo" pattern
      const title = pageTitle.replace(/\s*·\s*Pull Request.*$/, '').trim();
      if (title) {
        return title;
      }
    }

    // Fallback: Try DOM selectors (less reliable, may change)
    const titleSelectors = [
      'h1.gh-header-title .js-issue-title',
      'h1.gh-header-title',
      '.gh-header-title',
      '[data-testid="issue-title"]',
      '.js-issue-title',
      'h1[itemprop="name"]'
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

    return 'Unknown Pull Request';
  }

  /**
   * Extract repository information
   * @returns {Object} Repository information
   */
  extractRepositoryInfo() {
    const pathname = window.location.pathname;
    
    // Primary: Extract from URL pattern (most reliable)
    // GitHub PR URLs: /owner/repo/pull/{number}
    const prInfo = parseGitHubPRFromPath(pathname);
    if (prInfo) {
      return {
        name: prInfo.repo,
        fullName: `${prInfo.owner}/${prInfo.repo}`
      };
    }

    // Fallback: Try to extract from page title if URL extraction fails
    const pageTitle = document.title;
    if (pageTitle) {
      // Page title format: "title · Pull Request #123 · owner/repo"
      const titleMatch = pageTitle.match(/·\s*[^·]+\s*·\s*([^\/]+\/[^·]+)/);
      if (titleMatch) {
        const fullName = titleMatch[1].trim();
        const parts = fullName.split('/');
        if (parts.length === 2) {
          return {
            name: parts[1],
            fullName: fullName
          };
        }
      }
    }

    // Last resort: Try DOM (least reliable)
    const repoElement = document.querySelector('[itemprop="name"]') ||
                       document.querySelector('.AppHeader-context-item-label') ||
                       document.querySelector('[data-pjax="#js-repo-pjax-container"]');
    
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
   * Extract repository owner from URL
   * @returns {string} Repository owner
   */
  extractOwner() {
    const pathname = window.location.pathname;
    
    // Extract from URL pattern: /owner/repo/pull/{number}
    const prInfo = parseGitHubPRFromPath(pathname);
    if (prInfo) {
      return prInfo.owner;
    }

    return 'Unknown Owner';
  }

  /**
   * Extract source branch name
   * Note: This relies on DOM and may break if GitHub changes their UI
   * @returns {string|null} Source branch name
   */
  extractSourceBranch() {
    // DOM-based extraction (may be unreliable)
    const branchSelectors = [
      '.head-ref',
      '.commit-ref[title*="head"]',
      '[data-name="head-ref"]',
      '.gh-header-meta .head-ref'
    ];

    for (const selector of branchSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const branch = element.textContent?.trim();
        if (branch) {
          // Remove "owner:" prefix if present
          return branch.replace(/^[^:]+:/, '');
        }
      }
    }

    return null;
  }

  /**
   * Extract target branch name
   * Note: This relies on DOM and may break if GitHub changes their UI
   * @returns {string|null} Target branch name
   */
  extractTargetBranch() {
    // DOM-based extraction (may be unreliable)
    const branchSelectors = [
      '.base-ref',
      '.commit-ref[title*="base"]',
      '[data-name="base-ref"]',
      '.gh-header-meta .base-ref'
    ];

    for (const selector of branchSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const branch = element.textContent?.trim();
        if (branch) {
          // Remove "owner:" prefix if present
          return branch.replace(/^[^:]+:/, '');
        }
      }
    }

    return null;
  }

  /**
   * Extract pull request status
   * Note: This relies on DOM and may break if GitHub changes their UI
   * @returns {string} PR status
   */
  extractPRStatus() {
    // DOM-based extraction (may be unreliable)
    const statusSelectors = [
      '.State',
      '.gh-header-meta .State',
      '[data-state]',
      '.merge-status-icon'
    ];

    for (const selector of statusSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const status = element.textContent?.trim() || element.getAttribute('data-state');
        if (status) {
          return status;
        }
      }
    }

    return 'Unknown';
  }

  /**
   * Extract pull request author
   * Note: This relies on DOM and may break if GitHub changes their UI
   * @returns {string|null} PR author
   */
  extractAuthor() {
    // DOM-based extraction (may be unreliable)
    const authorSelectors = [
      '.author',
      '.gh-header-meta .author',
      '[itemprop="author"]',
      '.opened-by a'
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
      isGitHubPRPage: this.isGitHubPRPage(),
      documentTitle: document.title,
      relevantElements: {
        prTitle: !!document.querySelector('.gh-header-title'),
        prId: !!document.querySelector('.gh-header-number'),
        repoName: !!document.querySelector('[itemprop="name"]')
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

  /**
   * Get the canonical GitHub PR URL (without suffix segments like /files or /commits)
   * @returns {string} Canonical PR URL or current URL without query/hash as a fallback
   */
  getCanonicalPRUrl() {
    const { origin, pathname } = window.location;
    const prInfo = parseGitHubPRFromPath(pathname);

    if (prInfo) {
      const { owner, repo, prNumber } = prInfo;
      return `${origin}/${owner}/${repo}/pull/${prNumber}`;
    }

    // Fallback: strip query/hash but otherwise return current URL
    return window.location.href.replace(/[#?].*$/, '');
  }

  /**
   * Get the canonical GitHub PR diff URL (always .../pull/{number}.diff)
   * @returns {string} Canonical PR diff URL
   */
  getCanonicalPRDiffUrl() {
    const baseUrl = this.getCanonicalPRUrl();
    // Ensure we don't end up with .patch.diff, etc.
    const normalized = baseUrl
      .replace(/[#?].*$/, '')
      .replace(/\.(diff|patch)$/, '');
    return `${normalized}.diff`;
  }
}

// Create and export a singleton instance
export const githubDetector = new GitHubDetector();
