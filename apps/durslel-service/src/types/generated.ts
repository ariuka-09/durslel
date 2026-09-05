import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Timestamp: { input: any; output: any; }
};

/**
 * A payment Wire has confirmed. paymentIntent is the id of the intent that paid for it, and is
 * what makes activation exactly-once: Wire can deliver the same event more than once, and each
 * delivery must not buy another 30 days.
 */
export type ActivateSubscriptionInput = {
  paymentIntent: Scalars['String']['input'];
  tier: SubscriptionTier;
};

/**
 * What the renderer reports about a job it owns: the outcome once manim has finished or failed,
 * and before that the move from QUEUED to PENDING as a slot frees. Every field except status is
 * about an outcome and stays null on the intermediate writes.
 */
export type CompleteRenderInput = {
  attempts?: InputMaybe<Scalars['Int']['input']>;
  durationMs?: InputMaybe<Scalars['Int']['input']>;
  error?: InputMaybe<Scalars['String']['input']>;
  sceneClass?: InputMaybe<Scalars['String']['input']>;
  status: RenderStatus;
  url?: InputMaybe<Scalars['String']['input']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  /**
   * Records a paid subscription for the user the caller is acting for, extending any period still
   * running rather than replacing it.
   *
   * Callable only by the deployment itself, with the shared secret — never from a browser, where
   * it would be a button that grants a paid tier for free. The webhook that calls it acts on a
   * signature-verified Wire event, long after the buyer's own session has gone.
   */
  activateSubscription: User;
  /**
   * Records where a render has got to. Called by the renderer, not by a browser: it runs after the
   * request that started it is long gone, so it authenticates as the service. Usually the final
   * outcome, but also the QUEUED and PENDING transitions while a job waits for a slot.
   */
  completeRender: Render;
  deleteRender: Response;
  /**
   * Requests a render and returns immediately with a PENDING row. manim takes up to three
   * minutes, far longer than a request should be held open, so the client polls getRender until
   * status leaves PENDING rather than waiting on this call.
   */
  startRender: Render;
  updateRender: Render;
  /**
   * Creates the caller's row or refreshes it from Clerk. Safe to call on every sign-in: the id
   * and the role both come from the verified session, never from the input, so this can neither
   * write another user nor promote one.
   */
  upsertUser: User;
};


export type MutationActivateSubscriptionArgs = {
  input: ActivateSubscriptionInput;
};


export type MutationCompleteRenderArgs = {
  input: CompleteRenderInput;
  jobId: Scalars['String']['input'];
};


export type MutationDeleteRenderArgs = {
  id: Scalars['ID']['input'];
};


export type MutationStartRenderArgs = {
  prompt: Scalars['String']['input'];
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
   * Renders newest first. Defaults to the caller's own; an admin may name another user, which is
   * the admin dashboard's one query. Anyone else asking for someone else's is refused.
   */
  getRenders: Array<Render>;
  /**
   * The caller. Null when the request carries no valid session, which is how an anonymous
   * visitor is reported rather than an error.
   */
  me?: Maybe<User>;
  /**
   * Everyone who has signed in, newest first — the admin dashboard's left-hand list. Admin only,
   * checked against the session token rather than against the role stored on the row.
   */
  users: Array<User>;
};


export type QueryGetRenderArgs = {
  id: Scalars['ID']['input'];
};


export type QueryGetRenderByJobIdArgs = {
  jobId: Scalars['String']['input'];
};


export type QueryGetRendersArgs = {
  creatorId?: InputMaybe<Scalars['ID']['input']>;
};

/**
 * A render. The row exists from the moment one is requested, so a job still running and a job
 * that failed are both visible — status says which, and it is what a client polls on.
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
  /** Why it failed, when it did. Null on every other status. */
  error?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  jobId: Scalars['String']['output'];
  prompt: Scalars['String']['output'];
  sceneClass?: Maybe<Scalars['String']['output']>;
  status: RenderStatus;
  title: Scalars['String']['output'];
  updatedAt: Scalars['Timestamp']['output'];
  /** Null until the render finishes. The address its video is served at. */
  url?: Maybe<Scalars['String']['output']>;
};

export enum RenderStatus {
  Failed = 'FAILED',
  Ok = 'OK',
  Pending = 'PENDING',
  /**
   * Accepted, but waiting for a free render slot. The renderer runs a fixed number of manim
   * processes at once because manim is single-threaded, so a burst queues rather than all
   * starting at once and finishing later. Distinct from PENDING so a client can say why nothing
   * is happening yet, and so it does not start counting a stall against a job that has not begun.
   */
  Queued = 'QUEUED'
}

export enum Response {
  Success = 'SUCCESS'
}

