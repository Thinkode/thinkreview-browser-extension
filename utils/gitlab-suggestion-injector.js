/**
 * GitLab Code Suggestion Injector
 * 
 * Utility module to inject code suggestions into GitLab's diff view on the changes tab.
 * Formats suggestions as GitLab suggestion blocks and injects them into the appropriate diff lines.
 */

// Debug toggle
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[GitLabSuggestionInjector]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[GitLabSuggestionInjector]', ...args); }

// Store for re-injection when DOM is replaced (e.g. Cmd+F search in GitLab)
let lastInjectedSuggestions = null;
let lastPatchContent = null;
let reinjectObserver = null;
let dialogObserver = null; // Separate observer for dialog on document.body
let reinjectTimeoutId = null;
let isReinjecting = false;

// Store for dialog state to re-open if removed
let currentOpenDialog = null; // { suggestion, markerElement }

/** Ensure GitLab-injected suggestions stylesheet is loaded */
function ensureGitLabInjectedStylesLoaded() {
  const id = 'thinkreview-gitlab-injected-styles';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('utils/gitlab-injected-suggestions.css');
  document.head.appendChild(link);
}

// Import copy button utility
let copyButtonUtils = null;
async function loadCopyButtonUtils() {
  if (!copyButtonUtils) {
    const module = await import('../components/utils/item-copy-button.js');
    copyButtonUtils = {
      createCopyButton: module.createCopyButton,
      showCopySuccessFeedback: (button) => {
        const originalHTML = button.innerHTML;
        button.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/>
          </svg>
        `;
        button.classList.add('thinkreview-copy-success');
        setTimeout(() => {
          button.innerHTML = originalHTML;
          button.classList.remove('thinkreview-copy-success');
        }, 2000);
      },
      showCopyErrorFeedback: (button) => {
        const originalHTML = button.innerHTML;
        button.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
          </svg>
        `;
        button.classList.add('thinkreview-copy-error');
        setTimeout(() => {
          button.innerHTML = originalHTML;
          button.classList.remove('thinkreview-copy-error');
        }, 2000);
      }
    };
  }
  return copyButtonUtils;
}

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

const FILE_CONTAINER_SELECTORS = [
  '.file-holder', '.diff-file', '.file-content', '[data-testid="diff-file"]',
  '.diff-viewer', 'table.diff-file', '.js-diff-file', '[data-path]',
  'table[data-path]', '.file', '[class*="file-holder"]', '[class*="diff-file"]'
];

const FILE_HEADER_SELECTORS = [
  '.file-header-name', '.file-title', '.file-header-content',
  '[data-testid="file-header"]', 'h2', 'h3', '.file-header',
  'thead th', '.diff-file-header', '[data-qa-selector="file_path"]',
  'a[href*="/blob/"]', 'a[href*="/-/blob/"]'
];

/**
 * Collect all potential file containers from the document
 * @returns {HTMLElement[]}
 */
function getAllFileContainers() {
  const allContainers = [];
  for (const selector of FILE_CONTAINER_SELECTORS) {
    allContainers.push(...Array.from(document.querySelectorAll(selector)));
  }
  allContainers.push(...Array.from(document.querySelectorAll('[data-path]')));
  return Array.from(new Set(allContainers));
}

/**
 * Find the file container element for a given file path
 * @param {string} filePath - The file path
 * @param {string} fileName - The filename (from path)
 * @param {HTMLElement[]} allContainers - All potential file containers
 * @returns {HTMLElement|null}
 */
