import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  generates: {
    './apps/durslel-web/generated/index.ts': {
      // Read straight from the service's schema files rather than a published artefact, so a
      // resolver and the code calling it cannot drift apart without codegen noticing.
      schema: ['./apps/durslel-service/src/schemas/*.schema.ts'],
      documents: ['./apps/durslel-web/shared/graphql/**/*.graphql'],
      config: {
        reactApolloVersion: 3,
        withHooks: true,
        // Epoch milliseconds, which is what graphql-scalars' Timestamp serialises a Date to.
        // Left unmapped it arrives as `unknown` and every read of createdAt needs a cast.
        scalars: { Timestamp: 'number' },
      },
      plugins: ['typescript', 'typescript-operations', 'typescript-react-apollo'],
    },
  },
  overwrite: true,
};

export default config;
