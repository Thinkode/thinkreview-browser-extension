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

const COPY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="thinkreview-ollama-cors-copy-svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
</svg>`;

const CHECK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="thinkreview-ollama-cors-copy-svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
</svg>`;

const OLLAMA_CORS_COPY_BY_KEY = {
  'unix-stop': OLLAMA_STOP_COMMAND,
  'unix-start': OLLAMA_CORS_START_COMMAND,
  'ps-stop': OLLAMA_STOP_COMMAND_WIN_PS,
  'ps-start': OLLAMA_CORS_START_COMMAND_WIN_PS,
  'cmd-stop': OLLAMA_STOP_COMMAND_WIN_CMD,
  'cmd-start': OLLAMA_CORS_START_COMMAND_WIN_CMD
};

function corsCopyRow(copyKey) {
  return `
    <div class="thinkreview-ollama-cors-row">
      <pre class="thinkreview-ollama-cors-code thinkreview-ollama-cors-code--in-row"><code>${OLLAMA_CORS_COPY_BY_KEY[copyKey]}</code></pre>
      <button type="button" class="thinkreview-ollama-cors-copy-btn" data-ollama-copy="${copyKey}" title="Copy" aria-label="Copy command">
        ${COPY_ICON_SVG}
      </button>
    </div>`;
}

/**
 * Wire copy-to-clipboard for buttons rendered by getOllamaCorsHelpHtml().
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
      navigator.clipboard.writeText(text).then(() => {
        if (navigator.vibrate) navigator.vibrate(50);
        button.innerHTML = CHECK_ICON_SVG;
        button.style.color = '#22c55e';
        setTimeout(() => {
          button.innerHTML = COPY_ICON_SVG;
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
 * True when Ollama returned HTTP 403 from the API (common when CORS / origins block the extension).
 * @param {string} [message]
 * @returns {boolean}
 */
export function isOllamaBrowserExtension403Error(message) {
  if (!message || typeof message !== 'string') return false;
  return (
    message.includes('Ollama API error (403)') ||
    (message.includes('Ollama error:') && message.includes('API error (403)'))
  );
}

