/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots:           ['<rootDir>/src'],
  testMatch:       ['**/__tests__/**/*.test.ts'],
  testTimeout:     15_000,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: false } }],
  },
};
