# Detection Error Reporting System

## Overview

This document describes the error reporting system implemented to help debug GitLab merge request detection issues across different GitLab versions and configurations.

## Purpose

Users on certain GitLab versions (especially self-hosted enterprise instances) experience detection failures where the extension doesn't recognize their MR pages. This system collects comprehensive environment data to help identify patterns and fix detection logic.

## Architecture

### 1. Error Reporter Module (`services/error-reporter.js`)

A modular, reusable service that:
- Safely collects comprehensive debug information about the page
- Uses defensive coding (optional chaining, nullish coalescing) to prevent errors
- Sends data to background script for forwarding to cloud function

**Key Features:**
- Safe DOM element detection
- URL pattern analysis
- Platform detector state capture
- GitLab version detection via meta tags
- Browser and extension info collection

### 2. Integration Points

Error reporting is triggered at these key detection failure points:

#### content.js
1. **Line ~1177**: Detection failure - "Current page does not need button"
2. **Line ~315**: Panel injection blocked - Not on supported page
3. **Line ~994**: User clicked AI Review on unsupported page
4. **Line ~58**: Platform initialization error

#### platform-detector.js
1. **Line ~157**: GitLab MR info extraction error

### 3. Background Message Handler (`background.js`)

Added handler for `LOG_DETECTION_ISSUE` message type (line ~528):
- Extracts user email from storage
- Forwards debug data to cloud function
- Handles anonymous users gracefully

### 4. Cloud Function (`logDetectionIssue`)

Located in: `/thinkgpt-cloud-functions/gfunctions/index_ThinkReview.js`

**Functionality:**
- Receives detection issue data
- Looks up or creates user in `Users_Reviews` collection
- Stores data in subcollection `detectionIssues` under user document
- Anonymous users logged to `DetectionIssues_Anonymous` collection

**Endpoint:**
```
https://us-central1-thinkgpt.cloudfunctions.net/logDetectionIssue
```

## Data Collected

### Critical Fields for Debugging

1. **URL Information**
   - Full URL, hostname, pathname, search params
   - Essential for understanding URL variations

2. **Path Analysis**
   - Tests for `/merge_requests/`, `/-/merge_requests/`, etc.
   - Identifies which patterns match/fail
   - Extracts MR ID from path

3. **DOM Elements** (Extended)
   - Checks for GitLab-specific CSS classes across versions
   - Detects Vue-based UI components (newer GitLab)
   - MR widget, tabs, and container elements
   - Helps distinguish URL issues from DOM issues

4. **GitLab JavaScript Globals** (⭐ High Value)
   - `window.gon.gitlab_version` - Exact GitLab version number
   - `window.gon.api_version` - API version
   - `window.gon.relative_url_root` - Custom path prefix
   - Feature flags and configuration

5. **Body Classes** (⭐ High Value)
   - Full list of body CSS classes
   - UI framework indicators (`gl-page`, `ui-indigo`, etc.)
   - Data attributes on body element
   - Shows UI version and theme

6. **Data Attributes** (⭐ High Value)
   - MR ID from data attributes (`data-mr-id`, `data-merge-request-id`)
   - Project ID and context
   - Application data from main containers

7. **Loaded Scripts**
   - GitLab asset URLs (often contain version in filename)
   - Webpack chunks detection
   - Total script count

8. **Loaded Stylesheets**
   - GitLab CSS URLs
   - GitLab UI framework detection

9. **Timing Information**
   - Time since page load
   - DOM load states
   - Helps understand SPA behavior

10. **Viewport & Visibility**
    - Screen dimensions
    - Device pixel ratio
    - Page visibility state
    - Responsive design issues

11. **Meta Tags**
    - Generator tag often contains GitLab version
    - Example: "GitLab 14.5.2"

12. **Platform Detector State**
    - Full detection result object
    - Shows why detection failed

13. **Custom Domains**
    - Lists user-configured GitLab domains
    - Helps identify registration issues

## Firestore Structure

```
Users_Reviews/
  {userId}/
    detectionIssues/
      {issueId}/
        - timestamp
        - issueType
        - errorMessage
        - url (object)
        - pathAnalysis (object)
        - domElements (object) - Extended with Vue & widget detection
        - platformDetector (object)
        - document (object)
        - metaTags (object)
        - customDomains (array)
        - extensionInfo (object)
        - browserInfo (object)
        - gitlabGlobals (object) ⭐ NEW - window.gon data
        - bodyClasses (object) ⭐ NEW - CSS classes & data attrs
        - dataAttributes (object) ⭐ NEW - MR & project data attrs
        - loadedScripts (object) ⭐ NEW - Script URLs & counts
        - loadedStyles (object) ⭐ NEW - Stylesheet URLs
        - timing (object) ⭐ NEW - Performance & load timing
        - viewport (object) ⭐ NEW - Screen dimensions & visibility
        - additionalData (object)
        - email
        - serverTimestamp

DetectionIssues_Anonymous/
  {issueId}/
    - (same structure as above)
```

## Issue Types

The system logs these issue types:

1. **`detection_failure`** - Main detection logic failed (most common)
2. **`panel_injection_blocked`** - Panel couldn't be injected
3. **`button_clicked_unsupported_page`** - User tried to use button on wrong page
4. **`platform_init_error`** - Platform detector initialization failed
5. **`info_extraction_error`** - Failed to extract MR info from page

## Querying Detection Issues

### Find All Detection Failures
```javascript
const issues = await db.collection('Users_Reviews')
  .doc(userId)
  .collection('detectionIssues')
  .where('issueType', '==', 'detection_failure')
  .get();
```