function findFileContainer(filePath, fileName, allContainers) {
  const filesWithSameName = allContainers.filter((c) => {
    const path = c.getAttribute('data-path');
    return path && (path.endsWith('/' + fileName) || path.endsWith(fileName) || path.includes('/' + fileName + ' '));
  });
  const isUniqueFilename = filesWithSameName.length === 1;
  dbgLog(`Found ${filesWithSameName.length} file(s) with filename "${fileName}" (unique: ${isUniqueFilename})`);

  for (const container of allContainers) {
    const dataPath = container.getAttribute('data-path');
    if (dataPath) {
      if (dataPath === filePath || dataPath.endsWith('/' + filePath) || dataPath === '/' + filePath) {
        dbgLog(`Found file container by data-path: "${dataPath}" (exact match with "${filePath}")`);
        return container;
      }
      if (isUniqueFilename && (dataPath.endsWith('/' + fileName) || dataPath.endsWith(fileName))) {
        dbgLog(`Found file container by data-path (unique filename): "${dataPath}"`);
        return container;
      }
    }

    let foundMatch = false;
    for (const headerSelector of FILE_HEADER_SELECTORS) {
      const fileHeader = container.querySelector(headerSelector);
      if (fileHeader) {
        const headerText = fileHeader.textContent || '';
        const headerHTML = fileHeader.innerHTML || '';
        const headerHref = fileHeader.getAttribute('href') || '';

        if (headerText.includes(filePath) || headerHTML.includes(filePath) || headerHref.includes(filePath)) {
          dbgLog(`Found file container using selector: ${headerSelector}, exact path match: "${headerText.substring(0, 100)}"`);
          return container;
        }

        const othersWithSameName = allContainers.filter((c) => {
          const otherPath = c.getAttribute('data-path');
          const otherHeader = c.querySelector(headerSelector);
          if (otherHeader) {
            const otherText = otherHeader.textContent || '';
            return otherText.includes(fileName) || (otherPath && otherPath.endsWith(fileName));
          }
          return false;
        });
        if (othersWithSameName.length === 1 &&
            (headerText.includes(fileName) || headerText.endsWith(fileName) ||
             headerHTML.includes(fileName) || headerHref.includes(fileName))) {
          dbgLog(`Found file container using selector: ${headerSelector}, filename match (unique): "${headerText.substring(0, 100)}"`);
          return container;
        }
      }
    }

    const containerText = container.textContent || '';
    const containerHTML = container.innerHTML || '';
    if (containerText.includes(filePath) || containerHTML.includes(filePath)) {
      dbgLog('Found file container by container text match (exact path)');
      return container;
    }
    const containersWithFileName = allContainers.filter((c) => {
      const cText = c.textContent || '';
      const cHTML = c.innerHTML || '';
      return cText.includes(fileName) || cHTML.includes(fileName);
    });
    if (containersWithFileName.length === 1 && (containerText.includes(fileName) || containerHTML.includes(fileName))) {
      dbgLog('Found file container by container text match (unique filename)');
      return container;
    }
  }

  dbgLog('File container not found in containers, searching entire document...');
  const allElementsWithDataPath = document.querySelectorAll('[data-path]');
  for (const element of allElementsWithDataPath) {
    const dataPath = element.getAttribute('data-path') || '';
    if (dataPath === filePath || dataPath.endsWith('/' + filePath) || dataPath === '/' + filePath) {
      dbgLog(`Found file container by document-wide data-path search: "${dataPath}"`);
      return element;
    }
  }

  if (isUniqueFilename) {
    const allElementsWithText = document.querySelectorAll('*');
    for (const element of allElementsWithText) {
      const text = element.textContent || '';
      const html = element.innerHTML || '';
      const elDataPath = element.getAttribute('data-path') || '';
      if ((text.includes(filePath) || html.includes(filePath) || elDataPath === filePath) &&
          (element.querySelector('table') || element.querySelector('tr') || element.classList.contains('file') || element.querySelector('.line_holder'))) {
        dbgLog('Found file container by document-wide search (exact path)');
        return element;
      }
    }
  }

  return null;
}

/**
 * Find the specific line element within a file container
 * @param {HTMLElement} container - The file container element
 * @param {string} filePath - The file path (for logging)
 * @param {number} lineNumber - The line number in the new file
 * @returns {HTMLElement|null}
 */
