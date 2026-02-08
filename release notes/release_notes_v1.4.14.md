# ThinkReview - Version 1.4.14 Release Notes

**Release Date:** 11 February 2026

---

## 🎯 What's New

### On-Premise Azure DevOps with Custom Domain 🏢

**Enterprise-Ready Azure DevOps Support:** ThinkReview now supports on-premise and custom-domain Azure DevOps instances, not just the cloud-hosted dev.azure.com and visualstudio.com.

- **Custom Domains**: Add your organization’s Azure DevOps host (e.g. `https://devops.yourcompany.com`) in extension settings
- **Same Experience**: Code review, PR detection, and AI review work the same on custom domains as on Azure DevOps cloud
- **Easy Setup**: Enter your custom domain or hostname in the Azure DevOps section of the popup; the extension will request the right permissions and inject the review UI on those pages

**How It Works:**
Open the ThinkReview popup, go to the Azure DevOps section, and add your custom domain (URL or hostname). After granting permission, reload your Azure DevOps pages. ThinkReview will recognize PR pages on your instance and offer the same code review workflow.

**Why This Matters:**
Many teams run Azure DevOps Server or Azure DevOps Services on a custom domain. You can now use ThinkReview for AI-powered code review on those instances without switching to the public Azure DevOps URLs.

---

### Azure DevOps Works Out of the Box 🚀

**Token Optional on Azure DevOps:** ThinkReview works on Azure DevOps organization pages without requiring a Personal Access Token (PAT) up front. You can open the panel and start a review; token setup is optional for when you need full API access.

- **No Token Required to Start**: The extension loads on Azure DevOps PR pages and the review panel opens without a saved token
- **Optional PAT**: Configure a PAT in the popup when you want to fetch diffs via the Azure DevOps API (e.g. for full code review); otherwise the extension still detects PR pages and you can use the panel
- **Clear Errors**: If a token is needed for an action, you’ll see a clear message and a link to set it up in the extension popup

**How It Works:**
Visit any Azure DevOps pull request page (dev.azure.com, visualstudio.com, or your custom domain). ThinkReview detects the PR and shows the review panel. If you haven’t set a token, you can still use the panel; when you trigger a code review that needs the API, you’ll be prompted to add a PAT.

**Why This Matters:**
You can try ThinkReview on Azure DevOps immediately without configuring a token. Set a PAT when you’re ready for full code review; until then, the extension still helps you stay in context on PR pages.

---

## 🐛 Bug Fixes & Improvements

### GitHub PR Subpages: Panel Opens Correctly 📄

**Fixed:** The ThinkReview panel sometimes did not open on GitHub PR subpages such as **Files** and **Changes**, because those URLs were not treated as part of the same pull request.

- **Subpage Detection**: ThinkReview now detects that you are still on a PR when you’re on the "Files" or "Changes" (or similar) subpages of a GitHub pull request
- **Panel Available Everywhere**: The review panel and code review flow are available on these subpages, not only on the main PR conversation tab
- **Consistent Behavior**: You can open the panel and run a review from any tab of the PR (Conversation, Files, Changes, etc.)

**Why This Matters:**
Many reviewers spend time on the Files or Changes view. Previously, the panel could fail to open there, forcing a switch back to the main PR tab. You can now stay on the tab you prefer and still use ThinkReview.

---

## 📝 Usage Tips

1. **Custom Azure DevOps Domains**:
   - Add your on-prem or custom Azure DevOps URL in the extension popup under Azure DevOps
   - Use either full URL (e.g. `https://devops.company.com`) or hostname only
   - Reload Azure DevOps pages after adding a new domain

2. **Azure DevOps Without a Token**:
   - Use the extension on Azure DevOps PR pages without setting a PAT
   - When you’re ready for full code review, add a Personal Access Token in the popup
   - If you see a token-related message, follow the link to open the popup and configure the token

3. **GitHub PR Subpages**:
   - Use ThinkReview from the Files or Changes tab of a GitHub PR
   - The panel and review flow work the same as on the main Conversation tab

---

## 📞 Support

Having issues or suggestions? We'd love to hear from you:

- **Bug Reports**: Click the "Report a 🐞" button in the review panel
- **Feedback Form**: [Share Your Feedback](https://thinkreview.dev/feedback)
- **Rate Us**: Leave a review on the Chrome Web Store

---

**Thank you for using ThinkReview!** 🚀

*Making code reviews more accessible on Azure DevOps (cloud and on-prem) and smoother on GitHub PR subpages.*
