# ThinkReview - Version 2.3.11 Release Notes

**Release Date:** 20 September 2026

---

## 🎯 What's New

### Post a finding as a PR comment in one click 💬

Severity and scoring findings now include a **Post** control. Click it to publish that item as a **conversation comment** on the pull request or merge request you already have open — GitHub, GitLab, or Azure DevOps.

The comment is the finding you just read (title, file, line range, and explanation). Nothing is written until you click. While it posts, a short toast with a spinner appears in the panel so you can keep reading.

Post uses your **Full Context** connection:

- **GitHub App** comments appear as ThinkReview (the App needs comment write on the repo)
- **GitHub PAT, GitLab OAuth / PAT, and Azure PAT** comments appear as you
- **GitLab OAuth** needs the `api` scope — reconnect GitLab if you connected before this release
- Bitbucket reviews still run in the panel; posting from a finding is GitHub, GitLab, and Azure in this version

If Full Context is not set up yet, Post opens the setup hint instead of failing silently.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