### Find Issues by GitLab Version (from window.gon) ⭐ NEW
```javascript
// Using exact version from window.gon
const issues = await db.collectionGroup('detectionIssues')
  .where('gitlabGlobals.gitlabVersion', '==', '14.5.2')
  .get();

// Or from meta tags
const issues = await db.collectionGroup('detectionIssues')
  .where('metaTags.generator', '==', 'GitLab 14.5.2')
  .get();
```

### Find Issues by URL Pattern
```javascript
const issues = await db.collectionGroup('detectionIssues')
  .where('pathAnalysis.hasDashSlashMergeRequests', '==', true)
  .where('pathAnalysis.hasSlashMergeRequestsSlash', '==', false)
  .get();
```

### Find Vue-Based UI Issues ⭐ NEW
```javascript
// Find newer GitLab versions using Vue components
const issues = await db.collectionGroup('detectionIssues')
  .where('domElements.hasVueComponents', '==', true)
  .where('domElements.hasMergeRequest', '==', false)
  .get();
```

### Find Issues by Body Classes ⭐ NEW
```javascript
// Find specific UI framework versions
const snapshot = await db.collectionGroup('detectionIssues').get();
const uiVersions = {};
snapshot.forEach(doc => {
  const data = doc.data();
  if (data.bodyClasses?.classList) {
    const hasGlPage = data.bodyClasses.classList.includes('gl-page');
    uiVersions[hasGlPage ? 'new-ui' : 'old-ui'] = 
      (uiVersions[hasGlPage ? 'new-ui' : 'old-ui'] || 0) + 1;
  }
});
console.log('UI versions:', uiVersions);
```

### Find Timing-Related Issues ⭐ NEW
```javascript
// Find issues that occur very early (might be timing-related)
const issues = await db.collectionGroup('detectionIssues')
  .get();

const earlyIssues = [];
issues.forEach(doc => {
  const data = doc.data();
  if (data.timing?.timeSinceLoad < 1000) { // Less than 1 second
    earlyIssues.push({
      id: doc.id,
      timeSinceLoad: data.timing.timeSinceLoad,
      url: data.url.full
    });
  }
});
```

### Find Custom Domain Issues
```javascript
// Find issues on specific custom domains
const issues = await db.collectionGroup('detectionIssues')
  .where('url.hostname', '==', 'gitlab.tango.me')
  .get();
```

### Aggregate Analysis by GitLab Version ⭐ NEW
```javascript
// Count issues by GitLab version
const versionCounts = {};
const snapshot = await db.collectionGroup('detectionIssues').get();
snapshot.forEach(doc => {
  const version = doc.data().gitlabGlobals?.gitlabVersion || 'unknown';
  versionCounts[version] = (versionCounts[version] || 0) + 1;
});
console.log('Issues by GitLab version:', versionCounts);
```

### Find Script Loading Issues ⭐ NEW
```javascript
// Find issues where GitLab scripts didn't load
const snapshot = await db.collectionGroup('detectionIssues').get();
const scriptIssues = [];
snapshot.forEach(doc => {
  const data = doc.data();
  if (data.loadedScripts?.gitlabScripts?.length === 0) {
    scriptIssues.push({
      id: doc.id,
      url: data.url.full,
      totalScripts: data.loadedScripts.totalScriptCount
    });
  }
});
```

### Aggregate Analysis (General)
```javascript
// Count issues by type
const issuesByType = {};
const snapshot = await db.collectionGroup('detectionIssues').get();
snapshot.forEach(doc => {
  const type = doc.data().issueType;
  issuesByType[type] = (issuesByType[type] || 0) + 1;
});
```

## Benefits

### Core Debugging Capabilities
1. **URL Pattern Discovery**: See actual URL variations users encounter
2. **Exact Version Detection**: Get precise GitLab version from `window.gon.gitlab_version`
3. **DOM Consistency**: Understand CSS selector changes across versions
4. **Custom Domain Issues**: Diagnose registration problems
5. **Pattern Debugging**: Know exactly which regex patterns pass/fail
6. **Aggregate Analysis**: Find common patterns in failures

### Enhanced with New Data (⭐)
7. **UI Framework Detection**: Identify Vue-based vs older UI versions
8. **Asset Fingerprinting**: Track GitLab version via script/stylesheet URLs
9. **Timing Analysis**: Understand SPA behavior and race conditions
10. **Data Attribute Tracking**: See if MR data is in DOM but not detected
11. **Body Class Analysis**: Track UI themes and frameworks
12. **Viewport Correlation**: Identify responsive design issues
13. **Script Loading Issues**: Detect if GitLab assets failed to load
14. **Feature Flag Detection**: See which GitLab features are enabled via `window.gon.features`

## Testing

To test the error reporting system:

1. Navigate to a page that should trigger detection failure
2. Open DevTools Console
3. Look for: `[Code Review Extension] Current page does not need button`
4. Check Firestore for new document in `detectionIssues` subcollection
5. Verify all fields are populated correctly

## Privacy Considerations

- Only collects technical page information (no sensitive data)
- User email used only for associating issues with user account
- Anonymous users supported (no email required)
- No personal browsing data collected

## Future Enhancements

1. Add detection issue dashboard in Firebase Console
2. Automatic alerts for new issue patterns
3. ML-based pattern recognition for common failures
4. Auto-suggest fixes based on detected patterns
5. Integration with release notes for version-specific fixes

