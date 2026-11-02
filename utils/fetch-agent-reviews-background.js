/**
 * Fire-and-await ThinkReviewGetAgentReviewsForPatch via the service worker, right after
 * reviewPatchCode_1_1 or reviewUrlCode_1_1 returns.
 * @param {string} patchContent
 * @param {string|null|undefined} mrId
 * @param {string|null|undefined} [mrUrl] - PR URL for URL-based reviews (no local patch)
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export function startAgentReviewsFetchForPatch(patchContent, mrId, mrUrl = null) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'FETCH_AGENT_REVIEWS_FOR_PATCH',
        patchContent,
        mrId: mrId != null && mrId !== '' ? mrId : null,
        mrUrl: mrUrl || null
      },
      (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp && typeof resp === 'object' ? resp : { success: false, error: 'No response' });
        }
      }
    );
  });
}
