/**
 * GitLab Code Suggestion Injector
 * 
 * Utility module to inject code suggestions into GitLab's diff view on the changes tab.
 * Formats suggestions as GitLab suggestion blocks and injects them into the appropriate diff lines.
 */

// Debug toggle
const DEBUG = true;
function dbgLog(...args) { if (DEBUG) console.log('[GitLabSuggestionInjector]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[GitLabSuggestionInjector]', ...args); }

/**
 * Parse patch content to build a mapping of file paths to line number ranges
 * @param {string} patchContent - The git patch/diff content
 * @returns {Map<string, Array<{startLine: number, endLine: number, diffStartLine: number}>>} - Map of file paths to line ranges
 */
function parsePatchLineMapping(patchContent) {
  const fileMap = new Map();
  if (!patchContent || typeof patchContent !== 'string') {
    return fileMap;
  }

  const lines = patchContent.split('\n');
  let currentFile = null;
  let currentFileStartLine = 0;
  let diffLineNumber = 0;
  let newFileLineNumber = 1; // Line numbers in the new version of the file

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    diffLineNumber++;

    // Detect new file diff (starts with "diff --git")
    if (line.startsWith('diff --git')) {
      // Save previous file if exists
      if (currentFile) {
        const ranges = fileMap.get(currentFile) || [];
        if (ranges.length > 0) {
          ranges[ranges.length - 1].endLine = newFileLineNumber - 1;
        }
        fileMap.set(currentFile, ranges);
      }

      // Extract filename from "diff --git a/path/to/file b/path/to/file"
      const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
      if (match) {
        currentFile = match[2] || match[1];
        currentFileStartLine = diffLineNumber;
        newFileLineNumber = 1;
        
        // Initialize ranges for this file
        fileMap.set(currentFile, []);
      }
      continue;
    }

    // Detect hunk header (e.g., "@@ -10,5 +10,7 @@")
    if (line.startsWith('@@')) {
      const hunkMatch = line.match(/@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?/);
      if (hunkMatch && currentFile) {
        const newStart = parseInt(hunkMatch[3], 10);
        newFileLineNumber = newStart;
        
        const ranges = fileMap.get(currentFile) || [];
        ranges.push({
          startLine: newStart,
          endLine: newStart, // Will be updated as we process lines
          diffStartLine: diffLineNumber
        });
        fileMap.set(currentFile, ranges);
      }
      continue;
    }

    // Track line numbers for added/modified lines
    if (currentFile && (line.startsWith('+') || line.startsWith(' '))) {
      if (line.startsWith('+')) {
        // This is an added line in the new file
        newFileLineNumber++;
      } else if (line.startsWith(' ')) {
        // Context line - increment both old and new line numbers
        newFileLineNumber++;
      }
    }
  }

  // Finalize last file
  if (currentFile) {
    const ranges = fileMap.get(currentFile) || [];
    if (ranges.length > 0) {
      ranges[ranges.length - 1].endLine = newFileLineNumber - 1;
    }
    fileMap.set(currentFile, ranges);
  }

  return fileMap;
}

/**
 * Find the GitLab diff container element
 * @returns {HTMLElement|null} - The diff container or null if not found
 */
function findGitLabDiffContainer() {
  // GitLab's diff view typically uses these selectors
  const selectors = [
    '.diff-content',
    '.file-holder',
    '[data-testid="diff-view"]',
    '.diffs',
    '#diffs',
    '.diff-viewer',
    '[data-testid="diffs"]',
    'main .content',
    '.merge-request-diffs',
    '.js-diff-file'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      dbgLog('Found GitLab diff container:', selector);
      return element;
    }
  }

  // Fallback: try to find any element that might contain diff content
  // Look for elements with "diff" in class name or id
  const allElements = document.querySelectorAll('[class*="diff"], [id*="diff"], [class*="file"], [data-testid*="diff"]');
  if (allElements.length > 0) {
    dbgLog(`Found ${allElements.length} elements with diff-related attributes, using first one`);
    return allElements[0];
  }

  // Last resort: return document body
  dbgWarn('Could not find GitLab diff container, using document body');
  return document.body;
}

/**
 * Find the specific line element in GitLab's diff view
 * @param {string} filePath - The file path
 * @param {number} lineNumber - The line number in the new file
 * @returns {HTMLElement|null} - The line element or null if not found
 */
