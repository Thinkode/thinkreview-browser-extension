// azure-devops-api.js
// Azure DevOps API service for fetching pull request data and code changes
import { dbgLog, dbgWarn, dbgError } from '../utils/logger.js';
import { getRequestApiVersion, DEFAULT_API_VERSION } from './azure-api-versions/index.js';

// jsdiff (vendor/diff.min.js) exposes global Diff when loaded before this script; used for memory-efficient line diff
const Diff = (typeof self !== 'undefined' && self.Diff) || (typeof globalThis !== 'undefined' && globalThis.Diff) || null;



/**
 * Custom error class for Azure DevOps authentication failures
 */
export class AzureDevOpsAuthError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.name = 'AzureDevOpsAuthError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Azure DevOps API Service
 * Handles communication with Azure DevOps REST API
 */
export class AzureDevOpsAPI {
  constructor() {
    this.baseUrl = null;
    this.token = null;
    this.apiVersion = DEFAULT_API_VERSION;
    this.isInitialized = false;
    /** @type {Promise<void>|null} One-time promise for lazy project resolution (on-prem when project not in URL) */
    this._projectResolutionPromise = null;
  }

  /**
   * Initialize the API service with token and organization info
   * @param {string} token - Azure DevOps Personal Access Token
   * @param {string} organization - Organization name
   * @param {string} project - Project name
   * @param {string} repository - Repository name
   * @param {string} hostname - Hostname (optional, used to determine base URL for visualstudio.com domains)
   * @param {string} protocol - Protocol (optional, e.g. 'http:' or 'https:'; used for custom/on-prem to match page)
   * @param {string|null} apiVersion - API version (optional, e.g. '4.1' for on-prem; default 7.1)
   */
  async init(token, organization, project, repository, hostname = null, protocol = null, apiVersion = null) {
    if (!token) {
      throw new Error('Azure DevOps token is required');
    }

    this.token = token;
    this.organization = organization;
    this.project = project || null;
    this.repository = repository;
    const scheme = (protocol && (protocol === 'http:' || protocol === 'https:')) ? protocol : 'https:';

    // Determine base URL based on hostname or organization
    // For visualstudio.com domains, use the hostname directly
    // For custom/on-prem hostnames, use the hostname and page protocol (http/https)
    // For dev.azure.com domains, construct the URL with organization
    if (hostname && hostname.includes('visualstudio.com')) {
      this.baseUrl = `https://${hostname}`;
    } else if (organization.includes('visualstudio.com')) {
      // Fallback: if organization already includes the domain
      this.baseUrl = `https://${organization}`;
    } else if (hostname && !hostname.includes('dev.azure.com') && !hostname.includes('visualstudio.com')) {
      // Custom/on-prem Azure DevOps; use page protocol so HTTP sites get API calls over HTTP
      this.baseUrl = `${scheme}//${hostname}/${organization}`;
    } else {
      this.baseUrl = `https://dev.azure.com/${organization}`;
    }

    this.repositoryId = repository;
    this.apiVersion = apiVersion != null ? getRequestApiVersion(apiVersion) : DEFAULT_API_VERSION;
    this.isInitialized = true;

    // On-prem URL can be /{collection}/_git/{repo} with no project segment; resolve project lazily in makeRequest (no await in init)

    // Get repository ID for more reliable API calls (async, non-blocking)
    this.resolveRepositoryId().catch(error => {
      dbgWarn('Could not resolve repository ID, using repository name:', error);
    });
  }

