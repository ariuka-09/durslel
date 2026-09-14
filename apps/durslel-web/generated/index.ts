import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Timestamp: { input: number; output: number; }
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
  /**
   * Renders this account may start per day, which is what a subscription buys. Follows the tier
   * in force, so it drops back to the FREE allowance the moment a paid period ends. Served from
   * here so the browser and startRender cannot disagree about it.
   */
  dailyLimit: Scalars['Int']['output'];
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

export type GetRendersQueryVariables = Exact<{
  creatorId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type GetRendersQuery = { __typename?: 'Query', getRenders: Array<{ __typename?: 'Render', id: string, jobId: string, title: string, url?: string | null, status: RenderStatus, error?: string | null, prompt: string, sceneClass?: string | null, attempts: number, durationMs?: number | null, createdAt: number }> };

export type GetRenderQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type GetRenderQuery = { __typename?: 'Query', getRender?: { __typename?: 'Render', id: string, jobId: string, title: string, url?: string | null, status: RenderStatus, error?: string | null, createdAt: number } | null };

export type StartRenderMutationVariables = Exact<{
  prompt: Scalars['String']['input'];
}>;


export type StartRenderMutation = { __typename?: 'Mutation', startRender: { __typename?: 'Render', id: string, jobId: string, title: string, url?: string | null, status: RenderStatus, createdAt: number } };

export type DeleteRenderMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteRenderMutation = { __typename?: 'Mutation', deleteRender: Response };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me?: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, email?: string | null, role: Role, subscription: SubscriptionTier, subscriptionUntil?: number | null, dailyLimit: number } | null };

export type UsersQueryVariables = Exact<{ [key: string]: never; }>;


export type UsersQuery = { __typename?: 'Query', users: Array<{ __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, email?: string | null, role: Role, createdAt: number }> };

export type UpsertUserMutationVariables = Exact<{
  input: UpsertUserInput;
}>;


export type UpsertUserMutation = { __typename?: 'Mutation', upsertUser: { __typename?: 'User', id: string, firstName?: string | null, lastName?: string | null, email?: string | null, role: Role, subscription: SubscriptionTier, subscriptionUntil?: number | null } };


export const GetRendersDocument = gql`
    query GetRenders($creatorId: ID) {
  getRenders(creatorId: $creatorId) {
    id
    jobId
    title
    url
    status
    error
    prompt
    sceneClass
    attempts
    durationMs
    createdAt
  }
}
    `;

/**
 * __useGetRendersQuery__
 *
 * To run a query within a React component, call `useGetRendersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetRendersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetRendersQuery({
 *   variables: {
 *      creatorId: // value for 'creatorId'
 *   },
 * });
 */
export function useGetRendersQuery(baseOptions?: Apollo.QueryHookOptions<GetRendersQuery, GetRendersQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetRendersQuery, GetRendersQueryVariables>(GetRendersDocument, options);
      }
export function useGetRendersLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetRendersQuery, GetRendersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetRendersQuery, GetRendersQueryVariables>(GetRendersDocument, options);
        }
export function useGetRendersSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetRendersQuery, GetRendersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetRendersQuery, GetRendersQueryVariables>(GetRendersDocument, options);
        }
export type GetRendersQueryHookResult = ReturnType<typeof useGetRendersQuery>;
export type GetRendersLazyQueryHookResult = ReturnType<typeof useGetRendersLazyQuery>;
export type GetRendersSuspenseQueryHookResult = ReturnType<typeof useGetRendersSuspenseQuery>;
export type GetRendersQueryResult = Apollo.QueryResult<GetRendersQuery, GetRendersQueryVariables>;
export const GetRenderDocument = gql`
    query GetRender($id: ID!) {
  getRender(id: $id) {
    id
    jobId
    title
    url
    status
    error
    createdAt
  }
}
    `;

/**
 * __useGetRenderQuery__
 *
 * To run a query within a React component, call `useGetRenderQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetRenderQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetRenderQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetRenderQuery(baseOptions: Apollo.QueryHookOptions<GetRenderQuery, GetRenderQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetRenderQuery, GetRenderQueryVariables>(GetRenderDocument, options);
      }
export function useGetRenderLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetRenderQuery, GetRenderQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetRenderQuery, GetRenderQueryVariables>(GetRenderDocument, options);
        }
export function useGetRenderSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<GetRenderQuery, GetRenderQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetRenderQuery, GetRenderQueryVariables>(GetRenderDocument, options);
        }
export type GetRenderQueryHookResult = ReturnType<typeof useGetRenderQuery>;
export type GetRenderLazyQueryHookResult = ReturnType<typeof useGetRenderLazyQuery>;
export type GetRenderSuspenseQueryHookResult = ReturnType<typeof useGetRenderSuspenseQuery>;
export type GetRenderQueryResult = Apollo.QueryResult<GetRenderQuery, GetRenderQueryVariables>;
export const StartRenderDocument = gql`
    mutation StartRender($prompt: String!) {
  startRender(prompt: $prompt) {
    id
    jobId
    title
    url
    status
    createdAt
  }
}
    `;
export type StartRenderMutationFn = Apollo.MutationFunction<StartRenderMutation, StartRenderMutationVariables>;

/**
 * __useStartRenderMutation__
 *
 * To run a mutation, you first call `useStartRenderMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useStartRenderMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [startRenderMutation, { data, loading, error }] = useStartRenderMutation({
 *   variables: {
 *      prompt: // value for 'prompt'
 *   },
 * });
 */