function findLineInContainer(container, filePath, lineNumber) {
  const elementsWithLineId = container.querySelectorAll('[id]');
  for (const element of elementsWithLineId) {
    const id = element.getAttribute('id') || '';
    const idMatch = id.match(/_(\d+)_(\d+)$/);
    if (idMatch) {
      const oldLine = parseInt(idMatch[1], 10);
      const newLine = parseInt(idMatch[2], 10);
      if (newLine === lineNumber) {
        const lineContent = element.querySelector('div.diff-td.line_content.with-coverage.right-side, div.diff-td.line_content.right-side') ||
                           element.querySelector('div.diff-td.line_content.with-coverage.left-side, div.diff-td.line_content.left-side') ||
                           element.querySelector('div.diff-td.line_content.with-coverage') ||
                           element.querySelector('div.diff-td.line_content') ||
                           element.querySelector('div.line_content');
        if (lineContent) {
          dbgLog(`Found line element for ${filePath}:${lineNumber} by ID pattern: ${id} (newLine: ${newLine}, oldLine: ${oldLine})`);
          return lineContent;
        }
        dbgLog(`Found line element for ${filePath}:${lineNumber} by ID pattern (no line_content): ${id}`);
        return element;
      }
    }
    if (id.endsWith('_' + lineNumber)) {
      const lineContent = element.querySelector('div.diff-td.line_content, div.line_content');
      if (lineContent) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} by ID pattern (single): ${id}`);
        return lineContent;
      }
    }
  }

  const lineSelectors = [
    `[data-interop-new-line="${lineNumber}"]`, `[data-line-number="${lineNumber}"]`,
    `[data-new-line="${lineNumber}"]`, `[data-new-line-number="${lineNumber}"]`,
    `[data-linenumber="${lineNumber}"]`, `.line_holder[data-linenumber="${lineNumber}"]`,
    `tr[data-new-line-number="${lineNumber}"]`, `td[data-linenumber="${lineNumber}"]`,
    `td[data-line-number="${lineNumber}"]`, `[data-qa-line-number="${lineNumber}"]`
  ];
  for (const selector of lineSelectors) {
    const lineElement = container.querySelector(selector);
    if (lineElement) {
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

  const allElementsWithData = container.querySelectorAll(
    '[data-line-number], [data-new-line], [data-linenumber], [data-new-line-number], [data-interop-new-line], [data-interop-line]'
  );
  dbgLog(`Found ${allElementsWithData.length} elements with line number data attributes`);
  for (const element of allElementsWithData) {
    const dataLine = element.getAttribute('data-interop-new-line') || element.getAttribute('data-interop-line') ||
                    element.getAttribute('data-line-number') || element.getAttribute('data-new-line') ||
                    element.getAttribute('data-linenumber') || element.getAttribute('data-new-line-number');
    const dataLineNum = parseInt(dataLine, 10);
    if (!isNaN(dataLineNum) && dataLineNum === lineNumber) {
      dbgLog(`Found line element for ${filePath}:${lineNumber} by data attribute search: ${dataLine}`);
      return element;
    }
  }

  const elementsWithLineData = container.querySelectorAll(
    '[data-line-number], [data-new-line], [data-linenumber], [data-new-line-number], [data-interop-new-line], [data-interop-line]'
  );
  for (const element of elementsWithLineData) {
    const dataLine = element.getAttribute('data-interop-new-line') || element.getAttribute('data-interop-line') ||
                    element.getAttribute('data-line-number') || element.getAttribute('data-new-line') ||
                    element.getAttribute('data-linenumber') || element.getAttribute('data-new-line-number');
    const dataLineNum = parseInt(dataLine, 10);
    if (!isNaN(dataLineNum) && dataLineNum === lineNumber) {
      const lineContent = element.querySelector('div.diff-td.line_content, div.line_content') ||
                         element.closest('.line_holder, .diff-grid-row')?.querySelector('div.diff-td.line_content, div.line_content');
      if (lineContent) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} by data attribute: ${dataLine} (with line_content)`);
        return lineContent;
      }
      const lineContainer = element.closest('.line_holder, .diff-grid-row, tr, [class*="line"]') || element;
      dbgLog(`Found line element for ${filePath}:${lineNumber} by data attribute: ${dataLine}`);
      return lineContainer;
    }
  }

  const lineContainerSelectors = [
    '.line_holder', '.diff-grid-row.line_holder', 'div.line_holder', 'tr', 'tbody tr', 'table tr',
    'tr td', '.line', '[class*="diff-line"]', 'td.line-content', 'td[class*="line"]',
    'div[class*="line"]', 'div[data-line-number]'
  ];
  let allLines = [];
  for (const selector of lineContainerSelectors) {
    allLines.push(...Array.from(container.querySelectorAll(selector)));
  }
  allLines = Array.from(new Set(allLines));
  allLines = allLines.filter((line) => {
    const hasTd = line.querySelectorAll('td').length > 0;
    const hasData = line.hasAttribute('data-line-number') || line.hasAttribute('data-new-line') ||
                   line.hasAttribute('data-linenumber') || line.hasAttribute('data-new-line-number') ||
                   line.hasAttribute('data-interop-new-line') || line.hasAttribute('data-interop-line');
    const hasText = /\d+/.test(line.textContent || '');
    return hasTd || hasData || hasText;
  });

  dbgLog(`Found ${allLines.length} potential line elements to search (filtered)`);
  if (allLines.length > 0) {
    dbgLog('Sample line structures:');
    allLines.slice(0, 5).forEach((line, idx) => {
      const tagName = line.tagName.toLowerCase();
      const tds = line.querySelectorAll('td');
      const text = line.textContent?.trim().substring(0, 50) || '';
      const dataLine = line.getAttribute('data-line-number') || line.getAttribute('data-new-line') ||
                      line.getAttribute('data-linenumber') || '';
      const classes = line.className || '';
      if (tds.length > 0) {
        const lineNums = Array.from(tds).map((td) => {
          const tdText = td.textContent?.trim() || '';
          const tdData = td.getAttribute('data-line-number') || td.getAttribute('data-new-line') ||
                        td.getAttribute('data-linenumber') || '';
          return `text="${tdText.substring(0, 15)}" data="${tdData}"`;
        }).join(', ');
        dbgLog(`  Line ${idx + 1} (${tagName}): ${tds.length} tds, [${lineNums}]`);
      } else {
        dbgLog(`  Line ${idx + 1} (${tagName}): classes="${classes.substring(0, 50)}", data="${dataLine}", text="${text}"`);
      }
    });
  }

  for (const line of allLines) {
    const lineDataNum = line.getAttribute('data-interop-new-line') || line.getAttribute('data-interop-line') ||
                       line.getAttribute('data-linenumber') || line.getAttribute('data-line-number') ||
                       line.getAttribute('data-new-line') || line.getAttribute('data-new-line-number') ||
                       line.getAttribute('data-line');
    const lineDataNumParsed = parseInt(lineDataNum, 10);
    if (lineDataNum === String(lineNumber) || (!isNaN(lineDataNumParsed) && lineDataNumParsed === lineNumber)) {
      dbgLog(`Found line element for ${filePath}:${lineNumber} (element data attribute: ${lineDataNum})`);
      return line;
    }

    const childElementsWithLineData = line.querySelectorAll(
      '[data-linenumber], [data-line-number], [data-new-line], [data-new-line-number], [data-interop-new-line], [data-interop-line]'
    );
    for (const child of childElementsWithLineData) {
      const childDataLine = child.getAttribute('data-interop-new-line') || child.getAttribute('data-interop-line') ||
                           child.getAttribute('data-linenumber') || child.getAttribute('data-line-number') ||
                           child.getAttribute('data-new-line') || child.getAttribute('data-new-line-number');
      const childDataLineNum = parseInt(childDataLine, 10);
      if (!isNaN(childDataLineNum) && childDataLineNum === lineNumber) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (child element data attribute: ${childDataLine})`);
        return line;
      }
    }

    const tds = line.querySelectorAll('td');
    for (const td of tds) {
      const tdText = td.textContent?.trim();
      const tdTextNum = parseInt(tdText, 10);
      if (!isNaN(tdTextNum) && tdTextNum === lineNumber) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (td text: "${tdText}")`);
        return line;
      }
      if (tdText === String(lineNumber) || tdText === ` ${lineNumber}` || tdText === `${lineNumber} `) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (td text match: "${tdText}")`);
        return line;
      }
      const tdDataLine = td.getAttribute('data-interop-new-line') || td.getAttribute('data-interop-line') ||
                        td.getAttribute('data-linenumber') || td.getAttribute('data-line-number') ||
                        td.getAttribute('data-new-line') || td.getAttribute('data-new-line-number') ||
                        td.getAttribute('data-line');
      const tdDataLineParsed = parseInt(tdDataLine, 10);
      if (tdDataLine === String(lineNumber) || (!isNaN(tdDataLineParsed) && tdDataLineParsed === lineNumber)) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (td data attribute: ${tdDataLine})`);
        return line;
      }
    }

    const divs = line.querySelectorAll('div');
    for (const div of divs) {
      const divText = div.textContent?.trim();
      const divTextNum = parseInt(divText, 10);
      if (!isNaN(divTextNum) && divTextNum === lineNumber) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (div text: "${divText}")`);
        return line;
      }
      const divDataLine = div.getAttribute('data-interop-new-line') || div.getAttribute('data-interop-line') ||
                         div.getAttribute('data-linenumber') || div.getAttribute('data-line-number') ||
                         div.getAttribute('data-new-line') || div.getAttribute('data-new-line-number') ||
                         div.getAttribute('data-line');
      const divDataLineParsed = parseInt(divDataLine, 10);
      if (divDataLine === String(lineNumber) || (!isNaN(divDataLineParsed) && divDataLineParsed === lineNumber)) {
        dbgLog(`Found line element for ${filePath}:${lineNumber} (div data attribute: ${divDataLine})`);
        return line;
      }
    }

    const lineNumSelectors = [
      '.line_number', '.new_line', '.line-num', '[class*="line-number"]', '[class*="line_num"]',
      'td:last-child', 'td.new', 'td[data-linenumber]', 'td[data-line-number]', 'td[data-new-line]',
      '.old_line', '.new_line'
    ];
    for (const numSelector of lineNumSelectors) {
      const lineNumElements = line.querySelectorAll(numSelector);
      for (const lineNumElement of lineNumElements) {
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
        const dataLineNum = lineNumElement.getAttribute('data-interop-new-line') ||
                           lineNumElement.getAttribute('data-interop-line') ||
                           lineNumElement.getAttribute('data-linenumber') ||
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
  }

  if (allLines.length === 0) {
    // Check if the file is collapsed/not expanded
    const isCollapsed = container.classList.contains('diff-file-row') || 
                       container.classList.contains('tree-list-parent') ||
                       !container.querySelector('.diff-content, .file-content, table.diff-file');
    
    if (isCollapsed) {
      dbgLog(`File ${filePath} appears to be collapsed/not expanded, skipping line ${lineNumber}`);
      return null; // Return null to indicate we should skip this injection
    }
    
    dbgWarn(`No structured line elements found for ${filePath}; falling back to main content block for line ${lineNumber}`);
    const fallbackContent = container.querySelector(
      '.file-content, .diff-viewer, pre, code, .blob-content, .diff-td, .line_content'
    ) || container;
    return fallbackContent;
  }

  dbgWarn(`Could not find line element for ${filePath}:${lineNumber}`);
  if (allLines.length > 0) {
    dbgLog(`Sample line elements found (showing lines near ${lineNumber}):`);
    const nearbyLines = allLines.filter((line) => {
      const tds = line.querySelectorAll('td');
      for (const td of tds) {
        const text = td.textContent?.trim();
        const num = parseInt(text, 10);
        if (!isNaN(num) && Math.abs(num - lineNumber) <= 5) return true;
      }
      return false;
    }).slice(0, 5);
    const toLog = nearbyLines.length > 0 ? nearbyLines : allLines.slice(0, 5);
    toLog.forEach((line, idx) => {
      const tds = line.querySelectorAll('td');
      const lineInfo = Array.from(tds).map((td, tdIdx) => {
        const text = td.textContent?.trim() || '';
        const dataLine = td.getAttribute('data-line-number') || td.getAttribute('data-new-line') ||
                        td.getAttribute('data-linenumber') || '';
        return `td${tdIdx}: text="${text.substring(0, 20)}" data="${dataLine}"`;
      }).join(' | ');
      dbgLog(`  Line ${idx + 1}: ${lineInfo}`);
    });
    const foundLineNumbers = [];
    allLines.slice(0, 20).forEach((line) => {
      const tds = line.querySelectorAll('td');
      tds.forEach((td) => {
        const text = td.textContent?.trim();
        const num = parseInt(text, 10);
        if (!isNaN(num) && num > 0 && num < 10000) foundLineNumbers.push(num);
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
 * Find the specific line element in GitLab's diff view
 * @param {string} filePath - The file path
 * @param {number} lineNumber - The line number in the new file
 * @returns {HTMLElement|null} - The line element or null if not found
 */
function findGitLabDiffLine(filePath, lineNumber) {
  const fileName = filePath.split('/').pop();
  dbgLog(`Looking for file: ${filePath} (filename: ${fileName})`);

  const allContainers = getAllFileContainers();
  dbgLog(`Found ${allContainers.length} potential file containers`);

  const container = findFileContainer(filePath, fileName, allContainers);
  if (!container) {
    dbgWarn(`Could not find file container for: ${filePath}`);
    if (allContainers.length > 0) {
      dbgLog('Available file containers:');
      allContainers.slice(0, 10).forEach((c, idx) => {
        const header = c.querySelector('.file-header-name, .file-title, h2, h3, a[href*="blob"]') || c;
        const text = header.textContent?.substring(0, 150) || 'No text';
        const dataPath = c.getAttribute('data-path') || 'no data-path';
        const classes = c.className || 'no classes';
        dbgLog(`  Container ${idx + 1}: classes="${classes}", data-path="${dataPath}", text="${text}"`);
      });
    } else {
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
  return findLineInContainer(container, filePath, lineNumber);
}

/**
 * Create a GitLab suggestion block format
 * @param {Object} suggestion - The code suggestion object
 * @param {string} suggestion.filePath
 * @param {number} suggestion.startLine - Start line for the suggested change (new file)
 * @param {number} [suggestion.endLine] - End line for the suggested change (new file)
 * @param {string} suggestion.suggestedCode
 * @returns {string} - Formatted suggestion block
 */
function createSuggestionBlock(suggestion) {
  const startLine = typeof suggestion.startLine === 'number' ? suggestion.startLine : undefined;
  const endLine = typeof suggestion.endLine === 'number' && suggestion.endLine >= startLine
    ? suggestion.endLine
    : startLine;

  const code = suggestion.suggestedCode || '';

  // Optionally embed the range as a comment header inside the suggestion block for clarity
  const rangeHeader = (startLine && endLine)
    ? `// ${suggestion.filePath || ''} [lines ${startLine}${endLine !== startLine ? '–' + endLine : ''}]\n`
    : '';

  // GitLab suggestion syntax; we still use -0+0 because the extension is just
  // generating a copy-pastable suggestion block, not applying it automatically.
  return `\`\`\`suggestion:-0+0\n${rangeHeader}${code}\n\`\`\``;
}

