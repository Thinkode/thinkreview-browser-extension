/**
 * Start REVIEW_PATCH_CODE and, if Chrome drops the long message (~5–6 min),
 * poll POLL_REVIEW_PATCH_CODE until the cached review is ready.
 */

// Chrome MV3 often kills the SW / message port around 5–6 min. Wait this long
// on REVIEW_PATCH_CODE before starting cache polls.
const CHROME_SAFE_WAIT_MS = 4 * 60 * 1000;
// Cheap loop while still inside the safe window (no cloud poll yet).
const PRE_POLL_CHECK_MS = 2 * 1000;
// Panel poll of getReviewPatchCode_1_1 after the safe window.
const POLL_INTERVAL_MS = 5 * 1000;
// Matches reviewPatchCode_1_1_v2 timeout; give up if cache never appears.
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

/**
 * @param {object} payload - same fields as REVIEW_PATCH_CODE
 * @returns {Promise<object>} background response { success, data?, error?, ... }
 */
export async function requestPatchReviewFromBackground(payload) {
  // Same timestamp the backend uses to ignore older cached reviews.
  const startedAt = Date.now();
  let settled = null;

  const longReview = sendMessage({ type: 'REVIEW_PATCH_CODE', ...payload, startedAt }).then((resp) => {
    if (resp && settled == null) settled = resp;
    return resp;
  });

  while (settled == null && Date.now() - startedAt < DEADLINE_MS) {
    if (Date.now() - startedAt < CHROME_SAFE_WAIT_MS) {
      await wait(PRE_POLL_CHECK_MS);
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
    if (pollResp?.success === false && !pollResp.pending) {
      settled = pollResp;
      break;
    }
    await wait(POLL_INTERVAL_MS);
  }

  if (settled) return settled;
  const late = await longReview;
  if (late) return late;
  return { success: false, error: 'Review timed out. Please try again.' };
}
