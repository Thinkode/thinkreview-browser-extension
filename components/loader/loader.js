/**
 * Premium full-page loader — visual parity with Thinkreview-webapp `LoadingState`.
 * Vanilla DOM + CSS (no React/MUI). Safe for extension pages and content contexts
 * that expose `chrome.runtime.getURL`.
 */

import { getRandomFact } from './loadingMessages.js';

const STYLE_LINK_ID = 'thinkreview-loader-stylesheet';

function ensureLoaderStyles() {
  if (document.getElementById(STYLE_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_LINK_ID;
  link.rel = 'stylesheet';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    link.href = chrome.runtime.getURL('components/loader/loader.css');
  } else {
    link.href = new URL('loader.css', import.meta.url).href;
  }
  document.head.appendChild(link);
}

function extensionIconUrl(file) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(file);
  }
  return file;
}

/**
 * @typedef {Object} ThinkReviewLoaderOptions
 * @property {string} [message]
 * @property {string|null} [subMessage]
 * @property {boolean} [showAnalyzing]
 * @property {number} [size] Scale multiplier (default 0.52 for extension tab)
 * @property {boolean} [showFacts]
 * @property {number|null} [minHeight] Min height of inner content in px
 */

export class ThinkReviewLoader {
  /**
   * @param {HTMLElement} rootElement Host node (e.g. #user-data-loading-overlay). Cleared on first mount.
   * @param {ThinkReviewLoaderOptions} [options]
   */
  constructor(rootElement, options = {}) {
    this.root = rootElement;
    this.options = {
      message: options.message ?? 'Loading...',
      subMessage: options.subMessage ?? null,
      showAnalyzing: !!options.showAnalyzing,
      size: typeof options.size === 'number' ? options.size : 0.52,
      showFacts: options.showFacts !== false,
      minHeight: options.minHeight ?? null,
    };
    /** @type {HTMLElement|null} */
    this._inner = null;
    /** @type {HTMLElement|null} */
    this._titleEl = null;
    /** @type {HTMLElement|null} */
    this._subEl = null;
    /** @type {HTMLElement|null} */
    this._factEl = null;
    this._factInterval = null;
    this._mounted = false;
  }

