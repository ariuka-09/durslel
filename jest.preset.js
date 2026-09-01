const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  coverageReporters: ['text', 'html'],
  // The reference enforces this, and it is the point of having a spec per resolver: an untested
  // branch in an authorisation check is exactly the kind of gap that reads as covered otherwise.
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
