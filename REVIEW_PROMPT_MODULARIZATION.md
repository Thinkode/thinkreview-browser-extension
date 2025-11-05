# Review Prompt Component Modularization

## Overview

The review prompt functionality has been successfully modularized into a reusable, maintainable component that can be easily imported and used across different parts of the extension or even in other projects.

## What Was Modularized

### Before Modularization
- All review prompt logic was embedded in `integrated-review.js`
- Hard-coded configuration values
- Inline HTML generation
- Mixed concerns (review display + prompt logic)
- Difficult to test and maintain

### After Modularization
- Separate `ReviewPrompt` class with clear API
- Configurable settings
- Modular CSS file
- Event-driven architecture
- Easy to test and extend

## New File Structure

```
components/
├── review-prompt/
│   ├── review-prompt.js      # Main component class
│   ├── review-prompt.css     # Component-specific styles
│   ├── index.js             # Module entry point
│   └── README.md            # Comprehensive documentation
├── integrated-review.js      # Updated to use modular component
└── integrated-review.css     # Cleaned up (removed prompt styles)
```

## Key Benefits

### 1. **Reusability**
```javascript
// Can be used in multiple places
import { ReviewPrompt } from './components/review-prompt/index.js';

const prompt1 = new ReviewPrompt({ threshold: 10 });
const prompt2 = new ReviewPrompt({ threshold: 50 });
```

### 2. **Configurability**
```javascript
const customPrompt = new ReviewPrompt({
  threshold: 25,
  chromeStoreUrl: 'https://my-store.com',
  feedbackUrl: 'https://my-feedback.com',
  storageKeys: {
    reviewCount: 'customCount',
    neverAskAgain: 'customNever',
    dismissedSession: 'customDismissed'
  }
});
```

### 3. **Event-Driven Architecture**
```javascript
// Listen for user interactions
document.addEventListener('review-prompt:rated', (event) => {
  analytics.track('review_prompt_rated', event.detail);
});

document.addEventListener('review-prompt:dismissed', (event) => {
  console.log('User dismissed:', event.detail.permanent);
});
```

### 4. **Easy Testing**
```javascript
// Test individual methods
const prompt = new ReviewPrompt();
assert(prompt.shouldShow(104) === false);
assert(prompt.shouldShow(105) === true);

// Reset for testing
prompt.resetPreferences();
```

### 5. **Clean Separation of Concerns**
- **ReviewPrompt Class**: Handles prompt logic and state
- **CSS Module**: Handles styling and animations
- **Index Module**: Provides convenient API
- **Integration**: Simple import and use

## API Reference

### Basic Usage
```javascript
import { initReviewPrompt, checkAndShowReviewPrompt } from './components/review-prompt/index.js';

// Initialize
initReviewPrompt('my-container');

// Check and show
await checkAndShowReviewPrompt();
```

### Advanced Usage
```javascript
import { ReviewPrompt } from './components/review-prompt/index.js';

const prompt = new ReviewPrompt({
  threshold: 50,
  chromeStoreUrl: 'https://my-store.com'
});

prompt.init('container-id');
await prompt.checkAndShow();
```

### Available Methods
- `init(containerId)` - Initialize component
- `shouldShow(reviewCount)` - Check if should show
- `getCurrentReviewCount()` - Get current count
- `checkAndShow()` - Check conditions and show
- `show()` - Display prompt
- `hide()` - Hide prompt
- `handleRating(rating)` - Process user rating
- `dismiss()` - Dismiss for session
- `dismissPermanently()` - Dismiss permanently
- `resetPreferences()` - Reset for testing
- `updateConfig(newConfig)` - Update settings
- `destroy()` - Clean up

## Configuration Options

### Default Configuration
```javascript
{
  threshold: 105, // Show after 105 reviews
  chromeStoreUrl: 'https://chrome.google.com/webstore/detail/...',
  feedbackUrl: 'https://thinkodeai.com/Give-us-feedback.html',
  storageKeys: {
    reviewCount: 'reviewCount',
    neverAskAgain: 'gitlab-mr-review-prompt-never',
    dismissedSession: 'gitlab-mr-review-prompt-dismissed'
  }
}
```

