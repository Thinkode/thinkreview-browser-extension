// bitbucket-detector.js
// Detects Bitbucket Cloud and Bitbucket Data Center pull request pages and extracts relevant information
import { dbgLog, dbgWarn, dbgError } from '../utils/logger.js';
import {
  getBitbucketDiffApiUrl,
  parseBitbucketDataCenterPrPath,
  getBitbucketDataCenterDiffApiUrl
} from '../utils/bitbucket-api-urls.js';

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
 * Handles detection of Bitbucket Cloud and Bitbucket Data Center pull request pages
 */
export class BitbucketDetector {
  constructor() {
    this.isInitialized = false;
    this.currentPageInfo = null;
    /** @type {string[]} Normalized hostnames for Bitbucket Data Center instances */
    this.customDomains = [];
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
   * Set custom Bitbucket Data Center domains (self-hosted).
   * @param {string[]} domains - Array of domain URLs or hostnames from storage
   */
  setCustomDomains(domains) {
    this.customDomains = (domains || []).map(d => {
      try {
        const hasProtocol = d.startsWith('http://') || d.startsWith('https://');
        return new URL(hasProtocol ? d : `https://${d}`).hostname;
      } catch {
        return d;
      }
    }).filter(Boolean);
    dbgLog('Bitbucket Data Center custom domains set:', this.customDomains);
  }

  /**
   * Check if the current hostname is a configured Bitbucket Data Center instance.
   * @returns {boolean}
   */
  isDataCenterDomain() {
    return this.customDomains.includes(window.location.hostname);
  }

  /**
   * Check if the current page is on Bitbucket Cloud (bitbucket.org) or a Data Center instance.
   * @returns {boolean}
   */
  isBitbucketDomain() {
    return window.location.hostname === 'bitbucket.org' || this.isDataCenterDomain();
  }

  /**
   * Check if the current page is a Bitbucket pull request page (Cloud or Data Center).
   * @returns {boolean}
   */
  isBitbucketPRPage() {
    const hostname = window.location.hostname;

    if (hostname === 'bitbucket.org') {
      const prInfo = parseBitbucketPRFromPath(window.location.pathname);
      const isPRPath = !!prInfo;
      dbgLog('Bitbucket Cloud PR detection:', { isPRPath, url: window.location.href.substring(0, 100) + '...' });
      return isPRPath;
    }

    if (this.isDataCenterDomain()) {
      const prInfo = parseBitbucketDataCenterPrPath(window.location.pathname);
      const isPRPath = !!prInfo;
      dbgLog('Bitbucket Data Center PR detection:', { isPRPath, url: window.location.href.substring(0, 100) + '...' });
      return isPRPath;
    }

    return false;
  }

  /**
   * Extract pull request information from the current page (Cloud or Data Center).
   * @returns {Object|null} Pull request information or null if not found
   */
  extractPRInfo() {
    if (!this.isBitbucketPRPage()) {
      return null;
    }

    try {
      const hostname = window.location.hostname;
      const isDataCenter = this.isDataCenterDomain();

      if (!isDataCenter) {
        const parsed = parseBitbucketPRFromPath(window.location.pathname);
        const prInfo = {
          url: window.location.href,
          hostname,
          prId: parsed.prId,
          workspace: parsed.workspace,
          repoSlug: parsed.repoSlug,
          isDataCenter: false,
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
        dbgLog('Extracted Bitbucket Cloud PR info:', prInfo);
        return prInfo;
      }

      const parsed = parseBitbucketDataCenterPrPath(window.location.pathname);
      const prInfo = {
        url: window.location.href,
        hostname,
        prId: parsed.prId,
        namespace: parsed.namespace,
        namespaceType: parsed.namespaceType,
        repoSlug: parsed.repoSlug,
        isDataCenter: true,
        repository: {
          name: parsed.repoSlug,
          fullName: `${parsed.namespace}/${parsed.repoSlug}`
        },
        title: this.extractPRTitle(),
        sourceBranch: this.extractSourceBranch(),
        targetBranch: this.extractTargetBranch(),
        status: this.extractPRStatus(),
        author: this.extractAuthor(),
        timestamp: Date.now()
      };
      dbgLog('Extracted Bitbucket Data Center PR info:', prInfo);
      return prInfo;
    } catch (error) {
      dbgWarn('Error extracting Bitbucket PR info:', error);
      return null;
    }
  }

  /**
   * Get the API URL for fetching the PR diff.
   * - Cloud: api.bitbucket.org/2.0/repositories/{ws}/{repo}/pullrequests/{id}/diff
   * - Data Center: {origin}/rest/api/1.0/{projects|users}/{ns}/repos/{repo}/pull-requests/{id}/diff
   * @returns {string|null}
   */
  getPatchApiUrl() {
    if (this.isDataCenterDomain()) {
      const parsed = parseBitbucketDataCenterPrPath(window.location.pathname);
      if (!parsed) return null;
      return getBitbucketDataCenterDiffApiUrl(
        window.location.origin,
        parsed.namespaceType,
        parsed.namespace,
        parsed.repoSlug,
        parsed.prId
      );
    }

    const parsed = parseBitbucketPRFromPath(window.location.pathname);
    if (!parsed) return null;
    return getBitbucketDiffApiUrl(parsed.workspace, parsed.repoSlug, parsed.prId);
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
