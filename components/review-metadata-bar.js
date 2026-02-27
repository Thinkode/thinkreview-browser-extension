// review-metadata-bar.js
// Renders the patch size / metadata banner inside the integrated review panel

// Track user actions (dynamically imported to avoid module issues)
let trackUserAction = null;
(async () => {
  try {
    const analyticsModule = await import('../utils/analytics-service.js');
    trackUserAction = analyticsModule.trackUserAction;
  } catch (error) {
    // Silently fail - analytics shouldn't break the extension
  }
})();

/**
 * Render the review metadata bar (patch size banner)
 * @param {HTMLElement} container - The container element for the banner
 * @param {Object|null} patchSize - Patch size information from backend
 * @param {string|null} subscriptionType - User's subscription type ('Professional', 'Teams', or 'Free')
 * @param {string|null} modelUsed - Model used for the review
 * @param {boolean} isCached - Whether the review was retrieved from cache
 */
export function renderReviewMetadataBar(container, patchSize, subscriptionType = null, modelUsed = null, isCached = false) {
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

  // Helper to validate and sanitize file names
  const MAX_FILE_NAME_LENGTH = 200;
  const sanitizeFileName = (name) => {
    // Ensure it's a string and not empty
    if (typeof name !== 'string' || !name.trim()) {
      return null;
    }
    
    // Trim whitespace
    const trimmed = name.trim();
    
    // Limit length to prevent UI layout issues
    if (trimmed.length > MAX_FILE_NAME_LENGTH) {
      return {
        original: trimmed,
        sanitized: trimmed.substring(0, MAX_FILE_NAME_LENGTH),
        wasTruncated: true
      };
    }
    
    return {
      original: trimmed,
      sanitized: trimmed,
      wasTruncated: false
    };
  };

  const originalSize = formatSize(patchSize.original);
  const truncatedSize = patchSize.truncated ? formatSize(patchSize.truncated) : null;
  const filesExcluded = patchSize.filesExcluded || 0;
  const excludedFileNames = Array.isArray(patchSize.excludedFileNames)
    ? patchSize.excludedFileNames.map(sanitizeFileName).filter(Boolean)
    : [];
  const wasForcedTruncated = patchSize.wasForcedTruncated || false;
  // Check if subscriptionType is 'free' (case-insensitive comparison, handle null/undefined)
  const isFreeSubscription = subscriptionType && subscriptionType.toLowerCase() === 'free';
  const showUpgradeMessage = wasForcedTruncated && isFreeSubscription;

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
  
  // Build banner text with HTML elements to support the cached info icon
  const textParts = [];
  textParts.push(`Original patch: ${originalSize}`);
  
  if (filesExcluded > 0) {
    textParts.push(`Files excluded: ${filesExcluded}`);
  }
  if (patchSize.wasTruncated && truncatedSize) {
    textParts.push(`Truncated patch: ${truncatedSize}`);
  }
  if (modelUsed) {
    textParts.push(`Model: ${modelUsed}`);
  }
  
  // Build content with separators and special handling for cached status
  const fragment = document.createDocumentFragment();
  textParts.forEach((part, index) => {
    if (index > 0) {
      const separator = document.createTextNode(' • ');
      fragment.appendChild(separator);
    }
    const textNode = document.createTextNode(part);
    fragment.appendChild(textNode);
  });
  
  // Add cached status with badge if applicable
  if (isCached) {
    if (textParts.length > 0) {
      const separator = document.createTextNode(' • ');
      fragment.appendChild(separator);
    }
    
    // Add cached badge with hyperlink
    const cachedBadge = document.createElement('a');
    cachedBadge.href = 'https://thinkreview.dev/docs/cached-reviews';
    cachedBadge.target = '_blank';
    cachedBadge.rel = 'noopener noreferrer';
    cachedBadge.className = 'thinkreview-cached-badge';
    cachedBadge.textContent = 'Cached';
    cachedBadge.setAttribute('aria-label', 'Learn more about cached reviews');
    fragment.appendChild(cachedBadge);
  }
  
  content.appendChild(fragment);

  topRow.appendChild(icon);
  topRow.appendChild(content);
  
  // Add customize button to link to model selection page
  const customizeButton = document.createElement('a');
  customizeButton.href = 'https://portal.thinkreview.dev/model-selection';
  customizeButton.target = '_blank';
  customizeButton.rel = 'noopener noreferrer';
  customizeButton.className = 'thinkreview-patch-size-customize-button';
  // Randomly display either "Customize" or "Try a different model"
  const buttonTexts = ['Customize review models'];
  customizeButton.textContent = buttonTexts[Math.floor(Math.random() * buttonTexts.length)];
  customizeButton.setAttribute('aria-label', 'Customize model selection');
  
  // Prevent click event from bubbling to topRow (which might be clickable for expanding)
  customizeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Track customize button click
    if (trackUserAction) {
      trackUserAction('customize_review_models', {
        context: 'metadata_bar',
        location: 'integrated_panel'
      }).catch(() => {}); // Silently fail
    }
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

    excludedFileNames.forEach((fileInfo) => {
      const li = document.createElement('li');
      const displayName = fileInfo.wasTruncated 
        ? fileInfo.sanitized + '...'
        : fileInfo.sanitized;
      
      li.textContent = displayName;
      
      // Add title attribute with full name if it was truncated
      if (fileInfo.wasTruncated) {
        li.setAttribute('title', fileInfo.original);
      }
      
      list.appendChild(li);
    });

    details.appendChild(listTitle);
    details.appendChild(list);

    // Add "About excluded files" button linking to excluded files documentation
    const learnMoreButton = document.createElement('a');
    learnMoreButton.href = 'https://thinkreview.dev/docs/excluded-files';
    learnMoreButton.target = '_blank';
    learnMoreButton.rel = 'noopener noreferrer';
    learnMoreButton.className = 'thinkreview-excluded-files-learn-more';
    learnMoreButton.textContent = 'About excluded files';
    learnMoreButton.setAttribute('aria-label', 'Learn more about excluded files');
    
    // Prevent click event from bubbling
    learnMoreButton.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    details.appendChild(learnMoreButton);

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
    // Calculate percentages
    const percentageReviewed = patchSize.original > 0 
      ? Math.round((patchSize.truncated / patchSize.original) * 100) 
      : 100;
    
    // Format sizes for display
    const truncatedSizeFormatted = formatSize(patchSize.truncated);
    const originalSizeFormatted = formatSize(patchSize.original);
    
    // Randomly select one of the upgrade messages with percentage and sizes
    const upgradeMessages = [
      `Only ${percentageReviewed}% of this PR was reviewed (${truncatedSizeFormatted}/${originalSizeFormatted}) due to free tier limits. <a href="https://portal.thinkreview.dev/subscription" target="_blank" class="thinkreview-upgrade-link">Upgrade to one of our premium plans</a> to get a full review of this PR.`,
      `Only ${percentageReviewed}% of your patch was reviewed (${truncatedSizeFormatted}/${originalSizeFormatted}) due to free tier limits. <a href="https://portal.thinkreview.dev/subscription" target="_blank" class="thinkreview-upgrade-link">Upgrade to one of our premium plans</a> to review your entire patch.`,
      `This review covers ${percentageReviewed}% of your code changes (${truncatedSizeFormatted}/${originalSizeFormatted}) due to free tier limits. <a href="https://portal.thinkreview.dev/subscription" target="_blank" class="thinkreview-upgrade-link">Upgrade to one of our premium plans</a> to get a complete review of this PR.`
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
    
    // Add tracking to upgrade links in the message
    const upgradeLinks = upgradeMessage.querySelectorAll('.thinkreview-upgrade-link');
    upgradeLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        // Track upgrade link click
        if (trackUserAction) {
          trackUserAction('upgrade_link_clicked', {
            context: 'upgrade_message',
            location: 'metadata_bar',
            source: 'truncation_limit'
          }).catch(() => {}); // Silently fail
        }
      });
    });
  }

  container.appendChild(banner);
  container.classList.remove('gl-hidden');
}

