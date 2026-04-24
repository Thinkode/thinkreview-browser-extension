#!/usr/bin/env node
/**
 * Exit 0 if the PR should NOT get a tracking issue (release-notes + manifest style only).
 * Exit 1 if a tracking issue should be created.
 * Reads filenames as newline-separated stdin (one path per line).
 */

import { readFileSync } from 'node:fs';

const raw = readFileSync(0, 'utf8');
const files = raw
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

if (files.length === 0) {
  process.exit(1);
}

function isReleaseOnlyPath(path) {
  const base = path.split('/').pop() || path;
  const lower = base.toLowerCase();

  if (base === 'manifest.json') return true;
  if (base === 'package.json') return true;
  if (base === 'package-lock.json') return true;
  if (base === 'npm-shrinkwrap.json') return true;

  if (/^changelog/.test(lower) && /\.(md|txt|rst)$/.test(lower)) return true;
  if (/release.?notes?/.test(lower) && /\.(md|txt)$/.test(lower)) return true;
  if (/^releases?\./.test(lower) && /\.(md|txt)$/.test(lower)) return true;

  return false;
}

const allReleaseOnly = files.every(isReleaseOnlyPath);
process.exit(allReleaseOnly ? 0 : 1);
