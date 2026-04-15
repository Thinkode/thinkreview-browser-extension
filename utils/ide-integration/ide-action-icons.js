/**
 * IDE toolbar icons: SVGs live in /assets; we fetch once and inject inline <svg>
 * so path fills use `currentColor` and match --thinkreview-text-secondary on the button.
 * (Using <img src="…svg"> breaks theming: currentColor does not inherit from the page.)
 */

const NS = 'http://www.w3.org/2000/svg';

/** @type {{ cursor: SVGSVGElement, claude: SVGSVGElement, copilot: SVGSVGElement } | null} */
let templates = null;

function buildToolbarSvgFromRoot(srcSvg) {
  const svg = document.createElementNS(NS, 'svg');
  const vb = srcSvg.getAttribute('viewBox');
  if (vb) svg.setAttribute('viewBox', vb);
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.style.display = 'block';
  for (const path of srcSvg.querySelectorAll('path')) {
    const d = path.getAttribute('d');
    if (!d) continue;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'currentColor');
    const fr = path.getAttribute('fill-rule');
    if (fr) p.setAttribute('fill-rule', fr);
    svg.appendChild(p);
  }
  return svg;
}

async function loadSvgAsset(relativePath, getExtensionUrl) {
  const url = getExtensionUrl(relativePath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${relativePath}: ${res.status}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error(`Invalid SVG: ${relativePath}`);
  const root = doc.querySelector('svg');
  if (!root) throw new Error(`No svg root: ${relativePath}`);
  return buildToolbarSvgFromRoot(root);
}

/**
 * Call once (e.g. from each IDE integration factory) before create*IconSvg().
 * @param {(path: string) => string} [getExtensionUrl]
 */
export async function ensureIdeActionIconsLoaded(getExtensionUrl = (p) => chrome.runtime.getURL(p)) {
  if (templates) return;
  const [cursor, claude, copilot] = await Promise.all([
    loadSvgAsset('assets/cursor.svg', getExtensionUrl),
    loadSvgAsset('assets/claude-code.svg', getExtensionUrl),
    loadSvgAsset('assets/github-copilot.svg', getExtensionUrl)
  ]);
  templates = { cursor, claude, copilot };
}

function requireTemplates() {
  if (!templates) {
    throw new Error('ide-action-icons: call ensureIdeActionIconsLoaded() before creating icons');
  }
}

export function createCursorProductIconSvg() {
  requireTemplates();
  return templates.cursor.cloneNode(true);
}

export function createClaudeCodeIconSvg() {
  requireTemplates();
  return templates.claude.cloneNode(true);
}

export function createGitHubCopilotIconSvg() {
  requireTemplates();
  return templates.copilot.cloneNode(true);
}
