/**
 * Quality Scorecard Component
 * Displays quality metrics for MR reviews in a visual scorecard format
 */

import { CONFIGURE_ICON_SVG } from '../assets/icons.js';

/**
 * Gets the color class based on score value
 * @param {number} score - Score value (0-100)
 * @returns {string} - CSS class name for color
 */
function getScoreColorClass(score) {
  if (score >= 80) return 'score-excellent';
  if (score >= 50) return 'score-good';
  return 'score-poor';
}

/**
 * Gets the color value for progress bar
 * @param {number} score - Score value (0-100)
 * @returns {string} - Hex color code
 */
function getScoreColor(score) {
  if (score >= 80) return '#1f883d'; // Green
  if (score >= 50) return '#f79009'; // Yellow/Orange
  return '#c9190b'; // Red
}

/**
 * Renders a quality scorecard component
 * @param {Object} metrics - Metrics object with scores
 * @param {number} metrics.overallScore - Overall quality score (0-100)
 * @param {number} metrics.codeQuality - Code quality score (0-100)
 * @param {number} metrics.securityScore - Security score (0-100)
 * @param {number} metrics.bestPracticesScore - Best practices score (0-100)
 * @param {Function} [onMetricClick] - Optional callback function when a metric is clicked. Receives (metricName, score)
 * @returns {HTMLElement} - The rendered scorecard element
 */
