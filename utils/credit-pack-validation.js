/**
 * Validates normalized credit pack rows before rendering checkout UI.
 */

/**
 * @param {unknown} pack
 * @returns {boolean}
 */
export function isValidCreditPack(pack) {
  if (!pack || typeof pack !== 'object') return false;

  const credits = Number(pack.credits);
  if (!Number.isFinite(credits) || credits <= 0) return false;

  const price = Number(pack.price);
  if (!Number.isFinite(price) || price <= 0) return false;

  const checkoutUrl = typeof pack.checkoutUrl === 'string' ? pack.checkoutUrl.trim() : '';
  if (!checkoutUrl || checkoutUrl.includes('PLACEHOLDER')) return false;

  try {
    const parsed = new URL(checkoutUrl);
    if (parsed.protocol !== 'https:') return false;
  } catch {
    return false;
  }

  return true;
}

/**
 * @param {unknown} packs
 * @returns {Array<object>}
 */
export function filterValidCreditPacks(packs) {
  if (!Array.isArray(packs)) return [];
  return packs.filter(isValidCreditPack);
}
