// item-post-comment-button.js
// Post review items as PR/MR conversation comments via full-context PAT.

import { dbgWarn } from '../../utils/logger.js';

const ONBOARDING_STORAGE_KEY = 'hasSeenPostPrCommentOnboarding';
const INTEGRATIONS_URL = 'https://portal.thinkreview.dev/integrations';
const POSTING_TOAST_ID = 'thinkreview-post-comment-toast';

/**
 * @returns {SVGSVGElement}
 */
function createPostIconSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.style.display = 'block';
  // Paper-plane / send style icon
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

/**
 * @returns {SVGSVGElement}
 */
function createCheckmarkSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

/**
 * @returns {SVGSVGElement}
 */
function createErrorSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * @param {number} [size]
 * @returns {HTMLSpanElement}
 */
function createSpinnerEl(size = 14) {
  const el = document.createElement('span');
  el.className = 'thinkreview-post-comment-spinner';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function getToastHost() {
  return document.getElementById('gitlab-mr-integrated-review') || document.body;
}

/**
 * Non-blocking status toast while the post request is in flight.
 * @param {string} [message]
 */
function showPostingToast(message) {
  hidePostingToast(true);
  const host = getToastHost();
  const toast = document.createElement('div');
  toast.id = POSTING_TOAST_ID;
  toast.className = 'thinkreview-post-comment-toast';
  if (host.id !== 'gitlab-mr-integrated-review') {
    toast.classList.add('thinkreview-post-comment-toast-fixed');
  }
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.appendChild(createSpinnerEl(14));
  const label = document.createElement('span');
  label.className = 'thinkreview-post-comment-toast-label';
  label.textContent = message || 'Posting comment…';
  toast.appendChild(label);
  host.appendChild(toast);
}

/**
 * @param {boolean} [immediate]
 */
function hidePostingToast(immediate = false) {
  const toast = document.getElementById(POSTING_TOAST_ID);
  if (!toast) return;
  if (immediate) {
    toast.remove();
    return;
  }
  toast.classList.add('thinkreview-post-comment-toast-out');
  window.setTimeout(() => toast.remove(), 180);
}

function showButtonSpinner(button) {
  clearElement(button);
  button.appendChild(createSpinnerEl(14));
  button.style.color = '';
}

function trackAction(name, props = {}) {
  return import(chrome.runtime.getURL('utils/analytics-service.js'))
    .then((m) => m.trackUserAction(name, props))
    .catch(() => {});
}

/**
 * @returns {Promise<boolean>}
 */
function hasSeenOnboarding() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([ONBOARDING_STORAGE_KEY], (result) => {
        resolve(!!result?.[ONBOARDING_STORAGE_KEY]);
      });
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * @returns {Promise<void>}
 */
function markOnboardingSeen() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [ONBOARDING_STORAGE_KEY]: true }, () => resolve());
    } catch (_) {
      resolve();
    }
  });
}

/**
 * Simple illustration: extension finding → PR conversation comment.
 * @returns {SVGSVGElement}
 */
