# GitLab MR Reviews - Architecture

This document outlines the architecture and design decisions for the GitLab MR Reviews Chrome extension.

## Overview

GitLab MR Reviews is a Chrome extension designed to enhance the GitLab merge request review process by providing easy access to patch diffs. The extension detects GitLab merge request pages, adds a download button for patches, maintains a history of downloaded patches, and provides AI-powered code review capabilities using the Gemini API.

## Components

### 1. Content Script (`content.js`)

The content script runs in the context of GitLab merge request pages and is responsible for:

- Detecting when a user is viewing a GitLab merge request
- Finding the "Patches" dropdown item in the GitLab UI
- Extracting the URL to the patch file
- Injecting a "Download Patch" button into the page
- Fetching the patch content when requested
- Sending the patch data to the background script
- Injecting the integrated code review panel into the GitLab MR page
- Automatically fetching and displaying code review results

Key functions:
- `isGitLabMRPage()`: Detects if the current page is a GitLab merge request
- `getPatchUrl()`: Extracts the URL to the patch file
- `injectButtons()`: Adds floating action buttons to the page
- `fetchAndStorePatch()`: Fetches the patch content and stores it
- `injectIntegratedReviewPanel()`: Adds the integrated review panel to the page
- `fetchAndDisplayCodeReview()`: Fetches and displays code review results

### 2. Background Script (`background.js`)

The background script runs in the extension's background context and handles:

- Receiving patch data from the content script
- Storing patches in Chrome's local storage
- Managing the download of patch files
- Extracting metadata from merge request URLs

Key functions:
- `handleSavePatch()`: Processes and stores patch data
- `extractMergeRequestInfo()`: Parses merge request URLs to extract project and MR number
- `createDownload()`: Creates a download for the patch content

### 3. Popup UI (`popup.html`, `popup.js`, `popup.css`)

The popup UI provides a user interface for:

- Viewing the current tab's status (whether it's a GitLab merge request)
- Displaying a list of recently downloaded patches
- Re-downloading patches
- Navigating to merge request pages
- User authentication via Google Sign-In

Key functions:
- `loadRecentPatches()`: Loads and displays recent patches from storage
- `downloadPatch()`: Re-downloads a previously saved patch
- `viewMergeRequest()`: Opens a merge request in a new tab
- `signIn()`: Handles Google authentication

### 4. Patch Viewer (`patch-viewer.html`, `patch-viewer.js`, `patch-viewer.css`)

The patch viewer provides a dedicated interface for:

- Displaying patch content with syntax highlighting
- Downloading the patch file
- Toggling between raw and formatted views
- Requesting AI-powered code reviews of the patch

Key functions:
- `highlightDiff()`: Adds syntax highlighting to the patch content
- `displayCodeReview()`: Renders the code review results from the Gemini API
- `loadCloudService()`: Dynamically imports the CloudService module

### 5. Cloud Service (`services/cloud-service.js`)

The cloud service module handles communication with backend services:

- User data synchronization
- Patch data storage
- Code review requests

Key functions:
- `syncUserData()`: Synchronizes user data with the backend
- `getUserData()`: Retrieves user data from the backend
- `savePatchData()`: Saves patch data to the backend
- `reviewPatchCode()`: Sends patch content to the backend for AI code review

## Data Flow

### Patch Download Flow

1. User navigates to a GitLab merge request page
2. Content script detects the page and adds the download button
3. User clicks the download button
4. Content script fetches the patch and sends it to the background script
5. Background script stores the patch and initiates a download
6. Popup UI displays the list of downloaded patches

### Code Review Flow (Patch Viewer)

1. User opens a patch in the patch viewer
2. User clicks the "Review Code" button
3. Patch viewer loads the CloudService module
4. CloudService sends the patch content to the backend cloud function
5. Cloud function uses the Gemini API to analyze the code
6. Gemini API returns a structured code review
7. Cloud function sends the review back to the extension
8. Patch viewer displays the code review results

### Integrated Code Review Flow

1. User navigates to a GitLab merge request page
2. Content script detects the page and injects the integrated review panel
3. Content script automatically fetches the patch content
4. Content script sends the patch content directly to the backend cloud function
5. Cloud function uses the Gemini API to analyze the code
6. Gemini API returns a structured code review
7. Cloud function sends the review back to the content script
8. Content script displays the code review results in the integrated panel
9. User can refresh the review at any time by clicking the refresh button

