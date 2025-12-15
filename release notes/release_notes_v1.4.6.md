# ThinkReview - Version 1.4.6 Release Notes

**Release Date:** 15 December 2025

---

## 🎯 What's New

### GitHub PR Support (Beta) 🧩

**First-class GitHub support, alongside GitLab and Azure DevOps.**

- **New GitHub PR Integration**: Added full GitHub Pull Request support next to existing GitLab and Azure DevOps integrations.
- **Smart GitHub Detection**: Implemented `github-detector.js` to detect GitHub PR pages and extract key metadata (title, branches, status, author).
- **Reliable Diff Fetching**: Updated the background script to handle `FETCH_GITHUB_DIFF` and fetch `.diff` files via the background page to avoid CORS issues.

**Why This Matters:**

You can now use ThinkReview seamlessly across GitLab, GitHub, and Azure DevOps with consistent AI-powered reviews on your pull/merge requests.

---

### Unified Platform Detection 🌐

**Cleaner, smarter detection across all supported platforms.**

- **Unified PR/MR Detection**: Extended `platform-detector.js` with:
  - `isOnPRPage()` – detects if the current page is any supported PR/MR page.
  - `isOnGitHubPRPage()`, `isOnAzureDevOpsPRPage()`, `isOnGitLabMRPage()` – platform-specific PR/MR checks.
- **Simplified Content Logic**: Refactored `content.js` to rely on these helpers instead of direct `platform === 'github'` style checks.

**Why This Matters:**

Platform-specific logic is now centralized, easier to maintain, and less error-prone, which means more reliable behavior across all supported tools.

---

### SPA Navigation Auto-Review Fix (GitHub & Azure DevOps) 🔄

**AI reviews now trigger reliably when navigating within single-page apps.**

- **Fixed Auto-Start Behavior**: Resolved an issue where AI reviews only auto-started on direct PR URLs or page refresh, but not when navigating from non-PR pages.
- **Domain-Based Initialization**: SPA navigation monitoring now initializes based on domain (`isGitHubSite()`, `isAzureDevOpsSite()`), so it runs across all GitHub/Azure pages.
- **Reliable Review Triggering**: Made `checkAndTriggerReviewForNewPR()` async and ensured it awaits `injectIntegratedReviewPanel()` so reviews consistently auto-run when you enter a PR.

**Why This Matters:**

You get a smoother, more predictable experience when moving between PRs without needing manual refreshes to kick off AI reviews.

---

## ⚡ Performance Improvements

### Patch Handling & Filtering Improvements 🧵

**Smarter patch handling for faster, cleaner reviews.**

- **Platform-Aware Patch URLs**: Updated `getPatchUrl()` to use `.diff` for GitHub PRs and `.patch` for GitLab MRs based on platform detection.
- **Consistent Patch Filtering**: Reused and applied existing patch filtering logic for GitHub and GitLab to consistently exclude media/binary changes from reviews.

**Performance Impact:**

- Less unnecessary data processed during reviews.
- Faster, cleaner analysis focused on the code that actually matters.

---

### Table Display Improvements 📊

**Better handling for wide tables inside the chat.**

- **Fixed Table Overflow**: Resolved an issue where wide tables could extend beyond chat message container borders.
- **Improved Readability**: Added overflow handling to chat message containers to ensure tables stay within boundaries while remaining easy to read.

**Why This Matters:**

Large or wide tabular content is now displayed more cleanly, keeping your review UI tidy and readable.

---

## 🔧 Additional Improvements

### CSS Refactoring & Maintenance 🎨

**A cleaner, more maintainable visual system.**

- **CSS Variables Everywhere**: Refactored CSS to use custom properties (CSS variables) for common values, eliminating redundancy.
- **Color Consolidation**: Replaced 24+ instances of hardcoded `#e0e0e0` color with the `--thinkreview-text-secondary` variable.
- **Reusable Patterns**: Consolidated 18+ instances of `background-color: transparent` and common border patterns into reusable variables.
- **Removed Redundant Styles**: Cleaned up redundant dark and light theme table styles that duplicated base styles using the same CSS variables.

**Why This Matters:**

The UI is easier to evolve, with fewer hardcoded values and more consistent styling across themes and components.

---

## 📝 Usage Tips

1. **Using ThinkReview Across Platforms**:
   - Open a PR/MR on GitHub, GitLab, or Azure DevOps.
   - Look for the ThinkReview AI Review button, which is now consistently available across supported platforms.
   - Trigger an AI review and let the extension handle platform-specific patch fetching and filtering.

2. **Navigating in SPA Environments**:
   - When moving between PRs within GitHub or Azure DevOps, you no longer need to refresh the page to get AI reviews to start.
   - Simply navigate to a new PR and ThinkReview will automatically detect and trigger the appropriate review flow.

3. **Reading Large Tables**:
   - Tables in AI responses will now stay within the chat boundaries.
   - Use horizontal scrolling as needed to inspect wide tables without breaking the layout.

---

## 🐛 Bug Fixes

- **Fixed Auto-Review on SPA Navigation**: Resolved issues where navigation from non-PR pages could prevent AI reviews from auto-running.
- **Stale Score Popup**: When navigating away from a PR page (e.g., to `/pulls` or repository home), the score popup on the AI Review button is now hidden automatically, preventing stale quality scores from appearing outside PR context.
- **Button Visibility Consistency**: Ensured the AI Review button is always visible on GitHub and Azure DevOps sites (SPA-friendly behavior), while remaining MR-only on GitLab for clarity and consistency.
- **Table Overflow**: Fixed visual overflow issues caused by wide tables extending beyond the chat message container.

---

## 📞 Support

Having issues or suggestions? We'd love to hear from you:

- **Bug Reports**: Click the "Report a 🐞" button in the review panel
- **Feedback Form**: [Share Your Feedback](https://thinkreview.dev/feedback)
- **Rate Us**: Leave a review on the Chrome Web Store

---

**Thank you for using ThinkReview!** 🚀

*Making code reviews smarter, more consistent, and better across GitHub, GitLab, and Azure DevOps.*