export function useStartRenderMutation(baseOptions?: Apollo.MutationHookOptions<StartRenderMutation, StartRenderMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<StartRenderMutation, StartRenderMutationVariables>(StartRenderDocument, options);
      }
export type StartRenderMutationHookResult = ReturnType<typeof useStartRenderMutation>;
export type StartRenderMutationResult = Apollo.MutationResult<StartRenderMutation>;
export type StartRenderMutationOptions = Apollo.BaseMutationOptions<StartRenderMutation, StartRenderMutationVariables>;
export const DeleteRenderDocument = gql`
    mutation DeleteRender($id: ID!) {
  deleteRender(id: $id)
}
    `;
export type DeleteRenderMutationFn = Apollo.MutationFunction<DeleteRenderMutation, DeleteRenderMutationVariables>;

/**
 * __useDeleteRenderMutation__
 *
 * To run a mutation, you first call `useDeleteRenderMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteRenderMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteRenderMutation, { data, loading, error }] = useDeleteRenderMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteRenderMutation(baseOptions?: Apollo.MutationHookOptions<DeleteRenderMutation, DeleteRenderMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteRenderMutation, DeleteRenderMutationVariables>(DeleteRenderDocument, options);
      }
export type DeleteRenderMutationHookResult = ReturnType<typeof useDeleteRenderMutation>;
export type DeleteRenderMutationResult = Apollo.MutationResult<DeleteRenderMutation>;
export type DeleteRenderMutationOptions = Apollo.BaseMutationOptions<DeleteRenderMutation, DeleteRenderMutationVariables>;
export const MeDocument = gql`
    query Me {
  me {
    id
    firstName
    lastName
    email
    role
    subscription
    subscriptionUntil
    dailyLimit
  }
}
    `;

/**
 * __useMeQuery__
 *
 * To run a query within a React component, call `useMeQuery` and pass it any options that fit your needs.
 * When your component renders, `useMeQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMeQuery({
 *   variables: {
 *   },
 * });
 */
export function useMeQuery(baseOptions?: Apollo.QueryHookOptions<MeQuery, MeQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<MeQuery, MeQueryVariables>(MeDocument, options);
      }
export function useMeLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<MeQuery, MeQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<MeQuery, MeQueryVariables>(MeDocument, options);
        }
export function useMeSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<MeQuery, MeQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<MeQuery, MeQueryVariables>(MeDocument, options);
        }
export type MeQueryHookResult = ReturnType<typeof useMeQuery>;
export type MeLazyQueryHookResult = ReturnType<typeof useMeLazyQuery>;
export type MeSuspenseQueryHookResult = ReturnType<typeof useMeSuspenseQuery>;
export type MeQueryResult = Apollo.QueryResult<MeQuery, MeQueryVariables>;
export const UsersDocument = gql`
    query Users {
  users {
    id
    firstName
    lastName
    email
    role
    createdAt
  }
}
    `;

/**
 * __useUsersQuery__
 *
 * To run a query within a React component, call `useUsersQuery` and pass it any options that fit your needs.
 * When your component renders, `useUsersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useUsersQuery({
 *   variables: {
 *   },
 * });
 */
export function useUsersQuery(baseOptions?: Apollo.QueryHookOptions<UsersQuery, UsersQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<UsersQuery, UsersQueryVariables>(UsersDocument, options);
      }
export function useUsersLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<UsersQuery, UsersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<UsersQuery, UsersQueryVariables>(UsersDocument, options);
        }
export function useUsersSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<UsersQuery, UsersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<UsersQuery, UsersQueryVariables>(UsersDocument, options);
        }
export type UsersQueryHookResult = ReturnType<typeof useUsersQuery>;
export type UsersLazyQueryHookResult = ReturnType<typeof useUsersLazyQuery>;
export type UsersSuspenseQueryHookResult = ReturnType<typeof useUsersSuspenseQuery>;
export type UsersQueryResult = Apollo.QueryResult<UsersQuery, UsersQueryVariables>;
export const UpsertUserDocument = gql`
    mutation UpsertUser($input: UpsertUserInput!) {
  upsertUser(input: $input) {
    id
    firstName
    lastName
    email
    role
    subscription
    subscriptionUntil
  }
}
    `;
export type UpsertUserMutationFn = Apollo.MutationFunction<UpsertUserMutation, UpsertUserMutationVariables>;

/**
 * __useUpsertUserMutation__
 *
 * To run a mutation, you first call `useUpsertUserMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpsertUserMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [upsertUserMutation, { data, loading, error }] = useUpsertUserMutation({
 *   variables: {
 *      input: // value for 'input'
 *   },
 * });
 */
export function useUpsertUserMutation(baseOptions?: Apollo.MutationHookOptions<UpsertUserMutation, UpsertUserMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpsertUserMutation, UpsertUserMutationVariables>(UpsertUserDocument, options);
      }
export type UpsertUserMutationHookResult = ReturnType<typeof useUpsertUserMutation>;
export type UpsertUserMutationResult = Apollo.MutationResult<UpsertUserMutation>;
export type UpsertUserMutationOptions = Apollo.BaseMutationOptions<UpsertUserMutation, UpsertUserMutationVariables>;