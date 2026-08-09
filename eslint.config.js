import globals from 'globals';

/** Correctness-focused ESLint config for the extension.
 * Catches parse/syntax failures and clear bugs without style nits.
 */
export default [
  {
    ignores: [
      'node_modules/**',
      'build/**',
      'build-firefox/**',
      'vendor/**',
      'coverage/**',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.node,
        chrome: 'readonly',
        browser: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unexpected-multiline': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      'no-sparse-arrays': 'error',
      'no-unsafe-negation': 'error',
      'no-obj-calls': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-constant-binary-expression': 'error',
      'no-setter-return': 'error',
      'constructor-super': 'error',
      'no-this-before-super': 'error',
      'no-class-assign': 'error',
      'no-const-assign': 'error',
      'no-new-native-nonconstructor': 'error',
      'for-direction': 'error',
      'getter-return': 'error',
      'no-async-promise-executor': 'error',
      'no-misleading-character-class': 'error',
      'no-useless-backreference': 'error',
      'require-yield': 'error',
    },
  },
  // Classic content scripts share symbols via dynamic imports / window.*
  {
    files: ['content.js', 'content-webapp-auth.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        createIntegratedReviewPanel: 'readonly',
        displayIntegratedReview: 'readonly',
        showIntegratedReviewError: 'readonly',
        startEnhancedLoader: 'readonly',
        stopEnhancedLoader: 'readonly',
        fetchAndDisplayCodeReview: 'writable',
        platformDetector: 'writable',
      },
    },
  },
  {
    files: ['components/integrated-review.js'],
    languageOptions: {
      globals: {
        fetchAndDisplayCodeReview: 'readonly',
        platformDetector: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];
