/** Which IDE shortcut is shown on suggestion / best-practice rows in the integrated panel. */

export const IDE_ASSIST_STORAGE_KEY = 'reviewIdeAssistTarget';

/** @typedef {'cursor' | 'github_copilot' | 'claude_code' | 'none'} IdeAssistTargetId */

export const IDE_ASSIST_TARGET_IDS = /** @type {const} */ (['cursor', 'github_copilot', 'claude_code', 'none']);

/**
 * @param {unknown} raw
 * @returns {IdeAssistTargetId}
 */
export function normalizeIdeAssistTarget(raw) {
  const s = String(raw || '').trim();
  if (s === 'cursor' || s === 'github_copilot' || s === 'claude_code' || s === 'none') return s;
  return 'cursor';
}

/**
 * @returns {Promise<IdeAssistTargetId>}
 */
export async function getIdeAssistTarget() {
  try {
    const r = await chrome.storage.local.get([IDE_ASSIST_STORAGE_KEY]);
    return normalizeIdeAssistTarget(r[IDE_ASSIST_STORAGE_KEY]);
  } catch {
    return 'cursor';
  }
}

/**
 * @param {string} id
 * @returns {Promise<IdeAssistTargetId>}
 */
export async function setIdeAssistTarget(id) {
  const v = normalizeIdeAssistTarget(id);
  await chrome.storage.local.set({ [IDE_ASSIST_STORAGE_KEY]: v });
  return v;
}
