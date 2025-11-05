# Release Notes Directory

This directory contains user-facing release notes for ThinkReview (GitLab MR Reviews Extension).

## 📁 File Naming Convention

Release notes files should follow this naming pattern:
```
release_notes_v{major}.{minor}.{patch}.md
```

**Examples:**
- `release_notes_v1.2.7.md`
- `release_notes_v1.3.0.md`
- `release_notes_v2.0.0.md`

## 📝 Creating New Release Notes

1. Copy `TEMPLATE.md` to create a new release notes file
2. Rename it following the naming convention above
3. Fill in the sections with your release information
4. Remove any sections that don't apply to your release
5. Keep the tone user-friendly and avoid technical jargon

## ✍️ Writing Guidelines

### Do's ✅
- Focus on user benefits, not technical implementation
- Use clear, concise language
- Include emojis for visual appeal (but don't overdo it)
- Explain "why" features matter, not just "what" they do
- Provide usage examples and tips
- Include before/after comparisons for improvements

### Don'ts ❌
- Don't expose internal API endpoints or configurations
- Never mention any internal functions or code used in the extensiom
- Don't use overly technical language
- Don't include sensitive information (API keys, credentials, etc.)
- Don't forget to update the release date
- Don't leave placeholder text in published notes

## 📋 Release Notes Sections

Each release note should include relevant sections from:

1. **What's New** - New features and major changes
2. **Performance Improvements** - Speed and optimization updates
3. **Additional Improvements** - Minor enhancements
4. **Usage Tips** - How to use new features
5. **Bug Fixes** - Resolved issues
6. **Breaking Changes** - Any changes that affect existing functionality
7. **Support** - Contact information and feedback channels

## 🚀 Publishing Release Notes

When ready to publish:
1. Update the release date in the file
2. Review for typos and clarity
3. Ensure all placeholder text is replaced
4. Consider creating a short version for update notifications
5. Update the main CHANGELOG.md file with a summary

## 📚 Version History

- v1.3.3 - Smart media file filtering & improved sign-in experience
- v1.3.1 - Multilingual AI code reviews (13 languages)
- v1.3.0 - Smart follow-up questions & MR comment generation
- v1.2.7 - Manual review control & performance improvements
- v1.2.6 - Manual AI review control & bug fixes
- v1.2.5 - Broader browser support & enhanced sign-in experience
- v1.2.3 - Enhanced onboarding experience & smarter permissions
- v1.2.2 - Enhanced user experience & better error handling
- v1.1.3 - Premium subscription & payment integration
- v1.1.2 - Privacy-first onboarding & resizable review panel
- v1.1.1 - Custom GitLab domain support & review tracking
- v1.0.0 - Initial release with integrated AI code review panel

