# ThinkReview - Version 2.2.7.1 Release Notes

**Release Date:** 22 May 2026

---

## 🎯 What's New

### Azure DevOps (cloud): reviews use your Personal Access Token again 🔑

On `dev.azure.com` and `*.visualstudio.com`, ThinkReview now loads pull request details using the **Personal Access Token** you save in the extension—matching how on‑premises Azure DevOps already works. This keeps authentication consistent and avoids cases where the browser session alone was unreliable.

### Clearer “setup needed” state for Azure DevOps Cloud ⚙️

The extension popup shows **Setup needed** for Azure DevOps Cloud until a PAT is saved, and the in‑popup guide walks you through creating a token and opening a pull request before you run a review.

### Tougher handling when Azure returns a sign‑in page instead of data 🛡️

If Azure responds with an HTML sign‑in or error page while the extension expected API data, you now get a clearer token‑related message instead of a confusing failure.

### PAT encoding that works with more tokens ✨

Personal Access Tokens that include special characters are encoded more safely for Azure DevOps API calls, which reduces odd authentication failures after you paste a new token.

### Small wording tweaks in the popup ✍️

The Azure DevOps Cloud onboarding steps were reordered to match PAT‑first setup, and the final step now tells you explicitly to use the **ThinkReview** button to start a review.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
