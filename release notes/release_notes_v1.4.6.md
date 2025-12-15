# ThinkReview v1.4.6 – Release Notes

## GitHub PR Support (Beta)
- Added full GitHub Pull Request integration alongside GitLab and Azure DevOps.
- Implemented `github-detector.js` to detect GitHub PR pages and extract metadata (title, branches, status, author).
- Updated the background script to handle `FETCH_GITHUB_DIFF` and fetch `.diff` files via the background page to avoid CORS issues.

## Unified Platform Detection
- Extended `platform-detector.js` with:
  - `isOnPRPage()` – detects if the current page is any supported PR/MR page.
  - `isOnGitHubPRPage()`, `isOnAzureDevOpsPRPage()`, `isOnGitLabMRPage()` – platform-specific PR/MR checks.
- Refactored `content.js` to rely on these helpers instead of direct `platform === 'github'` style checks.

## SPA Navigation Auto-Review Fix (GitHub & Azure DevOps)
- Fixed bug where AI reviews only auto-started on direct PR URLs or refresh, but not when navigating from non-PR pages.
- SPA navigation monitoring now initializes based on domain (`isGitHubSite()`, `isAzureDevOpsSite()`) so it runs on all GitHub/Azure pages.
- Made `checkAndTriggerReviewForNewPR()` async and ensured it awaits `injectIntegratedReviewPanel()` so the review reliably auto-runs when entering a PR.

## Patch Handling & Filtering Improvements
- Updated `getPatchUrl()` to use `.diff` for GitHub PRs and `.patch` for GitLab MRs based on platform detection.
- Reused and applied existing patch filtering logic for GitHub and GitLab to consistently exclude media/binary changes from reviews.

## Score Popup Behavior
- When navigating away from a PR page (e.g., to `/pulls` or repository home), the score popup on the AI Review button is now hidden automatically.
- Prevents stale quality scores from appearing outside of PR context.

## Button Visibility & UX Consistency
- AI Review button is always visible on GitHub and Azure DevOps sites (SPA-friendly behavior), while remaining MR-only on GitLab.
- Ensures a consistent entry point to ThinkReview across GitLab, GitHub, and Azure DevOps.

## CSS Refactoring & Maintenance
- Refactored CSS to use custom properties (CSS variables) for common values, eliminating redundancy.
- Replaced 24+ instances of hardcoded `#e0e0e0` color with `--thinkreview-text-secondary` variable.
- Consolidated 18+ instances of `background-color: transparent` and border patterns into reusable variables.
- Removed redundant dark and light theme table styles that duplicated base styles using the same CSS variables.

## Table Display Improvements
- Fixed table overflow issue where wide tables would extend beyond chat message container borders.
- Added overflow handling to chat message containers to ensure tables remain within boundaries while maintaining readability.