/**
 * Create and show a popup dialog with the suggestion details
 * @param {Object} suggestion - The code suggestion object
 * @param {HTMLElement} markerElement - The marker element that was clicked
 */
async function showSuggestionDialog(suggestion, markerElement) {
  // Remove any existing dialog
  const existingDialog = document.querySelector('.thinkreview-suggestion-backdrop');
  if (existingDialog) {
    existingDialog.remove();
  }

  // Store current dialog state for re-opening if removed
  currentOpenDialog = { suggestion, markerElement };

  // Create dialog backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'thinkreview-suggestion-backdrop';
  
  // Start periodic check to see if dialog/markers are still in DOM
  const checkInterval = setInterval(() => {
    const dialogExists = document.querySelector('.thinkreview-suggestion-backdrop');
    const markerCount = document.querySelectorAll('.thinkreview-suggestion-marker').length;
    
    dbgLog(`Periodic check: dialog exists=${!!dialogExists}, markers=${markerCount}, currentOpenDialog=${!!currentOpenDialog}`);
    
    if (!dialogExists && currentOpenDialog) {
      dbgLog('Dialog disappeared, checking markers...');
      if (markerCount === 0 && lastInjectedSuggestions?.length > 0) {
        dbgLog('Both dialog and markers disappeared, triggering re-inject');
        clearInterval(checkInterval);
        scheduleReinject();
      }
    }
    
    // Stop checking if dialog was explicitly closed
    if (!currentOpenDialog) {
      dbgLog('Dialog was closed by user, stopping periodic check');
      clearInterval(checkInterval);
    }
  }, 1000);
  
  // Store interval ID so we can clear it when dialog is closed
  backdrop.dataset.checkIntervalId = checkInterval;
  
  // Create dialog container
  const dialog = document.createElement('div');
  dialog.className = 'thinkreview-suggestion-dialog';
  
  // Dialog header with close button
  const header = document.createElement('div');
  header.className = 'thinkreview-dialog-header';
  
  const title = document.createElement('div');
  title.className = 'thinkreview-dialog-title';
  
  const logoImg = document.createElement('img');
  logoImg.src = chrome.runtime.getURL('images/icon16.png');
  logoImg.alt = 'ThinkReview';
  
  const titleText = document.createElement('span');
  titleText.textContent = 'Code Suggestion';
  
  title.appendChild(logoImg);
  title.appendChild(titleText);
  
  const closeButton = document.createElement('button');
  closeButton.className = 'thinkreview-dialog-close';
  closeButton.innerHTML = '×';
  closeButton.title = 'Close';
  
  header.appendChild(title);
  header.appendChild(closeButton);
  
  // Dialog content
  const content = document.createElement('div');
  content.className = 'thinkreview-dialog-content';
  
  // Create suggestion element using shared UI utility
  const suggestionUiModule = await import('../components/utils/code-suggestion-element.js');
  const suggestionElement = suggestionUiModule.createCodeSuggestionElement(suggestion);
  content.appendChild(suggestionElement);
  
  // Dialog footer with actions
  const footer = document.createElement('div');
  footer.className = 'thinkreview-dialog-footer';
  
  // Add copy button
  const utils = await loadCopyButtonUtils();
  const copyButton = utils.createCopyButton();
  copyButton.className = 'thinkreview-dialog-copy-btn';
  copyButton.title = 'Copy code suggestion';
  
  const copyButtonText = document.createElement('span');
  copyButtonText.textContent = 'Copy Suggestion';
  copyButton.appendChild(copyButtonText);
  
  copyButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    const lines = [];

    // Add description if available
    if (suggestion.description) {
      lines.push(suggestion.description);
    }

    // Add GitLab suggestion block
    if (suggestion.suggestedCode) {
      const suggestedCodeLines = suggestion.suggestedCode.split('\n');
      const rawLinesToAdd = suggestedCodeLines.length;
      const linesToAdd = Math.max(0, rawLinesToAdd - 1);
      
      lines.push('');
      lines.push(`\`\`\`suggestion:-0+${linesToAdd}`);
      lines.push(suggestion.suggestedCode);
      lines.push('```');
    }

    const textToCopy = lines.join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      dbgLog('Copied suggestion in GitLab format to clipboard');
      utils.showCopySuccessFeedback(copyButton);
    } catch (err) {
      dbgWarn('Failed to copy suggestion to clipboard', err);
      utils.showCopyErrorFeedback(copyButton);
    }
  });
  
  footer.appendChild(copyButton);
  
  // Assemble dialog
  dialog.appendChild(header);
  dialog.appendChild(content);
  dialog.appendChild(footer);
  backdrop.appendChild(dialog);
  
  // Close handlers
  const closeDialog = () => {
    // Clear periodic check interval
    const intervalId = backdrop.dataset.checkIntervalId;
    if (intervalId) {
      clearInterval(parseInt(intervalId));
    }
    
    backdrop.remove();
    // Clear the current dialog state when user explicitly closes it
    currentOpenDialog = null;
  };
  
  closeButton.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeDialog();
    }
  });
  
  // ESC key to close
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeDialog();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  
  // Add to document
  document.body.appendChild(backdrop);
  
  dbgLog('Suggestion dialog opened');
}

