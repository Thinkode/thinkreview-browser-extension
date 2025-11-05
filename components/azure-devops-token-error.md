# Azure DevOps Token Error Module

This module provides functionality for displaying user-friendly Azure DevOps token configuration errors with helpful UI elements.

## Features

- **Professional UI**: Clean, branded interface with Azure DevOps styling
- **Action Button**: Direct button to open extension settings for token configuration
- **Documentation Link**: Direct link to Microsoft's PAT generation guide
- **State Management**: Functions to show/hide the error and check visibility
- **Modular Design**: Self-contained module with clear separation of concerns

## Usage

### Import the Module

```javascript
// Dynamic import in content script
const tokenErrorModule = await import(chrome.runtime.getURL('components/azure-devops-token-error.js'));
const azureDevOpsTokenError = tokenErrorModule;
```

### Show Token Error

```javascript
// Show the Azure DevOps token error
azureDevOpsTokenError.showAzureDevOpsTokenError(stopEnhancedLoader);
```

### Hide Token Error

```javascript
// Hide the Azure DevOps token error
azureDevOpsTokenError.hideAzureDevOpsTokenError();
```

### Check Visibility

```javascript
// Check if the token error is currently visible
const isVisible = azureDevOpsTokenError.isAzureDevOpsTokenErrorVisible();
```

## API Reference

### `showAzureDevOpsTokenError(stopEnhancedLoader)`

Displays the Azure DevOps token configuration error with helpful UI.

**Parameters:**
- `stopEnhancedLoader` (Function, optional): Function to stop the enhanced loader if running

**Returns:** `void`

### `hideAzureDevOpsTokenError()`

Hides the Azure DevOps token error if it's currently visible.

**Parameters:** None

**Returns:** `void`

### `isAzureDevOpsTokenErrorVisible()`

Checks if the Azure DevOps token error is currently visible.

**Parameters:** None

**Returns:** `boolean` - True if the token error is visible

## UI Components

The module creates the following UI elements:

1. **Heading**: "Azure DevOps Personal Access Token Issue" (centered, styled)
2. **Description**: Clear explanation of what's needed (centered, styled)
3. **Settings Button**: Opens extension popup for token configuration (single state)
4. **Documentation Link**: Links to Microsoft's PAT generation guide

## Dependencies

- Chrome Extension APIs (`chrome.runtime.sendMessage`)
- DOM manipulation functions
- CSS classes from the integrated review component

## Error Handling

The module includes fallback error handling:
- If the module fails to load, content.js falls back to a generic error message
- Chrome runtime errors are logged but don't break the UI
- Button states are properly managed during async operations

## Styling

The module uses distinctive CSS classes optimized for dark backgrounds:
- `gl-p-5`, `gl-text-center`, `gl-mb-5` for layout
- `azure-devops-token-heading` - Light heading text (#e6e6e6) with text shadow
- `azure-devops-token-description` - Light description text (#b3b3b3) with text shadow
- `azure-devops-token-actions` - Action buttons container
- `azure-devops-token-settings-button` - Settings button with enhanced shadow
- `azure-devops-token-learn-link` - Light blue link (#4da6ff) with text shadow
- Inline styles optimized for dark background visibility
