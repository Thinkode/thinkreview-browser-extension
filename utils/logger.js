// logger.js
// Shared logging utility that integrates with Google Analytics and Honeybadger

import { logToAnalytics } from './analytics-service.js';
import { reportError, reportMessage, isInitialized } from './honeybadger-service.js';

// Debug toggle: set to false to disable console logs in production
const DEBUG = false;

/**
 * Extract the calling filename from stack trace
 * This automatically gets the JS file name where the logger was called from
 * @returns {string} Filename without extension (e.g., 'background', 'popup')
 */
function getCallingFilename() {
  try {
    const stack = new Error().stack;
    if (!stack) return 'unknown';
    
    const stackLines = stack.split('\n');
    
    // Stack format examples:
    // Chrome: "    at dbgWarn (chrome-extension://.../utils/logger.js:88:5)"
    //         "    at handleReview (chrome-extension://.../background.js:394:15)"
    // Firefox: "dbgWarn@chrome-extension://.../utils/logger.js:88:5"
    //          "handleReview@chrome-extension://.../background.js:394:15"
    
    // Skip first line (Error message) and second line (getCallingFilename)
    // Look for the first file that's not logger.js
    for (let i = 2; i < stackLines.length && i < 10; i++) {
      const line = stackLines[i];
      
      // Match patterns:
      // - chrome-extension://id/path/to/file.js:line:col
      // - file:///path/to/file.js:line:col
      // - moz-extension://id/path/to/file.js:line:col
      const match = line.match(/(?:chrome-extension|file|moz-extension):\/\/[^:]+[\/\\]([^\/\\]+)\.js(?::\d+:\d+)?/);
      
      if (match && match[1]) {
        const filename = match[1];
        // Skip logger.js itself
        if (filename !== 'logger') {
          return filename;
        }
      }
    }
  } catch (e) {
    // Ignore errors in filename detection
  }
  
  return 'unknown';
}

/**
 * Format log arguments into a message string
 * @param {Array} args - Log arguments
 * @returns {string} Formatted message
 */
function formatMessage(args) {
  return args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

/**
 * Debug log function with Google Analytics integration
 * Usage: dbgLog('message', data) or dbgLog('message')
 * The filename is automatically extracted from the stack trace
 * @param {...any} args - Log arguments (all treated as message)
 */
export function dbgLog(...args) {
  // Always extract filename from stack trace
  const componentName = getCallingFilename();
  
  if (DEBUG) {
    console.log(`[${componentName}]`, ...args);
  }
  
  // Always send to analytics (even if DEBUG is false)
  const message = formatMessage(args);
  logToAnalytics('log', componentName, message).catch(() => {
    // Silently fail - analytics shouldn't break the extension
  });
}

/**
 * Debug warn function with Google Analytics integration
 * Usage: dbgWarn('message', data) or dbgWarn('message')
 * The filename is automatically extracted from the stack trace
 * @param {...any} args - Log arguments (all treated as message)
 */
export function dbgWarn(...args) {
  // Always extract filename from stack trace
  const componentName = getCallingFilename();
  
  if (DEBUG) {
    console.warn(`[${componentName}]`, ...args);
  }
  
  // Always send to analytics
  const message = formatMessage(args);
  logToAnalytics('warn', componentName, message).catch(() => {
    // Silently fail
  });
  
  // Report to Honeybadger if initialized
  if (isInitialized()) {
    reportMessage(message, {
      component: componentName,
      level: 'warning'
    });
  }
}

/**
 * Debug error function with Google Analytics integration
 * Usage: dbgError('message', error) or dbgError('message')
 * The filename is automatically extracted from the stack trace
 * @param {...any} args - Log arguments (all treated as message)
 */
export function dbgError(...args) {
  // Always extract filename from stack trace
  const componentName = getCallingFilename();
  
  if (DEBUG) {
    console.error(`[${componentName}]`, ...args);
  }
  
  // Always send to analytics (errors are important)
  const message = formatMessage(args);
  
  // Include error details if available
  const errorData = {};
  let errorObject = null;
  if (args[0] instanceof Error) {
    errorObject = args[0];
    errorData.error_name = errorObject.name;
    errorData.error_message = errorObject.message;
    errorData.error_stack = errorObject.stack?.substring(0, 1000); // Truncate stack
  }
  
  logToAnalytics('error', componentName, message, errorData).catch(() => {
    // Silently fail
  });
  
  // Report to Honeybadger if initialized
  if (isInitialized()) {
    if (errorObject) {
      // Report the actual error object
      reportError(errorObject, {
        component: componentName,
        message: message,
        ...errorData
      });
    } else {
      // Report as a message
      reportError(message, {
        component: componentName,
        level: 'error',
        ...errorData
      });
    }
  }
}

// Export default for convenience
export default {
  dbgLog,
  dbgWarn,
  dbgError
};