/**
 * What a person is allowed to do. Clerk owns this — it lives in their public metadata and rides
 * in on the session token — and the users table only mirrors it, so nothing here can grant it.
 */
export enum Role {
  Admin = 'ADMIN',
  User = 'USER'
}

/**
 * What a person is paying for. FREE is the default and the only tier nobody buys; the rest are
 * granted by a confirmed Wire payment and last 30 days from it.
 *
 * Read from User.subscription, which reports FREE once the paid period has run out — the stored
 * tier is not cleared on expiry, so a lapsed subscriber keeps their history and their old tier
 * reappears if they pay again.
 */
export enum SubscriptionTier {
  Basic = 'BASIC',
  Free = 'FREE',
  Pro = 'PRO',
  Studio = 'STUDIO'
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
 * translation. Name, email and role are a cache of Clerk's copy and may lag it.
 */
export type User = {
  __typename?: 'User';
  createdAt: Scalars['Timestamp']['output'];
  email?: Maybe<Scalars['String']['output']>;
  firstName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lastName?: Maybe<Scalars['String']['output']>;
  role: Role;
  /**
   * The tier in force right now: FREE once subscriptionUntil has passed, whatever was bought
   * until then.
   */
  subscription: SubscriptionTier;
  /** When the paid period ends. Null for someone who has never paid. */
  subscriptionUntil?: Maybe<Scalars['Timestamp']['output']>;
  updatedAt: Scalars['Timestamp']['output'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;

export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs>;

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

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  ActivateSubscriptionInput: ActivateSubscriptionInput;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  CompleteRenderInput: CompleteRenderInput;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Mutation: ResolverTypeWrapper<{}>;
  Query: ResolverTypeWrapper<{}>;
  Render: ResolverTypeWrapper<Render>;
  RenderStatus: RenderStatus;
  Response: Response;
  Role: Role;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  SubscriptionTier: SubscriptionTier;
  Timestamp: ResolverTypeWrapper<Scalars['Timestamp']['output']>;
  UpdateRenderInput: UpdateRenderInput;
  UpsertUserInput: UpsertUserInput;
  User: ResolverTypeWrapper<User>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  ActivateSubscriptionInput: ActivateSubscriptionInput;
  Boolean: Scalars['Boolean']['output'];
  CompleteRenderInput: CompleteRenderInput;
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Mutation: {};
  Query: {};
  Render: Render;
  String: Scalars['String']['output'];
  Timestamp: Scalars['Timestamp']['output'];
  UpdateRenderInput: UpdateRenderInput;
  UpsertUserInput: UpsertUserInput;
  User: User;
};

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  activateSubscription?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationActivateSubscriptionArgs, 'input'>>;
  completeRender?: Resolver<ResolversTypes['Render'], ParentType, ContextType, RequireFields<MutationCompleteRenderArgs, 'input' | 'jobId'>>;
  deleteRender?: Resolver<ResolversTypes['Response'], ParentType, ContextType, RequireFields<MutationDeleteRenderArgs, 'id'>>;
  startRender?: Resolver<ResolversTypes['Render'], ParentType, ContextType, RequireFields<MutationStartRenderArgs, 'prompt'>>;
  updateRender?: Resolver<ResolversTypes['Render'], ParentType, ContextType, RequireFields<MutationUpdateRenderArgs, 'id' | 'input'>>;
  upsertUser?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationUpsertUserArgs, 'input'>>;
};

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  getRender?: Resolver<Maybe<ResolversTypes['Render']>, ParentType, ContextType, RequireFields<QueryGetRenderArgs, 'id'>>;
  getRenderByJobId?: Resolver<Maybe<ResolversTypes['Render']>, ParentType, ContextType, RequireFields<QueryGetRenderByJobIdArgs, 'jobId'>>;
  getRenders?: Resolver<Array<ResolversTypes['Render']>, ParentType, ContextType, Partial<QueryGetRendersArgs>>;
  me?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  users?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType>;
};

export type RenderResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Render'] = ResolversParentTypes['Render']> = {
  attempts?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Timestamp'], ParentType, ContextType>;
  creator?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  creatorId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  durationMs?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  jobId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  prompt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sceneClass?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['RenderStatus'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Timestamp'], ParentType, ContextType>;
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
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
  role?: Resolver<ResolversTypes['Role'], ParentType, ContextType>;
  subscription?: Resolver<ResolversTypes['SubscriptionTier'], ParentType, ContextType>;
  subscriptionUntil?: Resolver<Maybe<ResolversTypes['Timestamp']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Timestamp'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = Context> = {
  Mutation?: MutationResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Render?: RenderResolvers<ContextType>;
  Timestamp?: GraphQLScalarType;
  User?: UserResolvers<ContextType>;
};