function findGitLabDiffLine(filePath, lineNumber) {
  // Extract just the filename for matching
  const fileName = filePath.split('/').pop();
  const fileNameParts = fileName.split('.');
  const baseFileName = fileNameParts[0];
  
  dbgLog(`Looking for file: ${filePath} (filename: ${fileName})`);
  
  // Try multiple selectors for file containers
  const fileContainerSelectors = [
    '.file-holder',
    '.diff-file',
    '.file-content',
    '[data-testid="diff-file"]',
    '.diff-viewer',
    'table.diff-file',
    '.js-diff-file',
    '[data-path]',
    'table[data-path]',
    '.file',
    '[class*="file-holder"]',
    '[class*="diff-file"]'
  ];
  
  let targetFileContainer = null;
  let allContainers = [];
  
  // Collect all potential file containers
  for (const selector of fileContainerSelectors) {
    const containers = document.querySelectorAll(selector);
    allContainers.push(...Array.from(containers));
  }
  
  // Also search by data-path attribute
  const dataPathContainers = document.querySelectorAll('[data-path]');
  allContainers.push(...Array.from(dataPathContainers));
  
  // Remove duplicates
  allContainers = Array.from(new Set(allContainers));
  
  dbgLog(`Found ${allContainers.length} potential file containers`);
  
  // Count how many files have the same filename (for uniqueness check)
  const filesWithSameName = allContainers.filter(c => {
    const path = c.getAttribute('data-path');
    return path && (path.endsWith('/' + fileName) || path.endsWith(fileName) || path.includes('/' + fileName + ' '));
  });
  const isUniqueFilename = filesWithSameName.length === 1;
  dbgLog(`Found ${filesWithSameName.length} file(s) with filename "${fileName}" (unique: ${isUniqueFilename})`);
  
  // Try to find the file by matching various header/text patterns
  for (const container of allContainers) {
    // First check data-path attribute (most reliable) - must match full path
    const dataPath = container.getAttribute('data-path');
    if (dataPath) {
      // Exact match is best
      if (dataPath === filePath || dataPath.endsWith('/' + filePath) || dataPath === '/' + filePath) {
        targetFileContainer = container;
        dbgLog(`Found file container by data-path: "${dataPath}" (exact match with "${filePath}")`);
        break;
      }
      // Only use filename match if filename is unique AND we haven't found exact match
      if (!targetFileContainer && isUniqueFilename && (dataPath.endsWith('/' + fileName) || dataPath.endsWith(fileName))) {
        targetFileContainer = container;
        dbgLog(`Found file container by data-path (unique filename): "${dataPath}"`);
        break;
      }
    }
    
    // Check multiple header selectors
    const headerSelectors = [
      '.file-header-name',
      '.file-title',
      '.file-header-content',
      '[data-testid="file-header"]',
      'h2',
      'h3',
      '.file-header',
      'thead th',
      '.diff-file-header',
      '[data-qa-selector="file_path"]',
      'a[href*="/blob/"]',
      'a[href*="/-/blob/"]'
    ];
    
    let foundMatch = false;
    for (const headerSelector of headerSelectors) {
      const fileHeader = container.querySelector(headerSelector);
      if (fileHeader) {
        const headerText = fileHeader.textContent || '';
        const headerHTML = fileHeader.innerHTML || '';
        const headerHref = fileHeader.getAttribute('href') || '';
        
        // Prioritize exact path matches
        // First check for exact file path match
        if (headerText.includes(filePath) || 
            headerHTML.includes(filePath) ||
            headerHref.includes(filePath)) {
          targetFileContainer = container;
          foundMatch = true;
          dbgLog(`Found file container using selector: ${headerSelector}, exact path match: "${headerText.substring(0, 100)}"`);
          break;
        }
        
        // Only use filename match if we haven't found an exact match yet
        // and if there's only one file with this name
        if (!targetFileContainer) {
          const filesWithSameName = allContainers.filter(c => {
            const otherPath = c.getAttribute('data-path');
            const otherHeader = c.querySelector(headerSelector);
            if (otherHeader) {
              const otherText = otherHeader.textContent || '';
              return otherText.includes(fileName) || (otherPath && otherPath.endsWith(fileName));
            }
            return false;
          });
          
          // Only match by filename if there's exactly one file with this name
          if (filesWithSameName.length === 1 && 
              (headerText.includes(fileName) || 
               headerText.endsWith(fileName) ||
               headerHTML.includes(fileName) ||
               headerHref.includes(fileName))) {
            targetFileContainer = container;
            foundMatch = true;
            dbgLog(`Found file container using selector: ${headerSelector}, filename match (unique): "${headerText.substring(0, 100)}"`);
            break;
          }
        }
      }
    }
    
    // Also check the entire container text and HTML - but prioritize exact path
    if (!foundMatch) {
      const containerText = container.textContent || '';
      const containerHTML = container.innerHTML || '';
      
      // Exact path match first
      if (containerText.includes(filePath) || containerHTML.includes(filePath)) {
        targetFileContainer = container;
        foundMatch = true;
        dbgLog(`Found file container by container text match (exact path)`);
        break;
      }
      
      // Filename match only if no exact match found and filename is unique
      if (!targetFileContainer) {
        const filesWithSameName = allContainers.filter(c => {
          const cText = c.textContent || '';
          const cHTML = c.innerHTML || '';
          return cText.includes(fileName) || cHTML.includes(fileName);
        });
        
        if (filesWithSameName.length === 1 && 
            (containerText.includes(fileName) || containerHTML.includes(fileName))) {
          targetFileContainer = container;
          foundMatch = true;
          dbgLog(`Found file container by container text match (unique filename)`);
          break;
        }
      }
    }
    
    if (foundMatch) break;
  }
  
  // If still not found, try searching the entire document for the file path
  // But prioritize exact path matches
  if (!targetFileContainer) {
    dbgLog('File container not found in containers, searching entire document...');
    
    // First try to find by exact data-path match
    const allElementsWithDataPath = document.querySelectorAll('[data-path]');
    for (const element of allElementsWithDataPath) {
      const dataPath = element.getAttribute('data-path') || '';
      if (dataPath === filePath || dataPath.endsWith('/' + filePath) || dataPath === '/' + filePath) {
        targetFileContainer = element;
        dbgLog(`Found file container by document-wide data-path search: "${dataPath}"`);
        break;
      }
    }
    
    // If still not found, try text matching (but only if filename is unique)
    if (!targetFileContainer && isUniqueFilename) {
      const allElementsWithText = document.querySelectorAll('*');
      for (const element of allElementsWithText) {
        const text = element.textContent || '';
        const html = element.innerHTML || '';
        const dataPath = element.getAttribute('data-path') || '';
        
        // Prioritize exact path in text/html
        if ((text.includes(filePath) || html.includes(filePath) || dataPath === filePath) &&
            (element.querySelector('table') || element.querySelector('tr') || element.classList.contains('file') || element.querySelector('.line_holder'))) {
          targetFileContainer = element;
          dbgLog(`Found file container by document-wide search (exact path)`);
          break;
        }
      }
    }
  }

  if (!targetFileContainer) {
    dbgWarn(`Could not find file container for: ${filePath}`);
    // Log available file containers for debugging
    if (allContainers.length > 0) {
      dbgLog('Available file containers:');
      allContainers.slice(0, 10).forEach((container, idx) => {
        const header = container.querySelector('.file-header-name, .file-title, h2, h3, a[href*="blob"]') || container;
        const text = header.textContent?.substring(0, 150) || 'No text';
        const dataPath = container.getAttribute('data-path') || 'no data-path';
        const classes = container.className || 'no classes';
        dbgLog(`  Container ${idx + 1}: classes="${classes}", data-path="${dataPath}", text="${text}"`);
      });
    } else {
      // Log what we can find in the document
      dbgLog('No file containers found. Searching document for file-related elements...');
      const fileLinks = document.querySelectorAll('a[href*="blob"], a[href*="file"]');
      dbgLog(`Found ${fileLinks.length} file links in document`);
      fileLinks.slice(0, 5).forEach((link, idx) => {
        const href = link.getAttribute('href') || '';
        const text = link.textContent?.substring(0, 100) || '';
        dbgLog(`  Link ${idx + 1}: href="${href}", text="${text}"`);
      });
    }
    return null;
  }

  dbgLog(`Searching for line ${lineNumber} in file container`);
  
  // GitLab uses IDs like: e9e5e209521918cac3e46a4906fd4de581436eaa_103_104
  // Format: {hash}_{oldLine}_{newLine} - we want to match where newLine equals our lineNumber
  // Try to find by ID pattern first (most reliable for GitLab)
  const elementsWithLineId = targetFileContainer.querySelectorAll('[id]');
  for (const element of elementsWithLineId) {
    const id = element.getAttribute('id') || '';
    // Match IDs with pattern: {hash}_{oldLine}_{newLine} where newLine matches
    const idMatch = id.match(/_(\d+)_(\d+)$/);
    if (idMatch) {
      const oldLine = parseInt(idMatch[1], 10);
      const newLine = parseInt(idMatch[2], 10);
      if (newLine === lineNumber) {
        // Find the line_content div within this element
        // User specified: #id > div.diff-td.line_content.with-coverage.left-side
        // But for new file suggestions, we want right-side. Try both.
        const lineContent = element.querySelector('div.diff-td.line_content.with-coverage.right-side, div.diff-td.line_content.right-side') ||
                           element.querySelector('div.diff-td.line_content.with-coverage.left-side, div.diff-td.line_content.left-side') ||
                           element.querySelector('div.diff-td.line_content.with-coverage') ||
                           element.querySelector('div.diff-td.line_content') ||
                           element.querySelector('div.line_content');
        if (lineContent) {
          dbgLog(`Found line element for ${filePath}:${lineNumber} by ID pattern: ${id} (newLine: ${newLine}, oldLine: ${oldLine})`);
          return lineContent;
        }
        // If no line_content found, return the element itself
        dbgLog(`Found line element for ${filePath}:${lineNumber} by ID pattern (no line_content): ${id}`);
        return element;
      }
    }
    // Also check if ID ends with just _lineNumber (single line, no old line)
    if (id.endsWith('_' + lineNumber)) {
      const lineContent = element.querySelector('div.diff-td.line_content, div.line_content');
      if (lineContent) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} by ID pattern (single): ${id}`);
        return lineContent;
      }
    }
  }
  
  // Look for the line number in the new file (right side of diff)
  // GitLab typically uses data-line-number or similar attributes
  const lineSelectors = [
    `[data-line-number="${lineNumber}"]`,
    `[data-new-line="${lineNumber}"]`,
    `[data-new-line-number="${lineNumber}"]`,
    `[data-linenumber="${lineNumber}"]`,
    `.line_holder[data-linenumber="${lineNumber}"]`,
    `tr[data-new-line-number="${lineNumber}"]`,
    `td[data-linenumber="${lineNumber}"]`,
    `td[data-line-number="${lineNumber}"]`,
    `[data-qa-line-number="${lineNumber}"]`
  ];

  for (const selector of lineSelectors) {
    const lineElement = targetFileContainer.querySelector(selector);
    if (lineElement) {
      // Try to find the line_content div within this element
      const lineContent = lineElement.querySelector('.line_content, div.diff-td.line_content') || 
                         lineElement.closest('.line_holder')?.querySelector('.line_content, div.diff-td.line_content');
      if (lineContent) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} using selector: ${selector} (with line_content)`);
        return lineContent;
      }
      dbgLog(`Found line element for ${filePath}:${lineNumber} using selector: ${selector}`);
      return lineElement;
    }
  }
  
  // Also try searching all elements with data attributes that might contain the line number
  const allElementsWithData = targetFileContainer.querySelectorAll('[data-line-number], [data-new-line], [data-linenumber], [data-new-line-number]');
  dbgLog(`Found ${allElementsWithData.length} elements with line number data attributes`);
  
  for (const element of allElementsWithData) {
    const dataLine = element.getAttribute('data-line-number') || 
                    element.getAttribute('data-new-line') ||
                    element.getAttribute('data-linenumber') ||
                    element.getAttribute('data-new-line-number');
    const dataLineNum = parseInt(dataLine, 10);
    if (!isNaN(dataLineNum) && dataLineNum === lineNumber) {
      dbgLog(`Found line element for ${filePath}:${lineNumber} by data attribute search: ${dataLine}`);
      return element;
    }
  }

  // Fallback: search by line number text content in various structures
  // First, try to find elements that actually have line number data attributes
  // GitLab uses div.line_holder with child elements that have data-linenumber
  const elementsWithLineData = targetFileContainer.querySelectorAll('[data-line-number], [data-new-line], [data-linenumber], [data-new-line-number]');
  dbgLog(`Found ${elementsWithLineData.length} elements with line number data attributes`);
  
  // Check these first as they're most likely to be correct
  for (const element of elementsWithLineData) {
    const dataLine = element.getAttribute('data-line-number') || 
                    element.getAttribute('data-new-line') ||
                    element.getAttribute('data-linenumber') ||
                    element.getAttribute('data-new-line-number');
    const dataLineNum = parseInt(dataLine, 10);
    if (!isNaN(dataLineNum) && dataLineNum === lineNumber) {
      // Find the line_content div within this element or its parent
      const lineContent = element.querySelector('div.diff-td.line_content, div.line_content') ||
                         element.closest('.line_holder, .diff-grid-row')?.querySelector('div.diff-td.line_content, div.line_content');
      if (lineContent) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} by data attribute: ${dataLine} (with line_content)`);
        return lineContent;
      }
      // Find the parent line_holder or diff-grid-row container
      const lineContainer = element.closest('.line_holder, .diff-grid-row, tr, [class*="line"]') || element;
      dbgLog(`Found line element for ${filePath}:${lineNumber} by data attribute: ${dataLine}`);
      return lineContainer;
    }
  }
  
  // GitLab uses div.diff-grid-row.line_holder structure
  // Try to find line_holder divs first, then table rows
  const lineContainerSelectors = [
    '.line_holder',  // GitLab's line container
    '.diff-grid-row.line_holder',  // More specific
    'div.line_holder',  // Explicit div
    'tr',     // Table rows
    'tbody tr',
    'table tr',
    'tr td',  // Table cells
    '.line',
    '[class*="diff-line"]',
    'td.line-content',
    'td[class*="line"]',
    'div[class*="line"]',
    'div[data-line-number]'
  ];
  
  let allLines = [];
  for (const selector of lineContainerSelectors) {
    const lines = targetFileContainer.querySelectorAll(selector);
    allLines.push(...Array.from(lines));
  }
  
  // Remove duplicates
  allLines = Array.from(new Set(allLines));
  
  // Filter to only elements that might contain line numbers (have td children or data attributes)
  allLines = allLines.filter(line => {
    const hasTd = line.querySelectorAll('td').length > 0;
    const hasData = line.hasAttribute('data-line-number') || 
                   line.hasAttribute('data-new-line') ||
                   line.hasAttribute('data-linenumber') ||
                   line.hasAttribute('data-new-line-number');
    const hasText = /\d+/.test(line.textContent || '');
    return hasTd || hasData || hasText;
  });
  
  dbgLog(`Found ${allLines.length} potential line elements to search (filtered)`);
  
  // Log first few lines for debugging - check both table and div structures
  if (allLines.length > 0) {
    dbgLog('Sample line structures:');
    allLines.slice(0, 5).forEach((line, idx) => {
      const tagName = line.tagName.toLowerCase();
      const tds = line.querySelectorAll('td');
      const divs = line.querySelectorAll('div');
      const text = line.textContent?.trim().substring(0, 50) || '';
      const dataLine = line.getAttribute('data-line-number') || 
                      line.getAttribute('data-new-line') ||
                      line.getAttribute('data-linenumber') || '';
      const classes = line.className || '';
      
      if (tds.length > 0) {
        const lineNums = Array.from(tds).map(td => {
          const tdText = td.textContent?.trim() || '';
          const tdData = td.getAttribute('data-line-number') || 
                        td.getAttribute('data-new-line') ||
                        td.getAttribute('data-linenumber') || '';
          return `text="${tdText.substring(0, 15)}" data="${tdData}"`;
        }).join(', ');
        dbgLog(`  Line ${idx + 1} (${tagName}): ${tds.length} tds, [${lineNums}]`);
      } else {
        dbgLog(`  Line ${idx + 1} (${tagName}): classes="${classes.substring(0, 50)}", data="${dataLine}", text="${text}"`);
      }
    });
  }
  
  // Search for line number in various ways
  for (const line of allLines) {
    // First check the element itself for data attributes
    const lineDataNum = line.getAttribute('data-linenumber') || 
                       line.getAttribute('data-line-number') ||
                       line.getAttribute('data-new-line') ||
                       line.getAttribute('data-new-line-number') ||
                       line.getAttribute('data-line');
    const lineDataNumParsed = parseInt(lineDataNum, 10);
    if (lineDataNum === String(lineNumber) || (!isNaN(lineDataNumParsed) && lineDataNumParsed === lineNumber)) {
      dbgLog(`Found line element for ${filePath}:${lineNumber} (element data attribute: ${lineDataNum})`);
      return line;
    }
    
    // GitLab uses div.line_holder with child elements that have data-linenumber
    // Check all child elements for line number data attributes
    const childElementsWithLineData = line.querySelectorAll('[data-linenumber], [data-line-number], [data-new-line], [data-new-line-number]');
    for (const child of childElementsWithLineData) {
      const childDataLine = child.getAttribute('data-linenumber') || 
                           child.getAttribute('data-line-number') ||
                           child.getAttribute('data-new-line') ||
                           child.getAttribute('data-new-line-number');
      const childDataLineNum = parseInt(childDataLine, 10);
      if (!isNaN(childDataLineNum) && childDataLineNum === lineNumber) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (child element data attribute: ${childDataLine})`);
        return line; // Return the parent line_holder container
      }
    }
    
    // Check all td elements in the row (GitLab often uses table structure)
    const tds = line.querySelectorAll('td');
    for (const td of tds) {
      // Check text content (might be just the number or have extra spaces)
      const tdText = td.textContent?.trim();
      const tdTextNum = parseInt(tdText, 10);
      if (!isNaN(tdTextNum) && tdTextNum === lineNumber) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (td text: "${tdText}")`);
        return line;
      }
      
      // Check if text contains the line number
      if (tdText === String(lineNumber) || tdText === ` ${lineNumber}` || tdText === `${lineNumber} `) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (td text match: "${tdText}")`);
        return line;
      }
      
      // Check data attributes on td
      const tdDataLine = td.getAttribute('data-linenumber') || 
                        td.getAttribute('data-line-number') ||
                        td.getAttribute('data-new-line') ||
                        td.getAttribute('data-new-line-number') ||
                        td.getAttribute('data-line');
      const tdDataLineParsed = parseInt(tdDataLine, 10);
      if (tdDataLine === String(lineNumber) || (!isNaN(tdDataLineParsed) && tdDataLineParsed === lineNumber)) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (td data attribute: ${tdDataLine})`);
        return line;
      }
    }
    
    // Also check div elements (GitLab might use divs instead of tables)
    const divs = line.querySelectorAll('div');
    for (const div of divs) {
      const divText = div.textContent?.trim();
      const divTextNum = parseInt(divText, 10);
      if (!isNaN(divTextNum) && divTextNum === lineNumber) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (div text: "${divText}")`);
        return line;
      }
      
      const divDataLine = div.getAttribute('data-linenumber') || 
                         div.getAttribute('data-line-number') ||
                         div.getAttribute('data-new-line') ||
                         div.getAttribute('data-new-line-number') ||
                         div.getAttribute('data-line');
      const divDataLineParsed = parseInt(divDataLine, 10);
      if (divDataLine === String(lineNumber) || (!isNaN(divDataLineParsed) && divDataLineParsed === lineNumber)) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (div data attribute: ${divDataLine})`);
        return line;
      }
    }
    
    // Try multiple selectors for line number elements
    const lineNumSelectors = [
      '.line_number',
      '.new_line',
      '.line-num',
      '[class*="line-number"]',
      '[class*="line_num"]',
      'td:last-child', // Right side (new file) is often last
      'td.new',
      'td[data-linenumber]',
      'td[data-line-number]',
      'td[data-new-line]',
      '.old_line',
      '.new_line'
    ];
    
    for (const numSelector of lineNumSelectors) {
      const lineNumElements = line.querySelectorAll(numSelector);
      for (const lineNumElement of lineNumElements) {
        // Check text content (handle whitespace)
        const lineNumText = lineNumElement.textContent?.trim();
        const lineNumTextParsed = parseInt(lineNumText, 10);
        if (!isNaN(lineNumTextParsed) && lineNumTextParsed === lineNumber) {
          dbgLog(`Found line element for ${filePath}:${lineNumber} (text match: "${lineNumText}")`);
          return line;
        }
        
        if (lineNumText === String(lineNumber)) {
          dbgLog(`Found line element for ${filePath}:${lineNumber} (exact text match: "${lineNumText}")`);
          return line;
        }
        
        // Check data attributes
        const dataLineNum = lineNumElement.getAttribute('data-linenumber') || 
                          lineNumElement.getAttribute('data-line-number') ||
                          lineNumElement.getAttribute('data-new-line') ||
                          lineNumElement.getAttribute('data-new-line-number') ||
                          lineNumElement.getAttribute('data-line');
        const dataLineNumParsed = parseInt(dataLineNum, 10);
        if (dataLineNum === String(lineNumber) || (!isNaN(dataLineNumParsed) && dataLineNumParsed === lineNumber)) {
          dbgLog(`Found line element for ${filePath}:${lineNumber} (data attribute: ${dataLineNum})`);
          return line;
        }
      }
    }
    
    // Note: line element data attributes already checked at the start of the loop
  }

  dbgWarn(`Could not find line element for ${filePath}:${lineNumber}`);
  // Log some sample lines for debugging
  if (allLines.length > 0) {
    dbgLog(`Sample line elements found (showing lines near ${lineNumber}):`);
    // Show lines around the target line number
    const nearbyLines = allLines.filter((line, idx) => {
      const tds = line.querySelectorAll('td');
      for (const td of tds) {
        const text = td.textContent?.trim();
        const num = parseInt(text, 10);
        if (!isNaN(num) && Math.abs(num - lineNumber) <= 5) {
          return true;
        }
      }
      return false;
    }).slice(0, 5);
    
    if (nearbyLines.length === 0) {
      // Just show first few lines
      nearbyLines.push(...allLines.slice(0, 5));
    }
    
    nearbyLines.forEach((line, idx) => {
      const tds = line.querySelectorAll('td');
      const lineInfo = Array.from(tds).map((td, tdIdx) => {
        const text = td.textContent?.trim() || '';
        const dataLine = td.getAttribute('data-line-number') || 
                        td.getAttribute('data-new-line') ||
                        td.getAttribute('data-linenumber') || '';
        return `td${tdIdx}: text="${text.substring(0, 20)}" data="${dataLine}"`;
      }).join(' | ');
      dbgLog(`  Line ${idx + 1}: ${lineInfo}`);
    });
    
    // Also log what line numbers we can find
    const foundLineNumbers = [];
    allLines.slice(0, 20).forEach(line => {
      const tds = line.querySelectorAll('td');
      tds.forEach(td => {
        const text = td.textContent?.trim();
        const num = parseInt(text, 10);
        if (!isNaN(num) && num > 0 && num < 10000) {
          foundLineNumbers.push(num);
        }
      });
    });
    if (foundLineNumbers.length > 0) {
      const uniqueNums = [...new Set(foundLineNumbers)].sort((a, b) => a - b);
      dbgLog(`Found line numbers in first 20 lines: ${uniqueNums.slice(0, 10).join(', ')}${uniqueNums.length > 10 ? '...' : ''}`);
      dbgLog(`Target line ${lineNumber} is ${uniqueNums.includes(lineNumber) ? 'present' : 'NOT present'} in found numbers`);
    }
  }
  return null;
}

/**
 * Create a GitLab suggestion block format
 * @param {Object} suggestion - The code suggestion object
 * @returns {string} - Formatted suggestion block
 */
function createSuggestionBlock(suggestion) {
  // Format as GitLab suggestion block
  // The format is: ```suggestion:-0+0\ncode\n```
  // For now, we'll use -0+0 (no lines removed, no lines added)
  // This may need adjustment based on the actual diff context
  const code = suggestion.suggestedCode || '';
  return `\`\`\`suggestion:-0+0\n${code}\n\`\`\``;
}

