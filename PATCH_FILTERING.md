# Patch Filtering for Media Files

## Overview

The extension now automatically filters out media and binary files from GitLab merge request patches before sending them for AI code review. This prevents images, videos, and other non-code files from overwhelming the actual code changes.

## What Gets Filtered

The following file types are automatically excluded from code reviews:

### Images
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.svg`, `.webp`, `.ico`, `.tiff`, `.tif`
- `.heic`, `.heif`, `.raw`, `.psd`, `.ai`, `.eps`, `.indd`

### Videos
- `.mp4`, `.avi`, `.mov`, `.wmv`, `.flv`, `.mkv`, `.webm`, `.m4v`, `.mpg`, `.mpeg`, `.3gp`, `.ogv`

### Audio
- `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`, `.wma`, `.opus`

### Archives & Compressed Files
- `.zip`, `.tar`, `.gz`, `.rar`, `.7z`, `.bz2`, `.xz`, `.tgz`

### Documents
- `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`

### Fonts
- `.ttf`, `.otf`, `.woff`, `.woff2`, `.eot`

### Other Binary Formats
- `.exe`, `.dll`, `.so`, `.dylib`, `.bin`, `.dat`
- `.db`, `.sqlite`, `.dmg`, `.iso`, `.img`

## Implementation

The filtering is implemented in `/utils/patch-filter.js` and is applied in two places:

1. **content.js** - Filters patches before sending them for review in the integrated GitLab MR view
2. **patch-viewer.js** - Filters patches in the standalone patch viewer

## User Experience

When media/binary files are filtered out:
- The review summary includes a note about which files were excluded
- For 1 file: "Note: 1 media/binary file (filename.png) was excluded from the review."
- For 2-3 files: "Note: 2 media/binary files (file1.png, file2.jpg) were excluded from the review."
- For 4+ files: "Note: 5 media/binary files were excluded from the review."

## Technical Details

The filtering process:
1. Parses the git patch to identify individual file changes
2. Checks each file against the list of filtered extensions
3. Reconstructs the patch with only code files
4. Sends the filtered patch to the AI for review
5. Adds a summary note to inform users about filtered files

## Testing

Run the test suite to verify filtering works correctly:

```bash
node utils/test-patch-filter.js
```

This will test:
- File extension detection
- Patch parsing and filtering
- Summary generation

## Benefits

- **Better AI Reviews**: The AI focuses only on actual code changes
- **Faster Processing**: Smaller patches mean faster review times
- **Cost Efficiency**: Reduces token usage for AI processing
- **Improved Accuracy**: Prevents media file content from confusing the AI