  /**
   * Low-level API request: builds URL from baseUrl + optional project + _apis/endpoint and fetches.
   * @param {string} endpoint - API endpoint (e.g. 'projects', 'git/repositories/foo')
   * @param {string|null|undefined} projectOverride - If string, use that project in path; if null, collection-level (no project); if undefined, use this.project
   * @param {Object} options - Fetch options (method, body, etc.)
   * @returns {Promise<Response>}
   */
  async _fetchApi(endpoint, projectOverride, options = {}) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const pathSegment = projectOverride === null
      ? ''
      : (projectOverride !== undefined ? `/${projectOverride}` : (this.project != null && this.project !== '' ? `/${this.project}` : ''));
    const url = `${this.baseUrl}${pathSegment}/_apis/${endpoint}${separator}api-version=${this.apiVersion}`;
    const defaultOptions = {
      headers: {
        'Authorization': `Basic ${btoa(':' + this.token)}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    const requestOptions = {
      ...defaultOptions,
      ...options,
      headers: { ...defaultOptions.headers, ...options.headers }
    };
    return fetch(url, requestOptions);
  }

  /**
   * Resolve project when URL is on-prem /{collection}/_git/{repo} (no project in path).
   * Uses collection-level Git List (one request). When multiple repos share the same name,
   * uses only the one whose remoteUrl matches the page (/{org}/_git/{repo}); otherwise reports to Honeybadger and throws.
   */
  async resolveProjectForRepository() {
    const repoName = this.repository;
    const org = this.organization;

    const listResp = await this._fetchApi('git/repositories', null);
    if (!listResp.ok) {
      const text = await listResp.text();
      throw new Error(`Could not list repositories (${listResp.status}). Collection-level git/repositories may not be supported: ${text}`);
    }
    const listData = await listResp.json();
    const repos = listData.value || [];
    const byName = repos.filter(r => (r.name && r.name.toLowerCase() === repoName.toLowerCase()) || r.id === repoName);

    const preciseMatch = byName.find(r => {
      if (!r.remoteUrl) return false;
      try {
        const pathname = new URL(r.remoteUrl).pathname.replace(/\/+$/, '');
        const collectionLevelPath = `/${org}/_git/${repoName}`;
        return pathname === collectionLevelPath || pathname === `${collectionLevelPath}/`;
      } catch {
        return false;
      }
    });

    if (preciseMatch && preciseMatch.project && preciseMatch.project.name) {
      this.project = preciseMatch.project.name;
      dbgLog('Resolved project via collection-level git/repositories:', {
        repository: repoName,
        project: this.project
      });
      return;
    }

    if (byName.length > 1) {
      const errorMessage = `Azure DevOps on-prem: multiple projects contain a repository named "${repoName}" but none have a remoteUrl matching /${org}/_git/${repoName}. Cannot safely pick a project.`;
      dbgError(errorMessage, {
        source: 'resolveProjectForRepository',
        repository: repoName,
        organization: org,
        candidateProjects: byName.map(r => r.project?.name).filter(Boolean),
        candidateRemoteUrls: byName.map(r => r.remoteUrl || null)
      });
      throw new Error(`${errorMessage} Use a URL that includes the project (e.g. /${org}/{project}/_git/${repoName}).`);
    }

    if (byName.length === 1 && byName[0].project && byName[0].project.name) {
      this.project = byName[0].project.name;
      dbgLog('Resolved project via collection-level git/repositories (single match):', {
        repository: repoName,
        project: this.project
      });
      return;
    }

    throw new Error(`Could not find project for repository: ${repoName}. Ensure the repo exists and the PAT has access.`);
  }

  /**
   * Resolve repository ID asynchronously
   */
  async resolveRepositoryId() {
    try {
      const repoInfo = await this.getRepository();
      this.repositoryId = repoInfo.id;
      dbgLog('Azure DevOps API repository ID resolved:', {
        repository: this.repository,
        repositoryId: this.repositoryId
      });
    } catch (error) {
      dbgWarn('Failed to resolve repository ID:', error);
      throw error;
    }
  }

  /**
   * Make authenticated request to Azure DevOps API.
   * Uses instance project (after lazy resolution when needed); for explicit project use _fetchApi(endpoint, project).
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} API response
   */
  async makeRequest(endpoint, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Azure DevOps API not initialized');
    }

    // Lazy project resolution for on-prem /{collection}/_git/{repo} (no project in URL)
    const isOnPrem = this.baseUrl && !this.baseUrl.includes('dev.azure.com') && !this.baseUrl.includes('visualstudio.com');
    if (isOnPrem && (this.project == null || this.project === '') && !this._projectResolutionPromise) {
      this._projectResolutionPromise = this.resolveProjectForRepository();
    }
    if (this._projectResolutionPromise) {
      try {
        await this._projectResolutionPromise;
      } catch (err) {
        // Clear the failed promise so future calls can retry resolution
        this._projectResolutionPromise = null;
        throw err;
      }
    }

    dbgLog('Making Azure DevOps API request:', {
      endpoint,
      project: this.project,
      repositoryId: this.repositoryId,
      repository: this.repository
    });

    try {
      const response = await this._fetchApi(endpoint, undefined, options);
      
        if (!response.ok) {
          const errorText = await response.text();
          let parsedError = null;
          try {
            parsedError = JSON.parse(errorText);
          } catch (parseErr) {
            // Ignore JSON parse failures, default to raw text
          }
          const errorMessage = parsedError?.message || errorText;
          
          // Handle 401 Unauthorized - token is invalid or expired
          if (response.status === 401) {
            dbgWarn('Azure DevOps authentication failed - token is invalid or not set');
            throw new AzureDevOpsAuthError(
              'Azure DevOps Personal Access Token is invalid, expired, or not set. Please check your token configuration.',
              401,
              {
                status: 401,
                userMessage: null,
                rawMessage: errorMessage
              }
            );
          }
          
          // Handle 403 Forbidden - token lacks access or org policies block it
          if (response.status === 403) {
            const userMessage = parsedError?.message || 'Azure DevOps denied access to this pull request.';
            dbgWarn('Azure DevOps access blocked (403):', userMessage);
            throw new AzureDevOpsAuthError(
              'Azure DevOps denied access for this token. Please ensure the PAT belongs to a member with access to this organization/project.',
              403,
              {
                status: 403,
                code: parsedError?.typeKey || parsedError?.typeName || null,
                userMessage,
                rawMessage: errorMessage
              }
            );
          }
          
          throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

      return response;
    } catch (error) {
      dbgWarn('Azure DevOps API request failed:', error);
      throw error;
    }
  }

  /**
   * Get pull request details
   * @param {string|number} pullRequestId - Pull request ID
   * @returns {Promise<Object>} Pull request details
   */
  async getPullRequest(pullRequestId) {
    const endpoint = `git/repositories/${this.repositoryId}/pullRequests/${pullRequestId}`;
    const response = await this.makeRequest(endpoint);
    const data = await response.json();
    
    dbgLog('Retrieved pull request details:', {
      id: data.pullRequestId,
      title: data.title,
      status: data.status
    });

    return data;
  }

  /**
   * Get pull request changes (files and diffs)
   * @param {string|number} pullRequestId - Pull request ID
   * @returns {Promise<Object>} Pull request changes
   */
  async getPullRequestChanges(pullRequestId) {
    try {
      // First get the iterations to find the latest iteration ID
      const iterations = await this.getPullRequestIterations(pullRequestId);
      
      if (!iterations || iterations.length === 0) {
        throw new Error('No iterations found for pull request');
      }
      
      // Use the latest iteration (highest iteration number)
      const latestIteration = iterations.reduce((latest, current) => 
        current.id > latest.id ? current : latest
      );
      
      dbgLog('Using iteration for changes:', {
        iterationId: latestIteration.id,
        iterationNumber: latestIteration.iterationNumber
      });
      
      // Get changes for the latest iteration
      const endpoint = `git/repositories/${this.repositoryId}/pullRequests/${pullRequestId}/iterations/${latestIteration.id}/changes`;
      const response = await this.makeRequest(endpoint);
      const data = await response.json();
      
      dbgLog('Retrieved pull request changes:', {
        changeCount: data.changeCounts?.Change || 0,
        fileCount: data.changeCounts?.Add + data.changeCounts?.Edit + data.changeCounts?.Delete || 0
      });

      return data;
    } catch (error) {
      dbgWarn('Changes endpoint failed, trying alternative approach:', error);
      
      // Fallback: get PR details and use diff between branches
      const prDetails = await this.getPullRequest(pullRequestId);
      return await this.getPullRequestDiff(prDetails);
    }
  }

  /**
   * Get pull request iterations
   * @param {string|number} pullRequestId - Pull request ID
   * @returns {Promise<Array>} List of iterations
   */
  async getPullRequestIterations(pullRequestId) {
    const endpoint = `git/repositories/${this.repositoryId}/pullRequests/${pullRequestId}/iterations`;
    const response = await this.makeRequest(endpoint);
    const data = await response.json();
    
    dbgLog('Retrieved pull request iterations:', {
      iterationCount: data.count || 0
    });

    return data.value || [];
  }

  /**
   * Get pull request diff between source and target branches.
   * Uses documented format: diffs/commits with baseVersion, targetVersion, baseVersionType, targetVersionType (no includeFileDiff).
   */
  async getPullRequestDiff(prDetails) {
    const sourceBranch = prDetails.sourceRefName?.replace('refs/heads/', '');
    const targetBranch = prDetails.targetRefName?.replace('refs/heads/', '');
    
    if (!sourceBranch || !targetBranch) {
      throw new Error('Could not determine source or target branch');
    }

    const endpoint = `git/repositories/${this.repositoryId}/diffs/commits`;
    const params = new URLSearchParams({
      baseVersion: targetBranch,
      baseVersionType: 'branch',
      targetVersion: sourceBranch,
      targetVersionType: 'branch',
      diffCommonCommit: 'true',
      $top: '1000'
    });

    const response = await this.makeRequest(`${endpoint}?${params}`);
    const data = await response.json();
    
    dbgLog('Retrieved pull request diff:', {
      changeCount: data.changeCounts?.Change || 0,
      fileCount: data.changeEntries?.length || 0,
      sampleChangeEntry: data.changeEntries?.[0],
      dataKeys: Object.keys(data)
    });

    return data;
  }

  /**
   * Get pull request commits
   * @param {string|number} pullRequestId - Pull request ID
   * @returns {Promise<Array>} List of commits
   */
  async getPullRequestCommits(pullRequestId) {
    const endpoint = `git/repositories/${this.repositoryId}/pullRequests/${pullRequestId}/commits`;
    const response = await this.makeRequest(endpoint);
    const data = await response.json();
    
    dbgLog('Retrieved pull request commits:', {
      commitCount: data.count || 0
    });

    return data.value || [];
  }

  /**
   * Get file content for a specific commit
   * @param {string} commitId - Commit ID
   * @param {string} filePath - File path
   * @returns {Promise<string>} File content
   */
  async getFileContent(commitId, filePath) {
    const endpoint = `git/repositories/${this.repositoryId}/items`;
    const params = new URLSearchParams({
      path: filePath,
      version: commitId,
      includeContent: 'true'
    });

    const response = await this.makeRequest(`${endpoint}?${params}`);
    const data = await response.json();
    
    return data.content || '';
  }


  /**
   * Create a unified diff for LLM/backend using jsdiff (vendor/diff.min.js).
   * Returns empty string if jsdiff is not loaded or createTwoFilesPatch throws.
   * @param {string} filePath - File path
   * @param {string} oldContent - Old file content
   * @param {string} newContent - New file content
   * @returns {string} Unified diff (---/+++ and hunks) or ''
   */
  createSimpleDiff(filePath, oldContent, newContent) {
    const oldStr = oldContent ?? '';
    const newStr = newContent ?? '';

    if (!Diff || typeof Diff.createTwoFilesPatch !== 'function') {
      dbgWarn('createSimpleDiff: jsdiff not loaded (vendor/diff.min.js); cannot compute diff');
      return '';
    }
    try {
      const opts = Diff.FILE_HEADERS_ONLY ? { headerOptions: Diff.FILE_HEADERS_ONLY } : {};
      const patch = Diff.createTwoFilesPatch(`a/${filePath}`, `b/${filePath}`, oldStr, newStr, '', '', opts);
      return patch || '';
    } catch (e) {
      dbgWarn('createSimpleDiff: createTwoFilesPatch failed', e);
      return '';
    }
  }

  /**
   * Get Git diff between two commits using Git API.
   * Uses documented format: diffs/commits with baseVersion, targetVersion, baseVersionType, targetVersionType (no includeFileDiff).
   */
  async getGitDiff(baseCommit, targetCommit) {
    try {
      dbgLog('Fetching Git diff between commits:', { baseCommit, targetCommit });
      
      const endpoint = `git/repositories/${this.repositoryId}/diffs/commits`;
      const params = new URLSearchParams({
        baseVersion: baseCommit,
        baseVersionType: 'commit',
        targetVersion: targetCommit,
        targetVersionType: 'commit',
        diffCommonCommit: 'true',
        $top: '1000'
      });

      const response = await this.makeRequest(`${endpoint}?${params}`);
      const data = await response.json();
      
      dbgLog('Git diff response:', {
        changeEntryCount: data.changeEntries?.length || 0,
        hasFileDiff: data.changeEntries?.[0]?.fileDiff ? 'yes' : 'no',
        sampleEntry: data.changeEntries?.[0] ? {
          path: data.changeEntries[0].item?.path,
          hasFileDiff: !!data.changeEntries[0].fileDiff
        } : 'none'
      });
      
      return data;
    } catch (error) {
      dbgWarn('Failed to get Git diff:', error);
      throw error;
    }
  }

  /**
   * Get file diff using Git compare endpoint
   * @param {string} baseCommit - Base commit ID
   * @param {string} targetCommit - Target commit ID
   * @param {string} filePath - File path
   * @param {string} [changeType] - 'add' | 'edit' | 'delete'; for 'add' we skip base fetch (file didn't exist)
   * @returns {Promise<string>} File diff content
   */
  async getGitFileDiff(baseCommit, targetCommit, filePath, changeType = null) {
    try {
      dbgLog('Fetching Git file diff:', { baseCommit, targetCommit, filePath, changeType });
      
      const endpoint = `git/repositories/${this.repositoryId}/items`;
      const params = new URLSearchParams({
        path: filePath,
        version: targetCommit,
        versionType: 'commit',
        includeContent: 'true'
      });

      const response = await this.makeRequest(`${endpoint}?${params}`);
      const data = await response.json();
      
      const targetContent = data.content || '';
      
      // For 'add' the file didn't exist in base commit - don't request it (would 404)
      let baseContent = '';
      if (changeType !== 'add') {
        try {
          const baseResponse = await this.makeRequest(`${endpoint}?${new URLSearchParams({
            path: filePath,
            version: baseCommit,
            versionType: 'commit',
            includeContent: 'true'
          })}`);
          const baseData = await baseResponse.json();
          baseContent = baseData.content || '';
        } catch (baseError) {
          baseContent = '';
        }
      }
      
      const diff = this.createSimpleDiff(filePath, baseContent, targetContent);
      return diff;
    } catch (error) {
      dbgWarn('Failed to get Git file diff:', error);
      return '';
    }
  }

  /**
   * Get pull request threads (comments)
   * @param {string|number} pullRequestId - Pull request ID
   * @returns {Promise<Array>} List of threads
   */
  async getPullRequestThreads(pullRequestId) {
    const endpoint = `git/repositories/${this.repositoryId}/pullRequests/${pullRequestId}/threads`;
    const response = await this.makeRequest(endpoint);
    const data = await response.json();
    
    dbgLog('Retrieved pull request threads:', {
      threadCount: data.count || 0
    });

    return data.value || [];
  }

  /**
   * Get repository branches
   * @returns {Promise<Array>} List of branches
   */
  async getBranches() {
    const endpoint = `git/repositories/${this.repositoryId}/refs`;
    const params = new URLSearchParams({
      filter: 'heads/',
      includeStatuses: 'true'
    });

    const response = await this.makeRequest(`${endpoint}?${params}`);
    const data = await response.json();
    
    dbgLog('Retrieved repository branches:', {
      branchCount: data.count || 0
    });

    return data.value || [];
  }

  /**
   * Test API connection and token validity
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    try {
      const endpoint = `git/repositories/${this.repositoryId}`;
      await this.makeRequest(endpoint);
      dbgLog('Azure DevOps API connection test successful');
      return true;
    } catch (error) {
      dbgWarn('Azure DevOps API connection test failed:', error);
      return false;
    }
  }

  /**
   * Get user information from token
   * @returns {Promise<Object>} User information
   */
  async getCurrentUser() {
    try {
      const endpoint = 'profile/profiles/me';
      const response = await this.makeRequest(endpoint);
      const data = await response.json();
      
      dbgLog('Retrieved current user info:', {
        id: data.id,
        displayName: data.displayName
      });

      return data;
    } catch (error) {
      dbgWarn('Failed to get current user info:', error);
      throw error;
    }
  }

  /**
   * Get project information
   * @returns {Promise<Object>} Project information
   */
  async getProject() {
    try {
      const endpoint = `projects/${this.project}`;
      const response = await this.makeRequest(endpoint);
      const data = await response.json();
      
      dbgLog('Retrieved project info:', {
        id: data.id,
        name: data.name,
        description: data.description
      });

      return data;
    } catch (error) {
      dbgWarn('Failed to get project info:', error);
      throw error;
    }
  }

  /**
   * Get repository information
   * @returns {Promise<Object>} Repository information
   */
  async getRepository() {
    try {
      const endpoint = `git/repositories/${this.repository}`;
      const response = await this.makeRequest(endpoint);
      const data = await response.json();
      
      dbgLog('Retrieved repository info:', {
        id: data.id,
        name: data.name,
        url: data.url
      });

      return data;
    } catch (error) {
      dbgWarn('Failed to get repository info:', error);
      throw error;
    }
  }
}

// Create and export a singleton instance
export const azureDevOpsAPI = new AzureDevOpsAPI();

// ---------------------------------------------------------------------------
// Server version detection (run from content script, cached in extension storage)
// ---------------------------------------------------------------------------

const AZURE_DEVOPS_SERVER_VERSIONS_KEY = 'azureDevOpsServerVersions';

const VERSIONS_TO_CHECK = [
  { api: '7.2', label: 'Azure DevOps Server 2022 Update 2' },
  { api: '7.1', label: 'Azure DevOps Server 2022 Update 1' },
  { api: '7.0', label: 'Azure DevOps Server 2022' },
  { api: '6.0', label: 'Azure DevOps Server 2020' },
  { api: '5.0', label: 'Azure DevOps Server 2019' },
  { api: '4.1', label: 'TFS 2018 Update 2+' },
  { api: '3.0', label: 'TFS 2017' }
];

/**
 * Get cached server version display string for an origin (if any).
 * Handles both legacy string cache and object cache { version, azureOnPremiseVersion, azureOnPremiseApiVersion }.
 * @param {string} origin - e.g. window.location.origin
 * @returns {Promise<string|null>} Cached version string or null
 */
export function getCachedServerVersion(origin) {
  if (!origin || typeof chrome === 'undefined' || !chrome.storage?.local) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    chrome.storage.local.get([AZURE_DEVOPS_SERVER_VERSIONS_KEY], (result) => {
      const map = result[AZURE_DEVOPS_SERVER_VERSIONS_KEY] || {};
      const raw = map[origin];
      if (raw == null) {
        resolve(null);
        return;
      }
      if (typeof raw === 'object' && raw.version) {
        resolve(raw.version);
        return;
      }
      if (typeof raw === 'string') resolve(raw);
      else resolve(null);
    });
  });
}

/**
 * Check if we have valid azureOnPremiseVersion and azureOnPremiseApiVersion for this origin in storage.
 * Used to decide whether to run detection and send to cloud (only when missing or invalid).
 * @param {string} origin
 * @returns {Promise<boolean>} true if both fields are stored and non-empty
 */
export function hasValidAzureOnPremiseFields(origin) {
  if (!origin || typeof chrome === 'undefined' || !chrome.storage?.local) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    chrome.storage.local.get([AZURE_DEVOPS_SERVER_VERSIONS_KEY], (result) => {
      const map = result[AZURE_DEVOPS_SERVER_VERSIONS_KEY] || {};
      const raw = map[origin];
      if (raw == null || typeof raw !== 'object') {
        resolve(false);
        return;
      }
      const a = raw.azureOnPremiseVersion;
      const b = raw.azureOnPremiseApiVersion;
      resolve(
        typeof a === 'string' && a.trim() !== '' &&
        typeof b === 'string' && b.trim() !== ''
      );
    });
  });
}

/**
 * Get cached API version string for an origin (for use in API request query param).
 * @param {string} origin - e.g. window.location.origin
 * @returns {Promise<string|null>} Cached azureOnPremiseApiVersion or null
 */
export function getCachedAzureApiVersion(origin) {
  if (!origin || typeof chrome === 'undefined' || !chrome.storage?.local) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    chrome.storage.local.get([AZURE_DEVOPS_SERVER_VERSIONS_KEY], (result) => {
      const map = result[AZURE_DEVOPS_SERVER_VERSIONS_KEY] || {};
      const raw = map[origin];
      if (raw == null || typeof raw !== 'object' || typeof raw.azureOnPremiseApiVersion !== 'string') {
        resolve(null);
        return;
      }
      const v = raw.azureOnPremiseApiVersion.trim();
      resolve(v !== '' ? v : null);
    });
  });
}

/**
 * Detect Azure DevOps Server version by probing _apis/projects with different api-version values.
 * Only runs (and sends to cloud) when the two fields azureOnPremiseVersion and azureOnPremiseApiVersion
 * were never stored or were null/invalid; otherwise returns cached.
 * Call from content script when on an Azure DevOps page (uses same origin as the page).
 * @param {string} origin - e.g. window.location.origin
 * @param {string} collection - First path segment (e.g. DefaultCollection or org name)
 * @returns {Promise<{ version: string, fromCache: boolean, azureOnPremiseVersion?: string|null, azureOnPremiseApiVersion?: string|null }>}
 */
export async function detectAndCacheServerVersion(origin, collection) {
  const fallback = { version: 'Unknown (storage not available)', fromCache: false, azureOnPremiseVersion: null, azureOnPremiseApiVersion: null };
  if (!origin || !collection) {
    return { version: 'Unknown (missing origin or collection)', fromCache: false, azureOnPremiseVersion: null, azureOnPremiseApiVersion: null };
  }
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return fallback;
  }

  const hasValid = await hasValidAzureOnPremiseFields(origin);
  if (hasValid) {
    const map = await new Promise((resolve) => {
      chrome.storage.local.get([AZURE_DEVOPS_SERVER_VERSIONS_KEY], (result) => {
        resolve(result[AZURE_DEVOPS_SERVER_VERSIONS_KEY] || {});
      });
    });
    const raw = map[origin];
    const versionStr = typeof raw === 'object' && raw?.version ? raw.version : (typeof raw === 'string' ? raw : null);
    if (versionStr) {
      dbgLog('Azure DevOps Server version (cached, valid fields):', { origin, version: versionStr });
      return {
        version: versionStr,
        fromCache: true,
        azureOnPremiseVersion: raw.azureOnPremiseVersion ?? null,
        azureOnPremiseApiVersion: raw.azureOnPremiseApiVersion ?? null
      };
    }
  }

  const baseUrl = `${origin}/${collection}/_apis/projects`;
  let detectedVersion = 'Unknown / Could not connect';
  let azureOnPremiseApiVersion = null;
  let azureOnPremiseVersion = null;

  for (const v of VERSIONS_TO_CHECK) {
    try {
      const testUrl = `${baseUrl}?api-version=${v.api}`;
      const response = await fetch(testUrl, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' }
      });
      if (response.ok) {
        detectedVersion = `${v.label} (Supports API ${v.api})`;
        azureOnPremiseApiVersion = v.api;
        azureOnPremiseVersion = v.label;
        break;
      }
      if (response.status === 401) {
        detectedVersion = '401 Unauthorized (Auth works, but version check blocked)';
        break;
      }
    } catch (e) {
      // Continue to next version
    }
  }

  const map = await new Promise((resolve) => {
    chrome.storage.local.get([AZURE_DEVOPS_SERVER_VERSIONS_KEY], (result) => {
      resolve(result[AZURE_DEVOPS_SERVER_VERSIONS_KEY] || {});
    });
  });
  map[origin] = {
    version: detectedVersion,
    azureOnPremiseVersion: azureOnPremiseVersion,
    azureOnPremiseApiVersion: azureOnPremiseApiVersion
  };
  await new Promise((resolve) => {
    chrome.storage.local.set({ [AZURE_DEVOPS_SERVER_VERSIONS_KEY]: map }, resolve);
  });

  dbgLog('Azure DevOps Server version detected and cached:', { origin, version: detectedVersion, azureOnPremiseVersion, azureOnPremiseApiVersion });
  return {
    version: detectedVersion,
    fromCache: false,
    azureOnPremiseVersion,
    azureOnPremiseApiVersion
  };
}