/**
 * Inject a suggestion marker into GitLab's diff view
 * @param {Object} suggestion - The code suggestion object with filePath, startLine/endLine, suggestedCode
 * @returns {Promise<boolean>} - Promise that resolves to true if injection was successful
 */
async function injectSuggestionIntoLine(suggestion) {
  const { filePath } = suggestion;

  // Use startLine as the anchor for the diff
  const requestedLineNumber = typeof suggestion.startLine === 'number' ? suggestion.startLine : null;
  
  if (!requestedLineNumber) {
    dbgWarn(`Could not inject suggestion for ${filePath} - missing startLine`);
    return false;
  }

  dbgLog(
    `[Inject] Preparing to inject suggestion marker for ${filePath} at requested line ${requestedLineNumber}`
  );

  // Try to find the exact line first
  let anchorLineNumber = requestedLineNumber;
  let lineElement = findGitLabDiffLine(filePath, anchorLineNumber);

  // If exact line isn't found, try a few lines before as a fallback anchor
  if (!lineElement) {
    dbgLog(
      `[Inject] Exact line not found for ${filePath}:${requestedLineNumber}, trying backoff to earlier lines`
    );

    const MAX_BACKOFF = 5;
    for (let offset = 1; offset <= MAX_BACKOFF; offset++) {
      const candidateLine = requestedLineNumber - offset;
      if (candidateLine < 1) break;

      dbgLog(
        `[Inject] Backoff attempt offset=${offset}, candidateLine=${candidateLine} for ${filePath}`
      );

      const candidateElement = findGitLabDiffLine(filePath, candidateLine);
      if (candidateElement) {
        dbgLog(
          `Falling back to line ${candidateLine} (requested ${requestedLineNumber}) for injection in ${filePath}`
        );
        anchorLineNumber = candidateLine;
        lineElement = candidateElement;
        break;
      }
    }
  }

  if (!lineElement) {
    dbgLog(
      `Skipping suggestion for ${filePath}:${requestedLineNumber} - file may be collapsed or line not visible in diff`
    );
    return false;
  }

  dbgLog(`Injecting suggestion marker into element: ${lineElement.tagName}, classes: ${lineElement.className}, id: ${lineElement.id || 'no-id'}`);

  // Find the line holder (row) that contains this line
  let lineHolder = lineElement;
  if (!lineElement.classList.contains('line_holder') && !lineElement.classList.contains('diff-grid-row')) {
    lineHolder = lineElement.closest('.line_holder, .diff-grid-row, tr');
  }
  
  if (!lineHolder) {
    dbgLog('Could not find line holder, falling back to line element');
    lineHolder = lineElement;
  }
  
  // Check if a marker already exists for this line
  const existingMarker = lineHolder.querySelector('.thinkreview-suggestion-marker');
  if (existingMarker) {
    dbgLog(`Marker already exists for ${filePath}:${anchorLineNumber}, skipping`);
    return true;
  }
  
  // Find the line number cell (new/right side)
  const lineNumberCell = lineHolder.querySelector(
    '.diff-td.line_number.new, .diff-td.line_number:last-of-type, ' +
    'td.line_number.new, td.line_number:last-of-type, ' +
    'td.new_line, .new_line, ' +
    '[class*="line-number"]:last-of-type'
  );
  
  if (!lineNumberCell) {
    dbgLog('Could not find line number cell, skipping marker injection');
    return false;
  }
  
  dbgLog(`Found line number cell: ${lineNumberCell.tagName}, classes: ${lineNumberCell.className}`);
  
  // Create the suggestion marker
  const marker = document.createElement('span');
  marker.className = 'thinkreview-suggestion-marker';
  marker.title = 'Click to view ThinkReview code suggestion';
  
  // ThinkReview logo
  const logo = document.createElement('img');
  logo.src = chrome.runtime.getURL('images/icon16.png');
  logo.alt = 'ThinkReview';
  logo.className = 'thinkreview-marker-logo';
  
  marker.appendChild(logo);
  
  // Click handler to show dialog
  marker.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    await showSuggestionDialog(suggestion, marker);
  });
  
  // Insert marker into the line number cell
  lineNumberCell.appendChild(marker);
  
  dbgLog(`Successfully injected suggestion marker for ${filePath}:${anchorLineNumber} (requested ${requestedLineNumber})`);
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
          observer.disconnect();
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
        observer.disconnect();
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
        observer.disconnect();
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
 * Check if any removed nodes contain our suggestion markers
 */
