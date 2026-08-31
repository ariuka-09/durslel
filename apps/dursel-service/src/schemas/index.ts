import { mergeTypeDefs } from '@graphql-tools/merge';
import { TimestampTypeDefinition } from 'graphql-scalars';

import { commonTypeDefs } from './common.schema';
import { renderTypeDefs } from './render.schema';
import { userTypeDefs } from './user.schema';

export const typeDefs = mergeTypeDefs([TimestampTypeDefinition, commonTypeDefs, userTypeDefs, renderTypeDefs]);
