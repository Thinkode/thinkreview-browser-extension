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
 * Prominent Revolut-style rewards prize card (rendered above buy-credits).
 * Copy/URL come from cloud Remote Config — never hardcoded prize amounts.
 */
function appendRewardsCta(container, rewardsCta, analyticsContext) {
  if (!rewardsCta || rewardsCta.enabled !== true) return;
  const label = typeof rewardsCta.label === 'string' ? rewardsCta.label.trim() : '';
  const url = typeof rewardsCta.url === 'string' ? rewardsCta.url.trim() : '';
  if (!label || !url) return;
  try {
    if (new URL(url).protocol !== 'https:') return;
  } catch {
    return;
  }

  const card = document.createElement('div');
  card.className = 'upgrade-rewards-prize';

  const badge = document.createElement('span');
  badge.className = 'upgrade-rewards-prize-badge';
  badge.textContent = 'Free credits';
  card.appendChild(badge);

  const title = document.createElement('p');
  title.className = 'upgrade-rewards-prize-title';
  title.textContent = label;
  card.appendChild(title);

  const description =
    typeof rewardsCta.description === 'string' ? rewardsCta.description.trim() : '';
  if (description) {
    card.appendChild(createParagraph('upgrade-rewards-prize-description', description));
  }

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'upgrade-rewards-prize-btn';
  link.textContent = 'Claim free credits';
  link.addEventListener('click', async () => {
    try {
      const { trackUserAction } = await import(chrome.runtime.getURL('utils/analytics-service.js'));
      trackUserAction('rewards_cta_clicked', {
        context: analyticsContext
      }).catch(() => {});
    } catch {
      // Silently fail - analytics should never break CTA
    }
  });
  card.appendChild(link);
  container.appendChild(card);
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   creditPacks?: unknown[],
 *   prepaidBalance?: number|null,
 *   analyticsContext?: string,
 *   rewardsCta?: { enabled?: boolean, label?: string, description?: string, url?: string }|null
 * }} [options]
 */
export async function renderUpgradeCreditPacksActions(container, options = {}) {
  if (!container) return;

  const {
    creditPacks: rawPacks = [],
    prepaidBalance = null,
    analyticsContext = 'daily_limit_upgrade_prompt',
    rewardsCta = null
  } = options;

  container.replaceChildren();

  // Prize / rewards first — most prominent path before paid packs.
  appendRewardsCta(container, rewardsCta, analyticsContext);

  const buySection = document.createElement('div');
  buySection.className = 'upgrade-buy-section';
  let buySectionHasContent = false;

  const balanceNote = getBalanceNoteText(prepaidBalance);
  if (balanceNote) {
    buySection.appendChild(createParagraph('upgrade-credits-balance-note', balanceNote));
    buySectionHasContent = true;
  }

  const validationModule = await import(chrome.runtime.getURL('utils/credit-pack-validation.js'));
  const creditPacks = validationModule.filterValidCreditPacks(rawPacks);

  if (creditPacks.length > 0) {
    buySection.appendChild(
      createParagraph('upgrade-credits-packs-label', getPacksSectionLabel(prepaidBalance))
    );
    buySection.appendChild(createParagraph('upgrade-credits-validity-note', VALIDITY_NOTE_TEXT));

    const packsRow = document.createElement('div');
    packsRow.className = 'upgrade-credit-packs';
    creditPacks.forEach((pack, packIndex) => {
      packsRow.appendChild(
        createCreditPackItem(pack, packIndex, creditPacks.length, analyticsContext)
      );
    });
    buySection.appendChild(packsRow);
    buySectionHasContent = true;
  } else if (balanceNote == null) {
    const before = buySection.childNodes.length;
    appendFallbackActions(buySection);
    buySectionHasContent = buySection.childNodes.length > before;
  }

  if (buySectionHasContent) {
    container.appendChild(buySection);
  }
}
