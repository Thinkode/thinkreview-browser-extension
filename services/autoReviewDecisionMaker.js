const AUTO_REVIEW_PATCH_SIZE_LIMIT = 30_000;

/**
 * Determines whether an auto-triggered review should proceed.
 * This module runs ONLY for auto-triggered reviews (not manual).
 *
 * @param {string} patchContent - The filtered patch diff string
 * @param {Object} context - Additional context for future decision responsibilities
 * @param {string} [context.platform] - The current platform (gitlab, github, etc.)
 * @param {string} [context.mrId] - The MR/PR identifier
 * @returns {{ proceed: boolean, reason?: string, details?: Object }}
 */
export function shouldProceedWithAutoReview(patchContent, context = {}) {
  // Responsibility 1: patch size check
  const patchSize = patchContent.length;
  if (patchSize > AUTO_REVIEW_PATCH_SIZE_LIMIT) {
    return {
      proceed: false,
      reason: 'patch-too-large',
      details: { patchSize, limit: AUTO_REVIEW_PATCH_SIZE_LIMIT }
    };
  }

  // Future responsibilities: add additional checks here using context fields
  return { proceed: true };
}
