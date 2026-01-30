import { dbgLog, dbgWarn, dbgError } from './utils/logger.js';


/**
 * Listens for messages from the background script
 * This script will be injected into the success page to handle the redirect
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STRIPE_SUCCESS_DETECTED') {
    dbgLog('Received success message from background script:', message);
    
    // Extract session ID from the URL
    const sessionId = message.sessionId;
    if (!sessionId) {
      dbgWarn('No session ID found in message');
      return;
    }
    
    // Update subscription status in local storage
    chrome.storage.local.set({
      'subscription': {
        status: 'active',
        sessionId: sessionId,
        timestamp: Date.now()
      }
    }, () => {
      dbgLog('Updated subscription status in local storage');
      
      // Notify any open extension pages about the successful subscription
      chrome.runtime.sendMessage({
        type: 'SUBSCRIPTION_UPDATED',
        status: 'active',
        sessionId: sessionId
      });
      
      // Send response back to background script
      sendResponse({ success: true });
    });
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  }
});

dbgLog('Stripe success handler loaded');