## Storage

The extension uses Chrome's local storage to store patch data:

```javascript
{
  "patches": [
    {
      "content": "...", // The actual patch content
      "url": "https://gitlab.com/...", // The merge request URL
      "project": "project-name", // Extracted project name
      "mrNumber": "123", // Merge request number
      "timestamp": "2025-07-30T17:19:52.000Z", // When the patch was downloaded
      "filename": "project-name_MR123_2025-07-30T17-19-52-000Z.patch" // Generated filename
    },
    // More patches...
  ]
}
```

## Security Considerations

- The extension only requests permissions for GitLab domains and the cloud function domain
- User authentication is handled securely via Google OAuth
- Patch data is stored locally and optionally synchronized with the backend
- The extension only activates on GitLab merge request pages
- Code review requests are sent securely to the cloud function over HTTPS
- The Gemini API key is stored securely in Firebase config, not in the extension code

### 6. Integrated Review Component (`components/integrated-review.js`, `components/integrated-review.css`)

The integrated review component provides a seamless code review experience directly within the GitLab merge request page:

- Displays AI-powered code review results in a GitLab-styled panel positioned on the right side of the page
- Features an expandable/minimizable interface that can be toggled with a click on the header
- Includes a floating toggle button to completely show/hide the review panel
- Provides an "AI Review" button in the fixed button panel that animates the review panel in/out
- Supports smooth animations when minimizing to the button or expanding
- Automatically analyzes code changes when a merge request page is loaded
- Shows summary, suggestions, security issues, and best practices
- Displays structured code suggestions with file names, line numbers, and suggested code
- Allows users to refresh the code review on demand
- Remembers user preferences for panel state (expanded/minimized and visible/hidden) between sessions
- Tracks each code review in Firestore under the user's document in a `codeReviews` subcollection
- Displays the total number of code reviews performed in the extension popup

Key functions:
- `createIntegratedReviewPanel()`: Creates the review panel with GitLab styling and expandable/minimizable functionality
- `toggleReviewPanel()`: Handles animation between the panel and the AI Review button
- `displayIntegratedReview()`: Renders the code review results in the panel
- `showIntegratedReviewError()`: Displays error messages when review fails
- `getMergeRequestId()`: Extracts the merge request ID from the URL
- `getMergeRequestSubject()`: Extracts the merge request title from the page
- `updateReviewCountDisplay()`: Updates the review count in localStorage and the popup
- `CloudService.syncCodeReview()`: Sends review data to the cloud function for storage
- `CloudService.getUserEmail()`: Gets the user's email from Chrome Identity API

### 7. Code Review Sync (`services/cloud-service.js`, `popup.js`)

The extension syncs each code review performed by users and stores this data in Firestore:

- Uses email-based user identification for consistent tracking across devices
- Stores review metadata (MR ID, subject, timestamp) in a `codeReviews` subcollection under the user's document
- Maintains a count of total reviews performed in the user document
- Displays the total review count in the extension popup
- Uses Chrome Identity API to securely retrieve the user's email
- Communicates with the `syncCodeReviews` cloud function in the ThinkGPT cloud functions project

Key components:
- `syncCodeReviews` cloud function: Stores review data in Firestore and returns the updated review count
- `CloudService.syncCodeReview()`: Client-side method to send review data to the cloud function
- `updateReviewCountDisplay()`: Updates the review count in localStorage and notifies the popup
- Review count display in popup.html with styled counter

## Future Enhancements

Potential future enhancements include:

1. Adding support for other GitLab instances (self-hosted)
2. Implementing patch diff visualization
3. Adding options to customize the extension behavior
4. Supporting batch operations on multiple patches
5. Expanding the integrated review with inline code comments
6. Adding support for different AI models for code review

## Development Guidelines

When extending or modifying this extension:

1. Maintain separation of concerns between content, background, and popup scripts
2. Use descriptive function and variable names
3. Add comments for complex logic
4. Test on different GitLab projects and merge request pages
5. Keep the UI simple and intuitive
