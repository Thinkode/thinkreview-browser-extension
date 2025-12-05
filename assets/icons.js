/**
 * Centralized icon assets for ThinkReview extension
 * SVG icons used throughout the extension
 */

// Refresh/Regenerate icon path data (single source of truth)
const REFRESH_ICON_PATH = 'M13.65 2.35C12.2 0.9 10.21 0 8 0C3.58 0 0.01 3.58 0.01 8C0.01 12.42 3.58 16 8 16C11.73 16 14.84 13.45 15.73 10H13.65C12.83 12.33 10.61 14 8 14C4.69 14 2 11.31 2 8C2 4.69 4.69 2 8 2C9.66 2 11.14 2.69 12.22 3.78L9 7H16V0L13.65 2.35Z';

/**
 * Refresh/Regenerate icon SVG
 * Used in regenerate button and error retry button
 * @param {number} width - Icon width (default: 16)
 * @param {number} height - Icon height (default: 16)
 * @param {string} fill - Fill color (default: 'currentColor')
 * @returns {string} SVG HTML string
 */
export function getRefreshIcon(width = 16, height = 16, fill = 'currentColor') {
  return `<svg width="${width}" height="${height}" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${REFRESH_ICON_PATH}" fill="${fill}"/></svg>`;
}

/**
 * Refresh icon as a constant (for direct HTML injection)
 */
export const REFRESH_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${REFRESH_ICON_PATH}" fill="currentColor"/></svg>`;

