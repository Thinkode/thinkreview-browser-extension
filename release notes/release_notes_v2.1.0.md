# ThinkReview - Version 2.1.0 Release Notes

**Release Date:** 10 April 2026

---

## 🎯 What's New

### Clearer “full repository” vs patch-only context 🧭

After you get the first reply in the review chat, ThinkReview now shows a simple banner that explains whether the assistant is using **full repository context** or **patch-only** context.

- **Know what you are getting:** Green state when full-repo tooling is active; informational state when only the diff is in scope.
- **Easy next step:** When you are on patch-only context, you can open the ThinkReview portal to connect your repo for deeper answers.

---

### Review metadata and MR/PR identity 📋

The review panel metadata row can now include your merge request or pull request identifier (for example GitLab **!123** or GitHub **#456**), so it is easier to match what you see in ThinkReview with the item in your host.

---

### Stronger Ollama setup and error help 🔧

If you use a **local Ollama** model, connection and browser security (CORS) issues are easier to understand and fix.

- **Guided troubleshooting:** Clearer copy and copy-friendly commands where they help most (including Windows PowerShell-oriented steps where applicable).
- **Stay productive:** When local AI is not available, you can switch to **ThinkReview Cloud** from the same flows with less guesswork.

---

## 🔧 Additional Improvements

- **Leaner extension package:** Removed unused onboarding, Stripe redirect, and other dead pages that were not part of the live install flow—less clutter in the shipped bundle.
- **Portal link for integrations:** The “full context” path from the review UI now points at the portal **integrations** area for a smoother setup experience.
- **Azure DevOps branding:** Popup and in-extension Azure visuals align with current Azure DevOps artwork.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
