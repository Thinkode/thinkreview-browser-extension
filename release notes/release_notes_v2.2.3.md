# ThinkReview - Version 2.2.3 Release Notes

**Release Date:** 25 April 2026

---

## 🎯 What's New

### More reliable ThinkReview on the page (especially after updates) 🧩

We tightened how the extension registers its scripts when the browser starts or after an update, and added a smarter fallback that watches the page briefly if the ThinkReview controls are not ready yet. Together, this reduces cases where the review entry point did not show up until you refreshed.

### Manual reviews no longer get "lost" behind an automatic run 🔄

If ThinkReview is already working on a review (for example, an automatic review is in progress) and you try to start one manually, we now remember that intent and follow through when the current run finishes—without starting duplicate work when a review is already on screen.

### Clearer Ollama setup guidance on GitLab 🦊

On GitLab merge requests, the on-page guidance for Ollama and CORS-related setup steps is easier to read and less likely to be visually overridden by the host site's styling.

### Simpler default for "Start review automatically" ⚙️

For people who have not changed this setting yet, automatic review start now defaults to **Off**, matching the extension popup. If you already chose **On**, your choice is preserved.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
