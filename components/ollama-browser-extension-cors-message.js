/**
 * Ollama CORS / HTTP 403 help copy for the integrated review panel and follow-up chat.
 * Shown when the extension hits Ollama with disallowed origins (browser extension context).
 */

export const OLLAMA_STOP_COMMAND =
  'killall ollama 2>/dev/null || true; killall Ollama 2>/dev/null || true; sleep 2';
export const OLLAMA_CORS_START_COMMAND = 'OLLAMA_ORIGINS="chrome-extension://*" ollama serve';

/** Windows: stop Ollama (Command Prompt) */
export const OLLAMA_STOP_COMMAND_WIN_CMD =
  'taskkill /IM ollama.exe /F 2>nul & timeout /t 2 /nobreak >nul';
/** Windows: start with CORS (Command Prompt) */
export const OLLAMA_CORS_START_COMMAND_WIN_CMD =
  'set OLLAMA_ORIGINS=chrome-extension://* && ollama serve';
/** Windows: stop Ollama (PowerShell) */
export const OLLAMA_STOP_COMMAND_WIN_PS =
  'Stop-Process -Name ollama -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2';
/** Windows: start with CORS (PowerShell) */
export const OLLAMA_CORS_START_COMMAND_WIN_PS =
  "$env:OLLAMA_ORIGINS='chrome-extension://*'; ollama serve";

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Avoid `replaceChildren` — not always available or reliable on host pages. */
function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

const OLLAMA_CORS_COPY_BY_KEY = {
  'unix-stop': OLLAMA_STOP_COMMAND,
  'unix-start': OLLAMA_CORS_START_COMMAND,
  'ps-stop': OLLAMA_STOP_COMMAND_WIN_PS,
  'ps-start': OLLAMA_CORS_START_COMMAND_WIN_PS,
  'cmd-stop': OLLAMA_STOP_COMMAND_WIN_CMD,
  'cmd-start': OLLAMA_CORS_START_COMMAND_WIN_CMD
};

/**
 * @param {Document} doc
 * @param {'copy' | 'check'} kind
 * @returns {SVGSVGElement}
 */
function createOllamaCopyIconSvg(doc, kind) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'thinkreview-ollama-cors-copy-svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  if (kind === 'check') {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute(
      'd',
      'M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
    );
    path.setAttribute('clip-rule', 'evenodd');
    svg.appendChild(path);
    return svg;
  }
  const p1 = doc.createElementNS(SVG_NS, 'path');
  p1.setAttribute('d', 'M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z');
  const p2 = doc.createElementNS(SVG_NS, 'path');
  p2.setAttribute(
    'd',
    'M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z'
  );
  svg.appendChild(p1);
  svg.appendChild(p2);
  return svg;
}

/**
 * @param {HTMLElement} parent
 * @param {Document} doc
 * @param {keyof typeof OLLAMA_CORS_COPY_BY_KEY} copyKey
 */
function appendCorsCopyRow(parent, doc, copyKey) {
  const row = doc.createElement('div');
  row.className = 'thinkreview-ollama-cors-row';
  const pre = doc.createElement('pre');
  pre.className = 'thinkreview-ollama-cors-code thinkreview-ollama-cors-code--in-row';
  const code = doc.createElement('code');
  code.textContent = OLLAMA_CORS_COPY_BY_KEY[copyKey] || '';
  pre.appendChild(code);
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'thinkreview-ollama-cors-copy-btn';
  btn.setAttribute('data-ollama-copy', copyKey);
  btn.title = 'Copy';
  btn.setAttribute('aria-label', 'Copy command');
  clearNode(btn);
  btn.appendChild(createOllamaCopyIconSvg(doc, 'copy'));
  row.appendChild(pre);
  row.appendChild(btn);
  parent.appendChild(row);
}

/**
 * @param {HTMLElement} parent
 * @param {Document} doc
 */
