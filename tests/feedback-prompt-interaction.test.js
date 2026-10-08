/**
 * Feedback prompt eligibility, merge, and tour-blocking helpers.
 */

import {
  FEEDBACK_PROMPT_LOCAL_INTERACTION_KEY,
  isFeedbackPromptBlockedByTour,
  mergeFeedbackPromptInteraction,
  resolveFeedbackPromptInteraction,
  shouldShowFeedbackPrompt
} from '../utils/feedback-prompt-interaction.js';

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function monthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

describe('mergeFeedbackPromptInteraction', () => {
  it('keeps a local later dismiss when the server still has null', () => {
    const local = { action: 'later', date: daysAgo(0) };
    expect(mergeFeedbackPromptInteraction(local, null)).toEqual(local);
  });

  it('prefers the newer of two valid records', () => {
    const older = { action: 'later', date: daysAgo(3) };
    const newer = { action: 'later', date: daysAgo(0) };
    expect(mergeFeedbackPromptInteraction(older, newer)).toEqual(newer);
    expect(mergeFeedbackPromptInteraction(newer, older)).toEqual(newer);
  });

  it('does not let an invalid local date clobber a valid remote', () => {
    const remote = { action: 'later', date: daysAgo(1) };
    expect(mergeFeedbackPromptInteraction({ action: 'later', date: 'nope' }, remote)).toEqual(remote);
  });
});

describe('resolveFeedbackPromptInteraction', () => {
  it('survives a refresh that clobbers lastFeedbackPromptInteraction to null', () => {
    const localDismiss = { action: 'later', date: daysAgo(0) };
    const storageResult = {
      lastFeedbackPromptInteraction: null,
      [FEEDBACK_PROMPT_LOCAL_INTERACTION_KEY]: localDismiss
    };

    expect(resolveFeedbackPromptInteraction(storageResult, null)).toEqual(localDismiss);
  });

  it('prefers a just-written local dismiss over a stale remote null after refresh', () => {
    const localDismiss = { action: 'later', date: new Date().toISOString() };
    const storageResult = {
      lastFeedbackPromptInteraction: localDismiss,
      [FEEDBACK_PROMPT_LOCAL_INTERACTION_KEY]: localDismiss
    };

    expect(resolveFeedbackPromptInteraction(storageResult, null)).toEqual(localDismiss);
  });
});

describe('shouldShowFeedbackPrompt', () => {
  it('shows for returning users over the review threshold with no prior interaction', () => {
    expect(shouldShowFeedbackPrompt(30, null)).toBe(true);
  });

  it('does not show again within 7 days of Maybe Later / close', () => {
    expect(shouldShowFeedbackPrompt(30, { action: 'later', date: daysAgo(0) })).toBe(false);
    expect(shouldShowFeedbackPrompt(30, { action: 'later', date: daysAgo(7) })).toBe(false);
    expect(shouldShowFeedbackPrompt(30, { action: 'later', date: daysAgo(8) })).toBe(true);
  });

  it('does not show after never, or after recent submit/feedback', () => {
    expect(shouldShowFeedbackPrompt(30, { action: 'never', date: daysAgo(40) })).toBe(false);
    expect(shouldShowFeedbackPrompt(30, { action: 'submit', date: daysAgo(1) })).toBe(false);
    expect(shouldShowFeedbackPrompt(30, { action: 'feedback', date: daysAgo(1) })).toBe(false);
    expect(shouldShowFeedbackPrompt(30, { action: 'submit', date: monthsAgo(4) })).toBe(true);
  });
});

describe('isFeedbackPromptBlockedByTour', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-thinkreview-tour-active');
    document.documentElement.removeAttribute('data-thinkreview-tour-pending');
  });

  it('blocks while the product tour is pending or active', () => {
    expect(isFeedbackPromptBlockedByTour()).toBe(false);
    document.documentElement.setAttribute('data-thinkreview-tour-pending', '1');
    expect(isFeedbackPromptBlockedByTour()).toBe(true);
    document.documentElement.removeAttribute('data-thinkreview-tour-pending');
    document.documentElement.setAttribute('data-thinkreview-tour-active', '1');
    expect(isFeedbackPromptBlockedByTour()).toBe(true);
  });
});
