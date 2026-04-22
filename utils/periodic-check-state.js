/**
 * periodic-check-state.js
 * Centralized state management for periodic check intervals.
 * Avoids polluting the global window object.
 */

/**
 * @type {number|null}
 */
let _periodicCheckInterval = null;

/**
 * Sets the periodic check interval ID.
 * 
 * @param {number} intervalId - The interval ID from setInterval
 */
export function setPeriodicCheckInterval(intervalId) {
  if (typeof intervalId !== 'number') {
    console.warn('[PeriodicCheckState] Invalid interval ID provided');
    return;
  }
  
  // Clear existing interval if one exists
  if (_periodicCheckInterval !== null) {
    clearInterval(_periodicCheckInterval);
  }
  
  _periodicCheckInterval = intervalId;
}

/**
 * Gets the current periodic check interval ID.
 * 
 * @returns {number|null}
 */
export function getPeriodicCheckInterval() {
  return _periodicCheckInterval;
}

/**
 * Checks if a periodic check interval is active.
 * 
 * @returns {boolean}
 */
export function hasPeriodicCheckInterval() {
  return _periodicCheckInterval !== null;
}

/**
 * Clears the periodic check interval and removes the reference.
 */
export function clearPeriodicCheckInterval() {
  if (_periodicCheckInterval !== null) {
    clearInterval(_periodicCheckInterval);
    _periodicCheckInterval = null;
  }
}
