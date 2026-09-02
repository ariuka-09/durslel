export default {
  displayName: 'durslel-service',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // nanoid ships ESM only, so it has to be transformed rather than passed through.
  transformIgnorePatterns: ['node_modules/(?!(nanoid)/)'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/durslel-service',
  collectCoverageFrom: ['src/common/**/*.ts', 'src/resolvers/**/*.ts', '!src/**/index.ts', '!src/**/*.spec.ts'],
};
