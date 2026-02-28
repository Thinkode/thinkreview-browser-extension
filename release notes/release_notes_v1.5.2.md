# ThinkReview - Version 1.5.2 Release Notes

**Release Date:** 16 February 2026

---

## 🎯 What's New

### Generate PR/MR Description from Review ✨

**One-click description draft:** A new **Generate PR description** button appears next to the **Summary** heading in the review panel. Click it to ask the AI to write a concise, paste-ready PR/MR description based on the current code changes and review context.

- The description is generated using the same AI provider (Cloud or Ollama) as your review
- The result appears in the chat area—copy it and paste directly into your merge request or pull request description field
- No border or heavy styling; the button sits inline with the Summary title for a clean look

---

### Ollama: Option to Disable Auto-Start Review 🖥️

**Control when reviews run with local AI:** When using **Local Ollama**, you can now turn off automatic review start. This is useful if you want to save GPU resources and only run a review when you click the **AI Review** button.

- **Cloud AI:** Reviews still start automatically when you open a PR (unchanged)
- **Local Ollama:** In the popup, under **AI Provider** → **Local Ollama**, use **Start review automatically** and set it to **Off** if you prefer manual start
- **Under the hood:** `getAutoStartReview()` now returns `true` for Cloud (always auto-start) and respects the stored setting for Ollama; trigger logic is simplified for consistent behaviour

---

### Azure DevOps On-Premise & Troubleshooting 🔧

**Better version checks and support:** Improvements for Azure DevOps (including on-premise) and easier access to help.

- **Azure on-premise:** The extension now checks and stores Azure version and API version (`azureOnPremiseVersion` / `azureOnPremiseApiVersion`) in local storage and sends them to the cloud only when missing or invalid, improving compatibility and diagnostics
- **Version logging:** Azure DevOps version logging is routed through the background script to avoid CORS/CSP issues when the content script would otherwise call the external API
- **Error messages:** Error messages now include **expired** where relevant (e.g. token expiry) for clearer troubleshooting
- **Help and troubleshooting:** New **Having Problems?**, **Report a Bug**, and **Privacy FAQ** buttons in the extension give quick access to support and documentation

---

## 🐛 Bug Fixes & Improvements

- **Ollama auto-start:** Fixed behaviour so Cloud AI always auto-starts the review; only Ollama respects the “Start review automatically” setting. Simplified `injectIntegratedReviewPanel` and `checkAndTriggerReviewForNewPR` for a consistent async flow.
- **Azure on-premise:** Version and API version are sent as two separate fields; storage and cloud logging are aligned so the backend receives correct diagnostics.

---

## 📝 Usage Tips

1. **Generate PR description**
   - Run an AI review on your PR, then click **Generate PR description** next to **Summary**
   - Copy the AI response from the chat and paste it into your MR/PR description

2. **Ollama without auto-start**
   - In the popup: **AI Provider** → **Local Ollama** → **Start review automatically** → **Off**
   - Open a PR and click **AI Review** when you want to run the review

3. **Azure DevOps issues**
   - Use **Having Problems?** or **Report a Bug** from the extension for guided help and to send diagnostics (including version info when applicable)

---

## 📞 Support

Having issues or suggestions? We'd love to hear from you:

- **Bug Reports**: Click the "Report a Bug" button in the review panel or footer
- **Feedback Form**: [Share Your Feedback](https://thinkreview.dev/feedback)
- **Rate Us**: Leave a review on the Chrome Web Store

---

**Thank you for using ThinkReview!** 🚀

*Generate PR descriptions in one click, control Ollama auto-start, and get better Azure on-premise and troubleshooting support.*
