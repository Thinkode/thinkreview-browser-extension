// logger.js
// Shared logging utility that integrates with Google Analytics and Honeybadger

import { logToAnalytics } from './analytics-service.js';
import { reportError, reportMessage, isInitialized } from './honeybadger-service.js';

// Debug toggle: set to false to disable console logs in production
const DEBUG = false;

/**
 * Extract component name from stack trace or use provided name
 * @param {string} providedName - Provided component name
 * @returns {string} Component name
 */
function getComponentName(providedName = null) {
  if (providedName) return providedName;
  
  try {
    const stack = new Error().stack;
    if (stack) {
      const stackLines = stack.split('\n');
      // Try to extract filename from stack trace
      for (let i = 2; i < stackLines.length && i < 5; i++) {
        const match = stackLines[i].match(/([^/\\]+)\.js/);
        if (match) {
          return match[1];
        }
      }
    }
  } catch (e) {
    // Ignore errors in component detection
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
 * Usage: dbgLog('ComponentName', 'message', data) or dbgLog('message', data)
 * @param {string} component - Optional component name (if first arg is string and there are more args)
 * @param {...any} args - Log arguments
 */
export function dbgLog(component, ...args) {
  // If first arg is not a string, treat it as part of args
  let componentName = component;
  let logArgs = args;
  
  if (typeof component !== 'string' || args.length === 0) {
    componentName = getComponentName();
    logArgs = component ? [component, ...args] : args;
  }
  
  if (DEBUG) {
    console.log(`[${componentName}]`, ...logArgs);
  }
  
  // Always send to analytics (even if DEBUG is false)
  const message = formatMessage(logArgs);
  logToAnalytics('log', componentName, message).catch(() => {
    // Silently fail - analytics shouldn't break the extension
  });
}

/**
 * Debug warn function with Google Analytics integration
 * Usage: dbgWarn('ComponentName', 'message', data) or dbgWarn('message', data)
 * @param {string} component - Optional component name
 * @param {...any} args - Log arguments
 */
export function dbgWarn(component, ...args) {
  let componentName = component;
  let logArgs = args;
  
  if (typeof component !== 'string' || args.length === 0) {
    componentName = getComponentName();
    logArgs = component ? [component, ...args] : args;
  }
  
  if (DEBUG) {
    console.warn(`[${componentName}]`, ...logArgs);
  }
  
  // Always send to analytics
  const message = formatMessage(logArgs);
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
 * Usage: dbgError('ComponentName', 'message', error) or dbgError('message', error)
 * @param {string} component - Optional component name
 * @param {...any} args - Log arguments
 */
export function dbgError(component, ...args) {
  let componentName = component;
  let logArgs = args;
  
  if (typeof component !== 'string' || args.length === 0) {
    componentName = getComponentName();
    logArgs = component ? [component, ...args] : args;
  }
  
  if (DEBUG) {
    console.error(`[${componentName}]`, ...logArgs);
  }
  
  // Always send to analytics (errors are important)
  const message = formatMessage(logArgs);
  
  // Include error details if available
  const errorData = {};
  let errorObject = null;
  if (logArgs[0] instanceof Error) {
    errorObject = logArgs[0];
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

