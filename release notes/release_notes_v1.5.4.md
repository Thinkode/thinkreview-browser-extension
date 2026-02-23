# ThinkReview - Version 1.5.4 Release Notes

**Release Date:** 24 February 2026

---

## 🎯 What's New

### Passwordless sign-in alongside Google sign-in 🔐

You can now sign in with **passwordless (magic link)** in addition to **Google sign-in**. Request a sign-in link sent to your email and open it to authenticate—no password required. Both options are available in the extension popup.

---

## 🚀 Azure DevOps: Major improvements and speed

### API and diff fetching fixes

- **Diffs/commits endpoint:** Corrected parameters (`baseVersionType`, `targetVersionType`, `$top`) and support for both response shapes (`changeEntries` and `changes`), so PR diff content loads reliably.
- **Added files:** The extension no longer requests base-commit file content for newly added files (`changeType: add`), avoiding 404s and unnecessary API calls.
- **Patch generation:** Diff line numbers and headers are fixed—single set of headers per file and correct `@@` hunk ranges so AI review receives valid patches.
- **Faster diffing:** Switched to the **diff** npm package and removed the manual LCS fallback for better performance when building file diffs.

### Performance optimizations

- **Project resolution (on-prem):** Project is now resolved via the **collection-level** `git/repositories` API only; the previous O(N) project-by-project fallback was removed. This reduces round-trips and speeds up initialization on Azure DevOps Server and TFS.
- **Lazy project resolution:** On-prem project resolution was moved out of async `init()` into `makeRequest()`, using `_makeCollectionRequest` / `_makeProjectRequest` so initialization doesn’t block and avoids duplicate collection segments in API URLs (e.g. `DefaultCollection/DefaultCollection`).
- **Syntax highlighting:** Single-pass placeholder restore in JS/TS, Bash, and Python highlighters (one global regex instead of N replace calls), reducing work from O(N×M) to O(N) on large code blocks.

---

## 🔧 Azure on-prem and URL format support

### Older Azure versions and “teams” URL formats

The extension **now works on Azure DevOps on-prem and older server versions** that use URL formats that previously failed:

- **`/{org}/_git/{repo}`** (no project in path): Project is resolved via the collection-level API when missing from the URL, so this format is supported.
- **`/{org}/{project}/{team}/_git/{repo}`** (team in path): Project and repository are now parsed correctly—**project** is taken as the first path segment after the org (e.g. `chromium`), not the team segment (e.g. `team2`), so the right project and repo are used for all API calls.

Before these fixes, the extension would not work on projects using these URL formats; it now correctly detects organization, project, and repository for both cloud and on-prem.

### Same-name repositories (on-prem)

When the collection-level `git/repositories` API returns multiple repos with the same name, the extension now **disambiguates by `remoteUrl`** (matching the current page URL) instead of picking the first match. If the match is still ambiguous, it reports via debug error rather than silently using the wrong repo.

---

## 🐛 Other bug fixes and improvements

- **Bash syntax highlighting:** Fixed corruption and “double-tagging” in code snippets (placeholder pattern aligned with other languages; comments and strings ordered before variables and builtins).
- **Copy button:** The copy button now appears correctly on **Generate PR description** AI responses (typing detection limited to spinner messages so real responses get the button).
- **Popup:** Handles missing profile picture or display name—fallback display name and initials avatar when no picture is available; CSP-safe and works with strict Content-Security-Policy.

---

## 📝 Summary

- **Speed:** Fewer API calls (collection-level project resolution, no base-commit for added files), faster diff building (diff library), and faster syntax highlighting (single-pass).
- **Compatibility:** Azure on-prem and older URL formats (`/_git/{repo}`, `/{project}/{team}/_git/{repo}`) and correct project/repository parsing so the extension works on these setups.
- **Sign-in:** Passwordless (magic link) sign-in is available next to Google sign-in.

---

## 📞 Support

- **Bug reports:** Use the "Report a Bug" button in the review panel or extension
- **Feedback:** [Share your feedback](https://thinkreview.dev/feedback)
- **Chrome Web Store:** Leave a review

---

**Thank you for using ThinkReview!** 🚀