function appendSwitchToCloudCallout(parent, doc) {
  const wrap = doc.createElement('div');
  wrap.className = 'thinkreview-ollama-error-cloud-fallback';
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', 'Cloud AI alternative');
  const p = doc.createElement('p');
  p.className = 'thinkreview-ollama-error-cloud-fallback-text';
  p.appendChild(doc.createTextNode('Need a review right away? Use '));
  const strong = doc.createElement('strong');
  strong.textContent = 'Cloud AI';
  p.appendChild(strong);
  p.appendChild(doc.createTextNode(' for instant hosted reviews—no local Ollama setup required.'));
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'thinkreview-ollama-switch-to-cloud-btn thinkreview-ollama-switch-to-cloud-btn--inline-error';
  b.setAttribute('data-thinkreview-action', 'switch-to-cloud-ai');
  b.setAttribute('aria-label', 'Switch to Cloud AI and regenerate this review');
  b.textContent = 'Switch to Cloud AI';
  wrap.appendChild(p);
  wrap.appendChild(b);
  parent.appendChild(wrap);
}

/**
 * @param {HTMLElement} parent
 * @param {Document} doc
 */
function appendFirefoxNote(parent, doc) {
  const p = doc.createElement('p');
  p.className = 'thinkreview-ollama-cors-firefox-note';
  p.setAttribute('role', 'note');
  const strong = doc.createElement('strong');
  strong.textContent = 'Firefox browser:';
  p.appendChild(strong);
  p.appendChild(doc.createTextNode(' replace '));
  const c1 = doc.createElement('code');
  c1.textContent = 'chrome-extension://*';
  p.appendChild(c1);
  p.appendChild(doc.createTextNode(' with '));
  const c2 = doc.createElement('code');
  c2.textContent = 'moz-extension://*';
  p.appendChild(c2);
  p.appendChild(doc.createTextNode(' in the commands above.'));
  parent.appendChild(p);
}

/**
 * @param {HTMLElement} parent
 * @param {Document} doc
 * @param {string} text
 */
function appendSublabel(parent, doc, text) {
  const el = doc.createElement('p');
  el.className = 'thinkreview-ollama-cors-sublabel';
  el.textContent = text;
  parent.appendChild(el);
}

/**
 * @param {HTMLElement} parent
 * @param {Document} doc
 * @param {string} text
 */
function appendStepTitle(parent, doc, text) {
  const el = doc.createElement('p');
  el.className = 'thinkreview-ollama-cors-step-title';
  el.textContent = text;
  parent.appendChild(el);
}

/**
 * Build Ollama CORS help with createElement/textContent only (no innerHTML) to avoid XSS sinks.
 * @param {HTMLElement | null} container
 */
export function appendOllamaCorsHelp(container) {
  if (!container) return;
  const doc = container.ownerDocument || document;
  clearNode(container);
  const root = doc.createElement('div');
  root.className = 'thinkreview-ollama-cors-help';

  const errTitle = doc.createElement('p');
  errTitle.className = 'thinkreview-ollama-error-title';
  errTitle.textContent = 'Ollama connection issue';
  root.appendChild(errTitle);

  appendSwitchToCloudCallout(root, doc);

  const intro = doc.createElement('p');
  intro.className = 'thinkreview-ollama-cors-steps-intro';
  const introStrong = doc.createElement('strong');
  introStrong.textContent = 'Fix local Ollama:';
  intro.appendChild(introStrong);
  intro.appendChild(
    doc.createTextNode(
      ' stop and start the server with CORS for extensions. Run on your computer (Terminal, PowerShell, or CMD) — not in the browser.'
    )
  );
  root.appendChild(intro);

  appendStepTitle(root, doc, 'Step 1: Stop Ollama');
  appendSublabel(root, doc, 'macOS & Linux');
  appendCorsCopyRow(root, doc, 'unix-stop');
  appendSublabel(root, doc, 'Windows (PowerShell)');
  appendCorsCopyRow(root, doc, 'ps-stop');
  appendSublabel(root, doc, 'Windows (Command Prompt)');
  appendCorsCopyRow(root, doc, 'cmd-stop');

  appendStepTitle(root, doc, 'Step 2: Start Ollama (CORS for extensions)');
  appendSublabel(root, doc, 'macOS & Linux');
  appendCorsCopyRow(root, doc, 'unix-start');
  appendSublabel(root, doc, 'Windows (PowerShell)');
  appendCorsCopyRow(root, doc, 'ps-start');
  appendSublabel(root, doc, 'Windows (Command Prompt)');
  appendCorsCopyRow(root, doc, 'cmd-start');

  appendFirefoxNote(root, doc);

  container.appendChild(root);
}