function containsOurSuggestions(node) {
  if (!node || node.nodeType !== 1) return false; // Element nodes only
  return node.classList?.contains('thinkreview-suggestion-marker') ||
    !!node.querySelector?.('.thinkreview-suggestion-marker');
}

/**
 * Schedule re-injection when our markers are removed (e.g. Cmd+F triggers GitLab DOM replacement)
 */
function scheduleReinject() {
  dbgLog('scheduleReinject called');
  if (reinjectTimeoutId) {
    dbgLog('Clearing existing reinject timeout');
    clearTimeout(reinjectTimeoutId);
  }
  reinjectTimeoutId = setTimeout(async () => {
    reinjectTimeoutId = null;
    
    dbgLog(`Re-inject check: lastInjectedSuggestions=${lastInjectedSuggestions?.length}, isReinjecting=${isReinjecting}`);
    if (!lastInjectedSuggestions?.length || isReinjecting) {
      dbgLog('Skipping re-injection: no suggestions or already re-injecting');
      return;
    }

    const count = document.querySelectorAll('.thinkreview-suggestion-marker').length;
    dbgLog(`Current marker count: ${count}`);
    if (count > 0) {
      dbgLog('Markers still present, no need to re-inject');
      return; // Still present, no need to re-inject
    }

    dbgLog('Suggestion markers removed from DOM (e.g. Cmd+F search), re-injecting...');
    
    // Store dialog state before re-injection
    const dialogWasOpen = currentOpenDialog !== null;
    const savedDialogState = currentOpenDialog ? { ...currentOpenDialog } : null;
    dbgLog(`Dialog was open: ${dialogWasOpen}`, savedDialogState);
    
    isReinjecting = true;
    try {
      dbgLog(`Re-injecting ${lastInjectedSuggestions.length} suggestions...`);
      
      // Clear currentOpenDialog temporarily to prevent the periodic check from interfering
      currentOpenDialog = null;
      
      await injectCodeSuggestions(lastInjectedSuggestions, lastPatchContent || '');
      
      // Re-open dialog if it was open before
      if (dialogWasOpen && savedDialogState) {
        dbgLog('Re-opening dialog after marker re-injection...');
        dbgLog('Saved dialog state:', savedDialogState);
        
        // Wait a bit for markers to be re-injected
        setTimeout(async () => {
          const { suggestion } = savedDialogState;
          dbgLog('Looking for matching suggestion:', suggestion.filePath, suggestion.startLine);
          
          // Find the matching suggestion in the re-injected list
          const matchingSuggestion = lastInjectedSuggestions.find(s => 
            s.filePath === suggestion.filePath && 
            s.startLine === suggestion.startLine &&
            s.suggestedCode === suggestion.suggestedCode
          );
          
          dbgLog('Matching suggestion found:', !!matchingSuggestion);
          
          if (matchingSuggestion) {
            // Find any marker (they all trigger the same dialog logic)
            const markers = document.querySelectorAll('.thinkreview-suggestion-marker');
            dbgLog(`Found ${markers.length} markers for dialog re-open`);
            if (markers.length > 0) {
              dbgLog('Calling showSuggestionDialog...');
              await showSuggestionDialog(matchingSuggestion, markers[0]);
              dbgLog('Dialog should now be open');
            } else {
              dbgLog('No markers found to attach dialog to');
            }
          } else {
            dbgLog('Could not find matching suggestion for dialog re-open');
            dbgLog('Available suggestions:', lastInjectedSuggestions.map(s => ({ 
              file: s.filePath, 
              line: s.startLine 
            })));
          }
        }, 500);
      } else {
        dbgLog('Not re-opening dialog: dialogWasOpen=' + dialogWasOpen + ', savedDialogState=' + !!savedDialogState);
      }
    } catch (error) {
      dbgWarn('Error during re-injection:', error);
    } finally {
      isReinjecting = false;
      dbgLog('Re-injection complete, isReinjecting set to false');
    }
  }, 400);
}

