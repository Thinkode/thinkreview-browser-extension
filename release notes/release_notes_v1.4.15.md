# ThinkReview - Version 1.4.15 Release Notes

**Release Date:** 13 February 2026

---

## 🎯 What's New

### Bitbucket Cloud Integration 🪣

**AI code reviews on Bitbucket Cloud:** ThinkReview now supports Bitbucket Cloud (bitbucket.org). You can run AI-powered code reviews directly on your Bitbucket Pull Requests, alongside GitLab, GitHub, and Azure DevOps.

- **Pull Request detection**: The extension detects Bitbucket PR pages and shows the ThinkReview review panel
- **One-time token setup**: Create a Bitbucket API token (or App password) in your Bitbucket settings, then paste it in the ThinkReview popup under the Bitbucket section. Optional: add your Bitbucket account email for Basic auth when required
- **Same workflow**: Use the **AI Review** button on a PR; ThinkReview fetches the diff and runs the review in the sidebar with suggestions, security notes, and best practices
- **Clear prompts**: If the API returns unauthorized (e.g. missing or invalid token), ThinkReview shows a dedicated message and link to the setup guide

**How to get started:**
1. Open the ThinkReview popup and go to the **Bitbucket** section
2. Click **Allow Bitbucket** if prompted, then add your **Bitbucket API token** (and optionally your account email) and click **Save Token**
3. Visit any Pull Request on bitbucket.org and use the **AI Review** button

**Documentation:** [Bitbucket Integration Guide](https://thinkreview.dev/docs/bitbucket-integration) — step-by-step token creation and usage.

**Why this matters:** Teams using Bitbucket Cloud can now use ThinkReview for consistent AI-assisted code review without leaving their PRs.

---

## 🐛 Bug Fixes & Improvements

- **Bitbucket token handling**: Save button no longer grays out; you can update the token or email and save at any time. When only the email is changed, the existing token is kept so you don’t have to re-paste it
- **Bitbucket auth errors**: 401/403 responses from the Bitbucket API now reliably show the token setup prompt and link to the docs
- **Bitbucket settings**: Token and email are stored consistently; success message is simplified to “Token saved”

---

## 📝 Usage Tips

1. **Bitbucket token**
   - Create an API token or App password in Bitbucket: **Personal settings → App passwords / API tokens** with at least **Repository: Read**
   - In ThinkReview popup: **Bitbucket** section → paste token → (optional) add your Bitbucket account email → **Save Token**
   - Reload the Bitbucket PR page after saving if the panel was already open

2. **Token prompt on Bitbucket**
   - If you see “Bitbucket API token required”, open the popup, add or update your token (and email if needed), save, then try the review again

---

## 📞 Support

Having issues or suggestions? We'd love to hear from you:

- **Bug Reports**: Click the "Report a 🐞" button in the review panel
- **Feedback Form**: [Share Your Feedback](https://thinkreview.dev/feedback)
- **Rate Us**: Leave a review on the Chrome Web Store

---

**Thank you for using ThinkReview!** 🚀

*Now supporting Bitbucket Cloud alongside GitLab, GitHub, and Azure DevOps.*
