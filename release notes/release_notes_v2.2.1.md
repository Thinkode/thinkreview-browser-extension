# ThinkReview - Version 2.2.1 Release Notes

**Release Date:** 23 April 2026

---

## 🎯 What's New

### Leaner extension permissions 🔒

The extension no longer includes the Stripe checkout flow or the extra browser permission that was only needed to detect a successful checkout. Subscription management stays on the ThinkReview web app and your existing account flow—this update keeps the extension focused on reviews and asks the browser for fewer capabilities.

### Integrated review panel (left layout) ↔️

When you dock the review panel on the **left** side of the page, resizing now behaves the same predictable way as on the right: drag the edge to widen or narrow the panel without the handle fighting your cursor.

### Azure DevOps review lists 🧾

On Azure DevOps, suggestion and checklist sections could show **double bullets** after aggressive page styling. List styling is tightened so those sections read cleanly again.

### Popup reliability when adding domains ✅

Adding custom domains (GitHub Enterprise, Azure DevOps, Bitbucket Data Center, and related flows) could sometimes leave buttons stuck in a **“Adding…”** state after a permission prompt was declined or an error occurred. Button state now resets reliably so you can try again without reopening the popup.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