function escapeHtmlOllama(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

/**
 * Call-to-action to switch AI provider to cloud and regenerate (dispatched via data-thinkreview-action on the button).
 * @returns {string}
 */
export function getOllamaSwitchToCloudCalloutHtml() {
  return `
    <div class="thinkreview-ollama-error-cloud-fallback" role="region" aria-label="Cloud AI alternative">
      <p class="thinkreview-ollama-error-cloud-fallback-text">Need a review right away? Use <strong>Cloud AI</strong> for instant hosted reviews—no local Ollama setup required.</p>
      <button type="button" class="thinkreview-ollama-switch-to-cloud-btn thinkreview-ollama-switch-to-cloud-btn--inline-error" data-thinkreview-action="switch-to-cloud-ai" aria-label="Switch to Cloud AI and regenerate this review">Switch to Cloud AI</button>
    </div>`;
}

/**
 * Polished HTML for non-CORS Ollama errors shown in the integrated panel.
 * @param {string} message - Raw error string from OllamaService / background
 * @returns {string}
 */
export function getOllamaGenericErrorDisplayHtml(message) {
  const callout = getOllamaSwitchToCloudCalloutHtml();
  const raw = message || '';

  if (/Cannot connect to Ollama at the configured URL/i.test(raw)) {
    const urlMatch = raw.match(/Try accessing\s+([^\s]+)\s+in your browser/i);
    const url = urlMatch ? escapeHtmlOllama(urlMatch[1].trim()) : 'http://localhost:11434';
    return `
    <div class="thinkreview-ollama-error-polished">
      <p class="thinkreview-ollama-error-polished-title">Couldn’t connect to Ollama</p>
      <p class="thinkreview-ollama-error-polished-lead">ThinkReview couldn’t reach your local Ollama server using the URL in your extension settings. Make sure Ollama is running and the base URL is correct.</p>
      <ul class="thinkreview-ollama-error-polished-list">
        <li><strong>Start Ollama</strong> — run <code>ollama serve</code> or open the Ollama app</li>
        <li><strong>Check settings</strong> — open ThinkReview settings and verify the Ollama URL</li>
        <li><strong>Test in your browser</strong> — try <strong>${url}</strong></li>
      </ul>
    </div>${callout}`;
  }

  if (/Cannot connect to Ollama\. Please ensure/i.test(raw)) {
    return `
    <div class="thinkreview-ollama-error-polished">
      <p class="thinkreview-ollama-error-polished-title">Couldn’t connect to Ollama</p>
      <p class="thinkreview-ollama-error-polished-lead">Your local Ollama server didn’t respond. Start Ollama and confirm the URL in extension settings, then try again.</p>
      <ul class="thinkreview-ollama-error-polished-list">
        <li>Run <code>ollama serve</code> or launch the Ollama desktop app</li>
        <li>Verify the Ollama URL under ThinkReview settings</li>
      </ul>
    </div>${callout}`;
  }

  if (/^Model error:/i.test(raw) || /Make sure the selected model is installed/i.test(raw)) {
    return `
    <div class="thinkreview-ollama-error-polished">
      <p class="thinkreview-ollama-error-polished-title">Ollama model issue</p>
      <p class="thinkreview-ollama-error-polished-lead">There was a problem with the model you selected. Details below.</p>
      <pre class="thinkreview-ollama-error-raw">${escapeHtmlOllama(raw)}</pre>
    </div>${callout}`;
  }

  return `
    <div class="thinkreview-ollama-error-polished">
      <p class="thinkreview-ollama-error-polished-title">Something went wrong with Ollama</p>
      <pre class="thinkreview-ollama-error-raw">${escapeHtmlOllama(raw)}</pre>
    </div>${callout}`;
}

/**
 * Markdown help for chat (processed by markdownToHtml).
 * @returns {string}
 */
export function getOllamaCorsHelpMarkdown() {
  return `**Important:** Browser extensions require CORS to be enabled.

**Where to run these commands:** use **Terminal** (macOS), your terminal app (**Linux**), **Windows PowerShell**, or **Command Prompt** — not the browser devtools console.

##### Step 1: Stop Ollama
**macOS & Linux**
\`\`\`bash
${OLLAMA_STOP_COMMAND}
\`\`\`
**Windows (PowerShell)**
\`\`\`powershell
${OLLAMA_STOP_COMMAND_WIN_PS}
\`\`\`

##### Step 2: Start Ollama with CORS enabled for browser extensions
**macOS & Linux**
\`\`\`bash
${OLLAMA_CORS_START_COMMAND}
\`\`\`
**Windows (PowerShell)**
\`\`\`powershell
${OLLAMA_CORS_START_COMMAND_WIN_PS}
\`\`\`

##### Windows (Command Prompt)
**Step 1: Stop Ollama**
\`\`\`cmd
${OLLAMA_STOP_COMMAND_WIN_CMD}
\`\`\`

**Step 2: Start Ollama with CORS enabled**
\`\`\`cmd
${OLLAMA_CORS_START_COMMAND_WIN_CMD}
\`\`\``;
}

/**
 * Static HTML for the review error panel (no user input; safe to inject).
 * PowerShell rows sit directly under macOS/Linux for each step; copy buttons match popup behavior.
 * @returns {string}
 */
export function getOllamaCorsHelpHtml() {
  return `
    <div class="thinkreview-ollama-cors-help">
      <p class="thinkreview-ollama-cors-lead"><strong>Important:</strong> Browser extensions require CORS to be enabled.</p>
      <p class="thinkreview-ollama-cors-where"><strong>Where to run:</strong> use <strong>Terminal</strong> (macOS), your terminal app (<strong>Linux</strong>), <strong>Windows PowerShell</strong>, or <strong>Command Prompt</strong> — not the browser devtools console.</p>

      <p class="thinkreview-ollama-cors-step-title">Step 1: Stop Ollama</p>
      <p class="thinkreview-ollama-cors-sublabel">macOS &amp; Linux</p>
      ${corsCopyRow('unix-stop')}
      <p class="thinkreview-ollama-cors-sublabel">Windows (PowerShell)</p>
      ${corsCopyRow('ps-stop')}

      <p class="thinkreview-ollama-cors-step-title">Step 2: Start Ollama with CORS enabled for browser extensions</p>
      <p class="thinkreview-ollama-cors-sublabel">macOS &amp; Linux</p>
      ${corsCopyRow('unix-start')}
      <p class="thinkreview-ollama-cors-sublabel">Windows (PowerShell)</p>
      ${corsCopyRow('ps-start')}

      <p class="thinkreview-ollama-cors-os-label">Windows (Command Prompt)</p>
      <p class="thinkreview-ollama-cors-sublabel">Step 1: Stop Ollama</p>
      ${corsCopyRow('cmd-stop')}
      <p class="thinkreview-ollama-cors-sublabel">Step 2: Start Ollama with CORS enabled</p>
      ${corsCopyRow('cmd-start')}
      ${getOllamaSwitchToCloudCalloutHtml()}
    </div>
  `;
}
