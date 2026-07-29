/**
 * Severity review layout — PR description + Critical / High / Low issues.
 * Loaded via chrome.runtime.getURL for Firefox-safe dynamic imports.
 */

/**
 * @param {{ filePath?: string, startLine?: number, endLine?: number }} issue
 * @returns {string}
 */
function formatLocation(issue) {
  if (!issue || !issue.filePath) return '';
  const start = typeof issue.startLine === 'number' ? issue.startLine : null;
  const end = typeof issue.endLine === 'number' ? issue.endLine : start;
  if (start == null) return issue.filePath;
  if (end != null && end !== start) {
    return `${issue.filePath}:${start}-${end}`;
  }
  return `${issue.filePath}:${start}`;
}

/**
 * Build a severity issue list section
 * @param {string} title
 * @param {string} severityClass - CSS modifier (critical|high|low)
 * @param {Array} issues
 * @param {Object} handlers
 * @param {Function} [handlers.onIssueClick]
 * @param {Function} [handlers.markdownToHtml]
 * @param {Function} [handlers.preprocessAIResponse]
 * @param {Function} [handlers.attachCopyButtonToItem]
 * @returns {HTMLElement|null}
 */
function buildIssueSection(title, severityClass, issues, handlers = {}) {
  const section = document.createElement('div');
  section.className = `gl-mb-4 thinkreview-severity-section thinkreview-severity-${severityClass}`;

  const heading = document.createElement('h5');
  heading.className = 'gl-font-weight-bold thinkreview-section-title';
  heading.textContent = title;
  section.appendChild(heading);

  if (!Array.isArray(issues) || issues.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'thinkreview-severity-empty';
    empty.textContent = 'None found.';
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement('ul');
  list.className = 'gl-pl-5 thinkreview-section-list thinkreview-severity-list';

  const {
    onIssueClick,
    markdownToHtml,
    preprocessAIResponse,
    attachCopyButtonToItem
  } = handlers;

  issues.forEach((issue) => {
    const li = document.createElement('li');
    li.className = 'thinkreview-severity-issue-item';

    const wrapper = document.createElement('div');
    wrapper.className = 'thinkreview-item-wrapper thinkreview-severity-issue-wrapper';

    const content = document.createElement('div');
    content.className = 'thinkreview-severity-issue-content';

    const titleEl = document.createElement('div');
    titleEl.className = 'thinkreview-severity-issue-title';
    titleEl.textContent = issue.title || 'Untitled issue';
    content.appendChild(titleEl);

    const location = formatLocation(issue);
    if (location) {
      const locEl = document.createElement('div');
      locEl.className = 'thinkreview-severity-issue-location';
      locEl.textContent = location;
      content.appendChild(locEl);
    }

    const descEl = document.createElement('div');
    descEl.className = 'thinkreview-severity-issue-description thinkreview-section-content';
    const descText = issue.description || '';
    if (typeof markdownToHtml === 'function' && typeof preprocessAIResponse === 'function') {
      descEl.innerHTML = markdownToHtml(preprocessAIResponse(descText));
    } else {
      descEl.textContent = descText;
    }
    content.appendChild(descEl);

    if (typeof onIssueClick === 'function') {
      wrapper.classList.add('thinkreview-clickable-item');
      wrapper.setAttribute('title', 'Click to ask a follow-up about this issue');
      wrapper.addEventListener('click', (e) => {
        if (e.target.closest('.thinkreview-copy-btn') || e.target.closest('.thinkreview-ide-assist-btn')) {
          return;
        }
        const plain = [
          issue.title || '',
          location,
          issue.description || ''
        ].filter(Boolean).join('\n');
        onIssueClick(plain, severityClass, issue);
      });
    }

    wrapper.appendChild(content);

    if (typeof attachCopyButtonToItem === 'function') {
      const copySource = document.createElement('div');
      copySource.textContent = [
        issue.title || '',
        location,
        issue.description || ''
      ].filter(Boolean).join('\n\n');
      attachCopyButtonToItem(copySource, wrapper);
    }

    li.appendChild(wrapper);
    list.appendChild(li);
  });

  section.appendChild(list);
  return section;
}

/**
 * Render the severity review layout into a container.
 * @param {HTMLElement} container
 * @param {Object} review - { prDescription, criticalIssues, highIssues, lowIssues }
 * @param {Object} [handlers]
 * @param {Function} [handlers.onIssueClick] - (plainText, severity, issue) => void
 * @param {Function} [handlers.markdownToHtml]
 * @param {Function} [handlers.preprocessAIResponse]
 * @param {Function} [handlers.attachCopyButtonToItem]
 * @param {Function} [handlers.applySimpleSyntaxHighlighting]
 * @returns {HTMLElement|null}
 */
export function renderSeverityLayout(container, review, handlers = {}) {
  if (!container || !review) return null;

  container.replaceChildren();
  container.classList.remove('gl-hidden');

  const {
    markdownToHtml,
    preprocessAIResponse,
    attachCopyButtonToItem,
    applySimpleSyntaxHighlighting,
    onIssueClick
  } = handlers;

  // PR Description section
  const prSection = document.createElement('div');
  prSection.className = 'gl-mb-4 thinkreview-severity-pr-section';

  const prHeader = document.createElement('div');
  prHeader.className = 'thinkreview-section-header-row';

  const prTitle = document.createElement('h5');
  prTitle.className = 'gl-font-weight-bold thinkreview-section-title';
  prTitle.textContent = 'PR Description';
  prHeader.appendChild(prTitle);
  prSection.appendChild(prHeader);

  const prWrapper = document.createElement('div');
  prWrapper.className = 'thinkreview-item-wrapper';
  const prContent = document.createElement('div');
  prContent.className = 'thinkreview-section-content thinkreview-severity-pr-description';
  // Spacing comes from the model (blank lines after sentences); markdownToHtml
  // turns those newlines into breaks — do not regex-split on '.' / '!' / '?'.
  const prText = review.prDescription || 'No PR description provided.';
  if (typeof markdownToHtml === 'function' && typeof preprocessAIResponse === 'function') {
    prContent.innerHTML = markdownToHtml(preprocessAIResponse(prText));
  } else {
    prContent.textContent = prText;
  }
  prWrapper.appendChild(prContent);

  if (typeof attachCopyButtonToItem === 'function') {
    const copySource = document.createElement('div');
    copySource.textContent = prText;
    attachCopyButtonToItem(copySource, prWrapper);
  }

  prSection.appendChild(prWrapper);
  container.appendChild(prSection);

  const issueHandlers = {
    onIssueClick,
    markdownToHtml,
    preprocessAIResponse,
    attachCopyButtonToItem
  };

  container.appendChild(
    buildIssueSection(
      `Critical Issues (${Array.isArray(review.criticalIssues) ? review.criticalIssues.length : 0})`,
      'critical',
      review.criticalIssues,
      issueHandlers
    )
  );
  container.appendChild(
    buildIssueSection(
      `High Issues (${Array.isArray(review.highIssues) ? review.highIssues.length : 0})`,
      'high',
      review.highIssues,
      issueHandlers
    )
  );
  container.appendChild(
    buildIssueSection(
      `Low Issues (${Array.isArray(review.lowIssues) ? review.lowIssues.length : 0})`,
      'low',
      review.lowIssues,
      issueHandlers
    )
  );

  if (typeof applySimpleSyntaxHighlighting === 'function') {
    applySimpleSyntaxHighlighting(container);
  }

  return container;
}

export default { renderSeverityLayout };
