# ThinkReview - Version 1.5.3 Release Notes

**Release Date:** 20 February 2026

---

## 🎯 What's New

### Azure DevOps: API versions 4.1 through 7.1 🔧

**Broader on-premise and server support:** The extension now supports Azure DevOps REST API versions from **4.1** up to **7.1**, so older on-premise installations (e.g. TFS 2018 Update 2+ with API 4.1) work correctly alongside newer Azure DevOps Server releases.

- **Version-aware requests:** When you use an on-premise or custom Azure DevOps host, the extension uses the cached API version for that server (from the existing version detection). All API calls (pull requests, iterations, changes, diffs, etc.) now send the appropriate `api-version` query parameter instead of a fixed 7.1.
- **Modular version config:** Supported versions (4.1, 5.0, 6.0, 7.0, 7.1) are defined in separate, modular config files under `services/azure-api-versions/`, making it easy to add or adjust version-specific behaviour later.
- **Cloud unchanged:** For `dev.azure.com` and `visualstudio.com`, the extension continues to use API version 7.1. Fallback to 7.1 is used when no cached on-prem version is available.

---

### Ollama: New metadata bar in the review panel 🖥️

**At-a-glance info and controls for local AI:** When you run a review with **Local Ollama**, the review panel now shows a dedicated **Ollama metadata bar** with patch size, truncation details, and quick actions.

- **Patch size and truncation:** The bar shows original patch size and, when applicable, truncated size sent to Ollama, with an optional tooltip explaining why the patch was truncated (context limits).
- **Switch to Cloud AI:** A **Switch to Cloud AI** button lets you move to cloud-based review without leaving the page; your AI provider setting is updated and the review can be re-run with ThinkReview Cloud.
- **Model selector:** A dropdown lists available Ollama models; you can change the model used for this session. The selected model is persisted so follow-up messages use the same model.
- **Consistent UX:** The Ollama bar uses the same visual language as the cloud review metadata bar (patch size, model, etc.) so behaviour is familiar whether you use Cloud or Ollama.

---

## 🐛 Bug Fixes & Improvements

- **Azure token save:** The Azure DevOps token **Save** button is disabled while the save operation is in progress and re-enabled in a `finally` block after success or error, preventing repeated clicks and duplicate requests.
- **Azure API version resolution:** When the detected server reports API 7.2 or higher, the extension uses 7.1 for requests (the highest supported version), so newer servers still work without code changes.

---

## 📝 Usage Tips

1. **On-premise Azure DevOps (TFS 2018+, Azure DevOps Server 2019–2022)**  
   Open a PR on your on-prem URL as usual. The extension will use the stored API version for that host. If you have not visited that host before, version detection runs once and caches the result.

2. **Ollama metadata bar**  
   Run a review with **Local Ollama** selected. The bar under the review header shows patch size, current model, and **Switch to Cloud AI**. Use the model dropdown to change the Ollama model and re-run or continue the conversation with the new model.

3. **Saving the Azure token**  
   After clicking **Save Token**, wait for the success or error message; the button stays disabled until the operation finishes.

---

## 📞 Support

Having issues or suggestions?

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀

*Use ThinkReview with Azure DevOps Server and TFS 4.1–7.1, and get a clearer Ollama experience with the new metadata bar.*
