#!/usr/bin/env bash
# Creates a tracking GitHub issue for a pull request (same repository).
# Skips when the PR only changes manifest version and release-notes markdown.
# Idempotent: looks for a hidden HTML marker in an existing issue for this PR.

set -euo pipefail

: "${GITHUB_REPOSITORY:?}"
: "${PR_NUMBER:?}"
: "${PR_TITLE:?}"
: "${PR_URL:?}"
: "${PR_BODY:=}"
: "${DEFAULT_ASSIGNEE:?}"

# Searchable idempotency token (must appear in issue body for duplicate detection).
TRACKING_REF="thinkreview-pr-tracking:${PR_NUMBER}"

# --- Idempotency: issue already created for this PR? ---
existing="$(
  gh api "/search/issues" --method GET \
    -f q="repo:${GITHUB_REPOSITORY} is:issue \"${TRACKING_REF}\" in:body" \
    --jq '.items[0].number // empty' 2>/dev/null || true
)"
if [[ -n "${existing}" ]]; then
  echo "Tracking issue already exists: #${existing}"
  exit 0
fi

# --- Skip release-notes + manifest-only PRs ---
mapfile -t files < <(
  gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files" --paginate --jq '.[].filename'
)

if [[ "${#files[@]}" -eq 0 ]]; then
  echo "No files in PR diff; creating tracking issue anyway."
else
  release_only=true
  for f in "${files[@]}"; do
    if [[ "${f}" == "manifest.json" ]]; then
      continue
    fi
    if [[ "${f}" =~ ^release\ notes/release_notes_.*\.md$ ]]; then
      continue
    fi
    release_only=false
    break
  done
  if [[ "${release_only}" == true ]]; then
    echo "Skipping: PR only touches manifest.json and/or release notes markdown."
    exit 0
  fi
fi

# --- Build issue body ---
body_file="$(mktemp)"
{
  printf '%s\n\n' "This issue was opened automatically to track the following pull request."
  printf '%s\n\n' "**Pull request:** #${PR_NUMBER}"
  printf '%s\n\n' "**URL:** ${PR_URL}"
  printf '%s\n\n' "## Pull request title"
  printf '%s\n\n' "${PR_TITLE}"
  printf '%s\n\n' "## Description (from the pull request)"
  if [[ -n "${PR_BODY}" ]]; then
    printf '%s\n\n' "${PR_BODY}"
  else
    printf '_No description provided._\n\n'
  fi
  printf '%s\n' "_Automation tracking ref: \`${TRACKING_REF}\`_"
} >"${body_file}"

issue_url="$(
  gh issue create \
    --title "PR #${PR_NUMBER}: ${PR_TITLE}" \
    --body-file "${body_file}" \
    --assignee "${DEFAULT_ASSIGNEE}" \
    | tail -1
)"
rm -f "${body_file}"

issue_num="$(echo "${issue_url}" | sed -n 's|.*/issues/\([0-9][0-9]*\).*|\1|p')"
if [[ -z "${issue_num}" ]]; then
  echo "Failed to parse issue number from: ${issue_url}" >&2
  exit 1
fi

echo "Created tracking issue #${issue_num}"

# --- Link PR to issue (Development / cross-reference) ---
link_line="**Tracking issue:** #${issue_num}"

current_body="$(gh pr view "${PR_NUMBER}" --json body --jq '.body // ""')"
if [[ "${current_body}" == *"${link_line}"* ]] || [[ "${current_body}" == *"(#${issue_num})"* ]]; then
  echo "PR body already references the issue."
  exit 0
fi

if [[ -z "${current_body}" ]]; then
  new_body="${link_line}

Ref #${issue_num}"
else
  new_body="${link_line}

Ref #${issue_num}

${current_body}"
fi

printf '%s' "${new_body}" | gh pr edit "${PR_NUMBER}" --body-file -

echo "Updated PR #${PR_NUMBER} to reference issue #${issue_num}"
