// onboarding.js
// Handles onboarding page functionality for ThinkReview extension

// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[onboarding]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[onboarding]', ...args); }

dbgLog('Onboarding page loaded');

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
  dbgLog('Onboarding page DOM loaded');
  markOnboardingComplete();
  
  // Add click event listeners
  const configureDomainButton = document.getElementById('configure-domain-button');
  const getStartedHeaderButton = document.getElementById('get-started-header-button');
  const getStartedBottomButton = document.getElementById('get-started-bottom-button');
  const gitlabButton = document.getElementById('gitlab-button');
  const azureButton = document.getElementById('azure-button');
  const closeButton = document.getElementById('close-button');
  
  if (configureDomainButton) {
    configureDomainButton.addEventListener('click', function(e) {
      dbgLog('Configure Domain button clicked');
      e.preventDefault();
      openExtensionPopup();
    });
  }
  
  if (getStartedHeaderButton) {
    getStartedHeaderButton.addEventListener('click', function(e) {
      dbgLog('Get Started header button clicked');
      e.preventDefault();
      openExtensionPopup();
    });
  }
  
  if (getStartedBottomButton) {
    getStartedBottomButton.addEventListener('click', function(e) {
      dbgLog('Get Started bottom button clicked');
      e.preventDefault();
      openExtensionPopup();
    });
  }
  
  if (gitlabButton) {
    gitlabButton.addEventListener('click', function(e) {
      dbgLog('GitLab button clicked');
      e.preventDefault();
      openGitLab();
    });
  }
  
  if (azureButton) {
    azureButton.addEventListener('click', function(e) {
      dbgLog('Azure DevOps button clicked');
      e.preventDefault();
      openAzureDevOps();
    });
  }
  
  if (closeButton) {
    closeButton.addEventListener('click', function(e) {
      dbgLog('Close button clicked');
      e.preventDefault();
      closeOnboarding();
    });
  }
});



/**
 * Open the extension popup
 */
function openExtensionPopup() {
  dbgLog('Opening extension popup...');
  
  try {
    // Chrome extensions can't programmatically open popups from web pages
    // The best approach is to open the popup.html in a new tab
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
      dbgLog('Extension popup opened in new tab');
      // Close the onboarding page after opening popup
      setTimeout(() => {
        closeOnboarding();
      }, 500);
    } else {
      // Fallback: show message and close onboarding
      dbgLog('Cannot open popup directly, showing message');
      alert('Please click the ThinkReview extension icon in your browser toolbar to access the configuration options.');
      closeOnboarding();
    }
  } catch (error) {
    dbgLog('Error opening extension popup:', error);
    // Fallback: show message and close onboarding
    alert('Please click the ThinkReview extension icon in your browser toolbar to access the configuration options.');
    closeOnboarding();
  }
}

/**
 * Open GitLab.com in a new tab
 */
function openGitLab() {
  dbgLog('Opening GitLab.com...');
  
  try {
    // Try to use Chrome extension API first
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'https://gitlab.com' });
      dbgLog('GitLab opened via Chrome API');
    } else {
      // Fallback to regular window.open
      window.open('https://gitlab.com', '_blank');
      dbgLog('GitLab opened via window.open');
    }
  } catch (error) {
    // console.error('Error opening GitLab:', error);
    // Fallback to regular window.open
    window.open('https://gitlab.com', '_blank');
  }
}

/**
 * Open Azure DevOps in a new tab
 */
function openAzureDevOps() {
  dbgLog('Opening Azure DevOps...');
  
  try {
    // Try to use Chrome extension API first
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'https://dev.azure.com' });
      dbgLog('Azure DevOps opened via Chrome API');
    } else {
      // Fallback to regular window.open
      window.open('https://dev.azure.com', '_blank');
      dbgLog('Azure DevOps opened via window.open');
    }
  } catch (error) {
    // console.error('Error opening Azure DevOps:', error);
    // Fallback to regular window.open
    window.open('https://dev.azure.com', '_blank');
  }
}

/**
 * Close the onboarding page
 */
function closeOnboarding() {
  dbgLog('Closing onboarding page...');
  
  try {
    // Try to close the window directly without confirmation
    // The confirm dialog was causing issues when the tab is not active
    window.close();
    dbgLog('Onboarding closed via window.close()');
  } catch (error) {
    dbgLog('Could not close window automatically:', error);
    // If window.close() fails, the tab will remain open
    // This is acceptable behavior for security reasons
  }
}

/**
 * Mark onboarding as complete
 */
function markOnboardingComplete() {
  chrome.storage.local.set({ onboardingComplete: true }, function() {
    dbgLog('Onboarding marked as complete');
  });
}

// Export functions for global access
window.openExtensionPopup = openExtensionPopup;
window.openGitLab = openGitLab;
window.openAzureDevOps = openAzureDevOps;
window.closeOnboarding = closeOnboarding;
