# ThinkReview - Version 1.3.6 Release Notes

**Release Date:** November 02, 2025

---

## 🎯 What's New

### Azure DevOps SPA Navigation Support 🚀

**Major UX Improvement:** ThinkReview now provides seamless support for Azure DevOps's Single Page Application (SPA) architecture!

- **Always-Visible Button**: The AI Review button now stays visible on all Azure DevOps pages, eliminating the need to refresh when navigating between pages
- **Smart Detection**: The extension intelligently detects whether you're on a Pull Request page
- **Better UX**: Simple alert notification when clicking the button on non-PR pages, keeping your workflow smooth
- **Persistent Experience**: Button persists during SPA navigation, providing a consistent experience throughout Azure DevOps

**How It Works:**
1. **Navigate**: Browse anywhere in Azure DevOps - the AI Review button is always visible
2. **On PR Pages**: Click the button to instantly generate AI-powered code reviews
3. **On Other Pages**: Get a helpful alert guiding you to navigate to a Pull Request page
4. **Seamless**: No more disappearing buttons or page refreshes needed!

---

## 🐛 Bug Fixes

### Azure DevOps Authentication & Authorization 🔒

- **Fixed Authentication Detection**: Extension now properly detects when Azure DevOps requests are unauthorized
- **Improved Error Messaging**: Clear, actionable error messages when Personal Access Token is invalid or expired
- **Better Token Validation**: Enhanced token checking before making API requests
- **Graceful Error Handling**: Improved handling of 401 authentication errors with helpful prompts

### Azure DevOps Diff Improvements 📝

- **Single Commit Support**: Fixed issue with file diffs when Pull Request contains only one commit
- **Better Edge Case Handling**: Improved diff generation for various PR scenarios
- **More Reliable Reviews**: Enhanced diff fetching logic ensures consistent code review generation
- **Fallback Improvements**: Better fallback strategies when primary diff methods encounter issues

### Code Review Display 🎨

- **Fixed Markdown Rendering**: Resolved sporadic issue where markdown code blocks were displayed as ` ```markdown ` instead of being properly rendered
- **Improved Code Block Handling**: Enhanced preprocessing of AI responses for better formatting
- **Consistent Display**: Code snippets and markdown now render consistently across all review types
- **Better Readability**: Fixed formatting issues that could affect review comprehension

---

## ⚡ Performance Improvements

### Optimized Content Script Injection ⚙️

- **Broader Coverage**: Content scripts now load on all Azure DevOps pages (not just PR pages)
- **Faster Detection**: Instant platform detection as soon as you land on any Azure DevOps page
- **Reduced Overhead**: Optimized script loading and initialization
- **Better Resource Management**: Improved memory usage and cleanup

### Enhanced Platform Detection 🔍

- **Smarter URL Matching**: More accurate detection of Azure DevOps domains and pages
- **PR Page Validation**: Reliable detection of actual Pull Request pages vs other Azure DevOps pages
- **Cross-Platform Support**: Seamless handling of both `dev.azure.com` and `visualstudio.com` domains

---

## 🔧 Additional Improvements

### User Experience Enhancements 🎯

- **Cleaner Alerts**: Simple, non-intrusive alerts replace complex in-panel messages
- **Better Navigation Flow**: Users can quickly navigate to PR pages without confusion
- **Consistent Behavior**: Predictable button behavior across all Azure DevOps pages
- **Reduced Friction**: Eliminated unnecessary panel openings on non-PR pages

### Code Quality & Reliability 🛡️

- **Improved Error Recovery**: Better handling of edge cases and error scenarios
- **Enhanced Logging**: More detailed debugging information for troubleshooting
- **Code Cleanup**: Removed unused functions and optimized existing code
- **Maintainability**: Cleaner code structure for easier future updates

---

## 📝 Usage Tips

### Azure DevOps Users

1. **SPA Navigation**: 
   - The AI Review button is now always visible on Azure DevOps
   - Navigate freely between pages - no need to refresh
   - Click the button when you're on a Pull Request page

2. **Token Issues**:
   - If you see an authentication error, check your Personal Access Token
   - Ensure your token has "Code (read)" permissions
   - Update your token in the extension popup settings

3. **Best Practices**:
   - Navigate to the Pull Request "Files" tab for best results
   - Ensure all changes are committed before requesting a review
   - Keep your Personal Access Token up to date

### GitLab Users

All existing GitLab functionality remains unchanged and continues to work as expected!

---

## 📞 Support

Having issues or suggestions? We'd love to hear from you:
- **Bug Reports**: Click the "Report a 🐞" button in the review panel
- **Feedback Form**: [Share Your Feedback](https://thinkreview.dev/feedback)
- **Rate Us**: Leave a review on the Chrome Web Store

**Azure DevOps Help:**
- Check that your Personal Access Token is valid and has the correct permissions
- Ensure you're on a Pull Request page when generating reviews
- Contact support if you continue to experience issues

---

**Thank you for using ThinkReview!** 🚀

*Continuing to improve AI-powered code reviews for both GitLab and Azure DevOps.*

