/**
 * GitHub Actions: when a pull request is opened, create a tracking issue
 * that documents the PR and comment on the PR with the issue link.
 *
 * Skips "release hygiene" PRs that only touch manifest version, package
 * metadata, lockfile, or files under `release notes/`.
 *
 * Env: GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_API_URL (optional)
 */
import { readFile } from 'node:fs/promises';

const ASSIGNEE = 'mshenawy22';

const RELEASE_ONLY_PATH_RE = [
  /^manifest\.json$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^release notes\//,
];

function isReleaseOnlyPath(filename) {
  return RELEASE_ONLY_PATH_RE.some((re) => re.test(filename));
}

function shouldSkipIssueForFiles(files) {
  if (!files.length) return false;
  return files.every((f) => isReleaseOnlyPath(f.filename));
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}

async function githubFetch(path, token, { method = 'GET', body } = {}) {
  const base = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function listPullRequestFiles(owner, repo, pullNumber, token) {
  const all = [];
  let page = 1;
  for (;;) {
    const batch = await githubFetch(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`,
      token
    );
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return all;
}

function buildIssueBody(pr) {
  const desc = pr.body?.trim() ? pr.body : '_No description provided._';
  return [
    '## Summary',
    '',
    'This issue was opened automatically to track the pull request below.',
    '',
    '## Pull request',
    '',
    `- **Title:** ${pr.title}`,
    `- **Author:** @${pr.user.login}`,
    `- **URL:** ${pr.html_url}`,
    '',
    '## Pull request description',
    '',
    desc,
    '',
    '---',
    '',
    `_Auto-generated from pull request #${pr.number} when it was opened._`,
  ].join('\n');
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repoFull = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  if (!eventPath || !repoFull || !token) {
    console.error('Missing GITHUB_EVENT_PATH, GITHUB_REPOSITORY, or GITHUB_TOKEN.');
    process.exit(1);
  }

  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const pr = event.pull_request;
  if (!pr) {
    console.log('No pull_request in event payload; exiting.');
    return;
  }

  const [owner, repo] = repoFull.split('/');
  const pullNumber = pr.number;

  const files = await listPullRequestFiles(owner, repo, pullNumber, token);
  if (shouldSkipIssueForFiles(files)) {
    console.log(
      'Skipping issue creation: all changed files are release-only (manifest, package files, or release notes).'
    );
    return;
  }

  const issueTitle = truncate(`[PR #${pullNumber}] ${pr.title}`, 250);
  const issue = await githubFetch(`/repos/${owner}/${repo}/issues`, token, {
    method: 'POST',
    body: {
      title: issueTitle,
      body: buildIssueBody(pr),
      assignees: [ASSIGNEE],
    },
  });

  const issueNum = issue.number;
  const issueUrl = issue.html_url;

  await githubFetch(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, token, {
    method: 'POST',
    body: {
      body: `Tracking issue created: #${issueNum}\n\n${issueUrl}`,
    },
  });

  console.log(`Created issue #${issueNum} and linked it from PR #${pullNumber}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
