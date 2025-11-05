/**
 * Date Utility Functions
 * -------------------------
 * Comprehensive date handling utilities for Firebase/Firestore timestamps
 * and various date formats used in the ThinkGPT ecosystem.
 */

/**
 * Convert various date formats to a JavaScript Date object
 * Handles Firebase/Firestore Timestamps, Unix timestamps, ISO strings, etc.
 * 
 * @param {any} value - Date value in various formats:
 *   - Date object
 *   - Firestore Timestamp (with toDate() method)
 *   - Object with {seconds} or {_seconds} property
 *   - Unix timestamp (number, seconds or milliseconds)
 *   - ISO date string
 *   - Numeric string timestamp
 * @returns {Date} JavaScript Date object, or Invalid Date if parsing fails
 */
export function toDate(value) {
  if (!value) return new Date('Invalid Date');
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  
  if (typeof value === 'number') {
    return value > 1000000000000 ? new Date(value) : new Date(value * 1000);
  }
  
  if (typeof value === 'string') {
    // Handle numeric string timestamps
    if (/^\d+$/.test(value)) {
      const n = parseInt(value, 10);
      return n > 1000000000000 ? new Date(n) : new Date(n * 1000);
    }
    // Handle Firebase date strings like "October 30, 2025 at 10:23:24 PM UTC"
    if (value.includes(' at ') && value.includes(' UTC')) {
      const cleanedDate = value.replace(' at ', ' ');
      return new Date(cleanedDate);
    }
    // Handle ISO strings and other formats
    return new Date(value);
  }
  
  // Handle objects with seconds property (Firestore Timestamp-like)
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
  
  // Try direct conversion as last resort
  return new Date(value);
}

/**
 * Check if a date is valid
 * @param {any} dateValue - Date value in any format
 * @returns {boolean} True if the date is valid
 */
export function isValidDate(dateValue) {
  const date = toDate(dateValue);
  return !isNaN(date.getTime());
}

/**
 * Check if two dates are on the same day (local time)
 * @param {any} date1 - First date in any format
 * @param {any} date2 - Second date in any format (defaults to today)
 * @returns {boolean} True if dates are on the same day
 */
export function isSameDay(date1, date2 = new Date()) {
  const d1 = toDate(date1);
  const d2 = toDate(date2);
  
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  
  return d1.toDateString() === d2.toDateString();
}

/**
 * Check if a date is today (local time)
 * @param {any} dateValue - Date value in any format
 * @returns {boolean} True if the date is today
 */
export function isToday(dateValue) {
  return isSameDay(dateValue, new Date());
}

/**
 * Check if a date is yesterday (local time)
 * @param {any} dateValue - Date value in any format
 * @returns {boolean} True if the date is yesterday
 */
export function isYesterday(dateValue) {
  const date = toDate(dateValue);
  if (isNaN(date.getTime())) return false;
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  return date.toDateString() === yesterday.toDateString();
}

/**
 * Check if a date is in the past
 * @param {any} dateValue - Date value in any format
 * @param {Date} referenceDate - Reference date (defaults to now)
 * @returns {boolean} True if the date is in the past
 */
export function isPast(dateValue, referenceDate = new Date()) {
  const date = toDate(dateValue);
  const ref = toDate(referenceDate);
  
  if (isNaN(date.getTime()) || isNaN(ref.getTime())) return false;
  
  return date < ref;
}

/**
 * Check if a date is in the future
 * @param {any} dateValue - Date value in any format
 * @param {Date} referenceDate - Reference date (defaults to now)
 * @returns {boolean} True if the date is in the future
 */
export function isFuture(dateValue, referenceDate = new Date()) {
  const date = toDate(dateValue);
  const ref = toDate(referenceDate);
  
  if (isNaN(date.getTime()) || isNaN(ref.getTime())) return false;
  
  return date > ref;
}

/**
 * Format a date for display (short format like Firebase)
 * Example: "Oct 30, 2025"
 * 
 * @param {any} dateValue - Date value in any format
 * @param {Object} options - toLocaleDateString options
 * @returns {string|null} Formatted date string or null if invalid
 */
export function formatDate(dateValue, options = {}) {
  const date = toDate(dateValue);
  
  if (isNaN(date.getTime())) return null;
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  return date.toLocaleDateString('en-US', mergedOptions);
}

/**
 * Format a date with time (long format like Firebase)
 * Example: "October 30, 2025 at 10:23:24 PM UTC"
 * 
 * @param {any} dateValue - Date value in any format
 * @param {Object} options - Formatting options
 * @returns {string|null} Formatted date string or null if invalid
 */
export function formatDateLong(dateValue, options = {}) {
  const date = toDate(dateValue);
  
  if (isNaN(date.getTime())) return null;
  
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  // Format date part
  const dateStr = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  // Format time part
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  });
  
  return `${dateStr} at ${timeStr} UTC`;
}

/**
 * Format a date relative to now (e.g., "2 days ago", "in 3 months")
 * @param {any} dateValue - Date value in any format
 * @returns {string} Human-readable relative date string
 */
export function formatRelativeDate(dateValue) {
  const date = toDate(dateValue);
  
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  
  const now = new Date();
  const diffMs = date - now;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  
  if (diffDays > 0) {
    if (diffDays < 30) return `In ${diffDays} days`;
    if (diffDays < 365) {
      const months = Math.round(diffDays / 30);
      return `In ${months} ${months === 1 ? 'month' : 'months'}`;
    }
    const years = Math.round(diffDays / 365);
    return `In ${years} ${years === 1 ? 'year' : 'years'}`;
  } else {
    const absDiffDays = Math.abs(diffDays);
    if (absDiffDays < 30) return `${absDiffDays} days ago`;
    if (absDiffDays < 365) {
      const months = Math.round(absDiffDays / 30);
      return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    }
    const years = Math.round(absDiffDays / 365);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  }
}

/**
 * Get the start of a day (00:00:00) in local time
 * @param {any} dateValue - Date value in any format (defaults to today)
 * @returns {Date} Date object set to start of day
 */
export function startOfDay(dateValue = new Date()) {
  const date = toDate(dateValue);
  if (isNaN(date.getTime())) return new Date('Invalid Date');
  
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Get the end of a day (23:59:59.999) in local time
 * @param {any} dateValue - Date value in any format (defaults to today)
 * @returns {Date} Date object set to end of day
 */
export function endOfDay(dateValue = new Date()) {
  const date = toDate(dateValue);
  if (isNaN(date.getTime())) return new Date('Invalid Date');
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

