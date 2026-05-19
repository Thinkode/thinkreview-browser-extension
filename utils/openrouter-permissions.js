// openrouter-permissions.js
// Shared OpenRouter optional host permission helpers for popup and background.

export const OPENROUTER_ORIGINS = ['https://openrouter.ai/*'];

export async function hasOpenRouterHostPermission() {
  return chrome.permissions.contains({ origins: OPENROUTER_ORIGINS });
}
