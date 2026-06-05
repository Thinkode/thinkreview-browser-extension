/**
 * Credit pack actions for the daily-limit upgrade prompt.
 */

const ADDITIONAL_CREDITS_PORTAL_URL = 'https://portal.thinkreview.dev/additional-credits';
const VALIDITY_NOTE_TEXT = 'Additional credits are valid for 1 year from purchase.';

/**
 * @param {number} packIndex
 * @param {number} packCount
 * @returns {'best-value'|'most-purchased'|null}
 */
export function getPackBadgeKind(packIndex, packCount) {
  if (!Number.isFinite(packIndex) || !Number.isFinite(packCount) || packCount < 1) {
    return null;
  }
  const lastIndex = packCount - 1;
  if (packIndex === lastIndex) return 'best-value';
  if (packCount >= 2 && packIndex === lastIndex - 1) return 'most-purchased';
  return null;
}

/**
 * @param {{ credits?: number, price?: number, ctaText?: string }} pack
 * @returns {string}
 */
export function formatPackButtonLabel(pack) {
  const credits = Number(pack?.credits);
  const price = Number(pack?.price);
  const priceLabel = Number.isFinite(price) && price > 0 ? `$${price}` : '';
  if (priceLabel && Number.isFinite(credits) && credits > 0) {
    return `${credits} credits · ${priceLabel}`;
  }
  if (Number.isFinite(credits) && credits > 0) {
    return pack?.ctaText || `Buy ${credits} credits`;
  }
  return pack?.ctaText || 'Buy credits';
}

/**
 * @param {number|null} prepaidBalance
 * @returns {string}
 */
export function getPacksSectionLabel(prepaidBalance) {
  return prepaidBalance != null && prepaidBalance > 0
    ? 'Buy more review credits:'
    : 'Buy review credits without upgrading your plan:';
}

/**
 * @param {number|null} prepaidBalance
 * @returns {string|null}
 */
export function getBalanceNoteText(prepaidBalance) {
  if (prepaidBalance == null || !(prepaidBalance > 0)) return null;
  return `You have ${prepaidBalance} purchased credits for reviews after your daily plan limit (each pack expires 1 year after purchase).`;
}

function createParagraph(className, text) {
  const el = document.createElement('p');
  el.className = className;
  el.textContent = text;
  return el;
}

function createBadge(badgeKind) {
  const badge = document.createElement('span');
  badge.className = 'upgrade-credit-pack-badge';
  if (badgeKind === 'best-value') {
    badge.classList.add('is-best-value');
    badge.textContent = 'Best value';
  } else {
    badge.classList.add('is-most-purchased');
    badge.textContent = 'Most purchased';
  }
  return badge;
}

/**
 * @param {object} pack
 * @param {'best-value'|'most-purchased'|null} badgeKind
 * @param {string} analyticsContext
 * @returns {HTMLButtonElement}
 */
function createPackButton(pack, badgeKind, analyticsContext) {
  const packBtn = document.createElement('button');
  packBtn.type = 'button';
  packBtn.className = 'upgrade-credit-pack-btn';
  if (badgeKind === 'best-value') packBtn.classList.add('is-best-value');
  if (badgeKind === 'most-purchased') packBtn.classList.add('is-most-purchased');
  packBtn.textContent = formatPackButtonLabel(pack);

  packBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const { trackUserAction } = await import(chrome.runtime.getURL('utils/analytics-service.js'));
      trackUserAction('credit_pack_checkout_clicked', {
        context: analyticsContext,
        packId: pack.id || null,
        credits: pack.credits || null
      }).catch(() => {});
    } catch {
      // Silently fail - analytics should never break CTA
    }
    const destinationUrl = pack.checkoutUrl || ADDITIONAL_CREDITS_PORTAL_URL;
    window.open(destinationUrl, '_blank');
  });

  return packBtn;
}

/**
 * @param {object} pack
 * @param {number} packIndex
 * @param {number} packCount
 * @param {string} analyticsContext
 * @returns {HTMLDivElement}
 */
export function createCreditPackItem(pack, packIndex, packCount, analyticsContext) {
  const badgeKind = getPackBadgeKind(packIndex, packCount);
  const packItem = document.createElement('div');
  packItem.className = 'upgrade-credit-pack-item';

  const badgeSlot = document.createElement('div');
  badgeSlot.className = 'upgrade-credit-pack-badge-slot';
  if (badgeKind) badgeSlot.appendChild(createBadge(badgeKind));
  packItem.appendChild(badgeSlot);
  packItem.appendChild(createPackButton(pack, badgeKind, analyticsContext));

  return packItem;
}

function appendFallbackActions(container) {
  const fallbackLink = document.createElement('a');
  fallbackLink.href = ADDITIONAL_CREDITS_PORTAL_URL;
  fallbackLink.target = '_blank';
  fallbackLink.rel = 'noopener noreferrer';
  fallbackLink.className = 'btn btn-md btn-confirm gl-mt-2 upgrade-credits-fallback-link';
  fallbackLink.textContent = 'Buy review credits';
  container.appendChild(fallbackLink);
  container.appendChild(createParagraph('upgrade-credits-validity-note', VALIDITY_NOTE_TEXT));
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   creditPacks?: unknown[],
 *   prepaidBalance?: number|null,
 *   analyticsContext?: string
 * }} [options]
 */
export async function renderUpgradeCreditPacksActions(container, options = {}) {
  if (!container) return;

  const {
    creditPacks: rawPacks = [],
    prepaidBalance = null,
    analyticsContext = 'daily_limit_upgrade_prompt'
  } = options;

  container.replaceChildren();

  const balanceNote = getBalanceNoteText(prepaidBalance);
  if (balanceNote) {
    container.appendChild(createParagraph('upgrade-credits-balance-note', balanceNote));
  }

  const validationModule = await import(chrome.runtime.getURL('utils/credit-pack-validation.js'));
  const creditPacks = validationModule.filterValidCreditPacks(rawPacks);

  if (creditPacks.length > 0) {
    container.appendChild(
      createParagraph('upgrade-credits-packs-label', getPacksSectionLabel(prepaidBalance))
    );
    container.appendChild(createParagraph('upgrade-credits-validity-note', VALIDITY_NOTE_TEXT));

    const packsRow = document.createElement('div');
    packsRow.className = 'upgrade-credit-packs';
    creditPacks.forEach((pack, packIndex) => {
      packsRow.appendChild(
        createCreditPackItem(pack, packIndex, creditPacks.length, analyticsContext)
      );
    });
    container.appendChild(packsRow);
    return;
  }

  if (balanceNote == null) {
    appendFallbackActions(container);
  }
}
