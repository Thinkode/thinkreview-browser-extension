/**
 * Start REVIEW_PATCH_CODE and, if Chrome / GFE drops the long message (~5–6 min),
 * poll POLL_REVIEW_PATCH_CODE (getReviewPatchCode_1_1) after the safe window.
 * Do not abort the long fetch: Cloud Run can cancel reviewPatchCode_1_2 on disconnect.
 * Treat 504 / timeout as "still running" and keep polling until the cache is ready.
 * Cache polling is ThinkReview Cloud only (never Ollama / OpenRouter / self-hosted).
 */

// Chrome MV3 often kills the SW / message port around 5–6 min. Wait this long
// on REVIEW_PATCH_CODE before starting cache polls.
const CHROME_SAFE_WAIT_MS = 4 * 60 * 1000;
// Cheap loop while still inside the safe window (no cloud poll yet).
const PRE_POLL_CHECK_MS = 2 * 1000;
// Panel poll of getReviewPatchCode_1_1 after the safe window.
const POLL_INTERVAL_MS = 15 * 1000;
// Matches reviewPatchCode_1_1_v2 timeout; give up if cache never appears.
const DEADLINE_MS = 15 * 60 * 1000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isThinkReviewCloudProvider() {
  const stored = await chrome.storage.local.get(['aiProvider']);
  return (stored.aiProvider || 'cloud') === 'cloud';
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
  if (resp.isAuthExpired || resp.isLimitExceeded || resp.isPatchTooLarge) return true;
  // Real provider errors (Ollama down, 4xx, etc.). Null means the port dropped;
  // Cloud Run 504s set isTransientTimeout and must keep polling.
  if (resp.success === false && resp.error && resp.isTransientTimeout !== true) return true;
  return false;
}

/**
 * @param {object} payload - same fields as REVIEW_PATCH_CODE
 * @returns {Promise<object>} background response { success, data?, error?, ... }
 */
export async function requestPatchReviewFromBackground(payload) {
  // Same timestamp the backend uses to ignore older cached reviews.
  const startedAt = Date.now();
  let settled = null;

  const longReview = sendMessage({ type: 'REVIEW_PATCH_CODE', ...payload, startedAt }).then((resp) => {
    if (settled == null && isTerminalReviewResponse(resp)) settled = resp;
    return resp;
  });

  // Ollama / OpenRouter / self-hosted have no cloud cache to poll — return as soon
  // as REVIEW_PATCH_CODE finishes so a refused localhost connection is not hidden
  // behind the 15-minute cloud wait loop.
  if (!(await isThinkReviewCloudProvider())) {
    const resp = await longReview;
    if (isTerminalReviewResponse(resp)) return resp;
    if (resp?.success === false) return resp;
    return { success: false, error: resp?.error || 'Review failed. Please try again.' };
  }

  while (settled == null && Date.now() - startedAt < DEADLINE_MS) {
    if (Date.now() - startedAt < CHROME_SAFE_WAIT_MS) {
      await Promise.race([wait(PRE_POLL_CHECK_MS), longReview]);
      continue;
    }
    const pollResp = await sendMessage({
      type: 'POLL_REVIEW_PATCH_CODE',
      patchContent: payload.patchContent,
      mrId: payload.mrId,
      reviewFormat: payload.reviewFormat,
      startedAt,
    });
    if (pollResp?.success && pollResp.data?.status === 'success') {
      settled = pollResp;
      break;
    }
    if (isTerminalReviewResponse(pollResp)) {
      settled = pollResp;
      break;
    }
    await wait(POLL_INTERVAL_MS);
  }

  if (settled) return settled;
  const late = await longReview;
  if (isTerminalReviewResponse(late)) return late;
  return { success: false, error: 'Review timed out. Please try again.' };
}