function createOnboardingIllustration() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 280 120');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '120');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'How posting to the pull request works');
  svg.classList.add('thinkreview-post-comment-illustration');

  // Left card (ThinkReview finding)
  const left = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  left.setAttribute('x', '16');
  left.setAttribute('y', '24');
  left.setAttribute('width', '100');
  left.setAttribute('height', '72');
  left.setAttribute('rx', '10');
  left.setAttribute('fill', '#2d2d2d');
  left.setAttribute('stroke', '#6b4fbb');
  left.setAttribute('stroke-width', '2');
  svg.appendChild(left);

  const leftTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  leftTitle.setAttribute('x', '66');
  leftTitle.setAttribute('y', '48');
  leftTitle.setAttribute('text-anchor', 'middle');
  leftTitle.setAttribute('fill', '#e8e0ff');
  leftTitle.setAttribute('font-size', '11');
  leftTitle.setAttribute('font-family', 'system-ui, sans-serif');
  leftTitle.textContent = 'Finding';
  svg.appendChild(leftTitle);

  const leftLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  leftLine1.setAttribute('x', '28');
  leftLine1.setAttribute('y', '58');
  leftLine1.setAttribute('width', '76');
  leftLine1.setAttribute('height', '6');
  leftLine1.setAttribute('rx', '3');
  leftLine1.setAttribute('fill', '#555');
  svg.appendChild(leftLine1);

  const leftLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  leftLine2.setAttribute('x', '28');
  leftLine2.setAttribute('y', '72');
  leftLine2.setAttribute('width', '52');
  leftLine2.setAttribute('height', '6');
  leftLine2.setAttribute('rx', '3');
  leftLine2.setAttribute('fill', '#444');
  svg.appendChild(leftLine2);

  // Arrow
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrow.setAttribute('d', 'M126 60 H158 L150 52 M158 60 L150 68');
  arrow.setAttribute('stroke', '#6b4fbb');
  arrow.setAttribute('stroke-width', '2.5');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(arrow);

  const postLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  postLabel.setAttribute('x', '142');
  postLabel.setAttribute('y', '48');
  postLabel.setAttribute('text-anchor', 'middle');
  postLabel.setAttribute('fill', '#a78bfa');
  postLabel.setAttribute('font-size', '10');
  postLabel.setAttribute('font-family', 'system-ui, sans-serif');
  postLabel.textContent = 'Post';
  svg.appendChild(postLabel);

  // Right card (PR conversation)
  const right = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  right.setAttribute('x', '164');
  right.setAttribute('y', '24');
  right.setAttribute('width', '100');
  right.setAttribute('height', '72');
  right.setAttribute('rx', '10');
  right.setAttribute('fill', '#1f2937');
  right.setAttribute('stroke', '#4ade80');
  right.setAttribute('stroke-width', '2');
  svg.appendChild(right);

  const rightTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  rightTitle.setAttribute('x', '214');
  rightTitle.setAttribute('y', '48');
  rightTitle.setAttribute('text-anchor', 'middle');
  rightTitle.setAttribute('fill', '#bbf7d0');
  rightTitle.setAttribute('font-size', '11');
  rightTitle.setAttribute('font-family', 'system-ui, sans-serif');
  rightTitle.textContent = 'PR comment';
  svg.appendChild(rightTitle);

  const rightLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rightLine1.setAttribute('x', '176');
  rightLine1.setAttribute('y', '58');
  rightLine1.setAttribute('width', '76');
  rightLine1.setAttribute('height', '6');
  rightLine1.setAttribute('rx', '3');
  rightLine1.setAttribute('fill', '#374151');
  svg.appendChild(rightLine1);

  const rightLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rightLine2.setAttribute('x', '176');
  rightLine2.setAttribute('y', '72');
  rightLine2.setAttribute('width', '44');
  rightLine2.setAttribute('height', '6');
  rightLine2.setAttribute('rx', '3');
  rightLine2.setAttribute('fill', '#4b5563');
  svg.appendChild(rightLine2);

  return svg;
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {boolean} [options.showIllustration]
 * @param {string} [options.primaryLabel]
 * @param {string} [options.secondaryLabel]
 * @param {() => void} [options.onPrimary]
 * @param {() => void} [options.onSecondary]
 * @param {() => void} [options.onDismiss] - X / backdrop dismiss
 * @param {boolean} [options.primaryOpensIntegrations]
 */
function showPostCommentModal(options) {
  const existing = document.querySelector('.thinkreview-post-comment-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'thinkreview-post-comment-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'thinkreview-post-comment-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const header = document.createElement('div');
  header.className = 'thinkreview-post-comment-dialog-header';

  const title = document.createElement('h3');
  title.textContent = options.title || 'Post to pull request';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'thinkreview-post-comment-dialog-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close';
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  const body = document.createElement('div');
  body.className = 'thinkreview-post-comment-dialog-body';

  if (options.showIllustration) {
    body.appendChild(createOnboardingIllustration());
  }

  const msg = document.createElement('p');
  msg.textContent = options.message || '';
  body.appendChild(msg);
  dialog.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'thinkreview-post-comment-dialog-footer';

  let settled = false;
  const settle = (kind) => {
    if (settled) return;
    settled = true;
    backdrop.remove();
    if (kind === 'primary' && typeof options.onPrimary === 'function') options.onPrimary();
    else if (kind === 'secondary' && typeof options.onSecondary === 'function') options.onSecondary();
    else if (kind === 'dismiss' && typeof options.onDismiss === 'function') options.onDismiss();
  };

  if (options.secondaryLabel) {
    const secondary = document.createElement('button');
    secondary.type = 'button';
    secondary.className = 'thinkreview-post-comment-btn-secondary';
    secondary.textContent = options.secondaryLabel;
    secondary.addEventListener('click', () => settle('secondary'));
    footer.appendChild(secondary);
  }

  const primary = document.createElement('button');
  primary.type = 'button';
  primary.className = 'thinkreview-post-comment-btn-primary';
  primary.textContent = options.primaryLabel || 'Continue';
  primary.addEventListener('click', () => {
    if (options.primaryOpensIntegrations) {
      window.open(INTEGRATIONS_URL, '_blank', 'noopener,noreferrer');
    }
    settle('primary');
  });
  footer.appendChild(primary);
  dialog.appendChild(footer);

  closeBtn.addEventListener('click', () => settle('dismiss'));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) settle('dismiss');
  });

  backdrop.appendChild(dialog);

  const panel = document.getElementById('gitlab-mr-integrated-review');
  if (panel) {
    panel.appendChild(backdrop);
  } else {
    document.body.appendChild(backdrop);
  }
}

