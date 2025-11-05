# Contributing to ThinkReview

First off, thank you for considering contributing to ThinkReview! 🎉

It's people like you that make ThinkReview such a great tool.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Style Guidelines](#style-guidelines)
- [Commit Messages](#commit-messages)
- [Additional Notes](#additional-notes)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [issue list](https://github.com/Thinkode/thinkreview-extension/issues) as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

**Before Submitting A Bug Report:**
- Check the [documentation](README.md)
- Check if the issue has already been reported
- Perform a search to see if the problem has already been reported

**How Do I Submit A Good Bug Report?**

Bugs are tracked as [GitHub issues](https://github.com/Thinkode/thinkreview-extension/issues). Create an issue and provide the following information:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** to demonstrate the steps
- **Describe the behavior you observed** after following the steps
- **Explain which behavior you expected to see** instead and why
- **Include screenshots** if possible
- **Include your environment details:**
  - Browser version (Chrome, Edge, Brave, etc.)
  - Extension version
  - Operating System

### Suggesting Enhancements

Enhancement suggestions are tracked as [GitHub issues](https://github.com/Thinkode/thinkreview-extension/issues). When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a step-by-step description** of the suggested enhancement
- **Provide specific examples** to demonstrate the steps
- **Describe the current behavior** and **explain which behavior you expected to see instead**
- **Explain why this enhancement would be useful**
- **List some other extensions where this enhancement exists** (if applicable)

### Pull Requests

- Fill in the pull request template
- Follow the [style guidelines](#style-guidelines)
- Include screenshots and animated GIFs in your pull request whenever possible
- End all files with a newline
- Avoid platform-dependent code

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- Chrome, Edge, or any Chromium-based browser
- Git

### Setup Instructions

1. **Fork the repository**

   Click the "Fork" button at the top right of the repository page.

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR-USERNAME/thinkreview-extension.git
   cd thinkreview-extension
   ```

3. **Install dependencies (optional, for linting)**

   ```bash
   npm install
   ```

4. **Load the extension in Chrome**

   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `thinkreview-extension` directory

5. **Make your changes**

   Create a new branch for your feature or bug fix:

   ```bash
   git checkout -b feature/your-feature-name
   ```

6. **Test your changes**

   - Navigate to a GitLab merge request or Azure DevOps pull request
   - Verify the extension works as expected
   - Test on multiple browsers if possible

7. **Run linting (if you installed npm packages)**

   ```bash
   npm run lint
   npm run validate
   ```

8. **Commit your changes**

   ```bash
   git add .
   git commit -m "Add your descriptive commit message"
   ```

9. **Push to your fork**

   ```bash
   git push origin feature/your-feature-name
   ```

10. **Create a Pull Request**

    Go to the original repository and click "New Pull Request"

## Style Guidelines

### JavaScript Style Guide

- Use **ES6+ syntax** (const, let, arrow functions, etc.)
- Use **meaningful variable names**
- Add **comments for complex logic**
- Follow **existing code patterns** in the project
- Keep functions **small and focused**
- Avoid **deeply nested code**

**Example:**

```javascript
// Good
const fetchUserData = async (userId) => {
  try {
    const response = await fetch(`/api/users/${userId}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user data:', error);
    return null;
  }
};

// Avoid
function getData(id){var x=fetch('/api/users/'+id);return x.json()}
```

### HTML/CSS Style Guide

- Use **semantic HTML**
- Use **consistent indentation** (2 spaces)
- Use **meaningful class names**
- Follow **existing naming conventions**

### File Organization

- Keep related files together
- Use descriptive file names
- Follow the existing project structure:
  - `components/` - UI components
  - `services/` - Backend integration
  - `utils/` - Helper functions

## Commit Messages

### Commit Message Format

```
<type>: <subject>

<body>

<footer>
```

### Type

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (formatting, etc.)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Changes to build process or auxiliary tools

### Examples

```
feat: add support for Firefox browser

- Implement Firefox-specific OAuth flow
- Update manifest for Firefox compatibility
- Add Firefox-specific styling fixes

Closes #123
```

```
fix: resolve memory leak in content script

The content script was not properly cleaning up event listeners
when navigating between pages, causing memory accumulation.

Fixes #456
```

## Additional Notes

### Backend Services

Please note that ThinkReview requires connection to proprietary backend services hosted by Thinkode. While you can modify and improve the extension frontend, the AI review functionality depends on our backend infrastructure.

For questions about backend API access or commercial licensing, please contact support@thinkode.co.uk

### Issue and Pull Request Labels

- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Improvements or additions to documentation
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention is needed
- `question` - Further information is requested

### Questions?

Feel free to:
- Open a [GitHub Discussion](https://github.com/Thinkode/thinkreview-extension/discussions)
- Email us at support@thinkode.co.uk
- Visit our website at [thinkreview.dev](https://thinkreview.dev)

---

Thank you for contributing to ThinkReview! 🚀
