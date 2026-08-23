# ThinkReview - Version 2.3.9 Release Notes

**Release Date:** 26 August 2026

---

## 🎯 What's New

### Suggested follow-up questions on Severity reviews 💬

Severity reviews now show the same suggested follow-up questions you already get with Scoring. After a review finishes, you'll see a ready-to-post MR comment prompt plus up to three AI-generated questions you can click to keep digging. Those questions are included when you copy or export the review as markdown, so they stay with the write-up you share.

### Large and long cloud reviews keep running ⏳

ThinkReview Cloud reviews that take longer than a typical browser request no longer fail silently. The extension keeps checking until the review is ready, so you can stay on the PR instead of starting over. If the wait stretches, the loader explains that the review is still running in the cloud.

### Clearer status while a review is in progress 📋

While a cloud review is running, the loader can now tell you what's going on in one place:

- **Large PRs:** When the patch is especially big (over 100 KB), you'll see a note with the size and how many lines changed.
- **Long waits:** After a couple of minutes on smaller PRs, you'll see a short "still running" message instead of wondering if anything happened.

Those notes are combined into a single status card so they don't stack as duplicate banners.

---

## 🐛 Bug Fixes

- Cloud reviews that time out in the browser now wait for the finished result instead of showing a failed review.
- Regenerating a review no longer picks up an older cached result from a previous attempt.
- Severity reviews no longer break when suggested questions are missing.
- Local Ollama, OpenRouter, and self-hosted reviews no longer wait on ThinkReview Cloud status checks.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
