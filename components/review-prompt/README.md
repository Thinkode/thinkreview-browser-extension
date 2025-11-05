# Review Prompt Component

A modular, reusable component for displaying user feedback prompts after generating a certain number of reviews.

## Features

- 🎯 **Configurable Threshold**: Show prompt after any number of reviews
- ⭐ **Star Rating System**: 1-5 star rating with visual feedback
- 🎨 **Customizable Styling**: GitLab-styled alerts and buttons
- 💾 **State Management**: Session and permanent dismissal options
- 🔄 **Event System**: Custom events for integration
- 📱 **Responsive Design**: Works on all screen sizes
- ♿ **Accessibility**: Screen reader support and keyboard navigation

## Quick Start

### Basic Usage

```javascript
// Import the component
import { initReviewPrompt, checkAndShowReviewPrompt } from './components/review-prompt/index.js';

// Initialize with default settings
const reviewPrompt = initReviewPrompt('gitlab-mr-integrated-review');

// Check and show prompt after a review
await checkAndShowReviewPrompt();
```

### Advanced Configuration

```javascript
import { ReviewPrompt } from './components/review-prompt/index.js';

// Create custom instance
const customPrompt = new ReviewPrompt({
  threshold: 50, // Show after 50 reviews
  chromeStoreUrl: 'https://chrome.google.com/webstore/detail/your-extension/ID',
  feedbackUrl: 'https://your-feedback-form.com',
  storageKeys: {
    reviewCount: 'customReviewCount',
    neverAskAgain: 'customNeverAsk',
    dismissedSession: 'customDismissed'
  }
});

// Initialize
customPrompt.init('my-container');

// Check and show
await customPrompt.checkAndShow();
```

## API Reference

### ReviewPrompt Class

#### Constructor
```javascript
new ReviewPrompt(config = {})
```

**Config Options:**
- `threshold` (number): Number of reviews before showing prompt (default: 105)
- `chromeStoreUrl` (string): Chrome Web Store URL for positive reviews
- `feedbackUrl` (string): Feedback form URL for improvement suggestions
- `storageKeys` (object): Custom storage key names

#### Methods

##### `init(containerId)`
Initialize the component with a container ID.

##### `shouldShow(reviewCount)`
Check if prompt should be shown based on review count and user preferences.

##### `async getCurrentReviewCount()`
Get the current review count from storage or API.

##### `async checkAndShow()`
Check conditions and show prompt if needed. Returns `true` if shown.

##### `show()`
Display the review prompt.

##### `hide()`
Hide the review prompt.

##### `handleRating(rating)`
Process user rating and direct to appropriate URL.

##### `dismiss()`
Dismiss prompt for current session.

##### `dismissPermanently()`
Dismiss prompt permanently.

##### `resetPreferences()`
Reset all dismissal preferences (for testing).

##### `updateConfig(newConfig)`
Update component configuration.

##### `destroy()`
Clean up component and remove event listeners.

### Utility Functions

#### `initReviewPrompt(containerId, config)`
Initialize with default settings and return instance.

#### `checkAndShowReviewPrompt()`
Check and show prompt using default instance.

#### `resetReviewPromptPreferences()`
Reset preferences for default instance.

#### `updateReviewPromptConfig(newConfig)`
Update configuration for default instance.

#### `destroyReviewPrompt()`
Destroy default instance.

## Events

The component emits custom events that you can listen to:

```javascript
// Listen for rating events
document.addEventListener('review-prompt:rated', (event) => {
  console.log('User rated:', event.detail.rating);
  console.log('Review count:', event.detail.reviewCount);
});

// Listen for dismissal events
document.addEventListener('review-prompt:dismissed', (event) => {
  console.log('Dismissed permanently:', event.detail.permanent);
});
```

## Configuration

### Default Configuration

```javascript
const DEFAULT_CONFIG = {
  threshold: 105,
  chromeStoreUrl: 'https://chrome.google.com/webstore/detail/thinkreview-ai-code-revie/REPLACE_WITH_ACTUAL_EXTENSION_ID',
  feedbackUrl: 'https://thinkreview.dev/feedback',
  storageKeys: {
    reviewCount: 'reviewCount',
    neverAskAgain: 'gitlab-mr-review-prompt-never',
    dismissedSession: 'gitlab-mr-review-prompt-dismissed'
  }
};
```

### Custom Configuration

```javascript
const customConfig = {
  threshold: 25,
  chromeStoreUrl: 'https://chrome.google.com/webstore/detail/my-extension/ABC123',
  feedbackUrl: 'https://mycompany.com/feedback',
  storageKeys: {
    reviewCount: 'myReviewCount',
    neverAskAgain: 'myNeverAsk',
    dismissedSession: 'myDismissed'
  }
};
```

## Styling

The component includes its own CSS file (`review-prompt.css`) with:

- GitLab-styled alerts and buttons
- Star rating button animations
- Responsive design
- Accessibility features
- High contrast mode support
- Reduced motion support

### Custom Styling

You can override styles by targeting the `#review-prompt` selector:

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

## Storage

The component uses both `localStorage` and `sessionStorage`:

### localStorage
- `gitlab-mr-review-prompt-never`: Permanent dismissal flag

### sessionStorage
- `gitlab-mr-review-prompt-dismissed`: Session dismissal flag

### Chrome Storage
- `reviewCount`: Current review count (synced with extension)

## Testing

### Manual Testing

```javascript
// Reset preferences for testing
resetReviewPromptPreferences();

// Force show prompt
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

// Test dismissal logic
localStorage.setItem('gitlab-mr-review-prompt-never', 'true');
assert(prompt.shouldShow(105) === false);
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
// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initReviewPrompt('my-review-container');
});

// Check after each review
async function afterReview() {
  await checkAndShowReviewPrompt();
}
```

## Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## Dependencies

- Chrome Extension APIs (for storage)
- ES6 Modules support
- CSS Grid and Flexbox

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Changelog

### v1.0.0
- Initial release
- Modular component architecture
- Configurable threshold and URLs
- Event system
- Comprehensive documentation 


localStorage.removeItem('reviewSubmitted');