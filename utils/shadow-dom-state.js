/**
 * shadow-dom-state.js
 * Centralized state management for Shadow DOM references.
 * Avoids polluting the global window object while providing clean module-level access.
 */

/**
 * @type {ShadowRoot|null}
 */
let _shadowRoot = null;

/**
 * Sets the Shadow DOM root reference.
 * Should be called once when the shadow root is created.
 * 
 * @param {ShadowRoot} shadowRoot - The shadow root instance
 */
export function setShadowRoot(shadowRoot) {
  if (!shadowRoot || !(shadowRoot instanceof ShadowRoot)) {
    console.warn('[ShadowDomState] Invalid shadow root provided');
    return;
  }
  _shadowRoot = shadowRoot;
}

/**
 * Gets the Shadow DOM root reference.
 * Falls back to document if shadow root hasn't been initialized.
 * 
 * @returns {ShadowRoot|Document}
 */
export function getShadowRoot() {
  return _shadowRoot || document;
}

/**
 * Checks if the shadow root has been initialized.
 * 
 * @returns {boolean}
 */
export function hasShadowRoot() {
  return _shadowRoot !== null;
}

/**
 * Clears the shadow root reference.
 * Useful for cleanup or testing scenarios.
 */
export function clearShadowRoot() {
  _shadowRoot = null;
}