/**
 * Set up observer for dialog removal on document.body.
 * Separate from marker observer for performance.
 */
function setupDialogObserver() {
  if (dialogObserver) {
    dialogObserver.disconnect();
    dialogObserver = null;
  }

  dialogObserver = new MutationObserver((mutations) => {
    // Only check for removed dialog backdrop
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes || []) {
        if (node.nodeType === 1 && 
            (node.classList?.contains('thinkreview-suggestion-backdrop') ||
             node.querySelector?.('.thinkreview-suggestion-backdrop'))) {
          dbgLog('Detected removal of dialog backdrop');
          // Check if markers also disappeared
          const markerCount = document.querySelectorAll('.thinkreview-suggestion-marker').length;
          dbgLog(`Marker count after dialog removal: ${markerCount}`);
          if (markerCount === 0 && lastInjectedSuggestions?.length > 0) {
            dbgLog('Markers also removed, scheduling re-inject');
            scheduleReinject();
            return;
          }
        }
      }
    }
  });

  // Only observe direct children of body for dialog (not subtree)
  dialogObserver.observe(document.body, { childList: true, subtree: false });
  dbgLog('Dialog observer active on document.body (childList only, no subtree)');
}

/**
 * Set up observer to detect when our suggestion markers are removed and re-inject.
 * Observes the parent of diff container to catch container replacements.
 */
