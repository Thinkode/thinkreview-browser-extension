// Debug toggle: set to false to disable console logs in production
const DEBUG = true;
function dbgLog(...args) { if (DEBUG) console.log('[stripe-redirect]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[stripe-redirect]', ...args); }

document.addEventListener('DOMContentLoaded', function() {
  // Get the session ID from the URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  
  if (!sessionId) {
    document.getElementById('message').textContent = 'Error: No session ID provided';
    return;
  }
  
  dbgLog('Processing checkout with session ID:', sessionId);
  document.getElementById('message').textContent = 'Redirecting to Stripe checkout...';
  
  // Try multiple URL formats for Stripe checkout
  // Format 1: Standard checkout URL
  const url1 = `https://checkout.stripe.com/pay/${sessionId}`;
  // Format 2: With 'c' path segment
  const url2 = `https://checkout.stripe.com/c/pay/${sessionId}`;
  // Format 3: Direct session URL
  const url3 = `https://checkout.stripe.com/session/${sessionId}`;
  
  // Try to load the Stripe checkout page directly
  dbgLog('Trying checkout URL:', url1);
  
  // Create a hidden iframe to test if the URL works
  const testFrame = document.createElement('iframe');
  testFrame.style.display = 'none';
  testFrame.src = url1;
  
  // Set a timeout to try the next URL if the first one doesn't work
  setTimeout(() => {
    dbgLog('Redirecting to URL format 1:', url1);
    window.location.href = url1;
  }, 500);
  
  // If there's an error loading the first URL, try the second one
  testFrame.onerror = () => {
    dbgWarn('First URL format failed, trying format 2:', url2);
    window.location.href = url2;
  };
  
  document.body.appendChild(testFrame);
});
