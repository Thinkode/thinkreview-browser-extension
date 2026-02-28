# ThinkReview - Version 1.5.1 Release Notes

**Release Date:** 18 February 2026

---

## 🎯 What's New

### Ollama Configuration Improvements 🖥️

**More control over local AI behaviour:** When using Local Ollama, you can now tune generation options directly in the extension popup. These settings apply to both the initial code review and follow-up conversation.

- **Temperature (min 0, max 2):** Controls randomness; lower values give more deterministic, focused reviews. Default: 0.3
- **Top P (min 0, max 1):** Nucleus sampling; helps control diversity of responses. Default: 0.4
- **Top K (min 1, max 200):** Limits how many top tokens are considered. Default: 90

All three fields appear in the Ollama configuration section (under **AI Provider** when **Local Ollama** is selected). Values are validated and clamped to the allowed ranges when you save, so invalid or out-of-range entries are corrected automatically. The same limits are enforced when sending requests to Ollama, so your settings are always safe for the API.

**Under the hood:** Clamping logic is centralized in a shared utility (`utils/ollama-options.js`) used by both the popup and the Ollama service, so limits and defaults stay consistent everywhere.

---

### Documentation Updates 📖

- **Recommended model:** The [Ollama Setup Guide](https://github.com/Thinkode/thinkreview-browser-extension/blob/main/OLLAMA_SETUP.md) now recommends **[Codestral](https://ollama.com/library/codestral:latest)** for the best code review results (Mistral AI’s 22B code model, 32k context, 80+ languages).
- **Alternative model:** **[gpt-oss](https://ollama.com/library/gpt-oss)** (OpenAI’s open-weight models; 20B/120B, 128K context) is documented as a supported option.
- The main README’s “Local AI with Ollama” section now points to Codestral as the recommended model and gpt-oss as an alternative.

---

## 🐛 Bug Fixes & Improvements

- **Conversation history on GitHub and Azure DevOps (and Bitbucket):** Fixed a bug where conversation history from a previous PR could appear when opening a new PR without refreshing the page. On these SPA-based sites, the extension now clears in-memory conversation history and the chat log UI whenever a new review is started (including when the panel is re-injected after SPA navigation), so each PR shows only its own review and follow-up messages.
- **Ollama options:** Temperature, Top P, and Top K are now persisted with your Ollama URL and model; they are loaded when you open settings and applied to every Ollama request (review and conversational).
- **Consistent limits:** Min/max limits are shown in the popup labels and enforced on save, load, and in the service, so you never send invalid values to Ollama.

---

## 📝 Usage Tips

1. **Tuning Ollama**
   - In the popup: **AI Provider** → **Local Ollama** → set **Temperature**, **Top P**, and **Top K** as needed, then **Save Settings**.
   - Lower temperature (e.g. 0.2–0.4) usually gives more consistent, focused reviews; higher values can increase variety.

2. **Best results with Ollama**
   - We recommend **Codestral** (`ollama pull codestral`) for code review quality. See the [Ollama Setup Guide](https://github.com/Thinkode/thinkreview-browser-extension/blob/main/OLLAMA_SETUP.md) for details and other options like gpt-oss.

---

## 📞 Support

Having issues or suggestions? We'd love to hear from you:

- **Bug Reports**: Click the "Report a 🐞" button in the review panel
- **Feedback Form**: [Share Your Feedback](https://thinkreview.dev/feedback)
- **Rate Us**: Leave a review on the Chrome Web Store

---

**Thank you for using ThinkReview!** 🚀

*Ollama users: tune Temperature, Top P, and Top K from the popup and try Codestral for best results.*
