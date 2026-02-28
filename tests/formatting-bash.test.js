/**
 * Unit tests for the Bash highlighter in applySimpleSyntaxHighlighting.
 *
 * The Bash highlighter uses placeholder-based protection: comments and strings
 * are replaced with placeholders first, so that built-in commands and variables
 * inside them are not incorrectly wrapped. These tests guard against regressions
 * if regex order or placeholder logic is changed.
 */

import { applySimpleSyntaxHighlighting } from '../components/utils/formatting.js';

function createRoot(innerHTML) {
  const root = document.createElement('div');
  root.innerHTML = innerHTML;
  return root;
}

function getCodeHtml(root) {
  const code = root.querySelector('code');
  return code ? code.innerHTML : '';
}

describe('applySimpleSyntaxHighlighting - Bash', () => {
  it('should not highlight built-in commands inside strings', () => {
    // 'git' and 'echo' are built-ins; here they are inside a string
    const root = createRoot('<pre><code class="language-bash">echo "git push"</code></pre>');
    applySimpleSyntaxHighlighting(root);
    const codeHtml = getCodeHtml(root);

    // String must be one token (whole "git push" inside string span)
    expect(codeHtml).toContain('token string');
    expect(codeHtml).toContain('"git push"');
    // Must NOT wrap "git" as builtin when it is inside the string
    expect(codeHtml).not.toMatch(/<span[^>]*token builtin[^>]*>git<\/span>/);
  });

  it('should not highlight built-ins inside comments', () => {
    const root = createRoot('<pre><code class="language-bash"># This is a git comment</code></pre>');
    applySimpleSyntaxHighlighting(root);
    const codeHtml = getCodeHtml(root);

    // Whole line must be one comment token
    expect(codeHtml).toContain('token comment');
    expect(codeHtml).toContain('# This is a git comment');
    // "git" must not be wrapped as builtin
    expect(codeHtml).not.toMatch(/<span[^>]*token builtin[^>]*>git<\/span>/);
  });

  it('should not highlight "ls" when inside a string (string protection)', () => {
    const root = createRoot('<pre><code class="language-bash">echo "ls"</code></pre>');
    applySimpleSyntaxHighlighting(root);
    const codeHtml = getCodeHtml(root);

    expect(codeHtml).toContain('token string');
    expect(codeHtml).toContain('"ls"');
    expect(codeHtml).not.toMatch(/<span[^>]*token builtin[^>]*>ls<\/span>/);
  });

  it('should treat # sudo rm -rf as a single comment block (comment protection)', () => {
    const root = createRoot('<pre><code class="language-bash"># sudo rm -rf /</code></pre>');
    applySimpleSyntaxHighlighting(root);
    const codeHtml = getCodeHtml(root);

    expect(codeHtml).toContain('token comment');
    expect(codeHtml).toContain('# sudo rm -rf /');
    // Built-ins inside comment must not be wrapped
    expect(codeHtml).not.toMatch(/<span[^>]*token builtin[^>]*>sudo<\/span>/);
    expect(codeHtml).not.toMatch(/<span[^>]*token builtin[^>]*>rm<\/span>/);
  });

  it('should highlight $VARIABLE as variable and not partially match other rules', () => {
    const root = createRoot('<pre><code class="language-bash">echo $MY_VAR</code></pre>');
    applySimpleSyntaxHighlighting(root);
    const codeHtml = getCodeHtml(root);

    expect(codeHtml).toContain('token variable');
    expect(codeHtml).toContain('$MY_VAR');
  });

  it('should never expose internal placeholder tokens in output', () => {
    // Use a mix of string and built-in so placeholders are used and restored
    const root = createRoot('<pre><code class="language-bash">echo "git" && git status</code></pre>');
    applySimpleSyntaxHighlighting(root);
    const codeHtml = getCodeHtml(root);

    // Null byte used in placeholder prefix/suffix must never appear in DOM
    expect(codeHtml).not.toContain('\x00');
    // Placeholder sentinel text should not appear as raw text (could appear in user string; safest is null check)
    // So we only assert no null byte, which is the critical internal character
  });
});
