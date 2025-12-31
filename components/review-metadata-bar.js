// review-metadata-bar.js
// Renders the patch size / metadata banner inside the integrated review panel

/**
 * Render the review metadata bar (patch size banner)
 * @param {HTMLElement} container - The container element for the banner
 * @param {Object|null} patchSize - Patch size information from backend
 * @param {string|null} subscriptionType - User's subscription type ('premium' or 'free')
 * @param {string|null} modelUsed - Model used for the review
 */
export function renderReviewMetadataBar(container, patchSize, subscriptionType = null, modelUsed = null) {
  if (!container) return;

  // Clear previous content
  container.innerHTML = '';

  // If we don't have patch size info or original is missing, hide the container
  if (!patchSize || !patchSize.original) {
    container.classList.add('gl-hidden');
    return;
  }

  // Helper to format sizes nicely
  const formatSize = (bytes) => {
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const originalSize = formatSize(patchSize.original);
  const truncatedSize = patchSize.truncated ? formatSize(patchSize.truncated) : null;
  const filesExcluded = patchSize.filesExcluded || 0;
  const excludedFileNames = Array.isArray(patchSize.excludedFileNames)
    ? patchSize.excludedFileNames.filter(Boolean)
    : [];
  const wasForcedTruncated = patchSize.wasForcedTruncated || false;
  // Check if subscriptionType is 'free' (case-insensitive comparison, handle null/undefined)
  const isFreeSubscription = subscriptionType && subscriptionType.toLowerCase() === 'free';
  const showUpgradeMessage = wasForcedTruncated && isFreeSubscription;

  // Build main banner text
  let bannerText = `Original patch: ${originalSize}`;
  if (filesExcluded > 0) {
    bannerText += ` • Files excluded: ${filesExcluded}`;
  }
  if (patchSize.wasTruncated && truncatedSize) {
    bannerText += ` • Truncated patch: ${truncatedSize}`;
  }
  if (modelUsed) {
    bannerText += ` • Model: ${modelUsed}`;
  }

  // Create main banner container
  const banner = document.createElement('div');
  banner.className = 'thinkreview-patch-size-banner';
  
  // Create top row container that stays fixed
  const topRow = document.createElement('div');
  topRow.className = 'thinkreview-patch-size-top-row';
  
  // Add expandable arrow on the left if there are excluded files
  if (excludedFileNames.length > 0) {
    const expandArrow = document.createElement('button');
    expandArrow.type = 'button';
    expandArrow.className = 'thinkreview-patch-size-expand-arrow';
    expandArrow.setAttribute('aria-label', 'Toggle excluded files list');
    expandArrow.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    topRow.appendChild(expandArrow);
  }

  const icon = document.createElement('div');
  icon.className = 'thinkreview-patch-size-icon';
  icon.textContent = '📊';

  const content = document.createElement('div');
  content.className = 'thinkreview-patch-size-content';
  content.textContent = bannerText;

  topRow.appendChild(icon);
  topRow.appendChild(content);
  
  // Add customize button to link to model selection page
  const customizeButton = document.createElement('a');
  customizeButton.href = 'https://portal.thinkreview.dev/model-selection';
  customizeButton.target = '_blank';
  customizeButton.rel = 'noopener noreferrer';
  customizeButton.className = 'thinkreview-patch-size-customize-button';
  customizeButton.textContent = 'Customize';
  customizeButton.setAttribute('aria-label', 'Customize model selection');
  
  // Prevent click event from bubbling to topRow (which might be clickable for expanding)
  customizeButton.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  topRow.appendChild(customizeButton);
  banner.appendChild(topRow);

  // Optional expandable list of excluded files (separate section below top row)
  if (excludedFileNames.length > 0) {
    const details = document.createElement('div');
    details.className = 'thinkreview-patch-size-details gl-hidden';

    const listTitle = document.createElement('div');
    listTitle.className = 'thinkreview-patch-size-details-title';
    listTitle.textContent = 'Excluded files (' + excludedFileNames.length + '):';

    const list = document.createElement('ul');
    list.className = 'thinkreview-patch-size-details-list';

    excludedFileNames.forEach((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      list.appendChild(li);
    });

    details.appendChild(listTitle);
    details.appendChild(list);

    // Get the expand arrow button
    const expandArrow = topRow.querySelector('.thinkreview-patch-size-expand-arrow');
    
    // Toggle behaviour - clicking the arrow or the top row
    const toggleExpanded = () => {
      const isHidden = details.classList.contains('gl-hidden');
      if (isHidden) {
        details.classList.remove('gl-hidden');
        banner.classList.add('thinkreview-patch-size-banner-expanded');
      } else {
        details.classList.add('gl-hidden');
        banner.classList.remove('thinkreview-patch-size-banner-expanded');
      }
    };

    if (expandArrow) {
      expandArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleExpanded();
      });
      
      // Also allow clicking the top row to expand
      topRow.style.cursor = 'pointer';
      topRow.addEventListener('click', (e) => {
        // Don't toggle if clicking on the arrow (already handled) or customize button
        if (e.target.closest('.thinkreview-patch-size-expand-arrow') || 
            e.target.closest('.thinkreview-patch-size-customize-button')) {
          return;
        }
        toggleExpanded();
      });
    }

    banner.appendChild(details);
  }

  // Add upgrade message if forced truncation occurred and user is on free tier
  if (showUpgradeMessage) {
    // Randomly select one of the upgrade messages
    const upgradeMessages = [
      'Your patch was too large for the free tier. <a href="https://portal.thinkreview.dev/subscription" target="_blank" class="thinkreview-upgrade-link">Upgrade to one of our premium plans</a> to review patches up to 4MB.',
      'Your patch was too large for the free tier. <a href="https://portal.thinkreview.dev/subscription" target="_blank" class="thinkreview-upgrade-link">Upgrade to one of our premium plans</a> to get a complete review for this PR',
      '<a href="https://portal.thinkreview.dev/subscription" target="_blank" class="thinkreview-upgrade-link">Upgrade to one of our premium plans</a> to review your entire patch (up to 5MB)'
    ];
    
    const randomMessage = upgradeMessages[Math.floor(Math.random() * upgradeMessages.length)];
    
    const upgradeMessage = document.createElement('div');
    upgradeMessage.className = 'thinkreview-upgrade-message';
    upgradeMessage.innerHTML = `
      <div class="thinkreview-upgrade-message-content">
        <span class="thinkreview-upgrade-icon">⚡</span>
        <span class="thinkreview-upgrade-text">
          ${randomMessage}
        </span>
      </div>
    `;
    banner.appendChild(upgradeMessage);
  }

  container.appendChild(banner);
  container.classList.remove('gl-hidden');
}


