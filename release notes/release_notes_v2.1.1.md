# ThinkReview - Version 2.1.1 Release Notes

**Release Date:** 13 April 2026

---

## 🎯 What's New

### Bitbucket Data Center (self-hosted) 🏢

ThinkReview now supports **Bitbucket Data Center** on your own domain, in addition to **Bitbucket Cloud** on bitbucket.org.

- **Add your instance:** In the extension popup, open **Bitbucket Data Center** settings and add your server’s hostname (for example `bitbucket.company.com`). The extension will request permission for that origin so reviews can load your pull requests securely.
- **Sign in with an HTTP access token:** Create a token in Bitbucket with **Repository read** and **Pull request read**, then save it in the popup—no need to mix Cloud app passwords with Data Center.
- **Same review experience:** Open a pull request on your Data Center site and use ThinkReview like you already do on Cloud; diffs are fetched in the background so page security policies do not block the review.

---

## 🔧 Additional Improvements

- **Clearer Bitbucket setup:** Cloud and Data Center each have their own settings and guidance in the popup, so it is easier to see what applies to your environment.
- **More reliable diff handling:** Data Center’s API returns structured diff data; the extension turns that into a normal patch for the reviewer, including multi-page diffs when needed.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