export function renderQualityScorecard(metrics, onMetricClick = null) {
  if (!metrics) {
    return null;
  }

  // Validate metrics object
  const {
    overallScore = 0,
    codeQuality = 0,
    securityScore = 0,
    bestPracticesScore = 0
  } = metrics;

  // Create the main container
  const container = document.createElement('div');
  container.className = 'thinkreview-quality-scorecard gl-mb-4';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Code quality metrics');

  container.innerHTML = `
    <div class="thinkreview-scorecard-header gl-display-flex gl-align-items-center gl-justify-content-space-between gl-mb-3">
      <h5 class="gl-font-weight-bold thinkreview-section-title gl-mb-0">Quality Score</h5>
    </div>
    <div class="thinkreview-scorecard-content">
      <div class="thinkreview-overall-score gl-display-flex gl-align-items-center gl-justify-content-center gl-mb-4">
        <div class="thinkreview-score-circle ${getScoreColorClass(overallScore)} thinkreview-clickable-metric" 
             data-metric="overall" 
             data-score="${overallScore}"
             aria-label="Overall quality score: ${overallScore}. Click to learn more." 
             role="button"
             tabindex="0">
          <span class="thinkreview-score-value">${overallScore}</span>
          <span class="thinkreview-score-label">Overall</span>
        </div>
      </div>
      <div class="thinkreview-metrics-grid">
        <div class="thinkreview-metric-item thinkreview-clickable-metric" 
             data-metric="codeQuality" 
             data-score="${codeQuality}"
             role="button"
             tabindex="0">
          <div class="thinkreview-metric-header gl-display-flex gl-justify-content-space-between gl-mb-1">
            <span class="thinkreview-metric-label">Code Quality</span>
            <span class="thinkreview-metric-score-container gl-display-flex gl-align-items-center">
              <a href="https://thinkreview.dev/scoring-metrics" target="_blank" rel="noopener noreferrer" class="thinkreview-metric-settings-icon" title="configure">
                ${CONFIGURE_ICON_SVG}
              </a>
              <span class="thinkreview-metric-score ${getScoreColorClass(codeQuality)}">${codeQuality}</span>
            </span>
          </div>
          <div class="thinkreview-progress-bar">
            <div class="thinkreview-progress-fill ${getScoreColorClass(codeQuality)}" 
                 style="width: ${codeQuality}%; background-color: ${getScoreColor(codeQuality)};" 
                 role="progressbar" 
                 aria-valuenow="${codeQuality}" 
                 aria-valuemin="0" 
                 aria-valuemax="100"
                 aria-label="Code quality score: ${codeQuality}%"></div>
          </div>
        </div>
        <div class="thinkreview-metric-item thinkreview-clickable-metric" 
             data-metric="security" 
             data-score="${securityScore}"
             role="button"
             tabindex="0">
          <div class="thinkreview-metric-header gl-display-flex gl-justify-content-space-between gl-mb-1">
            <span class="thinkreview-metric-label">Security</span>
            <span class="thinkreview-metric-score-container gl-display-flex gl-align-items-center">
              <a href="https://thinkreview.dev/scoring-metrics" target="_blank" rel="noopener noreferrer" class="thinkreview-metric-settings-icon" title="configure">
                ${CONFIGURE_ICON_SVG}
              </a>
              <span class="thinkreview-metric-score ${getScoreColorClass(securityScore)}">${securityScore}</span>
            </span>
          </div>
          <div class="thinkreview-progress-bar">
            <div class="thinkreview-progress-fill ${getScoreColorClass(securityScore)}" 
                 style="width: ${securityScore}%; background-color: ${getScoreColor(securityScore)};" 
                 role="progressbar" 
                 aria-valuenow="${securityScore}" 
                 aria-valuemin="0" 
                 aria-valuemax="100"
                 aria-label="Security score: ${securityScore}%"></div>
          </div>
        </div>
        <div class="thinkreview-metric-item thinkreview-clickable-metric" 
             data-metric="bestPractices" 
             data-score="${bestPracticesScore}"
             role="button"
             tabindex="0">
          <div class="thinkreview-metric-header gl-display-flex gl-justify-content-space-between gl-mb-1">
            <span class="thinkreview-metric-label">Best Practices</span>
            <span class="thinkreview-metric-score-container gl-display-flex gl-align-items-center">
              <a href="https://thinkreview.dev/scoring-metrics" target="_blank" rel="noopener noreferrer" class="thinkreview-metric-settings-icon" title="configure">
                ${CONFIGURE_ICON_SVG}
              </a>
              <span class="thinkreview-metric-score ${getScoreColorClass(bestPracticesScore)}">${bestPracticesScore}</span>
            </span>
          </div>
          <div class="thinkreview-progress-bar">
            <div class="thinkreview-progress-fill ${getScoreColorClass(bestPracticesScore)}" 
                 style="width: ${bestPracticesScore}%; background-color: ${getScoreColor(bestPracticesScore)};" 
                 role="progressbar" 
                 aria-valuenow="${bestPracticesScore}" 
                 aria-valuemin="0" 
                 aria-valuemax="100"
                 aria-label="Best practices score: ${bestPracticesScore}%"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Store references to event listeners and handlers for cleanup
  const eventListeners = [];

  // Add event handlers to prevent metric click when clicking settings icon
  const settingsIcons = container.querySelectorAll('.thinkreview-metric-settings-icon');
  settingsIcons.forEach(iconLink => {
    const handleSettingsClick = (e) => {
      e.stopPropagation(); // Prevent the metric click handler from triggering
    };
    
    iconLink.addEventListener('click', handleSettingsClick);
    
    // Store references for cleanup
    eventListeners.push({
      element: iconLink,
      handlers: [
        { event: 'click', handler: handleSettingsClick }
      ]
    });
  });

  // Add click handlers if callback is provided
  if (onMetricClick) {
    const clickableMetrics = container.querySelectorAll('.thinkreview-clickable-metric');
    clickableMetrics.forEach(element => {
      const metricName = element.getAttribute('data-metric');
      const score = parseInt(element.getAttribute('data-score'), 10);
      
      const handleClick = () => {
        onMetricClick(metricName, score);
      };
      
      const handleKeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      };
      
      element.addEventListener('click', handleClick);
      element.addEventListener('keydown', handleKeydown);
      
      // Store references for cleanup
      eventListeners.push({
        element,
        handlers: [
          { event: 'click', handler: handleClick },
          { event: 'keydown', handler: handleKeydown }
        ]
      });
    });
  }

  // Attach cleanup function to container for easy access
  container._cleanupMetricListeners = () => {
    eventListeners.forEach(({ element, handlers }) => {
      handlers.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
    });
    eventListeners.length = 0; // Clear the array
  };

  return container;
}