/**
 * Build markdown body for posting.
 * @param {string} plainText
 * @returns {string}
 */
export function buildPostCommentMarkdown(plainText) {
  return String(plainText || '').trim();
}

/**
 * @returns {HTMLButtonElement}
 */
export function createPostCommentButton() {
  const button = document.createElement('button');
  button.className = 'thinkreview-item-post-comment-btn';
  button.type = 'button';
  button.title = 'Post as PR comment';
  button.setAttribute('data-tooltip', 'Post as PR comment');
  button.style.display = 'flex';
  button.style.visibility = 'visible';
  button.style.opacity = '0.6';
  button.appendChild(createPostIconSvg());
  return button;
}

function showPostSuccessFeedback(button) {
  clearElement(button);
  button.appendChild(createCheckmarkSvg());
  button.style.color = '#4ade80';
  setTimeout(() => {
    clearElement(button);
    button.appendChild(createPostIconSvg());
    button.style.color = '';
  }, 2000);
}

function showPostErrorFeedback(button) {
  clearElement(button);
  button.appendChild(createErrorSvg());
  button.style.color = '#ef4444';
  setTimeout(() => {
    clearElement(button);
    button.appendChild(createPostIconSvg());
    button.style.color = '';
  }, 2000);
}

/**
 * @param {HTMLButtonElement} button
 * @param {() => string} getPlainText
 */
async function handlePostClick(button, getPlainText, location = 'review_item') {
  trackAction('post_pr_comment_clicked', {
    context: 'integrated_review_panel',
    location,
  });

  const plain = typeof getPlainText === 'function' ? getPlainText() : '';
  const body = buildPostCommentMarkdown(plain);
  if (!body.trim()) {
    showPostErrorFeedback(button);
    return;
  }

  const seen = await hasSeenOnboarding();
  if (!seen) {
    const proceed = await new Promise((resolve) => {
      showPostCommentModal({
        title: 'Post to the pull request',
        message:
          'Post publishes this as a conversation comment on the PR. Uses your Full Context integration (GitHub App, GitLab OAuth, or PAT). GitHub App comments appear as ThinkReview.',
        showIllustration: true,
        primaryLabel: 'Got it',
        secondaryLabel: 'Cancel',
        onPrimary: async () => {
          await markOnboardingSeen();
          resolve(true);
        },
        onSecondary: () => resolve(false),
        onDismiss: () => resolve(false),
      });
    });
    if (!proceed) return;
  }

  await executePost(button, body);
}

async function getSignedInEmail() {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['userData', 'user'], resolve);
    });
    const fromUserData = result?.userData?.email;
    if (typeof fromUserData === 'string' && fromUserData.trim()) return fromUserData.trim();
    const fromUser = result?.user?.email;
    if (typeof fromUser === 'string' && fromUser.trim()) return fromUser.trim();
  } catch (_) {
    // ignore
  }
  return null;
}

/**
 * @param {HTMLButtonElement} button
 * @param {string} body
 */
