import { GraphQLResolverMap } from '@apollo/subgraph';
import { GraphQLFieldResolver } from 'graphql';
import { TimestampResolver } from 'graphql-scalars';

import { Render } from './fields/render';
import * as Mutation from './mutations';
import * as Query from './queries';

export const resolvers: GraphQLResolverMap<Context> = {
  Timestamp: TimestampResolver,

  Query: Query as unknown as { [fieldName: string]: GraphQLFieldResolver<unknown, Context> },
  Mutation: Mutation as unknown as { [fieldName: string]: GraphQLFieldResolver<unknown, Context> },

  // Field resolvers for relations. The reference service had none — it has no table that points
  // at another — so this key is an addition rather than a departure from its shape.
  Render: Render as unknown as { [fieldName: string]: GraphQLFieldResolver<unknown, Context> },
};
