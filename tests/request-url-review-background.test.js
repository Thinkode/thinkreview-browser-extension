import { isTerminalReviewResponse } from '../utils/request-url-review-background.js';

describe('isTerminalReviewResponse', () => {
  it('does not treat a transient timeout as finished', () => {
    expect(isTerminalReviewResponse({
      success: false,
      isTransientTimeout: true,
      error: 'Gateway timeout',
    })).toBe(false);
  });

  it('treats a real failure as finished', () => {
    expect(isTerminalReviewResponse({
      success: false,
      error: 'Git credentials unavailable',
    })).toBe(true);
  });

  it('treats a successful response with no review payload as finished', () => {
    expect(isTerminalReviewResponse({ success: true, data: null })).toBe(true);
  });
});