  mount() {
    if (this._mounted) return;
    ensureLoaderStyles();

    this.root.textContent = '';
    this.root.classList.add('tr-loader-overlay');

    const { size } = this.options;
    const BASE = 96 * size;
    const dotSize = 7 * size;
    const logoHalf = BASE * 0.31;
    const logoReachPx = logoHalf * Math.SQRT2 * 1.06;
    const orbitRadiusPx = logoReachPx + dotSize / 2 + 6 * size;
    const orbitExtentPx = orbitRadiusPx + dotSize / 2 + 4 * size;
    const padPx = Math.max(0, orbitExtentPx - BASE / 2);
    const boxSizePx = BASE + 2 * padPx;

    const content = document.createElement('div');
    content.className = 'tr-loader-content';
    content.setAttribute('role', 'status');
    if (this.options.minHeight != null) {
      content.style.minHeight = `${this.options.minHeight}px`;
    }

    const iconOuter = document.createElement('div');
    iconOuter.className = 'tr-loader-icon-outer';
    iconOuter.style.width = `${boxSizePx}px`;
    iconOuter.style.height = `${boxSizePx}px`;

    const orbitColors = ['#3b82f6', '#10b981', '#8b5cf6'];
    const orbitDelays = [0, 0.93, 1.87];
    orbitColors.forEach((color, i) => {
      const arm = document.createElement('div');
      arm.className = 'tr-loader-orbit-arm';
      arm.style.animationDelay = `${orbitDelays[i]}s`;
      const dot = document.createElement('div');
      dot.className = 'tr-loader-orbit-dot';
      dot.style.width = `${dotSize}px`;
      dot.style.height = `${dotSize}px`;
      dot.style.background = color;
      dot.style.boxShadow = `0 0 8px 2px ${color}55`;
      dot.style.left = `${orbitRadiusPx - dotSize / 2}px`;
      dot.style.top = `${-dotSize / 2}px`;
      arm.appendChild(dot);
      iconOuter.appendChild(arm);
    });

    const ringsCenter = document.createElement('div');
    ringsCenter.className = 'tr-loader-rings-center';
    ringsCenter.style.width = `${BASE}px`;
    ringsCenter.style.height = `${BASE}px`;

    const ringOuter = document.createElement('div');
    ringOuter.className = 'tr-loader-ring-outer';

    const ringInner = document.createElement('div');
    ringInner.className = 'tr-loader-ring-inner';
    const innerInset = BASE * 0.1;
    ringInner.style.top = `${innerInset}px`;
    ringInner.style.right = `${innerInset}px`;
    ringInner.style.bottom = `${innerInset}px`;
    ringInner.style.left = `${innerInset}px`;

    const glow = document.createElement('div');
    glow.className = 'tr-loader-glow';
    const glowInset = BASE * 0.15;
    glow.style.top = `${glowInset}px`;
    glow.style.right = `${glowInset}px`;
    glow.style.bottom = `${glowInset}px`;
    glow.style.left = `${glowInset}px`;

    const logoWrap = document.createElement('div');
    logoWrap.className = 'tr-loader-logo-wrap';
    logoWrap.style.width = `${BASE * 0.62}px`;
    logoWrap.style.height = `${BASE * 0.62}px`;

    const img = document.createElement('img');
    img.src = extensionIconUrl('images/icon128.png');
    img.alt = 'ThinkReview';
    img.addEventListener('error', () => {
      img.src = extensionIconUrl('images/icon48.png');
    }, { once: true });

    const scanline = document.createElement('div');
    scanline.className = 'tr-loader-scanline';

    logoWrap.appendChild(img);
    logoWrap.appendChild(scanline);

    ringsCenter.appendChild(ringOuter);
    ringsCenter.appendChild(ringInner);
    ringsCenter.appendChild(glow);
    ringsCenter.appendChild(logoWrap);
    iconOuter.appendChild(ringsCenter);

    const messages = document.createElement('div');
    messages.className = 'tr-loader-messages';

    const title = document.createElement('h2');
    title.className = 'tr-loader-title';
    title.textContent = this.options.message;
    messages.appendChild(title);

    const subText =
      this.options.subMessage ||
      (this.options.showAnalyzing
        ? 'Processing your data and calculating metrics. Please wait...'
        : '');
    if (subText) {
      const sub = document.createElement('p');
      sub.className = 'tr-loader-sub';
      sub.textContent = subText;
      messages.appendChild(sub);
      this._subEl = sub;
    } else {
      this._subEl = null;
    }

    if (this.options.showFacts) {
      const factWrap = document.createElement('div');
      factWrap.className = 'tr-loader-fact-wrap';
      this._factEl = document.createElement('p');
      this._factEl.className = 'tr-loader-fact';
      factWrap.appendChild(this._factEl);
      messages.appendChild(factWrap);
      this._applyFactContent();
    }

    content.appendChild(iconOuter);
    content.appendChild(messages);
    this.root.appendChild(content);

    this._inner = content;
    this._titleEl = title;
    this._mounted = true;
  }

  _applyFactContent() {
    if (!this._factEl) return;
    const fact = getRandomFact();
    this._factEl.textContent = '';
    const label = document.createElement('span');
    label.className = 'tr-loader-fact-label';
    label.textContent = 'Did you know?';
    this._factEl.appendChild(label);
    this._factEl.appendChild(document.createTextNode(` ${fact}`));
  }

  /** Restart the fact line fade animation (call after swapping text). */
  _restartFactAnimation() {
    if (!this._factEl) return;
    this._factEl.style.animation = 'none';
    // reflow
    void this._factEl.offsetHeight;
    this._factEl.style.removeProperty('animation');
  }

  /**
   * @param {string} message
   * @param {string|null} [subMessage]
   */
  setMessages(message, subMessage = null) {
    this.options.message = message;
    this.options.subMessage = subMessage;
    if (!this._mounted) return;
    if (this._titleEl) this._titleEl.textContent = message;
    if (subMessage) {
      if (this._subEl) {
        this._subEl.textContent = subMessage;
      } else {
        const messages = this._inner?.querySelector('.tr-loader-messages');
        if (messages && this._titleEl) {
          const sub = document.createElement('p');
          sub.className = 'tr-loader-sub';
          sub.textContent = subMessage;
          this._titleEl.insertAdjacentElement('afterend', sub);
          this._subEl = sub;
        }
      }
    } else if (this._subEl) {
      this._subEl.remove();
      this._subEl = null;
    }
  }

  show() {
    this.mount();
    if (this.options.showFacts && this._factEl) {
      this._stopFactRotation();
      this._applyFactContent();
      this._restartFactAnimation();
      this._factInterval = window.setInterval(() => {
        this._applyFactContent();
        this._restartFactAnimation();
      }, 12000);
    }
    this.root.hidden = false;
    this.root.setAttribute('aria-busy', 'true');
  }

  hide() {
    this._stopFactRotation();
    this.root.hidden = true;
    this.root.setAttribute('aria-busy', 'false');
  }

  _stopFactRotation() {
    if (this._factInterval != null) {
      window.clearInterval(this._factInterval);
      this._factInterval = null;
    }
  }
}
