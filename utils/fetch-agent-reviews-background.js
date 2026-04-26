/**
 * Fire-and-await ThinkReviewGetAgentReviewsForPatch via the service worker, right after
 * reviewPatchCode_1_1 returns (use the same patch string and mrId).
 * @param {string} patchContent
 * @param {string|null|undefined} mrId
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export function startAgentReviewsFetchForPatch(patchContent, mrId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'FETCH_AGENT_REVIEWS_FOR_PATCH',
        patchContent,
        mrId: mrId != null && mrId !== '' ? mrId : null
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
