/**
 * Start REVIEW_URL_CODE (reviewUrlCode_1_1). If Chrome / GFE drops the long
 * message (~5–6 min), retry so in-flight / cache can complete the review.
 * Do not abort the long fetch: Cloud Run can cancel on disconnect.
 */

const CHROME_SAFE_WAIT_MS = 4 * 60 * 1000;
const PRE_POLL_CHECK_MS = 2 * 1000;
const POLL_INTERVAL_MS = 15 * 1000;
const DEADLINE_MS = 15 * 60 * 1000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (resp) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(resp);
    });
  });
}

function isTerminalReviewResponse(resp) {
  if (!resp || resp.pending) return false;
  if (resp.success === true && (resp.data?.status === 'success' || resp.data?.review)) return true;
  if (resp.success === false) return true;
  if (resp.isAuthExpired || resp.isLimitExceeded || resp.isPatchTooLarge || resp.isGitToolsUnavailable) {
    return true;
  }
  return false;
}

/**
 * @param {object} payload - mrUrl, mrId, language, forceRegenerate, reviewFormat, runAgents, reviewSource
 * @returns {Promise<object>} background response { success, data?, error?, ... }
 */
export async function requestUrlReviewFromBackground(payload) {
  const startedAt = Date.now();
  let settled = null;

  const longReview = sendMessage({ type: 'REVIEW_URL_CODE', ...payload }).then((resp) => {
    if (settled == null && isTerminalReviewResponse(resp)) settled = resp;
    return resp;
  });

  while (settled == null && Date.now() - startedAt < DEADLINE_MS) {
    if (Date.now() - startedAt < CHROME_SAFE_WAIT_MS) {
      await wait(PRE_POLL_CHECK_MS);
      continue;
    }
    const retryResp = await sendMessage({
      type: 'REVIEW_URL_CODE',
      ...payload,
      forceRegenerate: false,
    });
    if (isTerminalReviewResponse(retryResp)) {
      settled = retryResp;
      break;
    }
    await wait(POLL_INTERVAL_MS);
  }

  if (settled) return settled;
  const late = await longReview;
  if (isTerminalReviewResponse(late)) return late;
  return { success: false, error: 'Review timed out. Please try again.' };
}