/**
 * Wire copy-to-clipboard for buttons under `appendOllamaCorsHelp()`.
 * @param {HTMLElement | null} container
 */
export function attachOllamaCorsHelpCopyButtons(container) {
  if (!container) return;
  const buttons = container.querySelectorAll('button.thinkreview-ollama-cors-copy-btn[data-ollama-copy]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-ollama-copy');
      const text = key ? OLLAMA_CORS_COPY_BY_KEY[key] : '';
      if (!text) return;
      const doc = button.ownerDocument;
      navigator.clipboard.writeText(text).then(() => {
        if (navigator.vibrate) navigator.vibrate(50);
        clearNode(button);
        button.appendChild(createOllamaCopyIconSvg(doc, 'check'));
        button.style.color = '#22c55e';
        setTimeout(() => {
          clearNode(button);
          button.appendChild(createOllamaCopyIconSvg(doc, 'copy'));
          button.style.color = '';
        }, 1500);
      }).catch(() => {
        button.style.color = '#ef4444';
        setTimeout(() => {
          button.style.color = '';
        }, 1500);
      });
    });
  });
}

/**
 * True when the review error text refers to Ollama (local provider), including connection, CORS, and model errors.
 * @param {string} [message]
 * @returns {boolean}
 */
export function isOllamaProviderFailureMessage(message) {
  if (!message || typeof message !== 'string') return false;
  return /ollama/i.test(message);
}

/** Shown as a small footnote; main copy rows stay on chrome-extension://* */
export const OLLAMA_ORIGINS_FIREFOX_NOTE =
  'Firefox browser: replace chrome-extension://* with moz-extension://* in the commands above.';

/**
 * Markdown help for chat (processed by markdownToHtml).
 * @returns {string}
 */
export function getOllamaCorsHelpMarkdown() {
  return `**Ollama connection issue**

Need a review right away? Switch to **Cloud AI** in the extension popup (or toolbar) for hosted reviews—no local Ollama required.

**If fixing local Ollama:** run the commands below in **Terminal**, **PowerShell**, or **Command Prompt** on your machine — not in the browser. They restart Ollama with CORS allowed for browser extensions.

##### Step 1: Stop Ollama
**macOS & Linux**
\`\`\`bash
${OLLAMA_STOP_COMMAND}
\`\`\`
**Windows (PowerShell)**
\`\`\`powershell
${OLLAMA_STOP_COMMAND_WIN_PS}
\`\`\`
**Windows (Command Prompt)**
\`\`\`cmd
${OLLAMA_STOP_COMMAND_WIN_CMD}
\`\`\`

##### Step 2: Start Ollama (CORS for extensions)
**macOS & Linux**
\`\`\`bash
${OLLAMA_CORS_START_COMMAND}
\`\`\`
**Windows (PowerShell)**
\`\`\`powershell
${OLLAMA_CORS_START_COMMAND_WIN_PS}
\`\`\`
**Windows (Command Prompt)**
\`\`\`cmd
${OLLAMA_CORS_START_COMMAND_WIN_CMD}
\`\`\`

_${OLLAMA_ORIGINS_FIREFOX_NOTE}_`;
}