async function executePost(button, body) {
  if (button.dataset.posting === '1') return;
  button.dataset.posting = '1';
  button.disabled = true;
  showButtonSpinner(button);
  showPostingToast('Posting comment…');

  const finishWait = () => hidePostingToast(true);

  try {
    const cloudModule = await import(chrome.runtime.getURL('services/cloud-service.js'));
    const CloudService = cloudModule.CloudService;
    const email = await getSignedInEmail();
    if (!email) {
      finishWait();
      trackAction('post_pr_comment_setup_shown', { reason: 'not_signed_in' });
      showPostCommentModal({
        title: 'Sign in required',
        message: 'Sign in to ThinkReview, then connect a Personal Access Token under Integrations to post comments on the PR.',
        primaryLabel: 'Open Integrations',
        secondaryLabel: 'Close',
        primaryOpensIntegrations: true,
      });
      showPostErrorFeedback(button);
      return;
    }

    const mrUrl = window.location.href;
    const result = await CloudService.postPrComment(email, mrUrl, body);

    if (result?.status === 'success') {
      finishWait();
      trackAction('post_pr_comment_posted', {
        platform: result.platform || null,
      });
      showPostSuccessFeedback(button);
      return;
    }

    const code = result?.code;
    if (code === 'no_integration') {
      finishWait();
      trackAction('post_pr_comment_setup_shown', { reason: code });
      showPostCommentModal({
        title: 'Connect an integration',
        message:
          'To post this finding on the PR, connect GitHub App, GitLab OAuth, or a Personal Access Token under Full Context Integrations.',
        primaryLabel: 'Set up Integrations',
        secondaryLabel: 'Close',
        primaryOpensIntegrations: true,
      });
      showPostErrorFeedback(button);
      return;
    }

    if (code === 'missing_write_permission') {
      finishWait();
      trackAction('post_pr_comment_setup_shown', {
        reason: 'missing_write_permission',
        authType: result?.authType || null,
      });
      const authType = result?.authType;
      const message =
        typeof result?.message === 'string' && result.message.trim()
          ? result.message
          : authType === 'gitlab_oauth'
            ? 'Your GitLab connection needs comment permission. Reconnect with GitLab in Integrations, then try again.'
            : authType === 'github_app'
              ? 'The ThinkReview GitHub App needs permission to write pull request comments. Ask an admin to approve updated App permissions, or add a PAT with write access.'
              : 'Your token can read the repo but cannot post comments. Update it with write access for pull/merge requests, then try again.';
      showPostCommentModal({
        title: 'Write access needed',
        message,
        primaryLabel: 'Open Integrations',
        secondaryLabel: 'Close',
        primaryOpensIntegrations: true,
      });
      showPostErrorFeedback(button);
      return;
    }

    finishWait();
    showPostErrorFeedback(button);
  } catch (err) {
    dbgWarn('Failed to post PR comment:', err);
    finishWait();
    if (err?.name === 'AuthExpiredError' || err?.isAuthExpired) {
      showPostCommentModal({
        title: 'Sign in required',
        message: 'Your session expired. Sign in again, then retry posting.',
        primaryLabel: 'Close',
      });
    }
    showPostErrorFeedback(button);
  } finally {
    hidePostingToast(true);
    button.dataset.posting = '0';
    button.disabled = false;
  }
}

/**
 * Attach a post-comment button next to the copy button on a review item wrapper.
 * @param {HTMLElement} wrapperElement
 * @param {() => string} getPlainText - Returns the plain text / markdown source for the comment
 * @param {{ location?: string }} [options]
 * @returns {HTMLElement|null}
 */
export function attachPostCommentButtonToItem(wrapperElement, getPlainText, options = {}) {
  if (!wrapperElement) {
    dbgWarn('Cannot attach post comment button: missing wrapperElement');
    return null;
  }

  const existing = wrapperElement.querySelector('.thinkreview-item-post-comment-btn');
  if (existing) return existing;

  const location = options.location || 'review_item';
  const postBtn = createPostCommentButton();
  postBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    handlePostClick(postBtn, getPlainText, location);
  });

  const copyBtn = wrapperElement.querySelector('.thinkreview-item-copy-btn');
  if (copyBtn && copyBtn.parentElement === wrapperElement) {
    if (copyBtn.nextSibling) {
      wrapperElement.insertBefore(postBtn, copyBtn.nextSibling);
    } else {
      wrapperElement.appendChild(postBtn);
    }
  } else {
    wrapperElement.appendChild(postBtn);
  }

  return postBtn;
}

export default {
  createPostCommentButton,
  attachPostCommentButtonToItem,
  buildPostCommentMarkdown,
};
