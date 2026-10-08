/**
 * Feedback-prompt interaction helpers.
 *
 * Server user-data refreshes can overwrite `lastFeedbackPromptInteraction`
 * with a stale/null value (common right after dismiss, before Firestore
 * catches up). A dedicated local key is not part of that refresh payload.
 */

export const FEEDBACK_PROMPT_LOCAL_INTERACTION_KEY = 'thinkreviewFeedbackPromptLocalInteraction';

export const FEEDBACK_PROMPT_TOUR_STARTED_EVENT = 'thinkreview:panel-settings-tour-started';
export const FEEDBACK_PROMPT_TOUR_ENDED_EVENT = 'thinkreview:panel-settings-tour-ended';

const DEFAULT_THRESHOLD = 5;
const DEFAULT_SUBMIT_SUPPRESS_MONTHS = 3;
const DEFAULT_LATER_COOLDOWN_DAYS = 7;

/**
 * @param {Object|null|undefined} interaction
 * @returns {number}
 */
export function interactionTimestamp(interaction) {
  if (!interaction || !interaction.date) return Number.NaN;
  const ts = new Date(interaction.date).getTime();
  return Number.isNaN(ts) ? Number.NaN : ts;
}

/**
 * Prefer the newer of two interaction records. A missing/invalid remote
 * must not clobber a valid local dismiss/submit.
 *
 * @param {Object|null|undefined} local
 * @param {Object|null|undefined} remote
 * @returns {Object|null}
 */
export function mergeFeedbackPromptInteraction(local, remote) {
  const localValid = !!(local && local.action);
  const remoteValid = !!(remote && remote.action);

  if (!localValid) return remoteValid ? remote : null;
  if (!remoteValid) return local;

  const localTs = interactionTimestamp(local);
  const remoteTs = interactionTimestamp(remote);

  if (Number.isNaN(localTs)) return remote;
  if (Number.isNaN(remoteTs)) return local;
  return localTs >= remoteTs ? local : remote;
}

/**
 * Combine the refresh-clobber-proof local record with the server-synced one.
 *
 * @param {Object} storageResult
 * @param {Object|null|undefined} [remote]
 * @returns {Object|null}
 */
export function resolveFeedbackPromptInteraction(storageResult = {}, remote = undefined) {
  const localDedicated = storageResult[FEEDBACK_PROMPT_LOCAL_INTERACTION_KEY];
  const localSynced = storageResult.lastFeedbackPromptInteraction;
  const local = mergeFeedbackPromptInteraction(localDedicated, localSynced);
  if (remote === undefined) return local;
  return mergeFeedbackPromptInteraction(local, remote);
}

function isWithinDays(dateValue, days) {
  const ts = new Date(dateValue).getTime();
  if (Number.isNaN(ts)) return false;
  const elapsedDays = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  return elapsedDays <= days;
}

function isWithinMonths(dateValue, months) {
  const interactionDate = new Date(dateValue);
  if (Number.isNaN(interactionDate.getTime())) return false;
  const suppressUntil = new Date(interactionDate);
  suppressUntil.setMonth(suppressUntil.getMonth() + months);
  return Date.now() < suppressUntil.getTime();
}

/**
 * Whether the store-feedback prompt should appear for this review count
 * and last interaction.
 *
 * @param {number} reviewCount
 * @param {Object|null|undefined} interaction
 * @param {{ threshold?: number, submitSuppressMonths?: number, laterCooldownDays?: number }} [options]
 * @returns {boolean}
 */
export function shouldShowFeedbackPrompt(reviewCount, interaction = null, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const submitSuppressMonths = options.submitSuppressMonths ?? DEFAULT_SUBMIT_SUPPRESS_MONTHS;
  const laterCooldownDays = options.laterCooldownDays ?? DEFAULT_LATER_COOLDOWN_DAYS;

  if (interaction && interaction.action) {
    if (interaction.action === 'never') {
      return false;
    }

    if (interaction.action === 'submit' || interaction.action === 'feedback') {
      if (!interaction.date) {
        // Date missing: do not suppress forever
      } else if (isWithinMonths(interaction.date, submitSuppressMonths)) {
        return false;
      }
    }

    if (interaction.action === 'later' && interaction.date) {
      if (isWithinDays(interaction.date, laterCooldownDays)) {
        return false;
      }
    }
  }

  return reviewCount >= threshold;
}

/**
 * Tour overlay is on screen (or about to be). Feedback UI must not stack on it.
 *
 * @returns {boolean}
 */
export function isFeedbackPromptBlockedByTour() {
  if (typeof document === 'undefined' || !document.documentElement) return false;
  return (
    document.documentElement.hasAttribute('data-thinkreview-tour-active') ||
    document.documentElement.hasAttribute('data-thinkreview-tour-pending')
  );
}
