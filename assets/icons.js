/**
 * Centralized icon assets for ThinkReview extension
 * SVG icons used throughout the extension
 * This is a constants definition file
 */

// Refresh/Regenerate icon path data (single source of truth)
const REFRESH_ICON_PATH = 'M13.65 2.35C12.2 0.9 10.21 0 8 0C3.58 0 0.01 3.58 0.01 8C0.01 12.42 3.58 16 8 16C11.73 16 14.84 13.45 15.73 10H13.65C12.83 12.33 10.61 14 8 14C4.69 14 2 11.31 2 8C2 4.69 4.69 2 8 2C9.66 2 11.14 2.69 12.22 3.78L9 7H16V0L13.65 2.35Z';

// Refresh icon SVG constant
const REFRESH_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${REFRESH_ICON_PATH}" fill="currentColor"/></svg>`;

// Settings/Gear icon SVG constant
const SETTINGS_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

// Configure/Slider icon SVG constant
const CONFIGURE_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="3" width="4" height="2.5" rx="1.25"/><circle cx="8" cy="4.25" r="1.5"/><rect x="10" y="3" width="8" height="2.5" rx="1.25"/><rect x="2" y="8.75" width="6" height="2.5" rx="1.25"/><circle cx="10" cy="10" r="1.5"/><rect x="12" y="8.75" width="6" height="2.5" rx="1.25"/><rect x="2" y="14.5" width="4" height="2.5" rx="1.25"/><circle cx="8" cy="15.75" r="1.5"/><rect x="10" y="14.5" width="8" height="2.5" rx="1.25"/></svg>`;

// Export constants (ES6 module syntax needed for dynamic imports, but structure is simple constants)
export { REFRESH_ICON_SVG, SETTINGS_ICON_SVG, CONFIGURE_ICON_SVG };

