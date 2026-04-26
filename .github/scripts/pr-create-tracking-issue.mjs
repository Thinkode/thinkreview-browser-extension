#!/usr/bin/env node
/**
 * On pull_request opened: create a tracking issue (unless the PR is
 * release-notes + manifest-only), assign mshenawy22, and comment on the PR.
 */
const ASSIGNEE = 'mshenawy22';
const MARKER = '<!-- pr-issue-automation -->';

const repo = process.env.GITHUB_REPOSITORY;
const prNumber = process.env.PR_NUMBER;
const token = process.env.GITHUB_TOKEN;

if (!repo || !prNumber || !token) {
  console.error('Missing GITHUB_REPOSITORY, PR_NUMBER, or GITHUB_TOKEN');
  process.exit(1);
}

const [owner, repoName] = repo.split('/');
const api = (path, opts = {}) =>
  fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });

async function fetchAllPrFiles() {
  const files = [];
  let url = `/repos/${owner}/${repoName}/pulls/${prNumber}/files?per_page=100`;
  while (url) {
    const res = await api(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`List PR files failed: ${res.status} ${text}`);
    }
    const page = await res.json();
    files.push(...page);
    const link = res.headers.get('link');
    url = null;
    if (link) {
      const next = link.split(',').find((p) => p.includes('rel="next"'));
      if (next) {
        const m = next.match(/<([^>]+)>/);
        if (m) {
          const nextUrl = new URL(m[1]);
          url = `${nextUrl.pathname}${nextUrl.search}`;
        }
      }
    }
  }
  return files;
}

function isReleaseNotesAndManifestOnly(filenames) {
  if (filenames.length === 0) return false;
  for (const f of filenames) {
    if (f === 'manifest.json') continue;
    const lower = f.toLowerCase();
    if (lower.startsWith('release notes/')) continue;
    if (lower.startsWith('release_notes/')) continue;
    return false;
  }
  return true;
}

async function getPullRequest() {
  const res = await api(
    `/repos/${owner}/${repoName}/pulls/${prNumber}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get PR failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function prAlreadyHasTrackingComment() {
  const res = await api(
    `/repos/${owner}/${repoName}/issues/${prNumber}/comments?per_page=100`,
  );
  if (!res.ok) return false;
  const comments = await res.json();
  return comments.some(
    (c) =>
      typeof c.body === 'string' &&
      c.body.includes('Automatically created tracking issue:'),
  );
}

async function createIssue(title, body) {
  const res = await api(`/repos/${owner}/${repoName}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      body,
      assignees: [ASSIGNEE],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create issue failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function commentOnPr(body) {
  const res = await api(
    `/repos/${owner}/${repoName}/issues/${prNumber}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Comment on PR failed: ${res.status} ${text}`);
  }
}

async function main() {
  if (await prAlreadyHasTrackingComment()) {
    console.log('PR already has a tracking-issue comment; skipping.');
    return;
  }

  const prFiles = await fetchAllPrFiles();
  const filenames = prFiles.map((f) => f.filename);
  if (isReleaseNotesAndManifestOnly(filenames)) {
    console.log(
      'Skipping: changed files are only manifest.json and/or release notes.',
    );
    return;
  }

  const pr = await getPullRequest();
  const issueTitle = `[PR #${prNumber}] ${pr.title}`;
  const prAuthor = pr.user?.login || 'unknown';
  const headRef = pr.head?.ref || '';
  const baseRef = pr.base?.ref || '';

  const description =
    (pr.body && pr.body.trim()) || '_No description provided in the PR._';

  const issueBody = [
    `This issue tracks **pull request #${prNumber}** in the same repository (reverse link from PR → issue).`,
    '',
    '## Pull request',
    `- **Title:** ${pr.title}`,
    `- **Author:** @${prAuthor}`,
    `- **Branch:** \`${headRef}\` → \`${baseRef}\``,
    '',
    '## What this change is about',
    description,
    '',
    '## Link',
    `- Pull request: #${prNumber}`,
    '',
    MARKER,
  ].join('\n');

  const issue = await createIssue(issueTitle, issueBody);
  const issueNum = issue.number;
  const issueUrl = issue.html_url;

  await commentOnPr(
    [
      `Automatically created tracking issue: #${issueNum}`,
      '',
      `This links the PR to an issue for planning and traceability. See ${issueUrl}`,
    ].join('\n'),
  );

  console.log(`Created issue #${issueNum} and commented on PR #${prNumber}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
