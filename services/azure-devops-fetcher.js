// azure-devops-fetcher.js
// Azure DevOps code fetcher that retrieves and formats code changes for AI review



import { azureDevOpsAPI } from './azure-devops-api.js';

import { dbgLog, dbgWarn, dbgError } from '../utils/logger.js';
/**
 * Azure DevOps Code Fetcher
 * Handles fetching and formatting code changes from Azure DevOps pull requests
 */
export class AzureDevOpsFetcher {
  constructor() {
    this.isInitialized = false;
    this.prInfo = null;
  }

  /**
   * Initialize the fetcher with PR information
   * @param {Object} prInfo - Pull request information from detector
   * @param {string} token - Azure DevOps Personal Access Token
   */
  async init(prInfo, token) {
    if (!prInfo || !token) {
      throw new Error('PR info and token are required');
    }

    this.prInfo = prInfo;
    
    // Initialize the API service
    await azureDevOpsAPI.init(
      token,
      prInfo.organization,
      prInfo.project,
      prInfo.repository.name,
      prInfo.hostname
    );

    this.isInitialized = true;
    dbgLog('Azure DevOps fetcher initialized:', {
      prId: prInfo.prId,
      repository: prInfo.repository.name,
      organization: prInfo.organization
    });
  }

  /**
   * Fetch and format code changes for AI review
   * @returns {Promise<Object>} Formatted code changes
   */
  async fetchCodeChanges() {
    if (!this.isInitialized) {
      throw new Error('Azure DevOps fetcher not initialized');
    }

    try {
      dbgLog('Fetching code changes for PR:', this.prInfo.prId);

      // Get pull request details
      const prDetails = await azureDevOpsAPI.getPullRequest(this.prInfo.prId);
      
      // Get commits first
      const commits = await azureDevOpsAPI.getPullRequestCommits(this.prInfo.prId);
      
      // Try Git-based approach first - use diffs/commits endpoint for actual diff content
      let changes = null;
      try {
        if (commits.length >= 1) {
          // Get source and target commit IDs
          const sourceCommit = prDetails.lastMergeSourceCommit?.commitId || commits[0]?.commitId;
          const targetCommit = prDetails.lastMergeTargetCommit?.commitId;
          
          if (sourceCommit && targetCommit) {
            dbgLog('Fetching Git diff between target and source commits:', { targetCommit, sourceCommit });
            // Use target as base, source as target to get the PR changes
            changes = await azureDevOpsAPI.getGitDiff(targetCommit, sourceCommit);
          } else {
            dbgWarn('Could not determine source/target commits for Git diff');
          }
        }
      } catch (gitError) {
        dbgWarn('Git diff approach failed, falling back to changes endpoint:', gitError);
      }
      
      // Fallback to pull request changes endpoint
      if (!changes) {
        dbgLog('Using fallback: pull request changes endpoint');
        changes = await azureDevOpsAPI.getPullRequestChanges(this.prInfo.prId);
      }

      // Format the changes into a patch-like format
      const formattedChanges = await this.formatChangesAsPatch(prDetails, changes, commits);

      dbgLog('Successfully fetched and formatted code changes:', {
        fileCount: formattedChanges.files.length,
        totalLines: formattedChanges.totalLines
      });

      return formattedChanges;
    } catch (error) {
      dbgWarn('Error fetching code changes:', error);
      throw error;
    }
  }

  /**
   * Format Azure DevOps changes into a patch-like format for AI review
   * @param {Object} prDetails - Pull request details
   * @param {Object} changes - Pull request changes
   * @param {Array} commits - List of commits
   * @returns {Promise<Object>} Formatted changes
   */
  async formatChangesAsPatch(prDetails, changes, commits) {
    const formattedPatch = {
      header: this.createPatchHeader(prDetails, commits),
      files: [],
      totalLines: 0,
      metadata: {
        prId: this.prInfo.prId,
        title: prDetails.title,
        author: prDetails.createdBy?.displayName || 'Unknown',
        sourceBranch: prDetails.sourceRefName?.replace('refs/heads/', '') || 'Unknown',
        targetBranch: prDetails.targetRefName?.replace('refs/heads/', '') || 'Unknown',
        status: prDetails.status,
        createdAt: prDetails.creationDate,
        commits: commits.length
      }
    };

    // Process each changed file
    for (const change of changes.changeEntries || []) {
      try {
        const fileChange = await this.processFileChange(change, commits, prDetails);
        if (fileChange) {
          formattedPatch.files.push(fileChange);
          formattedPatch.totalLines += fileChange.linesAdded + fileChange.linesRemoved;
        }
      } catch (error) {
        dbgWarn('Error processing file change:', error);
        // Continue with other files
      }
    }

    return formattedPatch;
  }

  /**
   * Create patch header information
   * @param {Object} prDetails - Pull request details
   * @param {Array} commits - List of commits (optional)
   * @returns {string} Patch header
   */
  createPatchHeader(prDetails, commits = []) {
    const header = [
      `From: ${prDetails.createdBy?.displayName || 'Unknown'} <${prDetails.createdBy?.uniqueName || 'unknown@example.com'}>`,
      `Date: ${new Date(prDetails.creationDate).toISOString()}`,
      `Subject: [PATCH] ${prDetails.title}`,
      `Pull Request: #${prDetails.pullRequestId}`,
      `Source Branch: ${prDetails.sourceRefName?.replace('refs/heads/', '') || 'Unknown'}`,
      `Target Branch: ${prDetails.targetRefName?.replace('refs/heads/', '') || 'Unknown'}`,
      `Status: ${prDetails.status}`,
      `Commits: ${commits.length}`,
      `---`
    ].join('\n');

    return header;
  }

