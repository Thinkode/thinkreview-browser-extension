/**
 * Test script for rate limit error handling
 * 
 * This script demonstrates how the rate limit error handling works
 * in the GitLab MR Reviews extension.
 */

// Mock the CloudService for testing
class MockCloudService {
  static async getConversationalResponse(patchContent, conversationHistory) {
    // Simulate a 429 rate limit response
    const mockResponse = {
      ok: false,
      status: 429,
      text: async () => JSON.stringify({
        status: 'error',
        message: 'Too many conversational review requests from this IP, please try again later.',
        retryAfter: 900
      })
    };
    
    // Simulate the fetch response
    const response = await Promise.resolve(mockResponse);
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Create the original error for logging
      const originalError = new Error(`HTTP error ${response.status}: ${errorText}`);
      
      // Handle rate limiting specifically - add rate limit info to the error
      if (response.status === 429) {
        try {
          const errorData = JSON.parse(errorText);
          originalError.isRateLimit = true;
          originalError.rateLimitMessage = errorData.message || 'Too many requests from this IP, please try again later.';
          originalError.retryAfter = errorData.retryAfter || 900;
        } catch (parseError) {
          originalError.isRateLimit = true;
          originalError.rateLimitMessage = 'Too many requests from this IP, please try again later.';
          originalError.retryAfter = 900;
        }
      }
      
      throw originalError;
    }
  }
}

// Mock the error handling function from integrated-review.js
function handleRateLimitError(error) {
  let errorMessage = 'Sorry, something went wrong. Please try again.';
  if (error.isRateLimit) {
    const message = error.rateLimitMessage || 'Too many requests from this IP, please try again later.';
    const retryAfter = error.retryAfter || 900;
    const minutes = Math.ceil(retryAfter / 60);
    errorMessage = `🚫 ${message} Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before trying again.`;
  }
  return errorMessage;
}

// Test function
async function testRateLimitErrorHandling() {
  console.log('Testing rate limit error handling...\n');
  
  try {
    // This should trigger a rate limit error
    await MockCloudService.getConversationalResponse('test patch', []);
  } catch (error) {
    console.log('Caught error:', error.message);
    
    // Test the error handling
    const userFriendlyMessage = handleRateLimitError(error);
    console.log('User-friendly message:', userFriendlyMessage);
    
    // Verify the message format
    if (userFriendlyMessage.includes('🚫') && userFriendlyMessage.includes('minute')) {
      console.log('✅ Rate limit error handling works correctly!');
      console.log('✅ Message includes rate limit emoji and time information');
    } else {
      console.log('❌ Rate limit error handling failed');
    }
  }
}

// Test different retry times
function testDifferentRetryTimes() {
  console.log('\nTesting different retry times...\n');
  
  const testCases = [
    { retryAfter: 60, expected: '1 minute' },
    { retryAfter: 120, expected: '2 minutes' },
    { retryAfter: 900, expected: '15 minutes' },
    { retryAfter: 1800, expected: '30 minutes' }
  ];
  
  testCases.forEach(({ retryAfter, expected }) => {
    const error = new Error(`HTTP error 429: {"status":"error","message":"Too many requests from this IP, please try again later.","retryAfter":${retryAfter}}`);
    error.isRateLimit = true;
    error.rateLimitMessage = 'Too many requests from this IP, please try again later.';
    error.retryAfter = retryAfter;
    
    const message = handleRateLimitError(error);
    const minutes = Math.ceil(retryAfter / 60);
    const expectedMessage = `🚫 Too many requests from this IP, please try again later. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before trying again.`;
    
    console.log(`Retry after ${retryAfter}s: ${message}`);
    console.log(`Expected: ${expectedMessage}`);
    console.log(`Match: ${message === expectedMessage ? '✅' : '❌'}\n`);
  });
}

// Test non-rate-limit errors
function testNonRateLimitErrors() {
  console.log('Testing non-rate-limit errors...\n');
  
  const testErrors = [
    new Error('Network error'),
    new Error('HTTP error 500: Internal server error'),
    new Error('Some other error')
  ];
  
  testErrors.forEach((error, index) => {
    const message = handleRateLimitError(error);
    console.log(`Error ${index + 1}: ${error.message}`);
    console.log(`Handled message: ${message}`);
    console.log(`Is default message: ${message === 'Sorry, something went wrong. Please try again.' ? '✅' : '❌'}\n`);
  });
}

// Run all tests
async function runAllTests() {
  console.log('Rate Limit Error Handling Test Suite');
  console.log('====================================\n');
  
  await testRateLimitErrorHandling();
  testDifferentRetryTimes();
  testNonRateLimitErrors();
  
  console.log('Test suite completed!');
}

// Run tests if this script is executed directly
if (typeof window === 'undefined') {
  // Node.js environment
  runAllTests().catch(console.error);
} else {
  // Browser environment
  console.log('Run runAllTests() to execute the test suite');
  window.runAllTests = runAllTests;
}
