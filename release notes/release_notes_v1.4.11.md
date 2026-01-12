# ThinkReview - Version 1.4.11 Release Notes

**Release Date:** 11 January 2026

---

## 🎯 What's New

### Copy Buttons with Rich Text Formatting 📋

**Enhanced Copy Experience:** Copy review items and conversational messages with full formatting preservation. Your copied content maintains its styling and structure when pasted.

- **Rich Text Copy**: Copy review items and messages with HTML formatting preserved
- **Smart Formatting**: Automatically applies computed styles to maintain visual consistency
- **Review Items**: Copy buttons now appear next to each review item for quick access
- **Conversational Messages**: Copy functionality added to all conversational AI responses
- **GitHub Integration**: Copy buttons work seamlessly with GitHub's stylesheet using enhanced CSS specificity

**How It Works:**
Click the copy button next to any review item or conversational message. The content is copied to your clipboard with full formatting preserved, so when you paste it into documents, emails, or other applications, it maintains its original styling.

**Why This Matters:**
Sharing code review insights with your team is now easier than ever. Instead of manually formatting copied content, you get perfectly formatted text that's ready to use in documentation, reports, or communications.

---

### New Badge System 🏷️

**Visual Indicators for New Features:** Quickly identify new functionality and improvements with visual badges throughout the interface.

- **New Feature Badge**: Highlights new features as they're introduced
- **New Prompt Badge**: Indicates improved prompts next to the generate comment button
- **Smart Caching**: Badge modules are efficiently cached to prevent duplicate insertions
- **Performance Optimized**: Promise-based loading ensures badges appear smoothly without impacting performance

**How It Works:**
Badges appear automatically next to new features and improved functionality. They provide visual cues to help you discover and take advantage of the latest enhancements.

**Why This Matters:**
Staying up-to-date with new features can be challenging. Badges help you quickly identify what's new and what's been improved, ensuring you get the most value from each update.

---

### Portal Authentication Flow 🔐

**Streamlined Sign-In Experience:** New authentication flow through the portal with improved reliability and error handling.

- **Portal-Based Auth**: Sign in through the dedicated portal for a smoother experience
- **Fallback Support**: Old Google OAuth flow remains available as a fallback option
- **Improved Error Handling**: Better error messages and handling for authentication failures
- **Duplicate Prevention**: Enhanced protection against multiple simultaneous sign-in attempts
- **Promise Handling**: Proper async/await patterns ensure reliable authentication flow

**How It Works:**
When signing in, ThinkReview now uses the portal authentication flow by default. If the portal flow encounters an issue, it automatically falls back to the previous Google OAuth method. All errors are properly caught and communicated to you.

**Why This Matters:**
Authentication should be seamless and reliable. The new flow provides a more robust sign-in experience with better error handling and multiple fallback options to ensure you can always access your account.

---

### Expanded Language Support 🌍

**More Languages Added:** ThinkReview now supports additional languages for a more inclusive experience.

- **New Languages**: Added support for Dutch, Vietnamese, Indonesian, Italian, and Romanian
- **Expanded Reach**: More developers around the world can use ThinkReview in their native language
- **Seamless Integration**: All new languages work seamlessly with existing features

**How It Works:**
Language support is automatically detected based on your browser settings. You can now use ThinkReview in Dutch, Vietnamese, Indonesian, Italian, and Romanian in addition to all previously supported languages.

**Why This Matters:**
Code review is a global activity. By supporting more languages, we're making ThinkReview more accessible to developers worldwide, regardless of their preferred language.

---

### Improved Comment Generation Prompts 💬

**Better AI Responses:** Enhanced prompts for comment generation result in more relevant and useful AI-generated comments.

- **Refined Prompts**: Improved prompt engineering for comment generation
- **Better Context**: AI comments are now more contextual and actionable
- **Consistent Quality**: More reliable and useful comment suggestions

**How It Works:**
The underlying prompts used for AI comment generation have been refined and improved. When you generate comments, you'll receive higher quality, more relevant suggestions that better match your code review needs.

**Why This Matters:**
The quality of AI-generated comments directly impacts your workflow efficiency. Better prompts mean better suggestions, saving you time and helping you write more effective code reviews.

---

## 🎨 UI & Design Improvements

### Enhanced Copy Button Styling

- **GitHub Compatibility**: Copy buttons now properly override GitHub's stylesheet using `!important` flags and inline styles
- **Better Visibility**: Improved button visibility and interaction states
- **Consistent Design**: Copy buttons maintain consistent appearance across all review items

### Visual Refinements

- **Inline Code Styling**: Applied purple color to inline code styles within initial review sections for better visual distinction
- **Thumbs Button Colors**: Updated thumbs up/down buttons to lighter, more subtle colors
- **Summary Padding**: Added padding to summaries to better align with summary titles

---

## 🔧 Additional Improvements

- **Multiple Insertion Protection**: Enhanced protection against duplicate button insertions
- **Promise Caching**: Improved module loading with cached promises for better performance
- **Error Message Updates**: More descriptive error messages for better user guidance
- **Code Organization**: Better structure and organization of copy button components

---

## 📝 Usage Tips

1. **Using Copy Buttons**:
   - Click the copy button next to any review item or conversational message
   - Paste the content into your preferred application - formatting will be preserved
   - Use this feature to share insights with your team in documents or reports

2. **Exploring New Features**:
   - Look for badge indicators to discover new functionality
   - Badges help you quickly identify what's new in each release

3. **Authentication**:
   - The new portal-based authentication is automatic
   - If you encounter any issues, the system will automatically try the fallback method
   - Check error messages for guidance if authentication fails

4. **Language Support**:
   - Language detection is automatic based on your browser settings
   - All features work seamlessly in all supported languages

---

## 🐛 Bug Fixes & Improvements

- Fixed issue with multiple copy button insertions causing duplicate buttons
- Improved promise handling to prevent race conditions in badge loading
- Enhanced error handling in authentication flow with proper try/catch blocks
- Better async/await patterns for chrome.tabs.create to prevent duplicate sign-in attempts
- Improved CSS specificity for copy buttons to work correctly on GitHub
- Fixed promise caching to ensure modules load correctly before use

---

## 📞 Support

Having issues or suggestions? We'd love to hear from you:

- **Bug Reports**: Click the "Report a 🐞" button in the review panel
- **Feedback Form**: [Share Your Feedback](https://thinkreview.dev/feedback)
- **Rate Us**: Leave a review on the Chrome Web Store

---

**Thank you for using ThinkReview!** 🚀

*Making code reviews more accessible, efficient, and user-friendly with every release.*