function setupReinjectObserver() {
  if (reinjectObserver) {
    reinjectObserver.disconnect();
    reinjectObserver = null;
  }

  // Find the diff container's parent to observe (catches container replacement)
  const diffContainer = findGitLabDiffContainer();
  let observeTarget = document.body;
  let targetDesc = 'document.body (fallback)';
  
  if (diffContainer && diffContainer.parentElement) {
    // Observe the parent so we can detect when the container itself is replaced
    observeTarget = diffContainer.parentElement;
    targetDesc = `parent of diff container (${diffContainer.parentElement.tagName}.${diffContainer.parentElement.className || 'no-class'})`;
    dbgLog(`Found diff container parent for observation: ${targetDesc}`);
  } else if (diffContainer) {
    // If no parent, observe the container itself with subtree
    observeTarget = diffContainer;
    targetDesc = 'diff container itself';
    dbgLog('Diff container has no parent, observing container itself');
  } else {
    dbgWarn('Could not find diff container for observer, falling back to document.body');
  }

  reinjectObserver = new MutationObserver((mutations) => {
    // Check for removed nodes containing markers
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes || []) {
        if (containsOurSuggestions(node)) {
          dbgLog('Detected removal of node containing suggestion markers');
          scheduleReinject();
          return;
        }
      }
    }
  });

  reinjectObserver.observe(observeTarget, { childList: true, subtree: true });
  dbgLog(`Re-inject observer active on ${targetDesc}`);
  
  // Set up separate observer for dialog on document.body
  setupDialogObserver();
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

  ensureGitLabInjectedStylesLoaded();

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
    const hasStart = typeof suggestion.startLine === 'number' && suggestion.startLine >= 1;

    if (!suggestion.filePath || !hasStart || !suggestion.suggestedCode) {
      dbgWarn('Invalid suggestion object (must have filePath, startLine, and suggestedCode):', suggestion);
      failedCount++;
      continue;
    }

    const success = await injectSuggestionIntoLine(suggestion);
    if (success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  if (successCount > 0) {
    lastInjectedSuggestions = suggestions;
    lastPatchContent = patchContent || '';
    setupReinjectObserver();
  }

  dbgLog(`Injection complete: ${successCount} successful, ${failedCount} failed`);
  return { success: successCount, failed: failedCount };
}

// Export helper functions for testing
export { parsePatchLineMapping, findGitLabDiffLine, createSuggestionBlock };

