import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Timestamp: { input: unknown; output: unknown; }
};

export type CreateRenderInput = {
  attempts?: InputMaybe<Scalars['Int']['input']>;
  durationMs?: InputMaybe<Scalars['Int']['input']>;
  jobId: Scalars['String']['input'];
  prompt: Scalars['String']['input'];
  sceneClass?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
  url: Scalars['String']['input'];
};

export type Mutation = {
  __typename?: 'Mutation';
  createRender: Render;
  deleteRender: Response;
  updateRender: Render;
  /**
   * Creates the caller's row or refreshes it from Clerk. Safe to call on every sign-in: the id
   * comes from the verified session, never from the input, so this cannot write another user.
   */
  upsertUser: User;
};


export type MutationCreateRenderArgs = {
  input: CreateRenderInput;
};


export type MutationDeleteRenderArgs = {
  id: Scalars['ID']['input'];
};


export type MutationUpdateRenderArgs = {
  id: Scalars['ID']['input'];
  input: UpdateRenderInput;
};


export type MutationUpsertUserArgs = {
  input: UpsertUserInput;
};

export type Query = {
  __typename?: 'Query';
  getRender?: Maybe<Render>;
  /** Look up by storage key. What the app has in hand when reopening a render from its video URL. */
  getRenderByJobId?: Maybe<Render>;
  /**
   * The caller's own renders, newest first. Scoped to the session rather than taking a user
   * argument, so one person cannot list another's by guessing an id.
   */
  getRenders: Array<Render>;
  /**
   * The caller. Null when the request carries no valid session, which is how an anonymous
   * visitor is reported rather than an error.
   */
  me?: Maybe<User>;
};


export type QueryGetRenderArgs = {
  id: Scalars['ID']['input'];
};


export type QueryGetRenderByJobIdArgs = {
  jobId: Scalars['String']['input'];
};

/**
 * One finished render. jobId is the storage key its video and source live under; url is the
 * address that video was served at.
 */
export type Render = {
  __typename?: 'Render';
  attempts: Scalars['Int']['output'];
  createdAt: Scalars['Timestamp']['output'];
  /**
   * Resolved from creatorId. Being able to ask for the render and its author in one round trip is
   * most of the reason this is GraphQL rather than two REST calls.
   */
  creator?: Maybe<User>;
  creatorId: Scalars['ID']['output'];
  durationMs?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  jobId: Scalars['String']['output'];
  prompt: Scalars['String']['output'];
  sceneClass?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  updatedAt: Scalars['Timestamp']['output'];
  url: Scalars['String']['output'];
};

export enum Response {
  Success = 'SUCCESS'
}

export type UpdateRenderInput = {
  title?: InputMaybe<Scalars['String']['input']>;
};

export type UpsertUserInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  firstName?: InputMaybe<Scalars['String']['input']>;
  lastName?: InputMaybe<Scalars['String']['input']>;
};

/**
 * A signed-in person. The id is Clerk's, so it is the same value a session carries and needs no
 * translation. Name and email are a cache of Clerk's copy and may lag it.
 */
export type User = {
  __typename?: 'User';
  createdAt: Scalars['Timestamp']['output'];
  email?: Maybe<Scalars['String']['output']>;
  firstName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lastName?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['Timestamp']['output'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;

export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  CreateRenderInput: CreateRenderInput;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Render: ResolverTypeWrapper<Render>;
  Response: Response;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Timestamp: ResolverTypeWrapper<Scalars['Timestamp']['output']>;
  UpdateRenderInput: UpdateRenderInput;
  UpsertUserInput: UpsertUserInput;
  User: ResolverTypeWrapper<User>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Boolean: Scalars['Boolean']['output'];
  CreateRenderInput: CreateRenderInput;
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Mutation: Record<PropertyKey, never>;
  Query: Record<PropertyKey, never>;
  Render: Render;
  String: Scalars['String']['output'];
  Timestamp: Scalars['Timestamp']['output'];
  UpdateRenderInput: UpdateRenderInput;
  UpsertUserInput: UpsertUserInput;
  User: User;
};

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  createRender?: Resolver<ResolversTypes['Render'], ParentType, ContextType, RequireFields<MutationCreateRenderArgs, 'input'>>;
  deleteRender?: Resolver<ResolversTypes['Response'], ParentType, ContextType, RequireFields<MutationDeleteRenderArgs, 'id'>>;
  updateRender?: Resolver<ResolversTypes['Render'], ParentType, ContextType, RequireFields<MutationUpdateRenderArgs, 'id' | 'input'>>;
  upsertUser?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationUpsertUserArgs, 'input'>>;
};

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  getRender?: Resolver<Maybe<ResolversTypes['Render']>, ParentType, ContextType, RequireFields<QueryGetRenderArgs, 'id'>>;
  getRenderByJobId?: Resolver<Maybe<ResolversTypes['Render']>, ParentType, ContextType, RequireFields<QueryGetRenderByJobIdArgs, 'jobId'>>;
  getRenders?: Resolver<Array<ResolversTypes['Render']>, ParentType, ContextType>;
  me?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
};

export type RenderResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Render'] = ResolversParentTypes['Render']> = {
  attempts?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Timestamp'], ParentType, ContextType>;
  creator?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  creatorId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  durationMs?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  jobId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  prompt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sceneClass?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Timestamp'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export interface TimestampScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Timestamp'], any> {
  name: 'Timestamp';
}

export type UserResolvers<ContextType = Context, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  createdAt?: Resolver<ResolversTypes['Timestamp'], ParentType, ContextType>;
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  firstName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Timestamp'], ParentType, ContextType>;
};

export type Resolvers<ContextType = Context> = {
  Mutation?: MutationResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Render?: RenderResolvers<ContextType>;
  Timestamp?: GraphQLScalarType;
  User?: UserResolvers<ContextType>;
};