/**
 * Format character count as human-readable size (treat 1 char ≈ 1 byte for display).
 * @param {number} chars - Character count
 * @returns {string}
 */
function formatCharsAsSize(chars) {
  if (typeof chars !== 'number' || Number.isNaN(chars) || chars < 0) return '';
  if (chars < 1024) return `${chars} B`;
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(1)} KB`;
  return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Render the Ollama-specific metadata bar (patch size, truncation, Switch to Cloud, model dropdown).
 * @param {HTMLElement} container - The container element for the banner
 * @param {Object|null} ollamaMeta - { patchSizeChars, patchSentChars, wasTruncated, model }
 * @param {Object} callbacks - { onSwitchToCloud(), getModels?(): Promise<Array<{name:string}>>, onModelChange?(modelName: string) }
 */
export function renderOllamaMetadataBar(container, ollamaMeta, callbacks = {}) {
  if (!container) return;

  container.innerHTML = '';

  if (!ollamaMeta || typeof ollamaMeta.patchSizeChars !== 'number') {
    container.classList.add('gl-hidden');
    return;
  }

  const { patchSizeChars, patchSentChars, wasTruncated, model } = ollamaMeta;
  const onSwitchToCloud = typeof callbacks.onSwitchToCloud === 'function' ? callbacks.onSwitchToCloud : () => {};
  const getModels = typeof callbacks.getModels === 'function' ? callbacks.getModels : () => Promise.resolve([]);
  const onModelChange = typeof callbacks.onModelChange === 'function' ? callbacks.onModelChange : () => {};

  const banner = document.createElement('div');
  banner.className = 'thinkreview-patch-size-banner thinkreview-ollama-metadata-banner';

  const topRow = document.createElement('div');
  topRow.className = 'thinkreview-patch-size-top-row';

  const content = document.createElement('div');
  content.className = 'thinkreview-patch-size-content';
  const patchSizeStr = formatCharsAsSize(patchSizeChars);
  const truncatedSizeStr = formatCharsAsSize(patchSentChars);
  content.appendChild(document.createTextNode(`Original patch: ${patchSizeStr}`));
  if (wasTruncated && truncatedSizeStr) {
    content.appendChild(document.createTextNode(' • '));
    const tooltipMsg = "The patch was truncated to respect this model's context length. Switch to Cloud AI to get full review.";
    const truncatedWrapper = document.createElement('span');
    truncatedWrapper.className = 'thinkreview-ollama-truncated-tooltip-wrapper';
    const truncatedSpan = document.createElement('span');
    truncatedSpan.className = 'thinkreview-ollama-truncated-label';
    truncatedSpan.textContent = `Truncated patch: ${truncatedSizeStr}`;
    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'thinkreview-ollama-truncated-info-btn';
    infoBtn.textContent = 'i';
    infoBtn.setAttribute('aria-label', 'Why was the patch truncated?');
    const tooltipEl = document.createElement('span');
    tooltipEl.className = 'thinkreview-ollama-truncated-tooltip';
    tooltipEl.setAttribute('aria-hidden', 'true');
    tooltipEl.textContent = tooltipMsg;
    truncatedWrapper.appendChild(truncatedSpan);
    truncatedWrapper.appendChild(infoBtn);
    truncatedWrapper.appendChild(tooltipEl);
    let tooltipTimeout;
    const showTooltip = () => {
      tooltipTimeout = setTimeout(() => tooltipEl.classList.add('thinkreview-tooltip-visible'), 200);
    };
    const hideTooltip = () => {
      clearTimeout(tooltipTimeout);
      tooltipEl.classList.remove('thinkreview-tooltip-visible');
    };
    infoBtn.addEventListener('mouseenter', showTooltip);
    infoBtn.addEventListener('mouseleave', hideTooltip);
    infoBtn.addEventListener('focus', showTooltip);
    infoBtn.addEventListener('blur', hideTooltip);
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tooltipEl.classList.toggle('thinkreview-tooltip-visible');
    });
    content.appendChild(truncatedWrapper);
  }

  topRow.appendChild(content);

  const switchToCloudBtn = document.createElement('button');
  switchToCloudBtn.type = 'button';
  switchToCloudBtn.className = 'thinkreview-ollama-switch-to-cloud-btn';
  switchToCloudBtn.textContent = 'Switch to Cloud AI';
  switchToCloudBtn.setAttribute('aria-label', 'Switch to Cloud AI and regenerate review');
  switchToCloudBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onSwitchToCloud();
  });
  topRow.appendChild(switchToCloudBtn);

  const modelSelectWrap = document.createElement('div');
  modelSelectWrap.className = 'thinkreview-ollama-model-wrap';
  const modelLabel = document.createElement('span');
  modelLabel.className = 'thinkreview-ollama-model-label';
  modelLabel.textContent = 'Model: ';
  const modelSelect = document.createElement('select');
  modelSelect.className = 'thinkreview-ollama-model-select';
  modelSelect.setAttribute('aria-label', 'Change Ollama model');
  modelSelectWrap.appendChild(modelLabel);
  modelSelectWrap.appendChild(modelSelect);
  topRow.appendChild(modelSelectWrap);

  const currentModel = model || '';
  modelSelect.innerHTML = '';
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = currentModel || 'Loading…';
  placeholderOpt.disabled = true;
  modelSelect.appendChild(placeholderOpt);

  getModels()
    .then((models) => {
      modelSelect.innerHTML = '';
      const options = Array.isArray(models) ? models : [];
      if (options.length === 0) {
        const opt = document.createElement('option');
        opt.value = currentModel;
        opt.textContent = currentModel || 'No models';
        modelSelect.appendChild(opt);
        return;
      }
      options.forEach((m) => {
        const name = m.name || m;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === currentModel) opt.selected = true;
        modelSelect.appendChild(opt);
      });
      modelSelect.addEventListener('change', (e) => {
        const selected = e.target.value;
        if (selected) onModelChange(selected);
      });
    })
    .catch(() => {
      const opt = document.createElement('option');
      opt.value = currentModel;
      opt.textContent = currentModel || 'Check Ollama';
      modelSelect.appendChild(opt);
    });

  banner.appendChild(topRow);
  container.appendChild(banner);
  container.classList.remove('gl-hidden');
}


/**
 * Render a metadata bar for OpenAI-compatible API reviews.
 * Shows patch size, truncation info, model name (static), and a "Switch to Cloud AI" button.
 * @param {HTMLElement} container
 * @param {{ patchSizeChars: number, patchSentChars: number, wasTruncated: boolean, model: string }} meta
 * @param {{ onSwitchToCloud?: Function }} callbacks
 */
export function renderOpenAIMetadataBar(container, meta, callbacks = {}) {
  if (!container) return;

  container.innerHTML = '';

  if (!meta || typeof meta.patchSizeChars !== 'number') {
    container.classList.add('gl-hidden');
    return;
  }

  const { patchSizeChars, patchSentChars, wasTruncated, model } = meta;
  const onSwitchToCloud = typeof callbacks.onSwitchToCloud === 'function' ? callbacks.onSwitchToCloud : () => {};

  const banner = document.createElement('div');
  banner.className = 'thinkreview-patch-size-banner thinkreview-ollama-metadata-banner';

  const topRow = document.createElement('div');
  topRow.className = 'thinkreview-patch-size-top-row';

  const content = document.createElement('div');
  content.className = 'thinkreview-patch-size-content';
  const patchSizeStr = formatCharsAsSize(patchSizeChars);
  const truncatedSizeStr = formatCharsAsSize(patchSentChars);
  content.appendChild(document.createTextNode(`Original patch: ${patchSizeStr}`));
  if (wasTruncated && truncatedSizeStr) {
    content.appendChild(document.createTextNode(' \u2022 '));
    const truncatedWrapper = document.createElement('span');
    truncatedWrapper.className = 'thinkreview-ollama-truncated-tooltip-wrapper';
    const truncatedSpan = document.createElement('span');
    truncatedSpan.className = 'thinkreview-ollama-truncated-label';
    truncatedSpan.textContent = `Truncated patch: ${truncatedSizeStr}`;
    truncatedWrapper.appendChild(truncatedSpan);
    content.appendChild(truncatedWrapper);
  }

  topRow.appendChild(content);

  const switchToCloudBtn = document.createElement('button');
  switchToCloudBtn.type = 'button';
  switchToCloudBtn.className = 'thinkreview-ollama-switch-to-cloud-btn';
  switchToCloudBtn.textContent = 'Switch to Cloud AI';
  switchToCloudBtn.setAttribute('aria-label', 'Switch to Cloud AI and regenerate review');
  switchToCloudBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onSwitchToCloud();
  });
  topRow.appendChild(switchToCloudBtn);

  // Model label (static text, no dropdown)
  const modelWrap = document.createElement('div');
  modelWrap.className = 'thinkreview-ollama-model-wrap';
  const modelLabel = document.createElement('span');
  modelLabel.className = 'thinkreview-ollama-model-label';
  modelLabel.textContent = `Model: ${model || 'unknown'}`;
  modelWrap.appendChild(modelLabel);
  topRow.appendChild(modelWrap);

  banner.appendChild(topRow);
  container.appendChild(banner);
  container.classList.remove('gl-hidden');
}