/**
 * Start REVIEW_PATCH_CODE and, if Chrome drops the long message (~5–6 min),
 * poll POLL_REVIEW_PATCH_CODE until the cached review is ready.
 */

const CHROME_SAFE_WAIT_MS = 4 * 60 * 1000;
const POLL_INTERVAL_MS = 5 * 1000;
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
  const startedAt = Date.now();
  let settled = null;

  const longReview = sendMessage({ type: 'REVIEW_PATCH_CODE', ...payload }).then((resp) => {
    if (resp && settled == null) settled = resp;
    return resp;
  });

  while (settled == null && Date.now() - startedAt < DEADLINE_MS) {
    if (Date.now() - startedAt < CHROME_SAFE_WAIT_MS) {
      await wait(2000);
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
