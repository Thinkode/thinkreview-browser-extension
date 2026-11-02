# ThinkReview - Version 2.3.17 Release Notes

**Release Date:** 5 November 2026

---

## 🎯 What's New

### Azure DevOps reviews from the pull request URL ☁️

ThinkReview can now run AI reviews on **Azure DevOps** pull requests by sending the **PR URL** to the cloud instead of building the full diff only inside your browser. Reviews start more reliably on **Azure DevOps Services**, and you can use **portal Integrations (OAuth)** or a **Personal Access Token** in the extension—both paths are supported together.

### Clearer Azure DevOps connection help 🔗

When Azure DevOps is not connected or your signed-in account cannot access the organization, the review panel explains what went wrong and offers a direct path to **ThinkReview Integrations** in the portal, with an option to **save a PAT** in the extension when OAuth is not enough.

### Review details without a patch size 📋

The review **metadata bar** (timing, model, and related info) now appears for these URL-based Azure DevOps reviews even when there is no traditional patch-size line in the panel.

---

## 🐛 Bug Fixes

- URL-based reviews keep **polling after transient timeouts** instead of stopping on a long wait.
- The extension **reuses cached review results** from polling so a second review run is not started by mistake.
- Reviews no longer **hang on the loading screen** when the cloud returns an empty payload.
- **Azure DevOps Services** host names on `dev.azure.com` are matched more reliably.
- The extension popup shows your **total review count** rounded to **one decimal place** for cleaner numbers.
- A **Personal Access Token** saved in the extension still works alongside **Integrations OAuth** for Azure DevOps.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