  /**
   * Process individual file change
   * @param {Object} change - File change object
   * @param {Array} commits - List of commits
   * @param {Object} prDetails - Pull request details
   * @returns {Promise<Object|null>} Processed file change or null if skipped
   */
  async processFileChange(change, commits, prDetails = null) {
    const filePath = change.item?.path;
    if (!filePath) {
      return null;
    }

    // Skip binary files and large files
    if (this.shouldSkipFile(change)) {
      dbgLog('Skipping file:', filePath, 'Reason: Binary or too large');
      return null;
    }

    try {
      const fileChange = {
        path: filePath,
        changeType: change.changeType,
        linesAdded: 0,
        linesRemoved: 0,
        content: '',
        diff: ''
      };

      // Priority 1: Use diff content from the change object if available (from diffs/commits endpoint)
      let diffContent = '';
      if (change.fileDiff) {
        // Azure DevOps returns base64 encoded diff content
        try {
          diffContent = atob(change.fileDiff);
          dbgLog('Using diff content from change object for:', filePath);
        } catch (e) {
          dbgWarn('Failed to decode fileDiff for:', filePath, e);
        }
      }
      
      // Priority 2: Fetch individual file diff using commits
      if (!diffContent && commits.length > 0 && prDetails) {
        try {
          const sourceCommit = prDetails.lastMergeSourceCommit?.commitId || commits[0]?.commitId;
          const targetCommit = prDetails.lastMergeTargetCommit?.commitId;
          
          if (sourceCommit && targetCommit) {
            dbgLog('Fetching individual file diff for:', filePath);
            diffContent = await azureDevOpsAPI.getGitFileDiff(targetCommit, sourceCommit, filePath);
          }
        } catch (error) {
          dbgWarn('Failed to fetch Git-based diff for:', filePath, error);
        }
      }
      
      fileChange.diff = diffContent;

      // Calculate line changes
      this.calculateLineChanges(fileChange);

      return fileChange;
    } catch (error) {
      dbgWarn('Error processing file change for:', filePath, error);
      return null;
    }
  }

  /**
   * Check if file should be skipped
   * @param {Object} change - File change object
   * @returns {boolean} True if file should be skipped
   */
  shouldSkipFile(change) {
    const filePath = change.item?.path?.toLowerCase() || '';
    
    // Skip binary file extensions
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico',
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
      '.mp3', '.wav', '.flac', '.aac', '.ogg',
      '.zip', '.rar', '.7z', '.tar', '.gz',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.exe', '.dll', '.so', '.dylib',
      '.woff', '.woff2', '.ttf', '.eot'
    ];

    const hasBinaryExtension = binaryExtensions.some(ext => filePath.endsWith(ext));
    
    // Skip if file is too large (over 1MB)
    const isTooLarge = change.item?.size > 1024 * 1024;
    
    return hasBinaryExtension || isTooLarge;
  }

  /**
   * Calculate line changes from diff content
   * @param {Object} fileChange - File change object
   */
  calculateLineChanges(fileChange) {
    if (!fileChange.diff) {
      return;
    }

    const diffLines = fileChange.diff.split('\n');
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const line of diffLines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        linesAdded++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        linesRemoved++;
      }
    }

    fileChange.linesAdded = linesAdded;
    fileChange.linesRemoved = linesRemoved;
  }

  /**
   * Convert formatted changes to patch string
   * @param {Object} formattedChanges - Formatted changes object
   * @returns {string} Patch string
   */
  toPatchString(formattedChanges) {
    const patchLines = [formattedChanges.header];

    for (const file of formattedChanges.files) {
      patchLines.push(`diff --git a/${file.path} b/${file.path}`);
      patchLines.push(`index 0000000..1111111 100644`);
      patchLines.push(`--- a/${file.path}`);
      patchLines.push(`+++ b/${file.path}`);
      
      if (file.diff) {
        patchLines.push(file.diff);
      } else if (file.content) {
        // If no diff available, show the full file content
        const contentLines = file.content.split('\n');
        for (const line of contentLines) {
          patchLines.push(`+${line}`);
        }
      }
      
      patchLines.push(''); // Empty line between files
    }

    return patchLines.join('\n');
  }

  /**
   * Get summary of changes
   * @param {Object} formattedChanges - Formatted changes object
   * @returns {Object} Changes summary
   */
  getChangesSummary(formattedChanges) {
    const summary = {
      totalFiles: formattedChanges.files.length,
      totalLines: formattedChanges.totalLines,
      linesAdded: 0,
      linesRemoved: 0,
      filesByType: {
        added: 0,
        modified: 0,
        deleted: 0,
        renamed: 0
      }
    };

    for (const file of formattedChanges.files) {
      summary.linesAdded += file.linesAdded;
      summary.linesRemoved += file.linesRemoved;
      
      switch (file.changeType) {
        case 1: // Add
          summary.filesByType.added++;
          break;
        case 2: // Edit
          summary.filesByType.modified++;
          break;
        case 4: // Delete
          summary.filesByType.deleted++;
          break;
        case 8: // Rename
          summary.filesByType.renamed++;
          break;
      }
    }

    return summary;
  }

  /**
   * Test the fetcher connection
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    try {
      return await azureDevOpsAPI.testConnection();
    } catch (error) {
      dbgWarn('Fetcher connection test failed:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
export const azureDevOpsFetcher = new AzureDevOpsFetcher();