/**
 * Inject a suggestion into GitLab's diff view
 * @param {Object} suggestion - The code suggestion object with filePath, lineNumber, suggestedCode
 * @returns {boolean} - True if injection was successful
 */
function injectSuggestionIntoLine(suggestion) {
  const { filePath, lineNumber } = suggestion;
  
  const lineElement = findGitLabDiffLine(filePath, lineNumber);
  if (!lineElement) {
    dbgWarn(`Could not inject suggestion for ${filePath}:${lineNumber} - line not found`);
    return false;
  }

  dbgLog(`Injecting suggestion into element: ${lineElement.tagName}, classes: ${lineElement.className}, id: ${lineElement.id || 'no-id'}`);

  // GitLab's structure: we want to insert into or after the line_content div
  // The lineElement should already be a div.diff-td.line_content or we found it
  let targetElement = lineElement;
  
  // If we found a line_holder, find the right-side line_content
  if (lineElement.classList.contains('line_holder') || lineElement.classList.contains('diff-grid-row')) {
    const rightSideContent = lineElement.querySelector('div.diff-td.line_content.right-side, div.diff-td.line_content.with-coverage.right-side, div.line_content.right-side') ||
                            lineElement.querySelector('div.diff-td.line_content:last-child, div.line_content:last-child');
    if (rightSideContent) {
      targetElement = rightSideContent;
      dbgLog(`Found right-side line_content for injection`);
    }
  }
  
  // targetElement should now be the div.diff-td.line_content element
  // We'll insert the suggestion as a sibling or child of this element
  let commentArea = null;
  
  // Check if targetElement is a line_content div
  if (targetElement.classList.contains('line_content') || targetElement.classList.contains('diff-td')) {
    // Find the parent line_holder to insert after
    const lineHolder = targetElement.closest('.line_holder, .diff-grid-row, [id*="_' + lineNumber + '"]');
    
    if (lineHolder) {
      // Create suggestion area after the line_holder
      commentArea = document.createElement('div');
      commentArea.className = 'thinkreview-suggestion-area';
      commentArea.style.marginTop = '4px';
      commentArea.style.padding = '8px';
      commentArea.style.backgroundColor = 'rgba(107, 79, 187, 0.1)';
      commentArea.style.borderLeft = '3px solid #6b4fbb';
      commentArea.style.borderRadius = '4px';
      commentArea.style.marginLeft = '0';
      commentArea.style.width = '100%';
      
      // Insert after the line_holder
      const parent = lineHolder.parentElement;
      if (parent) {
        const nextSibling = lineHolder.nextSibling;
        if (nextSibling) {
          parent.insertBefore(commentArea, nextSibling);
        } else {
          parent.appendChild(commentArea);
        }
        dbgLog(`Inserted suggestion area after line_holder`);
      } else {
        dbgWarn('Could not find parent element for line_holder');
        return false;
      }
    } else {
      // Fallback: append to the line_content itself
      commentArea = targetElement;
      dbgLog(`Using line_content element directly for injection`);
    }
  } else {
    // Fallback to old method
    commentArea = targetElement.querySelector('.add-diff-note, .js-add-diff-note, [data-testid="add-comment-button"]');
    if (!commentArea) {
      commentArea = targetElement.closest('.line_holder, tr')?.querySelector('.notes, .discussion-notes');
    }
    if (!commentArea) {
      commentArea = document.createElement('div');
      commentArea.className = 'thinkreview-suggestion-area';
      commentArea.style.marginTop = '8px';
      commentArea.style.padding = '8px';
      commentArea.style.backgroundColor = 'rgba(107, 79, 187, 0.1)';
      commentArea.style.borderLeft = '3px solid #6b4fbb';
      commentArea.style.borderRadius = '4px';
      
      const parent = targetElement.parentElement;
      if (parent) {
        const nextSibling = targetElement.nextSibling;
        if (nextSibling) {
          parent.insertBefore(commentArea, nextSibling);
        } else {
          parent.appendChild(commentArea);
        }
      } else {
        dbgWarn('Could not find parent element for line');
        return false;
      }
    }
  }

  // Create suggestion element
  const suggestionElement = document.createElement('div');
  suggestionElement.className = 'thinkreview-code-suggestion';
  suggestionElement.style.marginTop = '4px';
  
  // Add description if available
  if (suggestion.description) {
    const descElement = document.createElement('div');
    descElement.className = 'thinkreview-suggestion-description';
    descElement.style.marginBottom = '8px';
    descElement.style.fontSize = '13px';
    descElement.style.color = '#666';
    descElement.textContent = suggestion.description;
    suggestionElement.appendChild(descElement);
  }

  // Add code block
  const codeBlock = document.createElement('pre');
  codeBlock.className = 'thinkreview-suggestion-code';
  codeBlock.style.backgroundColor = '#f4f4f4';
  codeBlock.style.padding = '8px';
  codeBlock.style.borderRadius = '4px';
  codeBlock.style.overflow = 'auto';
  codeBlock.style.fontSize = '12px';
  codeBlock.style.fontFamily = 'monospace';
  
  const codeText = document.createTextNode(suggestion.suggestedCode);
  codeBlock.appendChild(codeText);
  suggestionElement.appendChild(codeBlock);

  // Add suggestion block format (for copy-paste into GitLab)
  const suggestionBlock = createSuggestionBlock(suggestion);
  const blockElement = document.createElement('details');
  blockElement.style.marginTop = '8px';
  
  const summary = document.createElement('summary');
  summary.textContent = 'Copy GitLab suggestion format';
  summary.style.cursor = 'pointer';
  summary.style.fontSize = '12px';
  summary.style.color = '#6b4fbb';
  
  const blockPre = document.createElement('pre');
  blockPre.style.marginTop = '8px';
  blockPre.style.padding = '8px';
  blockPre.style.backgroundColor = '#f4f4f4';
  blockPre.style.borderRadius = '4px';
  blockPre.style.overflow = 'auto';
  blockPre.style.fontSize = '11px';
  blockPre.textContent = suggestionBlock;
  
  blockElement.appendChild(summary);
  blockElement.appendChild(blockPre);
  suggestionElement.appendChild(blockElement);

  commentArea.appendChild(suggestionElement);
  
  dbgLog(`Successfully injected suggestion for ${filePath}:${lineNumber}`);
  return true;
}

