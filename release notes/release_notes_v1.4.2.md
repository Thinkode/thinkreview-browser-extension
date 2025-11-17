# ThinkReview - Version 1.4.2 Release Notes

**Release Date:** November 19, 2025

---

## 🎯 What's New

### Enhanced Azure DevOps Support 🔷

**Improved visualstudio.com Domain Support:** ThinkReview now correctly handles Azure DevOps instances using the legacy `visualstudio.com` domain format!

- **Fixed Base URL Construction**: Correctly constructs API URLs for `*.visualstudio.com` domains
- **Better Detection**: Simplified and more reliable Azure DevOps domain detection
- **Consistent Behavior**: Unified detection logic across all Azure DevOps domain formats

**Why This Matters:**
Many organizations still use the legacy `https://{organization}.visualstudio.com` format instead of the newer `dev.azure.com` format. This update ensures ThinkReview works seamlessly with both formats, providing consistent code review functionality regardless of which Azure DevOps URL format your organization uses.

**Supported Azure DevOps URLs:**
- `https://dev.azure.com/{organization}/{project}/_git/{repository}/pullrequest/{id}` ✅
- `https://{organization}.visualstudio.com/{project}/_git/{repository}/pullrequest/{id}` ✅ (Now fully supported!)

---

## 🔧 Technical Improvements

### Simplified Detection Logic

- **Removed Redundant Checks**: Eliminated unnecessary DOM-based detection that was causing inconsistencies
- **Unified Detection**: All Azure DevOps detection now uses consistent hostname-based checks
- **Better Code Organization**: Cleaner, more maintainable detection code

**Changes Made:**
- Removed DOM selector checks from platform detection (hostname checks are sufficient)
- Standardized on `includes()` method for domain matching (more flexible than exact matches)
- Fixed base URL construction to properly handle visualstudio.com domains

### Improved Error Handling

- **Better Logging**: More informative error messages for troubleshooting
- **Cleaner Console**: Reduced unnecessary logging for expected scenarios
- **Graceful Fallbacks**: Improved handling of edge cases in API calls

---

## 🐛 Bug Fixes

### Azure DevOps Integration Fixes

- **Fixed visualstudio.com API Calls**: Resolved issue where API calls were failing for `*.visualstudio.com` domains due to incorrect base URL construction
- **Fixed Detection Inconsistencies**: Removed redundant detection checks that could cause false positives
- **Improved Error Messages**: Better error reporting when Azure DevOps API calls fail

**Before:** 
- API calls to `https://p365cloud.visualstudio.com` would incorrectly use `https://dev.azure.com/p365cloud`
- Result: 404 errors and failed code reviews

**After:**
- API calls correctly use `https://p365cloud.visualstudio.com` as the base URL
- Result: Successful code reviews on visualstudio.com domains ✅

---

## 📝 Usage Tips

1. **For visualstudio.com Users**:
   - No configuration changes needed - the fix works automatically
   - Your existing Personal Access Token will continue to work
   - Code reviews should now work seamlessly on your visualstudio.com instance

2. **For dev.azure.com Users**:
   - No changes - everything continues to work as before
   - This update improves compatibility without affecting existing functionality

---

## 🔄 Migration Notes

**No action required!** This is a fully backward-compatible update. All existing functionality remains unchanged, and the improvements work automatically for all users.

---

## 📞 Support

Having issues or suggestions? We'd love to hear from you:
- **Bug Reports**: Click the "Report a 🐞" button in the review panel
- **Feedback Form**: [Share Your Feedback](https://thinkreview.dev/feedback)
- **Rate Us**: Leave a review on the Chrome Web Store

---

**Thank you for using ThinkReview!** 🚀

*Making Azure DevOps code reviews better, one update at a time.*

