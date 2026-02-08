// bitbucket-detector.js
// Detects Bitbucket Cloud pull request pages and extracts relevant information
import { dbgLog, dbgWarn, dbgError } from '../utils/logger.js';

/**
 * Parse Bitbucket PR URL path into workspace, repo_slug, and PR id.
 * Supports:
 *   /{workspace}/{repo_slug}/pull-requests/{id}
 *   /{workspace}/{project_key}/{repo_slug}/pull-requests/{id}
 *
 * @param {string} pathname - window.location.pathname
 * @returns {{ workspace: string, repoSlug: string, prId: string } | null}
 */
function parseBitbucketPRFromPath(pathname) {
  const pullRequestsIndex = pathname.indexOf('/pull-requests/');
  if (pullRequestsIndex === -1) return null;
  const idMatch = pathname.slice(pullRequestsIndex + 15).match(/^(\d+)(?:\/|$)/);
  if (!idMatch) return null;
  const prId = idMatch[1];
  const before = pathname.slice(0, pullRequestsIndex).replace(/^\/+|\/+$/, '');
  const segments = before.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const workspace = segments[0];
  const repoSlug = segments[segments.length - 1];
  return { workspace, repoSlug, prId };
}

/**
 * Bitbucket Detector Service
 * Handles detection of Bitbucket Cloud pull request pages and extraction of PR information
 */
export class BitbucketDetector {
  constructor() {
    this.isInitialized = false;
    this.currentPageInfo = null;
  }

  /**
   * Initialize the detector
   */
  init() {
    if (this.isInitialized) return;

    dbgLog('Initializing Bitbucket detector');
    this.isInitialized = true;
  }

  /**
   * Check if the current page is on Bitbucket Cloud (bitbucket.org)
   * @returns {boolean}
   */
  isBitbucketDomain() {
    const hostname = window.location.hostname;
    return hostname === 'bitbucket.org';
  }

  /**
   * Check if the current page is a Bitbucket pull request page
   * @returns {boolean} True if the current page is a Bitbucket PR page
   */
  isBitbucketPRPage() {
    const hostname = window.location.hostname;
    if (hostname !== 'bitbucket.org') {
      return false;
    }
    const prInfo = parseBitbucketPRFromPath(window.location.pathname);
    const isPRPath = !!prInfo;
    dbgLog('Bitbucket PR detection:', {
      isBitbucketDomain: true,
      isPRPath,
      url: window.location.href.substring(0, 100) + '...'
    });
    return isPRPath;
  }

  /**
   * Extract pull request information from the current page
   * @returns {Object|null} Pull request information or null if not found
   */
  extractPRInfo() {
    if (!this.isBitbucketPRPage()) {
      return null;
    }

    try {
      const parsed = parseBitbucketPRFromPath(window.location.pathname);
      const prInfo = {
        url: window.location.href,
        hostname: window.location.hostname,
        prId: parsed.prId,
        workspace: parsed.workspace,
        repoSlug: parsed.repoSlug,
        repository: {
          name: parsed.repoSlug,
          fullName: `${parsed.workspace}/${parsed.repoSlug}`
        },
        title: this.extractPRTitle(),
        sourceBranch: this.extractSourceBranch(),
        targetBranch: this.extractTargetBranch(),
        status: this.extractPRStatus(),
        author: this.extractAuthor(),
        timestamp: Date.now()
      };

      dbgLog('Extracted Bitbucket PR info:', prInfo);
      return prInfo;
    } catch (error) {
      dbgWarn('Error extracting Bitbucket PR info:', error);
      return null;
    }
  }

  /**
   * Get the Bitbucket API 2.0 URL for PR diff.
   * Returns the pullrequests/{id}/diff form; background resolves this to the repository diff
   * URL (repositories/.../diff/...:commit?from_pullrequest_id=...) via PR API to avoid 302.
   * @returns {string|null} e.g. https://api.bitbucket.org/2.0/repositories/workspace/repo/pullrequests/1/diff
   */
  getPatchApiUrl() {
    const parsed = parseBitbucketPRFromPath(window.location.pathname);
    if (!parsed) return null;
    return `https://api.bitbucket.org/2.0/repositories/${parsed.workspace}/${parsed.repoSlug}/pullrequests/${parsed.prId}/diff`;
  }

  /**
   * Extract PR title from page
   * @returns {string}
   */
  extractPRTitle() {
    const titleEl = document.querySelector('[data-qa="pr-title"]') ||
      document.querySelector('.pr-title') ||
      document.querySelector('h1');
    if (titleEl) {
      const t = titleEl.textContent?.trim();
      if (t) return t;
    }
    const pageTitle = document.title;
    if (pageTitle) return pageTitle.split('·')[0].trim();
    return 'Unknown Pull Request';
  }

  /**
   * Extract source branch
   * @returns {string|null}
   */
  extractSourceBranch() {
    const el = document.querySelector('[data-qa="source-branch"]') ||
      document.querySelector('.source-branch');
    return el?.textContent?.trim() || null;
  }

  /**
   * Extract target branch
   * @returns {string|null}
   */
  extractTargetBranch() {
    const el = document.querySelector('[data-qa="target-branch"]') ||
      document.querySelector('.target-branch');
    return el?.textContent?.trim() || null;
  }

  /**
   * Extract PR status
   * @returns {string}
   */
  extractPRStatus() {
    const el = document.querySelector('[data-qa="pr-status"]') ||
      document.querySelector('.pr-status');
    return el?.textContent?.trim() || 'Unknown';
  }

  /**
   * Extract PR author
   * @returns {string|null}
   */
  extractAuthor() {
    const el = document.querySelector('[data-qa="pr-author"]') ||
      document.querySelector('.pr-author');
    return el?.textContent?.trim() || null;
  }
}

export const bitbucketDetector = new BitbucketDetector();
