// azure-devops-api.js
// Azure DevOps API service for fetching pull request data and code changes

// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[Azure DevOps API]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[Azure DevOps API]', ...args); }

/**
 * Custom error class for Azure DevOps authentication failures
 */
export class AzureDevOpsAuthError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'AzureDevOpsAuthError';
    this.statusCode = statusCode;
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
   */
  async init(token, organization, project, repository) {
    if (!token) {
      throw new Error('Azure DevOps token is required');
    }

    this.token = token;
    this.organization = organization;
    this.project = project;
    this.repository = repository;
    
    // Determine base URL based on organization
    if (organization.includes('visualstudio.com')) {
      this.baseUrl = `https://${organization}`;
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
        
        // Handle 401 Unauthorized - token is invalid or expired
        if (response.status === 401) {
          dbgWarn('Azure DevOps authentication failed - token is invalid or not set');
          throw new AzureDevOpsAuthError(
            'Azure DevOps Personal Access Token is invalid, expired, or not set. Please check your token configuration.',
            401
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
