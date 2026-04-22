# ThinkReview - Version 2.2.3 Release Notes

**Release Date:** 25 April 2026

---

## 🎯 What's New

### More reliable ThinkReview button after install or update 🧩

Right after an extension update or fresh install, the review entry point could occasionally fail to appear until you refreshed the page. The extension now waits for content scripts to finish registering and, if the page is still warming up, watches for the right moment to inject the controls—then cleans up automatically when you navigate elsewhere.

### Manual reviews no longer get “lost” behind an automatic run 🔄

If ThinkReview was already working through an automatic review (for example fetching the patch) and you clicked to start a review yourself, that manual request could be ignored. Manual intent is now remembered and runs right after the in-flight work finishes (without duplicating a review you already have, unless you asked to regenerate).

### GitLab: clearer Ollama connection help on styled merge requests 🎨

On GitLab, host page styling could make the Ollama CORS troubleshooting snippet hard to read inside the integrated review panel. Styling is isolated so those instructions stay legible in light and dark themes.

### “Implement in your IDE” actions: steadier behind-the-scenes telemetry 📊

The quick actions that open a suggestion in Cursor, Claude Code, or GitHub Copilot Chat now record usage events through a simpler, more dependable path—so we can keep improving those integrations based on real usage (including when a prompt is shortened to fit IDE limits).

### Fresher in-product demo 🖼️

The demo animation shown in onboarding and related surfaces is updated to a smaller, faster-loading GIF.

---

## 🔧 Additional improvements

- **Start review automatically** now defaults to **Off** until you explicitly turn it on in the popup (unset storage is treated as off, matching the default selection in settings). If you liked reviews starting immediately without ever opening settings, open the popup once and switch **Start review automatically** to **On**.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