### Custom Configuration
```javascript
{
  threshold: 25, // Custom threshold
  chromeStoreUrl: 'https://my-store.com',
  feedbackUrl: 'https://my-feedback.com',
  storageKeys: {
    reviewCount: 'myReviewCount',
    neverAskAgain: 'myNeverAsk',
    dismissedSession: 'myDismissed'
  }
}
```

## Events System

The component emits custom events for integration:

### `review-prompt:rated`
Emitted when user provides a rating.
```javascript
{
  rating: 5,
  reviewCount: 105
}
```

### `review-prompt:dismissed`
Emitted when user dismisses the prompt.
```javascript
{
  permanent: false // or true for "Don't Ask Again"
}
```

## Integration Examples

### With React
```jsx
import { useEffect, useRef } from 'react';
import { initReviewPrompt } from './components/review-prompt/index.js';

function ReviewComponent() {
  const containerRef = useRef();

  useEffect(() => {
    if (containerRef.current) {
      initReviewPrompt(containerRef.current.id);
    }
  }, []);

  return <div ref={containerRef} id="review-container" />;
}
```

### With Vue
```vue
<template>
  <div id="review-container" ref="container"></div>
</template>

<script>
import { initReviewPrompt } from './components/review-prompt/index.js';

export default {
  mounted() {
    initReviewPrompt(this.$refs.container.id);
  }
};
</script>
```

### With Vanilla JavaScript
```javascript
document.addEventListener('DOMContentLoaded', () => {
  initReviewPrompt('my-review-container');
});

async function afterReview() {
  await checkAndShowReviewPrompt();
}
```

## Styling

The component includes its own CSS file with:

- GitLab-styled alerts and buttons
- Star rating animations
- Responsive design
- Accessibility features
- High contrast mode support
- Reduced motion support

### Custom Styling
```css
#review-prompt .star-rating-btn {
  font-size: 24px;
  color: #ff6b35;
}

#review-prompt .gl-alert-info {
  background-color: #f0f8ff;
  border-color: #0066cc;
}
```

## Testing

### Manual Testing
```javascript
// Reset preferences
resetReviewPromptPreferences();

// Force show
const prompt = getReviewPrompt();
prompt.show();

// Test rating
prompt.handleRating(5);
```

### Automated Testing
```javascript
// Test threshold logic
assert(prompt.shouldShow(104) === false);
assert(prompt.shouldShow(105) === true);

// Test dismissal
localStorage.setItem('gitlab-mr-review-prompt-never', 'true');
assert(prompt.shouldShow(105) === false);
```

## Migration Guide

### From Old Implementation

**Old Code:**
```javascript
// Inline functions in integrated-review.js
function shouldShowReviewPrompt(reviewCount) {
  return reviewCount >= 10;
}

function showReviewPrompt() {
  // Inline HTML generation
}

function handleReviewRating(rating) {
  // Inline logic
}
```

**New Code:**
```javascript
// Import modular component
import { initReviewPrompt, checkAndShowReviewPrompt } from './components/review-prompt/index.js';

// Initialize once
initReviewPrompt('gitlab-mr-integrated-review');

// Use after each review
await checkAndShowReviewPrompt();
```

### Benefits of Migration
- ✅ Cleaner, more maintainable code
- ✅ Reusable across different parts of extension
- ✅ Easy to test and debug
- ✅ Configurable for different use cases
- ✅ Event-driven for better integration
- ✅ Better separation of concerns

## Future Enhancements

### Potential Improvements
1. **A/B Testing Support**: Different prompts for different user segments
2. **Analytics Integration**: Built-in tracking of user interactions
3. **Localization**: Multi-language support
4. **Theming**: Multiple visual themes
5. **Advanced Configuration**: More granular control options

### Extension Points
```javascript
// Custom rating handler
prompt.onRating = (rating) => {
  // Custom logic
};

// Custom dismissal handler
prompt.onDismiss = (permanent) => {
  // Custom logic
};
```

## Conclusion

The modularization of the review prompt component provides:

- **Better Code Organization**: Clear separation of concerns
- **Improved Maintainability**: Easy to update and debug
- **Enhanced Reusability**: Can be used in multiple contexts
- **Better Testing**: Isolated component for unit testing
- **Future-Proof**: Easy to extend and enhance

The component is now production-ready and can be easily integrated into any part of the extension or other projects that need similar functionality. 