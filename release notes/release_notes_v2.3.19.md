# ThinkReview - Version 2.3.19 Release Notes

**Release Date:** 16 November 2026

---

## 🎯 What's New

### ThinkReview portal knows when the extension is installed ✨

On **app.thinkreview.dev**, the portal can tell whether **ThinkReview** is installed in your browser. Pages update automatically when you install or remove the extension, so setup prompts and shortcuts stay accurate.

### Open the extension from the portal 🧭

A **Open extension** action on the portal works more reliably. It listens on both the page and the document, with safeguards so repeated clicks do not flood the extension.

---

## 🐛 Bug Fixes

- The portal no longer shows the extension as installed after an **extension reload or update** left the old page in a stale state.
- **Presence checks** from an outdated page context are ignored so status stays correct.
- Portal auth script timing is adjusted so the **installed signal appears sooner** when you load the app.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
