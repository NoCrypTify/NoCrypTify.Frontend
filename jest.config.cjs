/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  // Playwright E2E specs live in ./e2e and must not be run by Jest.
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
};
