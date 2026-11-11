# ThinkReview - Version 2.3.18 Release Notes

**Release Date:** 13 November 2026

---

## 🎯 What's New

### Connect Git hosts from the extension popup 🔗

You can start **cloud OAuth** for **GitHub**, **GitLab**, **Bitbucket**, and **Azure DevOps** directly from the extension popup. Each platform has its own setup page so cloud and self-hosted options are easier to follow. Badges show **Connect** or **Connected** based on your ThinkReview portal Integrations.

### Bitbucket Cloud reviews through the portal ☁️

On **Bitbucket Cloud** with **ThinkReview Cloud**, reviews can run from the **pull request URL** using your **portal Integrations** when you have not saved a separate API token in the extension. If you prefer a local token, saving one in the popup keeps the original in-browser diff path.

### Clearer Bitbucket connection help 🪣

When Bitbucket is not connected or credentials fail during URL-based reviews, the review panel explains whether to use **portal Integrations** or an **API token in the extension**, with one-click links to the right place.

### Self-hosted setup shows portal credentials 🏢

On **GitHub Enterprise**, **GitLab Self-Managed**, **Azure DevOps Server**, and **Bitbucket Data Center** pages in the popup, you can see which hosts are already connected in ThinkReview portal alongside local domain and token setup.

---

## 🐛 Bug Fixes

- **Azure DevOps Cloud** connection status treats a saved extension PAT as connected, without counting cloud portal tokens toward **Server** setup by mistake.
- **Azure DevOps Server** setup links and help text are restored on the dedicated server page.
- **Bitbucket.org** host detection is more reliable for cloud URL reviews.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