/**
 * Wait for GitLab's diff view to be ready
 * @returns {Promise<void>}
 */
function waitForGitLabDiffView() {
  return new Promise((resolve) => {
    // Check if diff container already exists
    const diffContainer = findGitLabDiffContainer();
    if (diffContainer) {
      // Check if it has file containers
      const fileContainers = diffContainer.querySelectorAll('.file-holder, .diff-file, table.diff-file');
      if (fileContainers.length > 0) {
        dbgLog('Diff view already loaded');
        resolve();
        return;
      }
    }

    // Wait for diff container to appear
    let attempts = 0;
    const maxAttempts = 30; // 15 seconds max (increased)
    const checkInterval = 500; // Check every 500ms

    const checkForDiff = () => {
      attempts++;
      const container = findGitLabDiffContainer();
      if (container && container !== document.body) {
        // Try multiple selectors for file containers
        const fileContainers = container.querySelectorAll(
          '.file-holder, .diff-file, table.diff-file, .file-content, .js-diff-file, [data-path], table[data-path]'
        );
        if (fileContainers.length > 0) {
          dbgLog(`Diff view loaded after ${attempts * checkInterval}ms with ${fileContainers.length} file containers`);
          resolve();
          return;
        }
      }
      
      // Also check if we can find any file containers in the entire document
      const anyFileContainers = document.querySelectorAll(
        '.file-holder, .diff-file, table.diff-file, [data-path], .js-diff-file'
      );
      if (anyFileContainers.length > 0) {
        dbgLog(`Found ${anyFileContainers.length} file containers in document after ${attempts * checkInterval}ms`);
        resolve();
        return;
      }

      if (attempts >= maxAttempts) {
        dbgWarn(`Timeout waiting for GitLab diff view after ${attempts * checkInterval}ms`);
        // Log what we found for debugging
        const container = findGitLabDiffContainer();
        if (container) {
          dbgLog(`Container found but no file containers. Container classes: ${container.className}`);
        }
        resolve(); // Resolve anyway to continue
        return;
      }

      setTimeout(checkForDiff, checkInterval);
    };

    // Use MutationObserver to watch for DOM changes
    const observer = new MutationObserver((mutations) => {
      const container = findGitLabDiffContainer();
      if (container && container !== document.body) {
        const fileContainers = container.querySelectorAll(
          '.file-holder, .diff-file, table.diff-file, .file-content, .js-diff-file, [data-path]'
        );
        if (fileContainers.length > 0) {
          dbgLog(`Diff view detected via MutationObserver with ${fileContainers.length} file containers`);
          observer.disconnect();
          resolve();
        }
      }
      
      // Also check document-wide
      const anyFileContainers = document.querySelectorAll(
        '.file-holder, .diff-file, table.diff-file, [data-path], .js-diff-file'
      );
      if (anyFileContainers.length > 0) {
        dbgLog(`File containers detected via MutationObserver: ${anyFileContainers.length}`);
        observer.disconnect();
        resolve();
      }
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also start polling as fallback
    checkForDiff();

    // Cleanup observer after max attempts
    setTimeout(() => {
      observer.disconnect();
    }, maxAttempts * checkInterval);
  });
}

/**
 * Main function to inject code suggestions into GitLab's diff view
 * @param {Array<Object>} suggestions - Array of code suggestion objects
 * @param {string} patchContent - The patch content for line mapping
 * @returns {Promise<{success: number, failed: number}>} - Injection results
 */
export async function injectCodeSuggestions(suggestions, patchContent) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    dbgLog('No suggestions to inject');
    return { success: 0, failed: 0 };
  }

  // Wait for GitLab's diff view to be fully loaded
  await waitForGitLabDiffView();
  
  // Additional wait for all content to render
  await new Promise(resolve => setTimeout(resolve, 500));

  const diffContainer = findGitLabDiffContainer();
  if (!diffContainer) {
    dbgWarn('GitLab diff container not found, cannot inject suggestions');
    return { success: 0, failed: suggestions.length };
  }

  let successCount = 0;
  let failedCount = 0;

  for (const suggestion of suggestions) {
    if (!suggestion.filePath || !suggestion.lineNumber || !suggestion.suggestedCode) {
      dbgWarn('Invalid suggestion object:', suggestion);
      failedCount++;
      continue;
    }

    const success = injectSuggestionIntoLine(suggestion);
    if (success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  dbgLog(`Injection complete: ${successCount} successful, ${failedCount} failed`);
  return { success: successCount, failed: failedCount };
}

// Export helper functions for testing
export { parsePatchLineMapping, findGitLabDiffLine, createSuggestionBlock };

