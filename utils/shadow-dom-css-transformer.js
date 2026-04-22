/**
 * shadow-dom-css-transformer.js
 * 
 * Transforms CSS selectors to work within Shadow DOM contexts.
 * 
 * IMPORTANT: This is a runtime solution for transforming CSS rules.
 * For production builds, consider using a CSS preprocessor or bundler (e.g., PostCSS, 
 * Vite, or Webpack) to generate Shadow DOM-compatible CSS at build time.
 * 
 * Build-time transformation benefits:
 * - More robust parsing (uses actual CSS parsers, not regex)
 * - Better error handling and validation
 * - Reduced runtime overhead
 * - Easier to test and maintain
 * - Can handle complex CSS edge cases
 * 
 * Example PostCSS plugin approach:
 * ```js
 * // postcss.config.js
 * module.exports = {
 *   plugins: [
 *     require('postcss-shadow-dom-transformer')({
 *       hostSelector: '#gitlab-mr-integrated-review',
 *       transformRules: {
 *         hostContext: /body\[data-theme="([^"]*)"\]/,
 *         hostClass: /\.([^\s,{>+~]+)/
 *       }
 *     })
 *   ]
 * }
 * ```
 */

/**
 * Transforms CSS selectors for Shadow DOM compatibility.
 * 
 * Transformation rules:
 * 1. "#gitlab-mr-integrated-review .foo"  → ".foo"   (shadow provides scoping)
 * 2. "#gitlab-mr-integrated-review.bar"   → ":host(.bar)"  (host-element class)
 * 3. "body[data-theme="X"] #gitlab-mr-integrated-review" → ":host-context([data-theme="X"])"
 * 4. bare "#gitlab-mr-integrated-review"  → ":host"
 * 
 * Known limitations (regex-based parsing):
 * - May not handle complex nested selectors correctly
 * - Cannot properly parse CSS at-rules (@media, @supports)
 * - May have issues with escaped characters in selectors
 * - Cannot validate selector syntax
 * - Performance impact on large CSS files
 * 
 * @param {string} css - CSS content to transform
 * @returns {string} Transformed CSS
 */
export function transformCssForShadow(css) {
  if (!css || typeof css !== 'string') {
    console.warn('[ShadowDomCssTransformer] Invalid CSS provided');
    return '';
  }

  try {
    return css
      // Handle host-context for theme attributes
      .replace(
        /body\[data-theme="([^"]*)"\]\s*#gitlab-mr-integrated-review\b/g,
        ':host-context([data-theme="$1"])'
      )
      // Handle host with classes
      .replace(
        /#gitlab-mr-integrated-review(\.[^\s,{>+~]+)/g,
        ':host($1)'
      )
      // Remove bare host selector in descendant combinator
      .replace(
        /#gitlab-mr-integrated-review\s+/g,
        ''
      )
      // Replace remaining bare host selectors
      .replace(
        /#gitlab-mr-integrated-review\b/g,
        ':host'
      );
  } catch (error) {
    console.error('[ShadowDomCssTransformer] Transformation failed:', error);
    return css; // Return original CSS on error
  }
}

/**
 * Validates that CSS has been properly transformed for Shadow DOM.
 * Useful for testing and debugging.
 * 
 * @param {string} css - CSS content to validate
 * @returns {{ isValid: boolean, issues: string[] }}
 */
export function validateTransformedCss(css) {
  const issues = [];
  
  // Check for untransformed host selectors
  if (/#gitlab-mr-integrated-review/.test(css)) {
    issues.push('Found untransformed #gitlab-mr-integrated-review selector');
  }
  
  // Check for proper :host usage
  const hostUsages = css.match(/:host(?:\([^)]*\))?/g) || [];
  if (hostUsages.length === 0) {
    issues.push('No :host selectors found (might be intentional)');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Fetches and transforms CSS files for Shadow DOM injection.
 * 
 * @param {string[]} cssUrls - Array of CSS file URLs to fetch and transform
 * @returns {Promise<string>} Combined and transformed CSS
 */
export async function fetchAndTransformCss(cssUrls) {
  if (!Array.isArray(cssUrls) || cssUrls.length === 0) {
    console.warn('[ShadowDomCssTransformer] No CSS URLs provided');
    return '';
  }

  try {
    const cssTexts = await Promise.all(
      cssUrls.map(url => fetch(url).then(r => {
        if (!r.ok) {
          throw new Error(`Failed to fetch ${url}: ${r.status} ${r.statusText}`);
        }
        return r.text();
      }))
    );

    const transformedCss = cssTexts.map(transformCssForShadow).join('\n\n');
    
    // Validate in development mode
    if (typeof DEBUG !== 'undefined' && DEBUG) {
      const validation = validateTransformedCss(transformedCss);
      if (!validation.isValid) {
        console.warn('[ShadowDomCssTransformer] Validation issues:', validation.issues);
      }
    }
    
    return transformedCss;
  } catch (error) {
    console.error('[ShadowDomCssTransformer] Failed to fetch and transform CSS:', error);
    throw error;
  }
}
