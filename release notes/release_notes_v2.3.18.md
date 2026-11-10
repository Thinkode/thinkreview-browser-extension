# ThinkReview - Version 2.3.18 Release Notes

**Release Date:** 13 November 2026

---

## 🎯 What's New

### Bitbucket Cloud reviews from the pull request URL ☁️

ThinkReview can now run AI reviews on **Bitbucket Cloud** pull requests by sending the **PR URL** to the cloud when you use **ThinkReview Cloud** and have connected Bitbucket in **portal Integrations**. You no longer need a saved API token in the extension popup for that path—reviews can start with your portal connection alone.

### Your extension token still works 🔑

If you prefer to keep a **Bitbucket API token** in the extension popup, ThinkReview continues to fetch the diff locally, just like before. Portal Integrations and a popup token are both supported.

### Clearer Bitbucket connection help 🔗

When Bitbucket is not connected or credentials are missing for a URL-based review, the review panel explains what went wrong. You can open **ThinkReview Integrations** in the portal with one click, or switch to saving an **API token** in the extension when that fits your setup.

---

## 🐛 Bug Fixes

- **Bitbucket Cloud** pull requests on `bitbucket.org` are recognized reliably for URL-based cloud reviews.
- Connection errors during URL-based Bitbucket reviews show **integration-focused** guidance instead of only a generic token prompt.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
