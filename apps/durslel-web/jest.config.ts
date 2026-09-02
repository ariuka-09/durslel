export default {
  displayName: 'durslel-web',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'html'],
  // `next build` copies the app — specs included — into .next/standalone. Without this, every
  // spec runs twice: once from source and once from a stale build artefact.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.next/'],
  coverageDirectory: '../../coverage/apps/durslel-web',
  collectCoverageFrom: ['lib/**/*.ts', '!lib/**/*.spec.ts'],
};
