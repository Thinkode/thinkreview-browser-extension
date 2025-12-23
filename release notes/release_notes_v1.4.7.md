## ThinkReview - Version 1.4.7 Release Notes

**Release Date:** 23 December 2025  

---

### 🔄 PR Navigation & Memory Management

- **Cleared stale patch data when switching PRs:** When you navigate from one PR/MR to another, the extension now clears any in-memory patch content and conversation history, reducing the chance of stale context leaking between reviews.
- **Improved SPA navigation handling:** The PR-change detection logic was tightened so that navigating between PRs in single-page app flows (e.g. GitHub/Azure DevOps) keeps patch content aligned with the currently open PR.

---

### ⚡ Performance & UX Improvements

- **Debounced character counter updates:** Replaced a chat-input `input` listener that updated on every keystroke with a debounced version, reducing unnecessary DOM work and improving typing responsiveness in the review chat.
- **Guarded debug-only DOM access:** Wrapped certain DOM debug queries behind the global debug flag to avoid performing unnecessary work in production builds.
- **Massive GitHub PR performance gains:** These optimizations significantly improve responsiveness on GitHub PR pages, especially when typing in the AI review chat or navigating between PRs.

---

### 🧹 Internal Cleanups

- **Code review flow hardening:** Minor internal refinements to the review trigger path and in-memory state management for the integrated review panel, making the behavior more predictable across repeated reviews and navigation events.

---

If you notice any issues with PR detection, navigation between PRs, or the integrated chat experience, please report them via the in-panel “Report a 🐞” button or on the ThinkReview support channels.


