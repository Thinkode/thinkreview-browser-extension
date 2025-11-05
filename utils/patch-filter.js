// patch-filter.js
// Utility to filter media and binary files from git patches

/**
 * List of file extensions to filter out from patch reviews
 * These are typically media, binary, or non-code files that don't benefit from AI code review
 */
const FILTERED_EXTENSIONS = [
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif',
  '.heic', '.heif', '.raw', '.psd', '.ai', '.eps', '.indd',
  
  // Videos
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm', '.m4v', '.mpg', '.mpeg',
  '.3gp', '.ogv',
  
  // Audio
  '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma', '.opus',
  
  // Archives & Compressed
  '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz', '.tgz',
  
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  
  // Fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  
  // Other binary formats
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.db', '.sqlite', '.dmg', '.iso', '.img'
];

/**
 * Checks if a filename should be filtered out based on its extension
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if the file should be filtered out
 */
export function shouldFilterFile(filename) {
  if (!filename) return false;
  
  const lowerFilename = filename.toLowerCase();
  return FILTERED_EXTENSIONS.some(ext => lowerFilename.endsWith(ext));
}

/**
 * Parses a git patch/diff and extracts individual file changes
 * @param {string} patchContent - The complete patch content
 * @returns {Array<{filename: string, content: string, isFiltered: boolean}>} - Array of file changes
 */
export function parsePatchFiles(patchContent) {
  if (!patchContent || typeof patchContent !== 'string') {
    return [];
  }
  
  const files = [];
  const lines = patchContent.split('\n');
  let currentFile = null;
  let currentContent = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect new file diff (starts with "diff --git")
    if (line.startsWith('diff --git')) {
      // Save previous file if exists
      if (currentFile) {
        files.push({
          filename: currentFile,
          content: currentContent.join('\n'),
          isFiltered: shouldFilterFile(currentFile)
        });
      }
      
      // Extract filename from "diff --git a/path/to/file b/path/to/file"
      const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
      if (match) {
        currentFile = match[2] || match[1];
        currentContent = [line];
      }
    } else if (currentFile) {
      // Add line to current file's content
      currentContent.push(line);
    }
  }
  
  // Don't forget the last file
  if (currentFile) {
    files.push({
      filename: currentFile,
      content: currentContent.join('\n'),
      isFiltered: shouldFilterFile(currentFile)
    });
  }
  
  return files;
}

/**
 * Filters out media and binary files from a git patch
 * @param {string} patchContent - The complete patch content
 * @returns {Object} - Object with filtered patch and statistics
 */
export function filterPatch(patchContent) {
  if (!patchContent || typeof patchContent !== 'string') {
    return {
      filteredPatch: '',
      originalFileCount: 0,
      filteredFileCount: 0,
      removedFileCount: 0,
      removedFiles: []
    };
  }
  
  const files = parsePatchFiles(patchContent);
  const keptFiles = files.filter(f => !f.isFiltered);
  const removedFiles = files.filter(f => f.isFiltered);
  
  // Reconstruct the patch with only non-filtered files
  const filteredPatch = keptFiles.map(f => f.content).join('\n');
  
  return {
    filteredPatch: filteredPatch,
    originalFileCount: files.length,
    filteredFileCount: keptFiles.length,
    removedFileCount: removedFiles.length,
    removedFiles: removedFiles.map(f => f.filename)
  };
}

/**
 * Generates a human-readable summary of what was filtered
 * @param {Object} filterResult - Result from filterPatch()
 * @returns {string} - Human-readable summary
 */
export function getFilterSummary(filterResult) {
  if (!filterResult || filterResult.removedFileCount === 0) {
    return '';
  }
  
  const { removedFileCount, removedFiles } = filterResult;
  
  if (removedFileCount === 1) {
    return `Note: 1 media/binary file (${removedFiles[0]}) was excluded from the review.`;
  } else if (removedFileCount <= 3) {
    return `Note: ${removedFileCount} media/binary files (${removedFiles.join(', ')}) were excluded from the review.`;
  } else {
    return `Note: ${removedFileCount} media/binary files were excluded from the review.`;
  }
}




