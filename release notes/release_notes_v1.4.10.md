# ThinkReview - Version 1.4.10 Release Notes

**Release Date:** [Release Date]

---

## 🎯 What's New

### Review Metadata Bar 📊

**Enhanced Transparency:** Get instant visibility into review details with the new metadata bar that displays comprehensive information about each code review.

- **Patch Size Information**: View the original patch size and truncated size (if applicable) to understand the scope of your review
- **Model Transparency**: See which LLM model was used to generate your review
- **File Exclusion Details**: View how many files were excluded from the review and expand to see the complete list of excluded files
- **Quick Customization**: Access model selection directly from the metadata bar with the "Customize" button

**How It Works:**
The metadata bar appears at the top of every review, providing at-a-glance information about the review process. Click the expand arrow to see detailed information about excluded files, and use the "Customize" button to quickly access model selection options.

**Why This Matters:**
Understanding review metadata helps you make informed decisions about review quality and scope. You can see exactly what was analyzed, which model processed it, and quickly adjust settings if needed.

---

### Custom Model Selection 🎛️

**Take Control of Your Reviews:** Choose which AI models power your code reviews with full control over model selection.

- **Model Customization**: Select from available models to match your preferences and requirements
- **Easy Access**: Quick access to model selection from the review metadata bar
- **Seamless Integration**: Changes take effect immediately for future reviews

**How It Works:**
Click the "Customize" or "Try a different model" button in the review metadata bar to access the model selection portal. Choose your preferred model and it will be used for subsequent reviews.

**Why This Matters:**
Different models excel at different tasks. By selecting the model that best fits your needs, you get more relevant and useful code reviews tailored to your development style.

---

### Custom Scoring Rules Configuration ⚙️

**Personalize Review Metrics:** Configure custom scoring rules to align review metrics with your team's standards and priorities.

- **Metric Configuration**: Customize how code quality, security, and best practices are scored
- **Quick Access**: Access scoring configuration directly from quality scorecard metrics
- **Team Alignment**: Set rules that match your organization's coding standards

**How It Works:**
Click the configure icon (⚙️) next to any metric in the quality scorecard to open the scoring metrics configuration page. Adjust rules and thresholds to match your preferences.

**Why This Matters:**
Every team has different priorities and standards. Custom scoring rules ensure that review metrics reflect what matters most to your organization, making reviews more actionable and relevant.

---

### Clickable Review Summary 🔍

**Dive Deeper Instantly:** The review summary is now clickable, allowing you to get more details about any PR summary with a single click.

- **One-Click Deep Dive**: Click on any review summary to automatically query the AI copilot for more details
- **Seamless Integration**: Questions are sent directly to the conversational review chat
- **Smart Query Formatting**: Automatically formats your question to get the most relevant follow-up information

**How It Works:**
Simply click anywhere on the review summary text. ThinkReview will automatically send a detailed query to the AI copilot chat asking for more information about the PR summary, and the response will appear in the conversational review panel.

**Why This Matters:**
Sometimes a summary raises questions or you need more context. Instead of manually typing questions, you can now click the summary to instantly get deeper insights, making your code review workflow faster and more efficient.

---

## 📝 Usage Tips

1. **Exploring Metadata**:
   - Check the metadata bar to understand the scope and model used for each review
   - Expand excluded files to see what wasn't analyzed
   - Use the customize button to quickly change models

2. **Customizing Models**:
   - Access model selection from the metadata bar or directly from the portal
   - Try different models to find the one that best fits your needs
   - Model changes apply to future reviews automatically

3. **Configuring Scoring Rules**:
   - Click the configure icon next to any metric in the quality scorecard
   - Adjust rules to match your team's standards and priorities
   - Custom configurations ensure reviews align with your organization's needs

4. **Using Clickable Summary**:
   - Click on any review summary to get more details
   - The AI copilot will automatically receive your question
   - Use this feature to quickly understand complex changes or get clarification

---

## 🐛 Bug Fixes & Improvements

- Improved metadata display with better formatting and expandable file lists
- Enhanced accessibility for all new interactive elements
- Optimized metadata bar rendering performance

---

## 📞 Support

Having issues or suggestions? We'd love to hear from you:

- **Bug Reports**: Click the "Report a 🐞" button in the review panel
- **Feedback Form**: [Share Your Feedback](https://thinkreview.dev/feedback)
- **Rate Us**: Leave a review on the Chrome Web Store

---

**Thank you for using ThinkReview!** 🚀

*Making code reviews more transparent, customizable, and interactive with every release.*

