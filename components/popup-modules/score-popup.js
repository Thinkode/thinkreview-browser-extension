/**
 * Score Popup Module
 * Displays a quality score popup on the AI Review button when the panel is minimized
 */

// Load CSS for the score popup
const cssURL = chrome.runtime.getURL('components/popup-modules/score-popup.css');
const linkElement = document.createElement('link');
linkElement.rel = 'stylesheet';
linkElement.href = cssURL;
if (!document.querySelector(`link[href="${cssURL}"]`)) {
  document.head.appendChild(linkElement);
}

// Store the current score for persistence
let currentScore = null;

/**
 * Gets the color for a score value
 * @param {number} score - Score value (0-100)
 * @returns {string} - Hex color code
 */
function getScoreColor(score) {
  if (score >= 80) return '#1f883d'; // Green
  if (score >= 50) return '#f79009'; // Yellow/Orange
  return '#c9190b'; // Red
}

/**
 * Updates the popup position to account for button position changes
 * @param {HTMLElement} popup - The popup element
 */
function updatePopupPosition(popup) {
  const reviewBtn = document.getElementById('code-review-btn');
  if (!reviewBtn || !popup) return;

  const buttonRect = reviewBtn.getBoundingClientRect();
  const buttonCenterX = buttonRect.left + buttonRect.width / 2;
  popup.style.bottom = `${window.innerHeight - buttonRect.top + 8}px`;
  popup.style.left = `${buttonCenterX}px`;
}

/**
 * Hides the popup with a fade-out animation
 * @param {HTMLElement} popup - The popup element to hide
 */
function hidePopup(popup) {
  if (popup && popup.parentNode) {
    popup.style.opacity = '0';
    popup.style.transform = 'translateX(-50%) translateY(5px)';
    setTimeout(() => {
      if (popup && popup.parentNode) {
        popup.remove();
      }
    }, 300);
  }
}

/**
 * Shows the popup with fade-in animation
 * @param {HTMLElement} popup - The popup element to show
 */
function showPopup(popup) {
  if (popup && popup.parentNode) {
    popup.style.opacity = '1';
    popup.style.transform = 'translateX(-50%) translateY(0)';
  }
}

/**
 * Creates a circular gauge SVG for the score
 * @param {number} score - Score value (0-100)
 * @param {string} color - Color for the gauge
 * @returns {string} - SVG string for the circular gauge
 */
function createCircularGauge(score, color) {
  const size = 45;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const finalOffset = circumference - (score / 100) * circumference;
  
  // Store circumference and final offset for animation
  const uniqueId = `gauge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return `
    <svg class="thinkreview-score-gauge-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <style>
        @keyframes gauge-fill-${uniqueId} {
          from {
            stroke-dashoffset: ${circumference};
          }
          to {
            stroke-dashoffset: ${finalOffset};
          }
        }
        .thinkreview-gauge-progress-${uniqueId} {
          animation: gauge-fill-${uniqueId} 3s ease-out forwards;
        }
      </style>
      <!-- Background circle -->
      <circle
        cx="${size / 2}"
        cy="${size / 2}"
        r="${radius}"
        fill="none"
        stroke="rgba(255, 255, 255, 0.2)"
        stroke-width="${strokeWidth}"
      />
      <!-- Progress circle with animation -->
      <circle
        cx="${size / 2}"
        cy="${size / 2}"
        r="${radius}"
        fill="none"
        stroke="${color}"
        stroke-width="${strokeWidth}"
        stroke-linecap="round"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${circumference}"
        transform="rotate(-90 ${size / 2} ${size / 2})"
        class="thinkreview-score-gauge-progress thinkreview-gauge-progress-${uniqueId}"
      />
      <!-- Score text -->
      <text
        x="${size / 2}"
        y="${size / 2}"
        text-anchor="middle"
        dominant-baseline="central"
        class="thinkreview-score-gauge-text"
        fill="${color}"
        font-size="14"
        font-weight="bold"
      >${score}</text>
    </svg>
  `;
}

/**
 * Creates and positions the popup element
 * @param {number} overallScore - The overall quality score (0-100)
 * @returns {HTMLElement} - The created popup element
 */
function createPopup(overallScore) {
  const reviewBtn = document.getElementById('code-review-btn');
  if (!reviewBtn) return null;

  const scoreColor = getScoreColor(overallScore);
  const gaugeSVG = createCircularGauge(overallScore, scoreColor);

  // Create popup element with circular gauge
  const popup = document.createElement('div');
  popup.id = 'thinkreview-score-popup';
  popup.className = 'thinkreview-score-popup';
  popup.innerHTML = `
    <div class="thinkreview-score-popup-content">
      ${gaugeSVG}
    </div>
  `;

  // Position popup above the button, centered
  const buttonRect = reviewBtn.getBoundingClientRect();
  const buttonCenterX = buttonRect.left + buttonRect.width / 2;
  popup.style.position = 'fixed';
  popup.style.bottom = `${window.innerHeight - buttonRect.top + 8}px`;
  popup.style.left = `${buttonCenterX}px`;
  popup.style.zIndex = '10000';

  document.body.appendChild(popup);
  return popup;
}

/**
 * Shows a score popup on the AI Review button when panel is minimized
 * @param {number} overallScore - The overall quality score (0-100)
 */
export function showScorePopupOnButton(overallScore) {
  // Store the score for later use
  currentScore = overallScore;

  const reviewBtn = document.getElementById('code-review-btn');
  if (!reviewBtn) return;

  // Check if panel is minimized
  const panel = document.getElementById('gitlab-mr-integrated-review');
  if (!panel || !panel.classList.contains('thinkreview-panel-minimized-to-button')) {
    // Panel is not minimized, don't show popup
    return;
  }

  // Remove existing popup if any
  const existingPopup = document.getElementById('thinkreview-score-popup');
  if (existingPopup) {
    existingPopup.remove();
  }

  const popup = createPopup(overallScore);
  if (!popup) return;

  // Update position on window resize
  const positionUpdater = () => updatePopupPosition(popup);
  window.addEventListener('resize', positionUpdater);
  
  // Store updater on popup for cleanup
  popup._positionUpdater = positionUpdater;
}

/**
 * Hides the score popup (called when panel is expanded)
 */
export function hideScorePopup() {
  const popup = document.getElementById('thinkreview-score-popup');
  if (popup) {
    // Remove resize listener
    if (popup._positionUpdater) {
      window.removeEventListener('resize', popup._positionUpdater);
    }
    hidePopup(popup);
  }
}

/**
 * Shows the score popup if panel is minimized and score exists
 * (called when panel is minimized)
 */
export function showScorePopupIfMinimized() {
  if (currentScore === null) return;

  const panel = document.getElementById('gitlab-mr-integrated-review');
  if (panel && panel.classList.contains('thinkreview-panel-minimized-to-button')) {
    showScorePopupOnButton(currentScore);
  }
}

