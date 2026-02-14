// azure-devops-api.js
// Azure DevOps API service for fetching pull request data and code changes
import { dbgLog, dbgWarn, dbgError } from '../utils/logger.js';



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
    this.isInitialized = false;
  }

  /**
   * Initialize the API service with token and organization info
   * @param {string} token - Azure DevOps Personal Access Token
   * @param {string} organization - Organization name
   * @param {string} project - Project name
   * @param {string} repository - Repository name
   * @param {string} hostname - Hostname (optional, used to determine base URL for visualstudio.com domains)
   * @param {string} protocol - Protocol (optional, e.g. 'http:' or 'https:'; used for custom/on-prem to match page)
   */
  async init(token, organization, project, repository, hostname = null, protocol = null) {
    if (!token) {
      throw new Error('Azure DevOps token is required');
    }

    this.token = token;
    this.organization = organization;
    this.project = project;
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

    // Initialize with repository name first, then resolve ID asynchronously
    this.repositoryId = repository;
    this.isInitialized = true;
    
    // Get repository ID for more reliable API calls (async, non-blocking)
    this.resolveRepositoryId().catch(error => {
      dbgWarn('Could not resolve repository ID, using repository name:', error);
    });
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
   * Make authenticated request to Azure DevOps API
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} API response
   */
  async makeRequest(endpoint, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Azure DevOps API not initialized');
    }

    // Handle query parameters properly
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}/${this.project}/_apis/${endpoint}${separator}api-version=7.1`;
    
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
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };

    dbgLog('Making Azure DevOps API request:', {
      url: url.substring(0, 150) + '...',
      method: requestOptions.method || 'GET',
      endpoint: endpoint,
      repositoryId: this.repositoryId,
      repository: this.repository
    });

    try {
      const response = await fetch(url, requestOptions);
      
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
   * Get pull request diff between source and target branches
   * @param {Object} prDetails - Pull request details
   * @returns {Promise<Object>} Pull request diff data
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
      targetVersion: sourceBranch,
      diffCommonCommit: 'true',
      includeFileDiff: 'true'
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
   * Create a simple diff between two file contents
   * @param {string} filePath - File path
   * @param {string} oldContent - Old file content
   * @param {string} newContent - New file content
   * @returns {string} Simple diff format
   */
  createSimpleDiff(filePath, oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    let diff = `--- a/${filePath}\n+++ b/${filePath}\n`;
    
    // Handle new files (oldContent is empty)
    if (!oldContent && newContent) {
      diff += `@@ -0,0 +1,${newLines.length} @@\n`;
      for (const line of newLines) {
        diff += `+${line}\n`;
      }
      return diff;
    }
    
    // Handle deleted files (newContent is empty)
    if (oldContent && !newContent) {
      diff += `@@ -1,${oldLines.length} +0,0 @@\n`;
      for (const line of oldLines) {
        diff += `-${line}\n`;
      }
      return diff;
    }
    
    // Handle modified files - simple line-by-line comparison
    const maxLines = Math.max(oldLines.length, newLines.length);
    let hasChanges = false;
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine === newLine) {
        if (hasChanges) {
          diff += ` ${oldLine}\n`;
        }
      } else {
        if (!hasChanges) {
          diff += `@@ -${i + 1},${oldLines.length - i} +${i + 1},${newLines.length - i} @@\n`;
          hasChanges = true;
        }
        
        if (oldLine) {
          diff += `-${oldLine}\n`;
        }
        if (newLine) {
          diff += `+${newLine}\n`;
        }
      }
    }
    
    return diff;
  }

  /**
   * Get Git diff between two commits using Git API
   * @param {string} baseCommit - Base commit ID
   * @param {string} targetCommit - Target commit ID
   * @returns {Promise<Object>} Git diff data
   */
  async getGitDiff(baseCommit, targetCommit) {
    try {
      dbgLog('Fetching Git diff between commits:', { baseCommit, targetCommit });
      
      const endpoint = `git/repositories/${this.repositoryId}/diffs/commits`;
      const params = new URLSearchParams({
        baseVersion: baseCommit,
        targetVersion: targetCommit,
        diffCommonCommit: 'true',
        includeFileDiff: 'true',
        top: '1000' // Get more files
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
   * @returns {Promise<string>} File diff content
   */
  async getGitFileDiff(baseCommit, targetCommit, filePath) {
    try {
      dbgLog('Fetching Git file diff:', { baseCommit, targetCommit, filePath });
      
      // Try the Git compare endpoint
      const endpoint = `git/repositories/${this.repositoryId}/items`;
      const params = new URLSearchParams({
        path: filePath,
        version: targetCommit,
        versionType: 'commit',
        includeContent: 'true'
      });

      const response = await this.makeRequest(`${endpoint}?${params}`);
      const data = await response.json();
      
      // Get the file content from the target commit
      const targetContent = data.content || '';
      
      // Now get the file content from the base commit
      let baseContent = '';
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
      
      // Create diff from the two file contents
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
