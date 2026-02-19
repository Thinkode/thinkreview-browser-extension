/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  rootDir: '.',
  moduleFileExtensions: ['js'],
  transform: {},
  testPathIgnorePatterns: ['/node_modules/'],
};
